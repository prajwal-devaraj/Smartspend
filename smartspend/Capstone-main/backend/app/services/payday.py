# app/services/payday.py
from __future__ import annotations
from datetime import datetime, date, timedelta
from typing import Tuple, Dict, Any

# In the future, read this from DB (user settings). For now: monthly on day 1.
_DEFAULT_RULE: Dict[str, Any] = {"kind": "monthly", "day": 1}

def get_user_pay_rule(user_id: int) -> Dict[str, Any]:
    """
    TODO: load per-user payday settings from DB.
    For now, return a simple monthly rule.
    """
    return dict(_DEFAULT_RULE)

def _clamp_dom(year: int, month: int, day: int) -> date:
    """Clamp day-of-month to avoid invalid dates (e.g., Feb 30)."""
    day = max(1, min(day, 28))  # simple safe clamp
    return date(year, month, day)

def get_period_bounds(rule: Dict[str, Any], ref: datetime) -> Tuple[datetime, datetime]:
    """
    Return (start_utc, end_utc) for the budgeting period covering `ref`
    based on a payoff rule.  Currently supports 'monthly' only (safe default).
    """
    if rule.get("kind") == "monthly":
        dom = int(rule.get("day", 1))
        y, m = ref.year, ref.month

        start_d = _clamp_dom(y, m, dom)
        if ref.date() < start_d:
            # previous month
            if m == 1:
                y2, m2 = y - 1, 12
            else:
                y2, m2 = y, m - 1
            start_d = _clamp_dom(y2, m2, dom)

        # next start is one month after start_d
        if start_d.month == 12:
            next_d = _clamp_dom(start_d.year + 1, 1, dom)
        else:
            next_d = _clamp_dom(start_d.year, start_d.month + 1, dom)

        return datetime.combine(start_d, datetime.min.time()), datetime.combine(next_d, datetime.min.time())

    # Fallback: calendar month
    start_d = date(ref.year, ref.month, 1)
    if ref.month == 12:
        next_d = date(ref.year + 1, 1, 1)
    else:
        next_d = date(ref.year, ref.month + 1, 1)
    return datetime.combine(start_d, datetime.min.time()), datetime.combine(next_d, datetime.min.time())
