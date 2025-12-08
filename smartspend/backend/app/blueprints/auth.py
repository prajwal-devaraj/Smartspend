# app/blueprints/auth.py
from __future__ import annotations

from flask import Blueprint, request
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta

from ..extensions import db
from ..models import User, RefreshToken
from ..auth_utils import (
    hash_password,
    verify_password,
    mint_access,
    mint_refresh,
    hash_refresh,
    refresh_expiry,
)
from ..errors import problem

bp = Blueprint("auth", __name__)

# ---------- helpers ----------

def weak_password(pw: str) -> bool:
    return not (
        pw
        and len(pw) >= 8
        and any(c.isupper() for c in pw)
        and any(c.isdigit() for c in pw)
        and any(not c.isalnum() for c in pw)
    )

def _client_ip():
    # simple best-effort
    return request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr

def _ua():
    return request.headers.get("User-Agent")

def _user_json(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "status": u.status}

# ---------- routes ----------

@bp.post("/auth/signup")
def signup():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").lower().strip()
    pw = data.get("password") or ""

    if not name or not email or not pw:
        return problem(400, "validation_error", "name, email, password required")
    if weak_password(pw):
        return problem(400, "weak_password", "Use ≥8 chars incl. upper, number, special")

    user = User(
        name=name,
        email=email,
        password_hash=hash_password(pw),
        status="pending_onboarding",
    )
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return problem(409, "email_exists", "Email already registered")

    access = mint_access(user.id, scope="onboarding")

    # FE convenience: return user object + default onboarding step
    return {
        "access": access,
        "scope": "onboarding",
        "user": _user_json(user),
        "onboarding": {"step": "balance"},
    }, 201


@bp.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").lower().strip()
    pw = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not verify_password(pw, user.password_hash):
        return problem(401, "invalid_credentials", "Email or password is incorrect")

    # Access for everyone
    scope = "onboarding" if user.status == "pending_onboarding" else "app"
    access = mint_access(user.id, scope)

    res = {
        "access": access,
        "scope": scope,
        "user": _user_json(user),
    }

    # If active, also mint+store refresh and send it back
    if user.status == "active":
        plain, hashed = mint_refresh()
        rt = RefreshToken(
            user_id=user.id,
            token_hash=hashed,
            rotation_parent_id=None,
            ip_last=_client_ip(),
            user_agent=_ua(),
            device_label=None,
            created_at=datetime.utcnow(),
            expires_at=refresh_expiry().replace(tzinfo=None),
            revoked_at=None,
        )
        db.session.add(rt)
        db.session.commit()
        res["refresh_token"] = plain
    else:
        # pending_onboarding: tell FE which screen to show
        res["onboarding"] = {"step": "balance"}

    return res, 200


@bp.post("/auth/refresh")
def refresh():
    """
    Body: { user_id, refresh_token }
    - Verify not expired or revoked
    - Hash compare
    - Rotate: revoke old, insert new with rotation_parent_id
    - Return new access + new refresh
    """
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    plain_in = data.get("refresh_token")
    if not user_id or not plain_in:
        return problem(400, "validation_error", "user_id and refresh_token required")

    user = User.query.get(int(user_id))
    if not user or user.status != "active":
        return problem(401, "invalid_user", "User not active")

    # find latest valid refresh token for this user that matches hash
    hashed_in = hash_refresh(plain_in)
    now = datetime.utcnow()

    row = (
        RefreshToken.query
        .filter(
            RefreshToken.user_id == user.id,
            RefreshToken.token_hash == hashed_in,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .order_by(RefreshToken.id.desc())
        .first()
    )

    if not row:
        return problem(401, "invalid_refresh", "Refresh token is invalid or expired")

    # Rotate: revoke old, create new
    row.revoked_at = now

    new_plain, new_hash = mint_refresh()
    new_row = RefreshToken(
        user_id=user.id,
        token_hash=new_hash,
        rotation_parent_id=row.id,
        ip_last=_client_ip(),
        user_agent=_ua(),
        device_label=None,
        created_at=now,
        expires_at=refresh_expiry().replace(tzinfo=None),
        revoked_at=None,
    )
    db.session.add(new_row)

    # New access for app scope
    new_access = mint_access(user.id, scope="app")

    db.session.commit()

    return {
        "access": new_access,
        "refresh_token": new_plain,
        "user": _user_json(user),
        "scope": "app",
    }, 200
