# app/blueprints/onboarding.py

from __future__ import annotations
from flask import Blueprint, request
from datetime import date, datetime
from calendar import monthrange

from ..extensions import db
from ..models import BudgetPref, MonthlyPeriod, User, Transaction, Bill
from ..errors import problem
from ..auth_utils import mint_access

bp = Blueprint("onboarding", __name__)

# -------------------------------------------------------
# Helpers
# -------------------------------------------------------

def _derive_biweekly_anchor(day_of_month: int) -> date:
    """Convert a 1..31 anchor into an actual upcoming date."""
    today = date.today()
    dom = max(1, min(int(day_of_month), 31))
    max_day = monthrange(today.year, today.month)[1]
    d = date(today.year, today.month, min(dom, max_day))

    if d < today:
        y, m = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
        max_day2 = monthrange(y, m)[1]
        d = date(y, m, min(dom, max_day2))

    return d


def _month_bounds(today: date):
    mstart = today.replace(day=1)
    mnext = date(today.year + (1 if today.month == 12 else 0),
                 1 if today.month == 12 else today.month + 1, 1)
    return mstart, mnext


def _parse_iso_date(s: str):
    try:
        if len(s) == 10:
            return datetime.strptime(s, "%Y-%m-%d").date()
        return datetime.fromisoformat(s).date()
    except Exception:
        return None

# -------------------------------------------------------
# STEP 2 — Save Pay Cadence
# -------------------------------------------------------

@bp.put("/budget")
def set_budget_cadence():
    """
    Saves pay_cadence + anchors in budget_pref.
    Body: { user_id, pay_cadence, pay_anchor_day_of_month?, pay_anchor_weekday? }
    """
    data = request.get_json(silent=True) or {}
    user_id = int(data.get("user_id", 0))
    cadence = (data.get("pay_cadence") or "").strip()
    dom = data.get("pay_anchor_day_of_month")
    weekday = data.get("pay_anchor_weekday")

    if not user_id or cadence not in ("weekly", "biweekly", "monthly"):
        return problem(400, "validation_error", "user_id and valid pay_cadence required")

    user = User.query.get(user_id)
    if not user:
        return problem(404, "not_found", "user")

    pref = BudgetPref.query.filter_by(user_id=user_id).first()
    if not pref:
        pref = BudgetPref(user_id=user_id)
        db.session.add(pref)

    # Store cadence
    pref.pay_cadence = cadence

    # 🔥 FIX: Keep expected cadence in sync
    pref.expected_amount_cadence = cadence

    # Anchors
    pref.pay_anchor_day_of_month = int(dom) if dom is not None else None
    pref.pay_anchor_weekday = weekday if weekday else None

    # Biweekly anchor logic
    if cadence == "biweekly" and dom is not None:
        pref.biweekly_anchor_date = _derive_biweekly_anchor(int(dom))
    else:
        pref.biweekly_anchor_date = None

    db.session.commit()
    return {"ok": True}

# -------------------------------------------------------
# STEP 1 — Save Expected Monthly Income (ONBOARDING)
# -------------------------------------------------------

@bp.put("/budget/period")
def set_period_expected_monthly():
    """
    Accepts UI monthly income input.
    Does NOT decide cadence — cadence is set in /budget.
    """
    data = request.get_json(silent=True) or {}
    user_id = int(data.get("user_id", 0))
    monthly_income_cents = data.get("monthly_income_cents")

    if not user_id or monthly_income_cents is None:
        return problem(400, "validation_error", "user_id and monthly_income_cents required")

    user = User.query.get(user_id)
    if not user:
        return problem(404, "not_found", "user")

    pref = BudgetPref.query.filter_by(user_id=user_id).first()
    if not pref:
        pref = BudgetPref(user_id=user_id)
        db.session.add(pref)

    # store expected income amount
    pref.expected_amount_cents = int(monthly_income_cents)

    # FIX: do NOT force monthly cadence — only set if empty
    if pref.expected_amount_cadence is None:
        pref.expected_amount_cadence = "monthly"

    # ensure monthly_period exists
    mstart = date.today().replace(day=1)
    period = MonthlyPeriod.query.filter_by(user_id=user_id, month_utc=mstart).first()

    if not period:
        period = MonthlyPeriod(
            user_id=user_id,
            month_utc=mstart,
            opening_income_cents=0
        )
        db.session.add(period)
    else:
        period.opening_income_cents = 0

    db.session.commit()
    return {
        "ok": True,
        "period_id": period.id,
        "month_utc": str(mstart)
    }

