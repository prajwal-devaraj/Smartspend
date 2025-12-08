# app/blueprints/transactions.py
from __future__ import annotations

from flask import Blueprint, request
from datetime import datetime, timedelta
from typing import Optional, Tuple
from sqlalchemy import or_

from ..extensions import db
from ..models import Transaction, MonthlyPeriod, User
from ..errors import problem
from ..services.periods import get_or_create_period
from ..services.category_service import resolve_category_id_or_default
from ..utils.tz import get_zoneinfo  # timezone helper

bp = Blueprint("transactions", __name__)

# -------------------- helpers --------------------
_ALLOWED_MOODS = {"happy", "neutral", "stressed"}
_ALLOWED_SPEND = {"need", "want", "guilt"}

def _parse_bool(v: Optional[str]) -> Optional[bool]:
    if v is None:
        return None
    v = v.strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    return None

def _date_preset_bounds(preset: str | None) -> Tuple[Optional[datetime], Optional[datetime]]:
    """
    Return naive UTC datetimes for filtering (we store UTC in DB).
    Presets: 7d, 30d, 90d (rolling windows); anything else => no bound.
    """
    now = datetime.utcnow()
    if preset in ("7d", "30d", "90d"):
        days = int(preset[:-1])
        start = now - timedelta(days=days)
        return (start, None)
    return (None, None)

def _require_user(user_id: int) -> User:
    u = User.query.get(user_id)
    if not u:
        raise ValueError("user_not_found")
    return u

def _to_cents(v: Optional[str]) -> Optional[int]:
    if not v:
        return None
    try:
        return int(round(float(v) * 100))
    except Exception:
        return None

def _local_day_part(dt_local: datetime) -> str:
    h = dt_local.hour
    if 4 <= h <= 11:
        return "morning"
    if 12 <= h <= 15:
        return "afternoon"
    if 16 <= h <= 21:
        return "evening"
    return "late_night"


# -------------------- GET /transactions --------------------
@bp.get("/transactions")
def list_transactions():
    # user validation
    try:
        user_id = int(request.args.get("user_id", "0"))
        if not user_id:
            return problem(400, "validation_error", "user_id required")
        u = _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "user_id invalid")
    except Exception:
        return problem(404, "not_found", "user")

    # query params
    q = (request.args.get("q") or "").strip().lower()
    typ = request.args.get("type")                      # 'income' | 'expense'
    nwg = request.args.get("nwg")                       # 'Need' | 'Want' | 'Guilt'
    mood = request.args.get("mood")                     # 'happy' | 'neutral' | 'stressed'
    late = _parse_bool(request.args.get("late"))        # local late-night toggle
    date_preset = request.args.get("date") or "30d"
    sort = request.args.get("sort") or "date_desc"
    include_bills = _parse_bool(request.args.get("include_bills")) or False

    try:
        page = max(1, int(request.args.get("page", "1")))
        per_page = min(100, max(1, int(request.args.get("per_page", "20"))))
    except ValueError:
        return problem(400, "validation_error", "page/per_page invalid")

    start_utc, end_utc = _date_preset_bounds(date_preset)

    # base query (UTC filters only; local filtering happens below)
    qset = Transaction.query.filter(Transaction.user_id == user_id)

    # Option A: include/exclude bill-paid rows
    if not include_bills:
        qset = qset.filter(Transaction.bill_payment_id.is_(None))

    if typ in ("income", "expense"):
        qset = qset.filter(Transaction.type == typ)

    if nwg in ("Need", "Want", "Guilt"):
        qset = qset.filter(Transaction.spend_class == nwg.lower())

    if mood in _ALLOWED_MOODS:
        qset = qset.filter(Transaction.mood == mood)

    if q:
        like = f"%{q}%"
        qset = qset.filter(or_(Transaction.merchant.ilike(like),
                               Transaction.memo.ilike(like)))

    vmin = _to_cents(request.args.get("min"))
    vmax = _to_cents(request.args.get("max"))
    if vmin is not None:
        qset = qset.filter(Transaction.amount_cents >= vmin)
    if vmax is not None:
        qset = qset.filter(Transaction.amount_cents <= vmax)

    if start_utc is not None:
        qset = qset.filter(Transaction.occurred_at >= start_utc)
    if end_utc is not None:
        qset = qset.filter(Transaction.occurred_at < end_utc)

    # sort by UTC (stable)
    if sort == "date_asc":
        qset = qset.order_by(Transaction.occurred_at.asc(), Transaction.id.asc())
    elif sort == "amount_desc":
        qset = qset.order_by(Transaction.amount_cents.desc(), Transaction.id.desc())
    elif sort == "amount_asc":
        qset = qset.order_by(Transaction.amount_cents.asc(), Transaction.id.asc())
    else:
        qset = qset.order_by(Transaction.occurred_at.desc(), Transaction.id.desc())

    # DB count before local late-night filter (so pagination reflects DB slice)
    total_db = qset.count()
    rows = qset.limit(per_page).offset((page - 1) * per_page).all()

    # local mapping with safe tz loader
    tz = get_zoneinfo(u.timezone)
    items = []
    for t in rows:
        occurred_utc = t.occurred_at.replace(tzinfo=get_zoneinfo("UTC"))
        occurred_local = occurred_utc.astimezone(tz)
        dp_local = _local_day_part(occurred_local)

        # apply late-night filter in LOCAL time
        if late is True and dp_local != "late_night":
            continue
        if late is False and dp_local == "late_night":
            continue

        items.append({
            "id": t.id,
            "type": t.type,
            "amount": round((t.amount_cents or 0) / 100.0, 2),
            "amount_cents": t.amount_cents,
            "occurred_at_utc": occurred_utc.isoformat().replace("+00:00", "Z"),
            "occurred_at_local": occurred_local.isoformat(),
            "merchant": t.merchant,
            "note": t.memo,
            "nwg": (t.spend_class.capitalize() if t.spend_class else None),
            "mood": t.mood,
            "category_id": t.category_id,
            "bill_payment_id": t.bill_payment_id,
            "late_night_local": (dp_local == "late_night"),
            "day_part_local": dp_local,
        })

    return {"total": total_db, "page": page, "per_page": per_page, "items": items}, 200


