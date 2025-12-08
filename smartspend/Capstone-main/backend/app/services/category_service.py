# app/services/category_service.py
from __future__ import annotations
from typing import Iterable, Optional
from sqlalchemy import and_

from ..extensions import db
from ..models.category import Category

DEFAULT_INCOME = ["Salary", "Bonus", "Interest","Other Income"]
DEFAULT_EXPENSE = ["Misc", "Food", "Rent", "Transport", "Entertainment", "Bills", "Health"]

def ensure_default_categories(user_id: int) -> None:
    """Seed defaults if user has no (non-deleted) categories."""
    has_any = (
        db.session.query(Category.id)
        .filter(Category.user_id == user_id, Category.deleted_at.is_(None))
        .limit(1)
        .first()
    )
    if has_any:
        return

    def _mk(name: str, kind: str, is_default: bool = True) -> Category:
        return Category(user_id=user_id, name=name, kind=kind, is_default=is_default)

    rows: list[Category] = []
    rows += [_mk(n, "income") for n in DEFAULT_INCOME]
    rows += [_mk(n, "expense") for n in DEFAULT_EXPENSE]
    db.session.bulk_save_objects(rows)
    db.session.commit()

def list_categories(user_id: int, kind: Optional[str] = None) -> Iterable[Category]:
    q = Category.query.filter(
        Category.user_id == user_id,
        Category.deleted_at.is_(None),
    )
    if kind in ("income", "expense"):
        q = q.filter(Category.kind == kind)
    return q.order_by(Category.kind.asc(), Category.name.asc()).all()

def resolve_category_id_or_default(user_id: int, kind: str, candidate_id: Optional[int]) -> int:
    """
    If candidate_id is provided and valid -> return it.
    Else return a default for this kind (Salary for income, Misc for expense).
    Raises ValueError if nothing found (shouldn't happen if defaults are seeded).
    """
    if candidate_id:
        found = Category.query.filter(
            Category.id == int(candidate_id),
            Category.user_id == user_id,
            Category.deleted_at.is_(None),
        ).first()
        if found and found.kind == kind:
            return found.id
        raise ValueError("invalid category_id")

    # No candidate -> pick a default by name
    default_name = "Salary" if kind == "income" else "Misc"
    c = Category.query.filter(
        and_(
            Category.user_id == user_id,
            Category.deleted_at.is_(None),
            Category.kind == kind,
            Category.name == default_name,
        )
    ).first()
    if not c:
        # try any default in that kind
        c = Category.query.filter(
            Category.user_id == user_id,
            Category.deleted_at.is_(None),
            Category.kind == kind,
            Category.is_default.is_(True),
        ).order_by(Category.id.asc()).first()
    if not c:
        # Ensure defaults exist, then retry
        ensure_default_categories(user_id)
        c = Category.query.filter(
            Category.user_id == user_id,
            Category.deleted_at.is_(None),
            Category.kind == kind,
        ).order_by(Category.id.asc()).first()
    if not c:
        raise ValueError("no category available")
    return c.id
