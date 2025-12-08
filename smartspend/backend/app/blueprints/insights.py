# app/blueprints/insights.py
from __future__ import annotations
from datetime import datetime

from flask import Blueprint, request
from sqlalchemy import text

from ..extensions import db
from ..errors import problem

bp = Blueprint("insights", __name__)

# ------------------------ helpers ------------------------

def _require_user(user_id: int):
    row = db.session.execute(
        text("SELECT id, timezone FROM `user` WHERE id=:uid"),
        {"uid": user_id}
    ).mappings().first()
    if not row:
        raise ValueError("user_not_found")
    return row

def _current_goal_days(user_id: int) -> int:
    """Latest active runway goal; default 30 (month-oriented)."""
    val = db.session.execute(
        text("""
            SELECT target_days
            FROM goal_runway
            WHERE user_id=:uid
              AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
            ORDER BY effective_from DESC
            LIMIT 1
        """),
        {"uid": user_id}
    ).scalar()
    return int(val or 30)

def _estimate_current_balance_cents(user_id: int) -> int:
    """Sum(income) - sum(expense) over all time (UTC)."""
    val = db.session.execute(
        text("""
            SELECT COALESCE(SUM(
                     CASE WHEN type='income'  THEN amount_cents
                          WHEN type='expense' THEN -amount_cents
                          ELSE 0 END
                   ), 0)
            FROM `transaction`
            WHERE user_id=:uid
        """), {"uid": user_id}
    ).scalar()
    return int(val or 0)

