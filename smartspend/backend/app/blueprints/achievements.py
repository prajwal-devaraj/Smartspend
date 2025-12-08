# app/blueprints/achievements.py
from __future__ import annotations
from datetime import datetime
from flask import Blueprint, request
from sqlalchemy import text

from ..extensions import db
from ..errors import problem

bp = Blueprint("achievements", __name__)

# ---- table names (edit here if your names are misspelled) ----
TBL_ACH = "achievement"         # or "acheivements"
TBL_USER_ACH = "user_achievement"  # or "user_acheivement"

# ------------------------ helpers ------------------------
def _require_user(user_id: int):
    row = db.session.execute(
        text("SELECT id FROM `user` WHERE id=:uid"),
        {"uid": user_id}
    ).mappings().first()
    if not row:
        raise ValueError("user_not_found")
    return row

def _get_achievement_by_code(code: str):
    return db.session.execute(
        text(f"""
            SELECT id, code, name, description, icon, is_active, created_at
            FROM `{TBL_ACH}`
            WHERE code = :code
        """),
        {"code": code}
    ).mappings().first()

# ------------------------ endpoints ------------------------

@bp.get("/achievements")
def achievements_catalog():
    """
    List all active achievements.
    Optional: include_inactive=true to return everything.
    """
    include_inactive = str(request.args.get("include_inactive", "")).lower() in ("1","true","yes","on")
    if include_inactive:
        rows = db.session.execute(
            text(f"""
                SELECT id, code, name, description, icon, is_active, created_at
                FROM `{TBL_ACH}`
                ORDER BY is_active DESC, created_at DESC
            """)
        ).mappings().all()
    else:
        rows = db.session.execute(
            text(f"""
                SELECT id, code, name, description, icon, is_active, created_at
                FROM `{TBL_ACH}`
                WHERE is_active = 1
                ORDER BY created_at DESC
            """)
        ).mappings().all()

    return {"items": [dict(r) for r in rows]}, 200


