# app/auth_utils.py
from __future__ import annotations

import time
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, Dict, Any

import jwt
from passlib.hash import pbkdf2_sha256 as pwd_hasher

from .config import Config


# ---------------------------
# Password hashing utilities
# ---------------------------

def hash_password(plain: str) -> str:
    """
    Strong, bcrypt-free (no 72-byte limit). Safe defaults from passlib.
    """
    return pwd_hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_hasher.verify(plain, hashed)


# ---------------------------
# Time helpers
# ---------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _now_unix() -> int:
    return int(time.time())


# ---------------------------
# Access token (JWT)
# ---------------------------

def mint_access(user_id: int, scope: str = "app") -> str:
    """
    Create a short-lived access JWT signed with HS256.
    Claims: sub, iss, iat, exp, scope
    """
    now = _now_unix()
    payload = {
        "sub": str(user_id),
        "iss": Config.JWT_ISS,
        "iat": now,
        "exp": now + Config.ACCESS_TTL_MIN * 60,
        "scope": scope,
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")


def decode_access(token: str, verify_exp: bool = True) -> Dict[str, Any]:
    """
    Decode and (optionally) verify an access JWT.
    Raises jwt.ExpiredSignatureError, jwt.InvalidTokenError on problems.
    """
    options = {"verify_exp": verify_exp}
    return jwt.decode(
        token,
        Config.SECRET_KEY,
        algorithms=["HS256"],
        options=options,
        issuer=Config.JWT_ISS,
    )


# ---------------------------
# Refresh token (opaque)
# ---------------------------

def mint_refresh() -> Tuple[str, str]:
    """
    Create a new refresh token pair: (plain_token, sha256_hex_hash).
    Store ONLY the hash in the DB. Return the plain token to the client once.
    """
    plain = secrets.token_urlsafe(48)  # ~384 bits of entropy
    h = hashlib.sha256(plain.encode("utf-8")).hexdigest()
    return plain, h


def hash_refresh(plain_refresh: str) -> str:
    """
    Deterministically hash a provided refresh token for DB lookup/compare.
    """
    return hashlib.sha256(plain_refresh.encode("utf-8")).hexdigest()


def refresh_expiry(now: Optional[datetime] = None) -> datetime:
    """
    Compute the absolute expiry timestamp for a new refresh token.
    """
    now = now or _utcnow()
    return now + timedelta(days=Config.REFRESH_TTL_DAYS)


# ---------------------------
# HTTP helpers (optional)
# ---------------------------

def bearer_from_auth_header(authorization: Optional[str]) -> Optional[str]:
    """
    Extract 'Bearer <token>' value from an Authorization header.
    """
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


# ---------------------------
# High-level flows (how to use)
# ---------------------------
# NOTE: These helpers do not import your DB models to avoid circular imports.
# In your blueprint, do roughly:
#
#   # LOGIN for active user:
#   access = mint_access(user.id, scope="app")
#   refresh_plain, refresh_hash = mint_refresh()
#   db.session.add(RefreshToken(
#       user_id=user.id,
#       token_hash=refresh_hash,
#       rotation_parent_id=None,
#       ip_last=request.remote_addr,
#       user_agent=request.headers.get("User-Agent"),
#       device_label=None,
#       created_at=datetime.utcnow(),
#       expires_at=refresh_expiry().replace(tzinfo=None),
#       revoked_at=None,
#   ))
#   db.session.commit()
#   return { "access": access, "refresh_token": refresh_plain, "user": {...} }
#
#   # /auth/refresh:
#   # 1) Find row by user_id where NOT revoked and NOT expired
#   # 2) Compare hash_refresh(plain_from_client) == stored.token_hash
#   # 3) Mint new access + new refresh; insert new row with rotation_parent_id=old.id; revoke old
#   # 4) Return both to client
#
# Access validation in protected routes:
#   token = bearer_from_auth_header(request.headers.get("Authorization"))
#   claims = decode_access(token)  # raises if invalid/expired
#   user_id = int(claims["sub"])
