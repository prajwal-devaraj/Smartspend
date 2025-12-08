# app/blueprints/goals.py
from __future__ import annotations
from datetime import date, datetime, timedelta
from typing import Optional

from flask import Blueprint, request
from sqlalchemy import text

from ..extensions import db
from ..errors import problem

bp = Blueprint("goals", __name__)

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
    """Get the active goal (latest row whose effective_to is NULL or future)."""
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

def _set_goal_days(user_id: int, target_days: int):
    # Close previous active row
    db.session.execute(
        text("""
            UPDATE goal_runway
            SET effective_to = CURRENT_DATE - INTERVAL 1 DAY
            WHERE user_id=:uid AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        """),
        {"uid": user_id}
    )
    # Insert new active row
    db.session.execute(
        text("""
            INSERT INTO goal_runway (user_id, target_days, effective_from)
            VALUES (:uid, :days, CURRENT_DATE)
        """),
        {"uid": user_id, "days": target_days}
    )

def _utc_now():
    return datetime.utcnow()

# --- burn-rate & balance estimation ---
def _estimate_current_balance_cents(user_id: int) -> int:
    """
    Balance = sum(income) - sum(expense) for all time (UTC).
    If you later track actual account balances, replace this with that source.
    """
    row = db.session.execute(
        text("""
            SELECT
              COALESCE(SUM(CASE WHEN type='income'  THEN amount_cents
                                WHEN type='expense' THEN -amount_cents
                                ELSE 0 END), 0) AS balance_cents
            FROM `transaction`
            WHERE user_id = :uid
        """),
        {"uid": user_id}
    ).scalar()
    return int(row or 0)

def _avg_daily_burn_cents(user_id: int, tz: str, window_days: int = 30) -> int:
    """
    Prefer insight_daily if populated; otherwise fallback to transactions in last N days.
    Burn = max( (expense - income) per day, 0 ). Return >= 1 cent to avoid div-by-zero.
    """
    # Try insight_daily
    row = db.session.execute(
        text("""
            SELECT
                GREATEST(ROUND(AVG(GREATEST(burn_rate_cents, 0))), 0)
            FROM insight_daily
            WHERE user_id = :uid
              AND day >= CURRENT_DATE - INTERVAL :win DAY
        """),
        {"uid": user_id, "win": window_days}
    ).scalar()
    if row is not None:
        return max(int(row), 1)

    # Fallback: compute from transactions (UTC window)
    row2 = db.session.execute(
        text("""
            SELECT
              COALESCE(SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END), 0) AS exp_c,
              COALESCE(SUM(CASE WHEN type='income'  THEN amount_cents ELSE 0 END), 0) AS inc_c
            FROM `transaction`
            WHERE user_id=:uid
              AND occurred_at >= (UTC_TIMESTAMP() - INTERVAL :win DAY)
        """),
        {"uid": user_id, "win": window_days}
    ).mappings().first()
    total_burn = max(int((row2["exp_c"] or 0) - (row2["inc_c"] or 0)), 0)
    avg = total_burn // max(window_days, 1)
    return max(avg, 1)

def _power_save_lift(burn_cents: int) -> int:
    """
    Simple heuristic: power-save reduces burn by 20%.
    Tune/replace with ML later.
    """
    reduced = int(round(burn_cents * 0.80))
    return max(reduced, 1)

