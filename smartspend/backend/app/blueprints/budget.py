# app/blueprints/budget.py  (replace the helpers + GET /pref with this block)

from datetime import datetime, timedelta, date
from typing import Optional, Tuple
from flask import Blueprint, request
from ..extensions import db
from ..errors import problem
from ..models import User, Transaction
from ..models import BudgetPref  # if you have it; else guard it like your other optional imports
from ..utils.tz import get_zoneinfo

bp = Blueprint("budget", __name__)

_ALLOWED_FREQ = {"weekly", "biweekly", "monthly"}

def _last_day_of_month(y: int, m: int) -> int:
    from calendar import monthrange
    return monthrange(y, m)[1]

def _clamp_dom(y: int, m: int, dom: int) -> date:
    return date(y, m, min(dom, _last_day_of_month(y, m)))

def _to_local_date(dt_utc: datetime, tzname: str) -> date:
    tz = get_zoneinfo(tzname or "America/New_York")
    return dt_utc.replace(tzinfo=get_zoneinfo("UTC")).astimezone(tz).date()

def _parse_ymd(s: Optional[str]) -> Optional[date]:
    if not s: return None
    try:
        y, m, d = map(int, str(s).split("-"))
        return date(y, m, d)
    except Exception:
        return None

def _weekly_next_and_today(today: date, weekday: int) -> Tuple[date, bool]:
    # python weekday(): 0=Mon..6=Sun
    wd_today = today.weekday()
    delta = (weekday - wd_today) % 7
    is_today = (delta == 0)
    nxt = today if is_today else today + timedelta(days=delta)
    return (nxt, is_today)

def _biweekly_next_and_today(today: date, anchor: date) -> Tuple[date, bool]:
    # repeats every 14 days from anchor
    diff = (today - anchor).days
    if diff >= 0:
        is_today = (diff % 14 == 0)
        add = 0 if is_today else (14 - (diff % 14))
        nxt = today + timedelta(days=add)
        return (nxt, is_today)
    # today before anchor: first multiple >= today is the anchor itself
    return (anchor, False)

def _monthly_next_and_today(today: date, dom: int) -> Tuple[date, bool]:
    # clamp to each month’s last day
    this_target = _clamp_dom(today.year, today.month, dom)
    if today == this_target:
        return (this_target, True)
    if today < this_target:
        return (this_target, False)
    # move to next month
    y, m = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
    nxt = _clamp_dom(y, m, dom)
    return (nxt, False)

def _last_income_tx(user_id: int) -> Optional[Transaction]:
    return (Transaction.query
            .filter(Transaction.user_id == user_id, Transaction.type == "income")
            .order_by(Transaction.occurred_at.desc(), Transaction.id.desc())
            .first())

