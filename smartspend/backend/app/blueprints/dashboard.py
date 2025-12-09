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
        text("""
            SELECT target_days
            FROM goal_runway
            WHERE user_id=:uid
              AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
            ORDER BY effective_from DESC
            LIMIT 1
        """),
        {"uid": user_id},
    ).scalar()
    return int(v or 30)


def _estimate_current_balance_cents(user_id: int) -> int:
    v = db.session.execute(
        text("""
            SELECT COALESCE(SUM(
                     CASE
                       WHEN type='income'  THEN amount_cents
                       WHEN type='expense' THEN -amount_cents
                       ELSE 0
                     END
                   ), 0)
            FROM `transaction`
            WHERE user_id=:uid
        """),
        {"uid": user_id},
    ).scalar()
    return int(v or 0)


def _avg_daily_burn_cents(user_id: int, window_days: int = 30) -> int:
    """
    Burn rate = total expenses over last 30 days / 30.
    """
    agg = db.session.execute(
        text("""
            SELECT COALESCE(SUM(
                CASE WHEN type='expense' THEN amount_cents END
            ), 0) AS exp_c
            FROM `transaction`
            WHERE user_id=:uid
              AND DATE(txn_date_local) >= (CURRENT_DATE - INTERVAL :win DAY)
        """),
        {"uid": user_id, "win": window_days},
    ).mappings().first()

    total_exp = max(int(agg["exp_c"] or 0), 0)

    # New user OR no expenses → burn = 0
    if total_exp <= 0:
        return 0

    return max(total_exp // max(window_days, 1), 1)


# ------------------------ Previous 7 FULL days ------------------------

def _last7_burn_cents(user_id: int) -> int:
    """
    Includes only previous 7 *full* days.
    Example: If today = Jan 10, include Jan 3–9.
    Excludes today entirely.
    """
    rows = db.session.execute(
        text("""
            SELECT COALESCE(SUM(amount_cents), 0)
            FROM `transaction`
            WHERE user_id = :uid
              AND type = 'expense'
              AND DATE(txn_date_local)
                    BETWEEN (CURRENT_DATE - INTERVAL 7 DAY)
                        AND (CURRENT_DATE - INTERVAL 1 DAY)
        """),
        {"uid": user_id},
    ).scalar()

    return int(rows or 0)


# ------------------------ Upcoming Bills ------------------------

def _upcoming_bills(user_id: int, within_days: int = 7):
    rows = db.session.execute(
        text("""
            SELECT
              b.id           AS occurrence_id,
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
        """),
        {"uid": user_id, "d": within_days},
    ).mappings().all()

    return [dict(r) for r in rows]


# ------------------------ NWG breakdown ------------------------

def _nwg_breakdown(user_id: int, days: int):
    rows = db.session.execute(
        text("""
            SELECT spend_class, COALESCE(SUM(amount_cents),0) AS cents
            FROM `transaction`
            WHERE user_id=:uid AND type='expense'
              AND txn_date_local >= CURRENT_DATE - INTERVAL :d DAY
            GROUP BY spend_class
        """),
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


# ------------------------ KPI ENDPOINT ------------------------

@bp.get("/dashboard/kpis")
def dashboard_kpis():
    try:
        user_id = int(request.args.get("user_id", "0"))
        _require_user(user_id)
    except:
        return problem(400, "validation_error", "valid user_id required")

    balance = _estimate_current_balance_cents(user_id)
    burn = _avg_daily_burn_cents(user_id)
    burn_ps = int(burn * 0.80) if burn > 0 else 0   # 20% power-save improvement

    # ⭐ previous 7 days expenses (no today)
    last7 = _last7_burn_cents(user_id)

    if last7 > 0:
        avg7_dollars = round((last7 / 7) / 100.0, 2)
    else:
        avg7_dollars = 0.0

    # runway cap
    cap = 30

    def _days_left(balance_cents: int, per_day: int):
        if per_day <= 0:
            return cap
        return min(balance_cents // per_day, cap)

    # regular runway
    days_regular = _days_left(balance, burn)

    # power-save runway (also capped)
    days_power = _days_left(balance, burn_ps)

    # ensure power-save never below regular
    if days_power < days_regular:
        days_power = days_regular

    return {
        "balance_cents": balance,
        "avg_daily_burn_cents": burn,
        "projected_next7_burn_cents": avg7_dollars,
        "runway": {
            "days_left_regular": days_regular,
            "days_left_power_save": days_power,
        },
    }, 200


# ------------------------ Burn series graph ------------------------

@bp.get("/dashboard/burn-series")
def dashboard_burn_series():
    try:
        user_id = int(request.args.get("user_id", "0"))
        days = int(request.args.get("days", "31"))
        if days < 1 or days > 120:
            days = 31
        _require_user(user_id)
    except:
        return problem(400, "validation_error", "valid params")

    agg = db.session.execute(
        text("""
            SELECT
              DATE(txn_date_local) AS d,
              COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents END),0) AS exp_c
            FROM `transaction`
            WHERE user_id=:uid
              AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
            GROUP BY d
            ORDER BY d
        """),
        {"uid": user_id, "win": days},
    ).mappings().all()

    by_day = {r["d"]: int(r["exp_c"] or 0) for r in agg}

    today = date.today()
    points = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        points.append({
            "d": f"{d.month}/{d.day}",
            "burn_cents": by_day.get(d, 0),
        })

    return {"points": points}, 200


# ------------------------ NWG ------------------------

@bp.get("/dashboard/nwg")
def dashboard_nwg():
    try:
        user_id = int(request.args.get("user_id", "0"))
        r = (request.args.get("range") or "7d").lower()
        days = 1 if r == "today" else 30 if r == "30d" else 7
        _require_user(user_id)
    except:
        return problem(400, "validation_error", "invalid params")

    return {"breakdown": _nwg_breakdown(user_id, days)}, 200


# ------------------------ Insights preview ------------------------

@bp.get("/dashboard/insights-preview")
def dashboard_insights_preview():
    try:
        user_id = int(request.args.get("user_id", "0"))
        days = int(request.args.get("days", "7"))
        if days not in (7, 30):
            days = 7
        _require_user(user_id)
    except:
        return problem(400, "validation_error", "invalid params")

    items = db.session.execute(
        text("""
            SELECT id, source, code, title, message, severity, created_at
            FROM insight_alert
            WHERE user_id=:uid
              AND created_at >= (UTC_TIMESTAMP() - INTERVAL :win DAY)
            ORDER BY created_at DESC
            LIMIT 3
        """),
        {"uid": user_id, "win": days},
    ).mappings().all()

    alerts = [dict(r) for r in items]

    # Wants % insight
    wants_row = db.session.execute(
        text("""
            SELECT
              COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents END),0) AS total_exp,
              COALESCE(SUM(CASE WHEN type='expense' AND spend_class='want' THEN amount_cents END),0) AS wants_exp
            FROM `transaction`
            WHERE user_id=:uid
              AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
        """),
        {"uid": user_id, "win": days},
    ).mappings().first()

    total = int(wants_row["total_exp"] or 0)
    wants = int(wants_row["wants_exp"] or 0)
    pct = int(round((wants / total) * 100)) if total > 0 else 0

    if pct >= 0:
        alerts.insert(0, {
            "source": "backend",
            "code": "wants_share",
            "title": f"“Wants” are {pct}% of your spend",
            "message": "Consider a short Power-Save streak if that feels high.",
            "severity": "warn" if pct >= 50 else "info",
            "created_at": datetime.utcnow().isoformat(sep=" "),
        })

    return {"items": alerts[:3]}, 200


# ------------------------ Achievements ------------------------

@bp.get("/dashboard/achievements/recent")
def dashboard_achievements_recent():
    try:
        user_id = int(request.args.get("user_id", "0"))
        limit = int(request.args.get("limit", "6"))
        limit = max(1, min(limit, 20))
        _require_user(user_id)
    except:
        return problem(400, "validation_error", "invalid params")

    return {"items": []}, 200
