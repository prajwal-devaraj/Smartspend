# app/blueprints/dashboard.py
from __future__ import annotations
from datetime import date, timedelta, datetime

from flask import Blueprint, request
from sqlalchemy import text

from ..extensions import db
from ..errors import problem

bp = Blueprint("dashboard", __name__)

# ------------------------ helpers ------------------------


def _require_user(user_id: int):
    row = db.session.execute(
        text("SELECT id, timezone FROM `user` WHERE id=:uid"),
        {"uid": user_id},
    ).mappings().first()
    if not row:
        raise ValueError("user_not_found")
    return row


def _current_goal_days(user_id: int) -> int:
    v = db.session.execute(
        text(
            """
            SELECT target_days
            FROM goal_runway
            WHERE user_id=:uid
              AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
            ORDER BY effective_from DESC
            LIMIT 1
            """
        ),
        {"uid": user_id},
    ).scalar()
    return int(v or 30)


def _estimate_current_balance_cents(user_id: int) -> int:
    """
    Estimate current balance from all transactions:

      income  -> +
      expense -> -
      other   -> 0

    If you later add a true balance table, you can replace this.
    """
    v = db.session.execute(
        text(
            """
            SELECT COALESCE(SUM(
                     CASE
                       WHEN type='income'  THEN amount_cents
                       WHEN type='expense' THEN -amount_cents
                       ELSE 0
                     END
                   ), 0)
            FROM `transaction`
            WHERE user_id=:uid
            """
        ),
        {"uid": user_id},
    ).scalar()
    return int(v or 0)


def _avg_daily_burn_cents(user_id: int, window_days: int = 30) -> int:
    """
    Average daily *spend* (expenses only), not net of income.

    Uses transactions only:
      - type='expense'
      - over last `window_days` days (local date if available)
    """
    agg = db.session.execute(
        text(
            """
            SELECT
              COALESCE(SUM(
                CASE WHEN type='expense' THEN amount_cents END
              ), 0) AS exp_c
            FROM `transaction`
            WHERE user_id=:uid
              AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
            """
        ),
        {"uid": user_id, "win": window_days},
    ).mappings().first()

    total_exp = max(int(agg["exp_c"] or 0), 0)

    if total_exp <= 0:
        # no spend in window -> treat as 0 burn
        return 0

    return max(total_exp // max(window_days, 1), 1)


def _power_save_lift(burn_cents: int) -> int:
    """
    Power-Save = assume user can cut burn by ~20%.
    """
    if burn_cents <= 0:
        return 0
    return max(int(round(burn_cents * 0.80)), 1)

def _recent_achievements(user_id: int, limit: int = 6) -> list[dict]:
    """
    Temporary stub for achievements.

    For now we don’t calculate real achievements in the backend.
    Returning an empty list lets the frontend show the
    “Keep going — your first milestone is coming soon.” message
    instead of a 500 error.
    """
    return []

# ------------------------ building blocks ------------------------
def _upcoming_bills(user_id: int, within_days: int = 7):
    """
    Return bills whose *next_due_date* is within the next `within_days` days.

    This matches what your Bills page shows in the “Next due” column.
    """
    rows = db.session.execute(
        text(
            """
            SELECT
              b.id           AS occurrence_id,   -- alias so frontend type still works
              b.id           AS bill_id,
              b.name         AS name,
              b.amount_cents AS amount_cents,
              b.next_due_date AS due_date,
              b.status       AS status
            FROM bill b
            WHERE b.user_id = :uid
              AND b.next_due_date IS NOT NULL
              AND b.next_due_date BETWEEN CURRENT_DATE
                                      AND (CURRENT_DATE + INTERVAL :d DAY)
              AND (b.status IS NULL OR b.status = 'active')
            ORDER BY b.next_due_date ASC, b.id ASC
            """
        ),
        {"uid": user_id, "d": within_days},
    ).mappings().all()

    return [dict(r) for r in rows]


def _nwg_breakdown(user_id: int, days: int):
    rows = db.session.execute(
        text(
            """
            SELECT spend_class, COALESCE(SUM(amount_cents),0) AS cents
            FROM `transaction`
            WHERE user_id=:uid AND type='expense'
              AND txn_date_local >= CURRENT_DATE - INTERVAL :d DAY
            GROUP BY spend_class
            """
        ),
        {"uid": user_id, "d": days},
    ).mappings().all()
    base = {"need": 0, "want": 0, "guilt": 0}
    for r in rows:
        k = r["spend_class"]
        if k in base:
            base[k] = int(r["cents"] or 0)
    return [
        {"class": "need", "amount_cents": base["need"]},
        {"class": "want", "amount_cents": base["want"]},
        {"class": "guilt", "amount_cents": base["guilt"]},
    ]




# ------------------------ endpoints matching your UI ------------------------


@bp.get("/dashboard/kpis")
def dashboard_kpis():
    """
    For: BalanceCard, DaysLeftCard, DailyBurnCard, Next7DaysBurnCard.
    Query: user_id (required)
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "valid user_id required")
    except Exception:
        return problem(404, "not_found", "user")

    balance = _estimate_current_balance_cents(user_id)
    burn = _avg_daily_burn_cents(user_id, window_days=30)
    burn_ps = _power_save_lift(burn)

    # Runway logic: cap Regular at 30 (or user goal if smaller), Power-Save can exceed.
    cap = min(_current_goal_days(user_id), 30)

    def _days_left(bal_c: int, per_day: int) -> int:
        if per_day <= 0:
            # If no burn yet, just show full cap.
            return cap
        return max(int(bal_c // per_day), 0)

    reg_raw = _days_left(balance, burn)
    days_left_regular = min(reg_raw, cap)
    days_left_power = _days_left(balance, burn_ps)
    if days_left_power < days_left_regular:
        days_left_power = days_left_regular

    return {
        "balance_cents": balance,
        "avg_daily_burn_cents": burn,
        # For now, simple projection; you can replace with ML later.
        "projected_next7_burn_cents": burn * 7 if burn > 0 else 0,
        "runway": {
            "days_left_regular": days_left_regular,
            "days_left_power_save": days_left_power,
        },
    }, 200


@bp.get("/dashboard/burn-series")
def dashboard_burn_series():
    """
    For: BurnRateChart (horizontal scroll).
    Query: user_id (required), days (default 31)
    Output: { points: [{ d:'M/D', burn_cents:int }] }

    Here burn_cents = *total expenses per local day* (income ignored),
    so the chart shows "how much you spent each day".
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        days = int(request.args.get("days", "31"))
        if days <= 0 or days > 120:
            days = 31
        _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "valid user_id & days required")
    except Exception:
        return problem(404, "not_found", "user")

    points: list[dict] = []

    agg = db.session.execute(
        text(
            """
            SELECT
              COALESCE(txn_date_local, DATE(occurred_at)) AS d,
              COALESCE(SUM(
                CASE WHEN type='expense' THEN amount_cents END
              ),0) AS exp_c
            FROM `transaction`
            WHERE user_id=:uid
              AND occurred_at >= (UTC_TIMESTAMP() - INTERVAL :win DAY)
            GROUP BY d
            ORDER BY d
            """
        ),
        {"uid": user_id, "win": days},
    ).mappings().all()

    by_day = {r["d"]: max(int(r["exp_c"] or 0), 0) for r in agg}

    today = date.today()
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        points.append(
            {
                "d": f"{d.month}/{d.day}",
                "burn_cents": by_day.get(d, 0),
            }
        )

    return {"points": points}, 200