@bp.get("/pref")
def get_pref():
    """
    Returns payday hints for UI (auto-open modal, prefill amount):

    pay_frequency: 'weekly'|'biweekly'|'monthly'|None
    suggested_amount_cents: int          # last income amount if available; else onboarding default
    fallback_amount_cents: int           # onboarding default
    next_payday_ymd: 'YYYY-MM-DD'|null   # in user's LOCAL tz
    is_today_payday: bool                # in user's LOCAL tz
    payday_fields: {                     # what was used to compute payday
      weekly_weekday?: 0..6,
      biweekly_anchor_ymd?: 'YYYY-MM-DD',
      monthly_day?: 1..31
    }
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        if not user_id:
            return problem(400, "validation_error", "user_id required")
        u = User.query.get(user_id)
        if not u:
            return problem(404, "not_found", "user")
    except Exception:
        return problem(400, "validation_error", "valid user_id required")

    tzname = u.timezone or "America/New_York"
    today_local = _to_local_date(datetime.utcnow(), tzname)

    pay_frequency = None
    weekly_weekday: Optional[int] = None     # 0..6
    monthly_day: Optional[int] = None        # 1..31
    biweekly_anchor: Optional[date] = None

    default_income_cents = 0
    if BudgetPref is not None:
        pref = BudgetPref.query.filter_by(user_id=user_id).first()
        if pref:
            pf = (getattr(pref, "pay_frequency", "") or "").lower()
            if pf == "bi-weekly": pf = "biweekly"
            pay_frequency = pf if pf in _ALLOWED_FREQ else None

            default_income_cents = int(getattr(pref, "default_income_cents", 0) or 0)

            # Optional fields — use if present
            try:
                weekly_weekday = int(getattr(pref, "weekly_weekday", None)) if hasattr(pref, "weekly_weekday") else None
            except Exception:
                weekly_weekday = None
            try:
                md = int(getattr(pref, "monthly_day", None)) if hasattr(pref, "monthly_day") else None
                if md is not None and (md < 1 or md > 31): md = None
                monthly_day = md
            except Exception:
                monthly_day = None
            biweekly_anchor = _parse_ymd(getattr(pref, "biweekly_anchor_ymd", None)) if hasattr(pref, "biweekly_anchor_ymd") else None

    # Suggested amount = last income if available else onboarding default
    tx_last = _last_income_tx(user_id)
    last_amount = getattr(tx_last, "amount_cents", None) if tx_last else None
    suggested = last_amount if (last_amount and last_amount > 0) else default_income_cents

    # If no explicit anchors provided, fall back to last income date for cadence math
    last_income_local = _to_local_date(tx_last.occurred_at, tzname) if tx_last else None
    if pay_frequency == "weekly" and weekly_weekday is None and last_income_local is not None:
        weekly_weekday = last_income_local.weekday()  # infer from last income weekday
    if pay_frequency == "biweekly" and biweekly_anchor is None and last_income_local is not None:
        biweekly_anchor = last_income_local
    if pay_frequency == "monthly" and monthly_day is None and last_income_local is not None:
        monthly_day = last_income_local.day

    # Compute next & is_today per frequency
    next_local: Optional[date] = None
    is_today = False
    if pay_frequency == "weekly" and weekly_weekday is not None:
        next_local, is_today = _weekly_next_and_today(today_local, weekly_weekday)
    elif pay_frequency == "biweekly" and biweekly_anchor is not None:
        next_local, is_today = _biweekly_next_and_today(today_local, biweekly_anchor)
    elif pay_frequency == "monthly" and monthly_day is not None:
        next_local, is_today = _monthly_next_and_today(today_local, monthly_day)
    else:
        # no enough data to compute
        next_local, is_today = (None, False)

    return {
        "pay_frequency": pay_frequency,
        "suggested_amount_cents": int(suggested or 0),
        "fallback_amount_cents": int(default_income_cents or 0),
        "next_payday_ymd": next_local.isoformat() if next_local else None,
        "is_today_payday": bool(is_today),
        "payday_fields": {
            **({"weekly_weekday": weekly_weekday} if weekly_weekday is not None else {}),
            **({"biweekly_anchor_ymd": biweekly_anchor.isoformat()} if biweekly_anchor else {}),
            **({"monthly_day": monthly_day} if monthly_day is not None else {}),
        }
    }, 200

# app/blueprints/budget.py  (append after GET /pref)

@bp.post("/payday-log")
def payday_log_income():
    """
    Body: { user_id: number, amount_cents: number }
    Creates an 'income' transaction at 'now' (UTC). Keep it simple.
    """
    from sqlalchemy import text
    try:
        d = request.get_json(silent=True) or {}
        user_id = int(d.get("user_id") or 0)
        amount_cents = int(d.get("amount_cents") or 0)
        if not user_id or amount_cents <= 0:
            return problem(400, "validation_error", "user_id & positive amount_cents required")
        # sanity check user
        u = User.query.get(user_id)
        if not u:
            return problem(404, "not_found", "user")
    except Exception:
        return problem(400, "validation_error", "invalid payload")

    # Minimal insert (using raw SQL to avoid ORM details)
    db.session.execute(
        text("""
          INSERT INTO `transaction`
            (user_id, type, amount_cents, occurred_at, note)
          VALUES
            (:uid, 'income', :amt, UTC_TIMESTAMP(), 'Logged from payday modal')
        """),
        {"uid": user_id, "amt": amount_cents}
    )
    db.session.commit()
    return {"ok": True}, 200


@bp.patch("/pref/default-income")
def pref_update_default_income():
    """
    Body: { user_id: number, default_income_cents: number }
    Updates BudgetPref.default_income_cents if table/row exists; no-op otherwise.
    """
    try:
        d = request.get_json(silent=True) or {}
        user_id = int(d.get("user_id") or 0)
        default_income_cents = int(d.get("default_income_cents") or 0)
        if not user_id:
            return problem(400, "validation_error", "user_id required")
        u = User.query.get(user_id)
        if not u:
            return problem(404, "not_found", "user")
    except Exception:
        return problem(400, "validation_error", "invalid payload")

    # Guard if BudgetPref model/table is optional in your build
    if BudgetPref is None:
      # no table → accept but do nothing
      return {"ok": True, "updated": False}, 200

    pref = BudgetPref.query.filter_by(user_id=user_id).first()
    if not pref:
        # create a minimal row
        pref = BudgetPref(user_id=user_id, default_income_cents=default_income_cents)
        db.session.add(pref)
    else:
        pref.default_income_cents = default_income_cents

    db.session.commit()
    return {"ok": True, "updated": True}, 200

