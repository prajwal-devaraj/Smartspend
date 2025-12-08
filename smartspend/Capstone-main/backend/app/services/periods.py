# app/services/periods.py
from __future__ import annotations
from datetime import datetime, date
from ..extensions import db
from ..models import MonthlyPeriod
from .payday import get_user_pay_rule, get_period_bounds

def get_or_create_period(user_id: int, when: datetime) -> MonthlyPeriod:
    """
    Adapter layer that maps a (future) payday rule to your current MonthlyPeriod table.
    Today it simply stores to the row keyed by the calendar month of `when`.
    When you later add a true Period model, only this function needs to change.
    """
    # You can look at the rule if you want (for future use)
    _ = get_user_pay_rule(user_id)
    # For now, keep using calendar month buckets to match your schema:
    mstart = date(when.year, when.month, 1)

    period = MonthlyPeriod.query.filter_by(user_id=user_id, month_utc=mstart).first()
    if not period:
        period = MonthlyPeriod(
            user_id=user_id,
            month_utc=mstart,
            opening_income_cents=0,
        )
        db.session.add(period)
        db.session.flush()
    return period