# -------------------------------------------------------
# STEP 3 — Save Bills
# -------------------------------------------------------

@bp.post("/onboarding/bills")
def onboarding_save_bills():
    data = request.get_json(silent=True) or {}
    user_id = int(data.get("user_id", 0))
    bills = data.get("bills") or []

    if not user_id:
        return problem(400, "validation_error", "user_id required")
    if not isinstance(bills, list) or not bills:
        return problem(400, "validation_error", "bills array required")

    user = User.query.get(user_id)
    if not user:
        return problem(404, "not_found", "user")

    valid_rules = {"weekly", "biweekly", "monthly"}
    out = []

    for idx, b in enumerate(bills):
        name = (b.get("name") or "").strip()
        amount_cents = b.get("amount_cents")
        rule = (b.get("recurrence_rule") or "").lower()
        next_due_date_str = (b.get("next_due_date") or "").strip()

        if not name:
            return problem(400, "validation_error", f"bills[{idx}].name required")
        if amount_cents is None:
            return problem(400, "validation_error", f"bills[{idx}].amount_cents required")
        if rule not in valid_rules:
            return problem(400, "validation_error", f"invalid recurrence_rule")

        next_due = _parse_iso_date(next_due_date_str) if next_due_date_str else None

        existing = Bill.query.filter(Bill.user_id == user_id, Bill.name == name).first()

        if existing:
            existing.amount_cents = int(amount_cents)
            existing.recurrence_rule = rule
            existing.next_due_date = next_due
            row = existing
        else:
            row = Bill(
                user_id=user_id,
                name=name,
                amount_cents=int(amount_cents),
                recurrence_rule=rule,
                status="active",
                next_due_date=next_due,
            )
            db.session.add(row)

        out.append(row)

    db.session.commit()
    return {
        "ok": True,
        "bills": [
            {
                "id": r.id,
                "name": r.name,
                "amount_cents": int(r.amount_cents or 0),
                "recurrence_rule": r.recurrence_rule,
                "status": r.status,
                "next_due_date": r.next_due_date.isoformat() if r.next_due_date else None,
            }
            for r in out
        ],
    }

# -------------------------------------------------------
# STEP 4 — Complete Onboarding
# -------------------------------------------------------

@bp.post("/onboarding/complete")
def onboarding_complete():
    data = request.get_json(silent=True) or {}
    user_id = int(data.get("user_id", 0))

    if not user_id:
        return problem(400, "validation_error", "user_id required")

    user = User.query.get(user_id)
    if not user:
        return problem(404, "not_found", "user")

    today = date.today()
    mstart, mnext = _month_bounds(today)

    # Ensure monthly period exists
    period = MonthlyPeriod.query.filter_by(user_id=user_id, month_utc=mstart).first()
    if not period:
        period = MonthlyPeriod(user_id=user_id, month_utc=mstart, opening_income_cents=0)
        db.session.add(period)
    else:
        period.opening_income_cents = 0

    # One-time onboarding credit
    pref = BudgetPref.query.filter_by(user_id=user_id).first()
    expected_cents = int(pref.expected_amount_cents or 0) if pref else 0

    if expected_cents > 0:
        memo = "Opening funds (onboarding)"
        dup = (
            db.session.query(Transaction.id)
            .filter(
                Transaction.user_id == user_id,
                Transaction.type == "income",
                Transaction.memo == memo,
                Transaction.occurred_at >= datetime.combine(mstart, datetime.min.time()),
                Transaction.occurred_at < datetime.combine(mnext, datetime.min.time()),
            )
            .first()
        )

        if not dup:
            db.session.add(Transaction(
                user_id=user_id,
                period_id=period.id,
                type="income",
                amount_cents=expected_cents,
                occurred_at=datetime.utcnow(),
                timezone=user.timezone,
                memo=memo,
            ))

    # Activate user
    user.status = "active"
    db.session.commit()

    # Issue fresh access token
    access = mint_access(user_id, scope="app")
    return {
        "ok": True,
        "scope": "app",
        "access": access,
        "period_id": period.id,
        "month_utc": str(mstart),
    }

@bp.post("/onboarding/finish")
def onboarding_finish_alias():
    return onboarding_complete()