def _avg_daily_burn_cents(user_id: int, window_days: int = 30) -> int:
    """
    Prefer insight_daily if populated (local-day aggregates).
    Burn = avg(max(expense - income, 0) per day). Return >=1 to avoid div-by-zero.
    """
    v = db.session.execute(
        text("""
            SELECT GREATEST(ROUND(AVG(GREATEST(burn_rate_cents, 0))), 0)
            FROM insight_daily
            WHERE user_id=:uid
              AND day >= CURRENT_DATE - INTERVAL :win DAY
        """),
        {"uid": user_id, "win": window_days}
    ).scalar()
    if v is not None:
        return max(int(v), 1)

    # Fallback: compute from transactions (UTC window)
    agg = db.session.execute(
        text("""
            SELECT
              COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents END),0) AS exp_c,
              COALESCE(SUM(CASE WHEN type='income'  THEN amount_cents END),0) AS inc_c
            FROM `transaction`
            WHERE user_id=:uid
              AND occurred_at >= (UTC_TIMESTAMP() - INTERVAL :win DAY)
        """),
        {"uid": user_id, "win": window_days}
    ).mappings().first()
    total_burn = max(int((agg["exp_c"] or 0) - (agg["inc_c"] or 0)), 0)
    return max(total_burn // max(window_days, 1), 1)

def _power_save_lift(burn_cents: int) -> int:
    """Heuristic: power-save drops burn by ~20%."""
    return max(int(round(burn_cents * 0.80)), 1)

# ------------------------ core queries ------------------------

def _wants_share(user_id: int, days: int):
    """Wants/expense share for last N local days using txn_date_local + spend_class."""
    row = db.session.execute(
        text("""
          SELECT
            COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents END), 0) AS total_exp,
            COALESCE(SUM(CASE WHEN type='expense' AND spend_class='want' THEN amount_cents END), 0) AS wants_exp
          FROM `transaction`
          WHERE user_id=:uid
            AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
        """),
        {"uid": user_id, "win": days}
    ).mappings().first()
    total = int(row["total_exp"] or 0)
    wants = int(row["wants_exp"] or 0)
    return (wants / total) if total > 0 else 0.0, wants, total

def _late_night_count(user_id: int, days: int):
    """Count of late-night expenses using derived local day_part_local."""
    val = db.session.execute(
        text("""
          SELECT COALESCE(COUNT(*),0)
          FROM `transaction`
          WHERE user_id=:uid
            AND type='expense'
            AND day_part_local='late_night'
            AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
        """),
        {"uid": user_id, "win": days}
    ).scalar()
    return int(val or 0)

def _mood_avg_spend(user_id: int, days: int):
    """Avg expense per txn grouped by mood in window (local day)."""
    rows = db.session.execute(
        text("""
          SELECT mood, COALESCE(AVG(amount_cents),0) AS avg_cents
          FROM `transaction`
          WHERE user_id=:uid
            AND type='expense'
            AND mood IS NOT NULL
            AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
          GROUP BY mood
        """),
        {"uid": user_id, "win": days}
    ).mappings().all()
    base = {"happy": 0, "neutral": 0, "stressed": 0}
    for r in rows:
        m = r["mood"]
        if m in base:
            base[m] = int(r["avg_cents"] or 0)
    return [{"mood": k, "avg_amount_cents": v} for k, v in base.items()]

def _upcoming_bills(user_id: int, within_days: int = 7):
    """Next-due bill occurrences for the next N days."""
    rows = db.session.execute(
        text("""
          SELECT
            bo.id          AS occurrence_id,
            b.id           AS bill_id,
            b.name         AS name,
            b.amount_cents AS amount_cents,
            bo.due_date    AS due_date,
            bo.status      AS status
          FROM bill b
          JOIN bill_occurrence bo ON bo.bill_id = b.id
          WHERE b.user_id = :uid
            AND bo.status = 'due'
            AND bo.due_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL :d DAY)
          ORDER BY bo.due_date ASC, bo.id ASC
        """),
        {"uid": user_id, "d": within_days}
    ).mappings().all()
    return [dict(r) for r in rows]

def _stored_alerts(user_id: int, days: int):
    """Surface rows from insight_alert for the window."""
    rows = db.session.execute(
        text("""
          SELECT id, source, code, title, message, severity, is_read, created_at
          FROM insight_alert
          WHERE user_id=:uid
            AND created_at >= (UTC_TIMESTAMP() - INTERVAL :win DAY)
          ORDER BY created_at DESC
        """),
        {"uid": user_id, "win": days}
    ).mappings().all()
    return [dict(r) for r in rows]

# ------------------------ endpoints ------------------------

@bp.get("/insights/summary")
def insights_summary():
    """
    Query: user_id, days (7|30)
    Returns wants share, late-night count, mood avgs, upcoming bills, and runway.
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        days = int(request.args.get("days", "7"))
        if days not in (7, 30):
            days = 7
        _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "valid user_id required")
    except Exception:
        return problem(404, "not_found", "user")

    wshare, wants_c, total_exp_c = _wants_share(user_id, days)
    late = _late_night_count(user_id, days)
    mood = _mood_avg_spend(user_id, days)
    upcoming = _upcoming_bills(user_id, within_days=7)

    # Runway with monthly cap for Regular
    goal_cap = min(_current_goal_days(user_id), 30)
    bal = _estimate_current_balance_cents(user_id)
    burn = _avg_daily_burn_cents(user_id, window_days=30)
    burn_ps = _power_save_lift(burn)

    def _safe_days(bal_c: int, per_day: int) -> int:
        if per_day is None or per_day <= 0:
            return goal_cap
        return max(int(bal_c // per_day), 0)

    regular_raw = _safe_days(bal, burn)
    days_left_regular = min(regular_raw, goal_cap)  # cap to month view
    # Power-Save can exceed 30, but avoid infinity
    days_left_power_save = _safe_days(bal, burn_ps)
    if days_left_power_save < days_left_regular:
        days_left_power_save = days_left_regular

    return {
        "wants_share": round(wshare, 4),
        "wants_expense_cents": wants_c,
        "total_expense_cents": total_exp_c,
        "late_night_count": late,
        "mood_avgs": mood,
        "upcoming_bills": upcoming,
        "runway": {
            "days_left_regular": days_left_regular,
            "days_left_power_save": days_left_power_save,
        },
    }, 200


@bp.get("/insights/alerts")
def insights_alerts():
    """Alert feed combining stored alerts + simple computed ones (no-ML baseline)."""
    try:
        user_id = int(request.args.get("user_id", "0"))
        days = int(request.args.get("days", "7"))
        if days not in (7, 30):
            days = 7
        _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "valid user_id required")
    except Exception:
        return problem(404, "not_found", "user")

    alerts = _stored_alerts(user_id, days)

    wshare, *_ = _wants_share(user_id, days)
    wants_pct = int(round(wshare * 100))
    alerts.insert(0, {
        "source": "backend",
        "code": "wants_share",
        "title": f"“Wants” are {wants_pct}% of your spend",
        "message": "Consider a short Power-Save streak if that feels high.",
        "severity": "info" if wants_pct < 50 else "warn",
        "created_at": datetime.utcnow().isoformat(sep=" "),
    })

    late = _late_night_count(user_id, days)
    if late >= 2:
        alerts.insert(0, {
            "source": "backend",
            "code": "late_night_spike",
            "title": f"Late-night purchases: {late} in last {days} days",
            "message": "Night-time buys often correlate with impulse mood.",
            "severity": "warn",
            "created_at": datetime.utcnow().isoformat(sep=" "),
        })

    return {"items": alerts}, 200


@bp.get("/insights/nwg-share")
def insights_nwg_share():
    """Pie data for Needs/Wants/Guilt over a window."""
    try:
        user_id = int(request.args.get("user_id", "0"))
        days = int(request.args.get("days", "30"))
        _require_user(user_id)
    except Exception:
        return problem(400, "validation_error", "valid user_id & days required")

    rows = db.session.execute(
        text("""
          SELECT spend_class,
                 COALESCE(SUM(amount_cents), 0) AS cents
          FROM `transaction`
          WHERE user_id=:uid
            AND type='expense'
            AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
          GROUP BY spend_class
        """),
        {"uid": user_id, "win": days}
    ).mappings().all()

    base = {"need": 0, "want": 0, "guilt": 0}
    for r in rows:
        k = r["spend_class"]
        if k in base:
            base[k] = int(r["cents"] or 0)

    return {
        "breakdown": [
            {"class": "need",  "amount_cents": base["need"]},
            {"class": "want",  "amount_cents": base["want"]},
            {"class": "guilt", "amount_cents": base["guilt"]},
        ]
    }, 200
