# app/blueprints/goals.py
from __future__ import annotations
from datetime import date, datetime, timedelta
from typing import Optional

from flask import Blueprint, request
from sqlalchemy import text

from ..extensions import db
from ..errors import problem

bp = Blueprint("goals", __name__)


# ========================= HELPERS =========================

def _require_user(user_id: int):
    row = db.session.execute(
        text("SELECT id, timezone FROM `user` WHERE id=:uid"),
        {"uid": user_id}
    ).mappings().first()
    if not row:
        raise ValueError("user_not_found")
    return row


def _current_goal_days(user_id: int) -> int:
    row = db.session.execute(
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
    return int(row or 30)


# ---- THIS IS THE OFFICIAL BURN RATE (MATCHING DASHBOARD) ----
def _dashboard_burn_cents(user_id: int, window_days: int = 30) -> int:
    """
    EXACT same logic used in /dashboard/kpis.
    Uses transaction table directly.
    """
    agg = db.session.execute(
        text("""
            SELECT
              COALESCE(SUM(
                CASE WHEN type='expense' THEN amount_cents END
              ), 0) AS exp_c
            FROM `transaction`
            WHERE user_id=:uid
              AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
        """),
        {"uid": user_id, "win": window_days},
    ).mappings().first()

    total_exp = max(int(agg["exp_c"] or 0), 0)
    if total_exp <= 0:
        return 0

    return max(total_exp // max(window_days, 1), 1)


def _estimate_current_balance_cents(user_id: int) -> int:
    row = db.session.execute(
        text("""
            SELECT
              COALESCE(SUM(CASE WHEN type='income'  THEN amount_cents
                                WHEN type='expense' THEN -amount_cents END), 0)
            FROM `transaction`
            WHERE user_id = :uid
        """),
        {"uid": user_id}
    ).scalar()
    return int(row or 0)


def _power_save_lift(burn_cents: int) -> int:
    reduced = int(round(burn_cents * 0.80))
    return max(reduced, 1)


def _days_left(bal_cents: int, burn_cents: int, cap: Optional[int] = None) -> int:
    burn = max(int(burn_cents or 0), 1)
    days = int(max(bal_cents // burn, 0))
    return min(days, cap) if cap is not None else days


# ========================= SNAPSHOT =========================

@bp.get("/goals/snapshot")
def goals_snapshot():
    """
    FIXED VERSION — now matches Dashboard burn rate.
    Returns:
      {
        goal_days,
        days_left_regular,
        days_left_power_save,
        basis: {
          balance_cents,
          avg_daily_burn_cents,  <-- now dashboard burn
          window_days
        },
        model_burn_rate   <-- NEW
      }
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        if not user_id:
            return problem(400, "validation_error", "user_id required")
        _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "invalid user_id")
    except Exception:
        return problem(404, "not_found", "user")

    goal_days = _current_goal_days(user_id)

    balance_cents = _estimate_current_balance_cents(user_id)

    # ⭐ OFFICIAL DASHBOARD BURN RATE
    burn_cents = _dashboard_burn_cents(user_id, window_days=30)

    # ⭐ ML also uses this
    model_burn_rate = burn_cents / 100.0

    burn_ps_cents = _power_save_lift(burn_cents)

    out = {
        "goal_days": goal_days,
        "days_left_regular": _days_left(balance_cents, burn_cents, cap=goal_days),
        "days_left_power_save": _days_left(balance_cents, burn_ps_cents),
        "basis": {
            "balance_cents": balance_cents,
            "avg_daily_burn_cents": burn_cents,   # <-- NOW SAME AS DASHBOARD
            "window_days": 30
        },
        "model_burn_rate": model_burn_rate,       # <-- NEW FIELD
    }
    return out, 200


# ========================= UPDATE TARGET =========================

@bp.patch("/goals/target")
def goals_target_update():
    d = request.get_json(silent=True) or {}
    try:
        user_id = int(d.get("user_id") or 0)
        target_days = int(d.get("target_days") or 0)
        if not user_id or target_days <= 0:
            raise ValueError
        _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "valid user_id & target_days required")
    except Exception:
        return problem(404, "not_found", "user")

    # Close previous active
    db.session.execute(
        text("""
            UPDATE goal_runway
            SET effective_to = CURRENT_DATE - INTERVAL 1 DAY
            WHERE user_id=:uid
              AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        """),
        {"uid": user_id}
    )

    # Insert new
    db.session.execute(
        text("""
            INSERT INTO goal_runway (user_id, target_days, effective_from)
            VALUES (:uid, :days, CURRENT_DATE)
        """),
        {"uid": user_id, "days": target_days}
    )

    db.session.commit()
    return {"ok": True, "goal_days": target_days}, 200


# ========================= HISTORY =========================

@bp.get("/goals/history")
def goals_history():
    """
    Uses corrected burn rate for consistent runway history.
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        days_back = int(request.args.get("days", "120"))
        if not user_id:
            return problem(400, "validation_error", "user_id required")
        _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "invalid")
    except Exception:
        return problem(404, "not_found", "user")

    # ⭐ Correct burn
    burn_cents = _dashboard_burn_cents(user_id, window_days=30)
    burn_ps_cents = _power_save_lift(burn_cents)
    goal_days = _current_goal_days(user_id)

    # Try daily_balance table
    rows = db.session.execute(
        text("""
            SELECT day_local, balance_cents
            FROM daily_balance
            WHERE user_id=:uid
              AND day_local >= CURRENT_DATE - INTERVAL :win DAY
            ORDER BY day_local ASC
        """),
        {"uid": user_id, "win": days_back}
    ).mappings().all()

    points = []

    if rows:
        for r in rows:
            bal = int(r["balance_cents"] or 0)
            points.append({
                "d": f"{r['day_local'].month}/{r['day_local'].day}",
                "regular": _days_left(bal, burn_cents, cap=goal_days),
                "power": _days_left(bal, burn_ps_cents),
            })
    else:
        # reconstruct from txns
        changes = db.session.execute(
            text("""
                SELECT txn_date_local AS d,
                       COALESCE(SUM(CASE WHEN type='income' THEN amount_cents
                                         WHEN type='expense' THEN -amount_cents END),0) AS delta
                FROM `transaction`
                WHERE user_id=:uid
                  AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
                GROUP BY txn_date_local
                ORDER BY txn_date_local
            """),
            {"uid": user_id, "win": days_back}
        ).mappings().all()

        cur_balance = _estimate_current_balance_cents(user_id)
        delta_by_day = {r["d"]: int(r["delta"] or 0) for r in changes}

        today = date.today()
        day_list = [today - timedelta(days=i) for i in range(days_back - 1, -1, -1)]

        total_delta = sum(delta_by_day.get(d, 0) for d in day_list)
        bal_start = cur_balance - total_delta

        bal = bal_start
        for d in day_list:
            bal += delta_by_day.get(d, 0)
            points.append({
                "d": f"{d.month}/{d.day}",
                "regular": _days_left(bal, burn_cents, cap=goal_days),
                "power": _days_left(bal, burn_ps_cents),
            })

    return {"points": points}, 200