def _days_left(bal_cents: int, burn_cents: int, cap: Optional[int] = None) -> int:
    """
    Floor division of balance by burn (>=1), clamped to >=0.
    If cap is provided, clamp to that cap.
    """
    burn = max(int(burn_cents or 0), 1)
    days = int(max(bal_cents // burn, 0))
    return min(days, cap) if cap is not None else days

# ------------------------ endpoints ------------------------

@bp.get("/goals/snapshot")
def goals_snapshot():
    """
    Returns:
      {
        goal_days: number,
        days_left_regular: number,
        days_left_power_save: number,
        basis: { balance_cents, avg_daily_burn_cents, window_days }
      }
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        if not user_id:
            return problem(400, "validation_error", "user_id required")
        u = _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "user_id invalid")
    except Exception:
        return problem(404, "not_found", "user")

    goal_days = _current_goal_days(user_id)  # e.g., 30
    balance_cents = _estimate_current_balance_cents(user_id)
    burn_cents = _avg_daily_burn_cents(user_id, u["timezone"], window_days=30)
    burn_ps_cents = _power_save_lift(burn_cents)

    out = {
        "goal_days": goal_days,
        # Regular is capped at goal_days (month-oriented cap)
        "days_left_regular": _days_left(balance_cents, burn_cents, cap=goal_days),
        # Power-Save is uncapped (can exceed 30)
        "days_left_power_save": _days_left(balance_cents, burn_ps_cents),
        "basis": {
            "balance_cents": balance_cents,
            "avg_daily_burn_cents": burn_cents,
            "window_days": 30
        }
    }
    return out, 200


@bp.patch("/goals/target")
def goals_target_update():
    """
    Body: { user_id: number, target_days: number (15..90 recommended) }
    Versioned write to goal_runway.
    """
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

    _set_goal_days(user_id, target_days)
    db.session.commit()
    return {"ok": True, "goal_days": target_days}, 200


@bp.get("/goals/history")
def goals_history():
    """
    Query:
      user_id (required)
      days (optional, default 120) – how many days back
    Returns:
      { points: [{ d: 'M/D', regular: n, power: n }, ...] }
    Strategy:
      - Use daily_balance for balance snapshot per local day if available;
        otherwise approximate by rolling sum of txns.
      - Use a single average daily burn over the period window for simplicity.
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        days_back = int(request.args.get("days", "120"))
        if not user_id:
            return problem(400, "validation_error", "user_id required")
        u = _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "user_id/days invalid")
    except Exception:
        return problem(404, "not_found", "user")

    # Same burn basis as snapshot
    burn_cents = _avg_daily_burn_cents(user_id, u["timezone"], window_days=30)
    burn_ps_cents = _power_save_lift(burn_cents)
    goal_days = _current_goal_days(user_id)  # cap for Regular

    # Try to read daily balances (local day)
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
        # Use the snapshots directly
        for r in rows:
            d = r["day_local"]
            bal = int(r["balance_cents"] or 0)
            reg_days = _days_left(bal, burn_cents, cap=goal_days)   # CAP
            ps_days  = _days_left(bal, burn_ps_cents)               # UN-CAPPED
            points.append({
                "d": f"{d.month}/{d.day}",
                "regular": int(reg_days),
                "power": int(ps_days),
            })
    else:
        # Fallback: reconstruct balances by rolling net change from transactions (local day)
        changes = db.session.execute(
            text("""
                SELECT txn_date_local AS d,
                       COALESCE(SUM(CASE WHEN type='income' THEN amount_cents
                                         WHEN type='expense' THEN -amount_cents ELSE 0 END),0) AS delta
                FROM `transaction`
                WHERE user_id=:uid
                  AND txn_date_local >= CURRENT_DATE - INTERVAL :win DAY
                GROUP BY txn_date_local
                ORDER BY txn_date_local
            """),
            {"uid": user_id, "win": days_back}
        ).mappings().all()

        cur_balance = _estimate_current_balance_cents(user_id)
        delta_by_day = {c["d"]: int(c["delta"] or 0) for c in changes}

        today = date.today()
        day_list = [today - timedelta(days=i) for i in range(days_back - 1, -1, -1)]

        total_delta = sum(delta_by_day.get(d, 0) for d in day_list)
        bal = cur_balance - total_delta  # back-computed starting balance

        for d in day_list:
            bal += delta_by_day.get(d, 0)  # end-of-day balance
            reg_days = _days_left(bal, burn_cents, cap=goal_days)   # CAP
            ps_days  = _days_left(bal, burn_ps_cents)               # UN-CAPPED
            points.append({
                "d": f"{d.month}/{d.day}",
                "regular": int(reg_days),
                "power": int(ps_days),
            })

    return {"points": points}, 200
