# app/blueprints/categories.py
from __future__ import annotations
from flask import Blueprint, request
from ..extensions import db
from ..models.user import User
from ..models.category import Category
from ..errors import problem
from ..services.category_service import ensure_default_categories, list_categories

bp = Blueprint("categories", __name__)

def _require_user(user_id: int) -> User:
    u = User.query.get(user_id)
    if not u:
        raise ValueError("user_not_found")
    return u

@bp.get("/categories")
def get_categories():
    """
    Query:
      user_id: int (required)
      kind: 'income'|'expense' (optional)
      autocreate: '1' to seed defaults if user has none
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        _require_user(user_id)
    except Exception:
        return problem(400, "validation_error", "valid user_id required")

    if request.args.get("autocreate") == "1":
        ensure_default_categories(user_id)

    kind = request.args.get("kind")
    rows = list_categories(user_id, kind)
    return {
        "items": [
            {
                "id": c.id,
                "name": c.name,
                "kind": c.kind,
                "is_default": c.is_default,
                "parent_id": c.parent_id,
            }
            for c in rows
        ]
    }, 200

@bp.post("/categories")
def create_category():
    """
    Body:
      { user_id, name, kind: 'income'|'expense', parent_id?: int }
    """
    d = request.get_json(silent=True) or {}
    try:
        user_id = int(d.get("user_id") or 0)
        _require_user(user_id)
    except Exception:
        return problem(400, "validation_error", "valid user_id required")

    name = (d.get("name") or "").strip()
    kind = d.get("kind")
    parent_id = d.get("parent_id")

    if not name or kind not in ("income", "expense"):
        return problem(400, "validation_error", "name and kind required")

    # Uniqueness per user + name (ignore soft-deleted)
    exists = Category.query.filter(
        Category.user_id == user_id,
        Category.name == name,
        Category.deleted_at.is_(None)
    ).first()
    if exists:
        return problem(409, "conflict", "category name already exists for this user")

    parent = None
    if parent_id:
        parent = Category.query.get(int(parent_id))
        if not parent or parent.user_id != user_id or parent.deleted_at is not None:
            return problem(400, "validation_error", "invalid parent_id")
        if parent.kind != kind:
            return problem(400, "validation_error", "parent kind mismatch")

    c = Category(user_id=user_id, name=name, kind=kind, parent_id=parent.id if parent else None)
    db.session.add(c)
    db.session.commit()
    return {"id": c.id}, 201

@bp.patch("/categories/<int:cat_id>")
def update_category(cat_id: int):
    d = request.get_json(silent=True) or {}
    c = Category.query.get(cat_id)
    if not c or c.deleted_at is not None:
        return problem(404, "not_found", "category")
    name = (d.get("name") or "").strip()
    if not name:
        return problem(400, "validation_error", "name required")

    exists = Category.query.filter(
        Category.user_id == c.user_id,
        Category.name == name,
        Category.deleted_at.is_(None),
        Category.id != c.id,
    ).first()
    if exists:
        return problem(409, "conflict", "category name already exists for this user")
    c.name = name
    db.session.commit()
    return {"ok": True}, 200

@bp.delete("/categories/<int:cat_id>")
def soft_delete_category(cat_id: int):
    c = Category.query.get(cat_id)
    if not c or c.deleted_at is not None:
        return problem(404, "not_found", "category")
    if c.is_default:
        return problem(409, "conflict", "cannot delete default category")
    c.deleted_at = db.func.now()
    db.session.commit()
    return {"ok": True}, 200