@bp.get("/dashboard/nwg")
def dashboard_nwg():
    """
    For: NWGPie (range toggle).
    Query: user_id (required), range = today|7d|30d  (default 7d)
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        r = (request.args.get("range") or "7d").lower()
        days = 1 if r == "today" else (30 if r == "30d" else 7)
        _require_user(user_id)
    except Exception:
        return problem(400, "validation_error", "valid user_id & range required")

    return {"breakdown": _nwg_breakdown(user_id, days)}, 200


@bp.get("/dashboard/insights-preview")
def dashboard_insights_preview():
    """
    Tiny list (max 3) for the InsightsPreview card.
    Pulls from insight_alert + 2 simple computed helpers.
    Query: user_id (required), days (default 7)
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        days = int(request.args.get("days", "7"))
        if days not in (7, 30):
            days = 7
        _require_user(user_id)
    except Exception:
        return problem(400, "validation_error", "valid user_id & days required")

    items = db.session.execute(
        text(
            """
            SELECT id, source, code, title, message, severity, created_at
            FROM insight_alert
            WHERE user_id=:uid
              AND created_at >= (UTC_TIMESTAMP() - INTERVAL :win DAY)
            ORDER BY created_at DESC
            LIMIT 3
            """
        ),
        {"uid": user_id, "win": days},
    ).mappings().all()
    alerts = [dict(r) for r in items]

    # Simple computed add-ons (deterministic)
    wants_row = db.session.execute(
        text(
            """
            SELECT
              COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents END),0) AS total_exp,
              COALESCE(SUM(CASE WHEN type='expense' AND spend_class='want' THEN amount_cents END),0) AS wants_exp
            FROM `transaction`
            WHERE user_id=:uid
              AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
            """
        ),
        {"uid": user_id, "win": days},
    ).mappings().first()
    total = int(wants_row["total_exp"] or 0)
    wants = int(wants_row["wants_exp"] or 0)
    pct = int(round((wants / total) * 100)) if total > 0 else 0
    if pct >= 0:  # always show a small nudge
        alerts.insert(
            0,
            {
                "source": "backend",
                "code": "wants_share",
                "title": f"“Wants” are {pct}% of your spend",
                "message": "Consider a short Power-Save streak if that feels high.",
                "severity": "warn" if pct >= 50 else "info",
                "created_at": datetime.utcnow().isoformat(sep=" "),
            },
        )

    late = db.session.execute(
        text(
            """
            SELECT COALESCE(COUNT(*),0)
            FROM `transaction`
            WHERE user_id=:uid AND type='expense'
              AND day_part_local='late_night'
              AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
            """
        ),
        {"uid": user_id, "win": days},
    ).scalar() or 0
    if late >= 2:
        alerts.insert(
            0,
            {
                "source": "backend",
                "code": "late_night_spike",
                "title": f"Late-night purchases: {late} in last {days} days",
                "message": "Night-time buys often correlate with impulse mood.",
                "severity": "warn",
                "created_at": datetime.utcnow().isoformat(sep=" "),
            },
        )

    return {"items": alerts[:3]}, 200


@bp.get("/dashboard/upcoming-bills")
def dashboard_upcoming_bills():
    """
    For: UpcomingBills card.
    Query: user_id (required), days (default 7)
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        days = int(request.args.get("days", "7"))
        if days <= 0 or days > 60:
            days = 7
        _require_user(user_id)
    except Exception:
        return problem(400, "validation_error", "valid user_id & days required")

    return {"items": _upcoming_bills(user_id, within_days=days)}, 200


@bp.get("/dashboard/achievements/recent")
def dashboard_achievements_recent():
    """
    For: AchievementsCard.
    Query: user_id (required), limit (default 6)
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        limit = int(request.args.get("limit", "6"))
        if limit <= 0 or limit > 20:
            limit = 6
        _require_user(user_id)
    except Exception:
        return problem(400, "validation_error", "valid user_id & limit required")

    return {"items": _recent_achievements(user_id, limit)}, 200