# -------------------- POST /transactions --------------------
@bp.post("/transactions")
def create_transaction():
    d = request.get_json(silent=True) or {}

    # user
    try:
        user_id = int(d.get("user_id") or 0)
        u = _require_user(user_id)
    except Exception:
        return problem(400, "validation_error", "valid user_id required")

    # type
    typ = d.get("type")
    if typ not in ("income", "expense"):
        return problem(400, "validation_error", "type must be 'income' or 'expense'")

    # amount
    try:
        amount_cents = int(d.get("amount_cents") or 0)
        if amount_cents <= 0:
            raise ValueError
    except Exception:
        return problem(400, "validation_error", "amount_cents must be positive integer")

    # when (expecting UTC ISO like '...Z'); default now (UTC)
    when = d.get("occurred_at")
    if when:
        try:
            occurred_at = datetime.fromisoformat(str(when).replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return problem(400, "validation_error", "occurred_at must be ISO datetime")
    else:
        occurred_at = datetime.utcnow()

    merchant = (d.get("merchant") or "").strip() or None
    memo = (d.get("memo") or "").strip() or None
    spend_class = d.get("spend_class")
    mood = d.get("mood")
    req_category_id = d.get("category_id")

    if typ == "expense" and spend_class and spend_class not in _ALLOWED_SPEND:
        return problem(400, "validation_error", "spend_class must be need|want|guilt")

    if mood is not None:
        if mood not in _ALLOWED_MOODS:
            return problem(400, "validation_error", "mood must be happy|neutral|stressed")

    # recurring guard
    if d.get("recurring") in (True, "true", "1"):
        return problem(409, "use_bills_api", "Recurring expenses should be created via /bills")

    # attach period by UTC timestamp
    period = get_or_create_period(user_id, occurred_at)

    # resolve category (fall back to defaults)
    try:
        resolved_category_id = resolve_category_id_or_default(user_id, typ, req_category_id)
    except ValueError as e:
        return problem(400, "validation_error", str(e))

    # set per-row timezone (mirrors onboarding behavior)
    t = Transaction(
        user_id=user_id,
        period_id=period.id,
        type=typ,
        amount_cents=amount_cents,
        occurred_at=occurred_at,     # stored as naive UTC
        timezone=u.timezone or "America/New_York",
        merchant=merchant,
        memo=memo,
        spend_class=spend_class,
        mood=mood,
        category_id=resolved_category_id,
        bill_payment_id=None,
    )
    db.session.add(t)
    db.session.commit()

    occurred_utc = t.occurred_at.replace(tzinfo=get_zoneinfo("UTC"))
    tz = get_zoneinfo(u.timezone)
    occurred_local = occurred_utc.astimezone(tz)

    return {
        "id": t.id,
        "type": t.type,
        "amount_cents": t.amount_cents,
        "occurred_at_utc": occurred_utc.isoformat().replace("+00:00", "Z"),
        "occurred_at_local": occurred_local.isoformat(),
        "merchant": t.merchant,
        "note": t.memo,
        "nwg": (t.spend_class.capitalize() if t.spend_class else None),
        "mood": t.mood,
        "category_id": t.category_id,
    }, 201


# -------------------- PATCH /transactions/<id> --------------------
@bp.patch("/transactions/<int:tx_id>")
def update_transaction(tx_id: int):
    d = request.get_json(silent=True) or {}
    tx = Transaction.query.get(tx_id)
    if not tx:
        return problem(404, "not_found", "transaction")

    user_id = d.get("user_id")
    if user_id and int(user_id) != tx.user_id:
        return problem(403, "forbidden", "Transaction does not belong to user")

    # Compute prospective type (may be unchanged)
    new_type = d.get("type", tx.type) or tx.type
    if new_type not in ("income", "expense"):
        return problem(400, "validation_error", "type must be 'income' or 'expense'")

    # If category or type is changing, resolve a valid category_id
    if ("category_id" in d) or ("type" in d and new_type != tx.type):
        try:
            tx.category_id = resolve_category_id_or_default(
                tx.user_id,
                new_type,
                d.get("category_id") if "category_id" in d else tx.category_id
            )
        except ValueError as e:
            return problem(400, "validation_error", str(e))

    # Now set the (possibly changed) type
    tx.type = new_type

    # Other mutable fields
    if "merchant" in d and d["merchant"] is not None:
        tx.merchant = (str(d["merchant"]).strip() or None)
    if "memo" in d and d["memo"] is not None:
        tx.memo = (str(d["memo"]).strip() or None)

    if "mood" in d:
        m = d["mood"]
        if m is None:
            tx.mood = None
        else:
            m = str(m)
            if m not in _ALLOWED_MOODS:
                return problem(400, "validation_error", "mood must be happy|neutral|stressed")
            tx.mood = m

    if "spend_class" in d:
        sc = d["spend_class"]
        if sc is None:
            tx.spend_class = None
        else:
            sc = str(sc)
            if sc not in _ALLOWED_SPEND:
                return problem(400, "validation_error", "spend_class must be need|want|guilt")
            tx.spend_class = sc

    if "amount_cents" in d and d["amount_cents"] is not None:
        try:
            v = int(d["amount_cents"])
            if v <= 0:
                raise ValueError
        except Exception:
            return problem(400, "validation_error", "amount_cents must be positive integer")
        tx.amount_cents = v

    # If date changed, reattach to correct period (still UTC)
    if "occurred_at" in d and d["occurred_at"]:
        try:
            when = datetime.fromisoformat(str(d["occurred_at"]).replace("Z", "+00:00")).replace(tzinfo=None)
            tx.occurred_at = when
            period = get_or_create_period(tx.user_id, when)
            tx.period_id = period.id
        except Exception:
            return problem(400, "validation_error", "occurred_at must be ISO datetime")

    db.session.commit()
    return {"ok": True}, 200


# -------------------- DELETE /transactions/<id> --------------------
@bp.delete("/transactions/<int:tx_id>")
def delete_transaction(tx_id: int):
    tx = Transaction.query.get(tx_id)
    if not tx:
        return problem(404, "not_found", "transaction")
    db.session.delete(tx)
    db.session.commit()
    return {"ok": True}, 200