@bp.get("/achievements/user")
def user_achievements():
    """
    Query: user_id (required)
    Returns earned achievements (most recent first).
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        if not user_id:
            return problem(400, "validation_error", "user_id required")
        _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "user_id invalid")
    except Exception:
        return problem(404, "not_found", "user")

    rows = db.session.execute(
        text(f"""
            SELECT ua.id            AS user_achievement_id,
                   ua.earned_at     AS earned_at,
                   a.id             AS achievement_id,
                   a.code           AS code,
                   a.name           AS name,
                   a.description    AS description,
                   a.icon           AS icon
            FROM `{TBL_USER_ACH}` ua
            JOIN `{TBL_ACH}` a ON a.id = ua.achievement_id
            WHERE ua.user_id = :uid
            ORDER BY ua.earned_at DESC, ua.id DESC
        """),
        {"uid": user_id}
    ).mappings().all()

    return {"items": [dict(r) for r in rows]}, 200


@bp.post("/achievements/earn")
def earn_achievement():
    """
    Body: { user_id: number, code: string, earned_at?: ISO string }
    Idempotent: if user already has it, returns already_owned=true.
    Only awards if achievement exists and is_active=1.
    """
    d = request.get_json(silent=True) or {}
    try:
        user_id = int(d.get("user_id") or 0)
        code = (d.get("code") or "").strip()
        if not user_id or not code:
            raise ValueError
        _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "valid user_id & code required")
    except Exception:
        return problem(404, "not_found", "user")

    ach = _get_achievement_by_code(code)
    if not ach:
        return problem(404, "not_found", "achievement")
    if int(ach.get("is_active") or 0) != 1:
        return problem(409, "inactive", "achievement is not active")

    # Check if already owned
    owned = db.session.execute(
        text(f"""
            SELECT id, earned_at
            FROM `{TBL_USER_ACH}`
            WHERE user_id=:uid AND achievement_id=:aid
            LIMIT 1
        """),
        {"uid": user_id, "aid": ach["id"]}
    ).mappings().first()
    if owned:
        return {
            "ok": True,
            "already_owned": True,
            "user_achievement": {
                "id": owned["id"],
                "earned_at": owned["earned_at"].isoformat(sep=" ") if owned["earned_at"] else None,
                "achievement": {
                    "id": ach["id"], "code": ach["code"], "name": ach["name"],
                    "description": ach["description"], "icon": ach["icon"]
                }
            }
        }, 200

    # Parse earned_at (optional)
    earned_at = None
    if d.get("earned_at"):
        try:
            earned_at = datetime.fromisoformat(str(d["earned_at"]).replace("Z","+00:00")).replace(tzinfo=None)
        except Exception:
            return problem(400, "validation_error", "earned_at must be ISO datetime")

    # Insert (idempotency aided by UNIQUE(user_id, achievement_id))
    try:
        ins = db.session.execute(
            text(f"""
                INSERT INTO `{TBL_USER_ACH}` (user_id, achievement_id, earned_at)
                VALUES (:uid, :aid, :earned_at)
            """),
            {"uid": user_id, "aid": ach["id"], "earned_at": earned_at or datetime.utcnow()}
        )
        db.session.commit()
        user_ach_id = ins.lastrowid
    except Exception as e:
        db.session.rollback()
        # If UNIQUE constraint hit (race condition), fetch existing and return already_owned
        owned2 = db.session.execute(
            text(f"""
                SELECT id, earned_at
                FROM `{TBL_USER_ACH}`
                WHERE user_id=:uid AND achievement_id=:aid
                LIMIT 1
            """),
            {"uid": user_id, "aid": ach["id"]}
        ).mappings().first()
        if owned2:
            return {
                "ok": True,
                "already_owned": True,
                "user_achievement": {
                    "id": owned2["id"],
                    "earned_at": owned2["earned_at"].isoformat(sep=" ") if owned2["earned_at"] else None,
                    "achievement": {
                        "id": ach["id"], "code": ach["code"], "name": ach["name"],
                        "description": ach["description"], "icon": ach["icon"]
                    }
                }
            }, 200
        return problem(500, "db_error", str(e))

    # Return created
    row = db.session.execute(
        text(f"""
            SELECT ua.id AS user_achievement_id, ua.earned_at
            FROM `{TBL_USER_ACH}` ua
            WHERE ua.id = :id
        """),
        {"id": user_ach_id}
    ).mappings().first()

    return {
        "ok": True,
        "awarded": {
            "id": row["user_achievement_id"],
            "earned_at": row["earned_at"].isoformat(sep=" "),
            "achievement": {
                "id": ach["id"], "code": ach["code"], "name": ach["name"],
                "description": ach["description"], "icon": ach["icon"]
            }
        }
    }, 201


@bp.delete("/achievements/user/<int:user_achievement_id>")
def revoke_user_achievement(user_achievement_id: int):
    """
    Optional admin/debug endpoint to revoke an earned achievement.
    Query/body may include user_id to ensure ownership (safety).
    """
    uid = request.args.get("user_id") or (request.get_json(silent=True) or {}).get("user_id")
    if uid:
        try:
            uid = int(uid)
            _require_user(uid)
        except Exception:
            return problem(400, "validation_error", "valid user_id required (if provided)")

        # ensure ownership
        own = db.session.execute(
            text(f"""
                SELECT 1 FROM `{TBL_USER_ACH}`
                WHERE id=:id AND user_id=:uid
                LIMIT 1
            """),
            {"id": user_achievement_id, "uid": uid}
        ).scalar()
        if not own:
            return problem(403, "forbidden", "not owned by user")

    res = db.session.execute(
        text(f"DELETE FROM `{TBL_USER_ACH}` WHERE id=:id"),
        {"id": user_achievement_id}
    )
    db.session.commit()
    if res.rowcount == 0:
        return problem(404, "not_found", "user_achievement")
    return {"ok": True}, 200
