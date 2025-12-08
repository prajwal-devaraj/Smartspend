# app/blueprints/bills.py
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional, Tuple

from flask import Blueprint, request

from ..extensions import db
from ..errors import problem
from ..models import User, Bill, Transaction, MonthlyPeriod
try:
    from ..models import BillPayment, BillOccurrence  # optional models
except Exception:  # pragma: no cover
    BillPayment = None  # type: ignore
    BillOccurrence = None  # type: ignore

from ..services.periods import get_or_create_period
from ..services.category_service import resolve_category_id_or_default
from ..utils.tz import get_zoneinfo

bp = Blueprint("bills", __name__)

# ------------------------------ helpers ------------------------------
_VALID_RULES = {"weekly", "biweekly", "monthly"}
_STATUS = {"active", "paused"}


def _require_user(user_id: int) -> User:
    u = User.query.get(user_id)
    if not u:
        raise ValueError("user_not_found")
    return u


def _ymd(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def _parse_ymd(s: str) -> Optional[date]:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return None


def _advance_next_due(cur: date, rule: str) -> date:
    if rule == "weekly":
        return cur + timedelta(days=7)
    if rule == "biweekly":
        return cur + timedelta(days=14)
    # monthly: keep day-of-month where possible; clamp to end-of-month
    y, m, d = cur.year, cur.month, cur.day
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    from calendar import monthrange
    last = monthrange(ny, nm)[1]
    return date(ny, nm, min(d, last))


def _rewind_prev_due(cur: date, rule: str) -> date:
    """Inverse of _advance_next_due."""
    if rule == "weekly":
        return cur - timedelta(days=7)
    if rule == "biweekly":
        return cur - timedelta(days=14)
    # monthly: go to previous month, clamp DOM
    y, m, d = cur.year, cur.month, cur.day
    py, pm = (y - 1, 12) if m == 1 else (y, m - 1)
    from calendar import monthrange
    last = monthrange(py, pm)[1]
    return date(py, pm, min(d, last))


def _normalize_rule(v: str | None) -> Optional[str]:
    if not v:
        return None
    v = v.strip().lower()
    if v == "bi-weekly":
        v = "biweekly"
    return v if v in _VALID_RULES else None


def _due_filter_to_bounds(v: str | None) -> Tuple[Optional[date], Optional[date], str]:
    """
    Returns (start_date_inclusive, end_date_inclusive, mode)
    mode in {'today','next7','overdue',''}; when overdue we only use end bound (yesterday).
    """
    today = date.today()
    if v == "today":
        return today, today, "today"
    if v == "next7":
        return today, today + timedelta(days=7), "next7"
    if v == "overdue":
        return None, today - timedelta(days=1), "overdue"
    return None, None, ""


# ------------------------------ GET /bills ------------------------------
@bp.get("/bills")
def list_bills():
    """
    Query params:
      user_id (required)
      q (search name/notes)
      status: active|paused
      cadence: weekly|biweekly|monthly
      category: string (optional)
      due: today|next7|overdue
      sort: next_due_asc|amount_desc|amount_asc (default next_due_asc)
      page, per_page
    """
    try:
        user_id = int(request.args.get("user_id", "0"))
        if not user_id:
            return problem(400, "validation_error", "user_id required")
        _require_user(user_id)
    except ValueError:
        return problem(400, "validation_error", "user_id invalid")
    except Exception:
        return problem(404, "not_found", "user")

    q = (request.args.get("q") or "").strip().lower()
    status = (request.args.get("status") or "").strip().lower()
    cadence = _normalize_rule(request.args.get("cadence"))
    category = (request.args.get("category") or "").strip()
    due = (request.args.get("due") or "").strip().lower()
    sort = request.args.get("sort") or "next_due_asc"

    # pagination
    try:
        page = max(1, int(request.args.get("page", "1")))
        per_page = min(100, max(1, int(request.args.get("per_page", "50"))))
    except ValueError:
        return problem(400, "validation_error", "page/per_page invalid")

    # base
    qset = Bill.query.filter(Bill.user_id == user_id)

    if status in _STATUS:
        qset = qset.filter(Bill.status == status)

    if cadence:
        qset = qset.filter(Bill.recurrence_rule == cadence)

    if category and hasattr(Bill, "category"):
        qset = qset.filter(Bill.category == category)

    if q:
        like = f"%{q}%"
        if hasattr(Bill, "notes"):
            qset = qset.filter((Bill.name.ilike(like)) | (Bill.notes.ilike(like)))
        else:
            qset = qset.filter(Bill.name.ilike(like))

    # due window
    ds, de, mode = _due_filter_to_bounds(due)
    if ds and de:
        qset = qset.filter(Bill.next_due_date >= ds, Bill.next_due_date <= de)
    elif mode == "overdue" and de:
        qset = qset.filter(Bill.next_due_date <= de)

    # sort
    if sort == "amount_desc":
        qset = qset.order_by(Bill.amount_cents.desc(), Bill.id.desc())
    elif sort == "amount_asc":
        qset = qset.order_by(Bill.amount_cents.asc(), Bill.id.asc())
    else:
        qset = qset.order_by(Bill.next_due_date.asc(), Bill.id.asc())

    total = qset.count()
    rows = qset.limit(per_page).offset((page - 1) * per_page).all()

    items = []
    for b in rows:
        cadence_ui = "bi-weekly" if (b.recurrence_rule == "biweekly") else (b.recurrence_rule or "monthly")

        # last payment time (optional; only if BillPayment model exists)
        last_payment_at = None
        if BillPayment is not None:
            bp_row = (
                BillPayment.query
                .filter_by(bill_id=b.id)
                .order_by(BillPayment.paid_at.desc(), BillPayment.id.desc())
                .first()
            )
            if bp_row and getattr(bp_row, "paid_at", None):
                last_payment_at = bp_row.paid_at.isoformat(sep=" ")

        item = {
            "id": b.id,
            "name": b.name,
            "amount": round((b.amount_cents or 0) / 100.0, 2),  # dollars for UI
            "cadence": cadence_ui,
            "recurrence": True,
            "next_due": _ymd(b.next_due_date) if b.next_due_date else None,
            "status": b.status or "active",
            "category": getattr(b, "category", None),
            "nwg": "Need",  # bills are Needs by design
            "notes": getattr(b, "notes", None),
            "paused_at": getattr(b, "paused_at", None).isoformat(sep=" ") if getattr(b, "paused_at", None) else None,
            "resumed_at": getattr(b, "resumed_at", None).isoformat(sep=" ") if getattr(b, "resumed_at", None) else None,
            "last_payment_at": last_payment_at,
        }
        items.append(item)

    return {"total": total, "page": page, "per_page": per_page, "items": items}, 200


# ------------------------------ POST /bills ------------------------------
@bp.post("/bills")
def create_bill():
    """
    Body:
      { user_id, name, amount_cents, recurrence_rule, next_due_date('YYYY-MM-DD'),
        [category], [notes] }
    Bills are always NWG='Need' (any provided nwg is ignored).
    """
    d = request.get_json(silent=True) or {}
    try:
        user_id = int(d.get("user_id") or 0)
        user = _require_user(user_id)
    except Exception:
        return problem(400, "validation_error", "valid user_id required")

    name = (d.get("name") or "").strip()
    if not name:
        return problem(400, "validation_error", "name required")

    try:
        amount_cents = int(d.get("amount_cents") or 0)
        if amount_cents <= 0:
            raise ValueError
    except Exception:
        return problem(400, "validation_error", "amount_cents must be positive integer")

    rule = _normalize_rule(d.get("recurrence_rule"))
    if not rule:
        return problem(400, "validation_error", "recurrence_rule must be weekly|biweekly|monthly")

    nd = d.get("next_due_date")
    next_due = _parse_ymd(nd) if nd else None
    if nd and not next_due:
        return problem(400, "validation_error", "next_due_date must be YYYY-MM-DD")

    b = Bill(
        user_id=user.id,
        name=name,
        amount_cents=amount_cents,
        recurrence_rule=rule,
        status="active",
        next_due_date=next_due or date.today(),
    )

    # optional columns
    if hasattr(Bill, "category"):
        setattr(b, "category", (d.get("category") or None))
    if hasattr(Bill, "nwg"):
        setattr(b, "nwg", "Need")
    if hasattr(Bill, "notes"):
        setattr(b, "notes", (d.get("notes") or None))

    db.session.add(b)
    db.session.commit()

    return {"id": b.id}, 201


# ------------------------------ PATCH /bills/<id> ------------------------------
@bp.patch("/bills/<int:bill_id>")
def update_bill(bill_id: int):
    d = request.get_json(silent=True) or {}
    b: Bill = Bill.query.get(bill_id)
    if not b:
        return problem(404, "not_found", "bill")

    if "user_id" in d:
        try:
            uid = int(d.get("user_id") or 0)
            if uid != b.user_id:
                return problem(403, "forbidden", "Bill does not belong to user")
        except Exception:
            return problem(400, "validation_error", "user_id invalid")

    if "name" in d:
        nm = (d.get("name") or "").strip()
        if not nm:
            return problem(400, "validation_error", "name required")
        b.name = nm

    if "amount_cents" in d and d["amount_cents"] is not None:
        try:
            v = int(d["amount_cents"])
            if v <= 0:
                raise ValueError
            b.amount_cents = v
        except Exception:
            return problem(400, "validation_error", "amount_cents must be positive integer")

    if "recurrence_rule" in d:
        rr = _normalize_rule(d.get("recurrence_rule"))
        if not rr:
            return problem(400, "validation_error", "recurrence_rule must be weekly|biweekly|monthly")
        b.recurrence_rule = rr

    if "next_due_date" in d:
        nd = d.get("next_due_date")
        if nd is None:
            b.next_due_date = None
        else:
            dt = _parse_ymd(nd)
            if not dt:
                return problem(400, "validation_error", "next_due_date must be YYYY-MM-DD")
            b.next_due_date = dt

    if "status" in d:
        st = (d.get("status") or "").lower()
        if st not in _STATUS:
            return problem(400, "validation_error", "status must be active|paused")
        b.status = st

    # optional columns
    if hasattr(Bill, "category") and "category" in d:
        setattr(b, "category", (d.get("category") or None))
    if hasattr(Bill, "nwg"):
        setattr(b, "nwg", "Need")
    if hasattr(Bill, "notes") and "notes" in d:
        setattr(b, "notes", (d.get("notes") or None))

    db.session.commit()
    return {"ok": True}, 200


# ------------------------------ DELETE /bills/<id> ------------------------------
@bp.delete("/bills/<int:bill_id>")
def delete_bill(bill_id: int):
    b = Bill.query.get(bill_id)
    if not b:
        return problem(404, "not_found", "bill")
    db.session.delete(b)
    db.session.commit()
    return {"ok": True}, 200


# ------------------------------ POST /bills/<id>/toggle ------------------------------
@bp.post("/bills/<int:bill_id>/toggle")
def toggle_bill(bill_id: int):
    d = request.get_json(silent=True) or {}
    b: Bill = Bill.query.get(bill_id)
    if not b:
        return problem(404, "not_found", "bill")
    if "user_id" in d and int(d["user_id"]) != b.user_id:
        return problem(403, "forbidden", "Bill does not belong to user")

    # flip status and stamp paused_at/resumed_at if columns exist
    now = datetime.utcnow()
    new_status = "paused" if (b.status or "active") == "active" else "active"
    b.status = new_status

    if hasattr(Bill, "paused_at") and hasattr(Bill, "resumed_at"):
        if new_status == "paused" and getattr(b, "paused_at", None) is None:
            setattr(b, "paused_at", now)
        if new_status == "active":
            setattr(b, "resumed_at", now)

    db.session.commit()
    return {
        "ok": True,
        "status": b.status,
        "paused_at": getattr(b, "paused_at", None).isoformat(sep=" ") if getattr(b, "paused_at", None) else None,
        "resumed_at": getattr(b, "resumed_at", None).isoformat(sep=" ") if getattr(b, "resumed_at", None) else None,
    }, 200


# ------------------------------ POST /bills/<id>/pay ------------------------------
@bp.post("/bills/<int:bill_id>/pay")
def pay_bill(bill_id: int):
    """
    Creates:
      - BillOccurrence for bill.next_due_date (if missing) and marks it paid
      - BillPayment linked to that occurrence
      - Expense Transaction linked via transaction.bill_payment_id
      - Also back-links BillPayment.transaction_id and BillOccurrence.bill_payment_id/auto_txn_id
      - Advances bill.next_due_date to next cycle

    Body:
      { user_id, [amount_cents], [occurred_at ISO UTC], [category_id], [memo], [force] }
    """
    d = request.get_json(silent=True) or {}
    b: Bill = Bill.query.get(bill_id)
    if not b:
        return problem(404, "not_found", "bill")

    try:
        user_id = int(d.get("user_id") or 0)
        u = _require_user(user_id)
        if b.user_id != user_id:
            return problem(403, "forbidden", "Bill does not belong to user")
    except Exception:
        return problem(400, "validation_error", "valid user_id required")

    # If paused, block unless force=true
    force = str(d.get("force", "")).lower() in ("1", "true", "yes", "on")
    if (b.status or "active") == "paused" and not force:
        return problem(409, "bill_paused", "Bill is paused; resume or pass force=true to record a payment")

    # amount override? fallback to bill amount
    try:
        amount_cents = int(d.get("amount_cents") or b.amount_cents or 0)
        if amount_cents <= 0:
            raise ValueError
    except Exception:
        return problem(400, "validation_error", "amount_cents must be positive integer")

    # occurred_at (UTC) optional
    when = d.get("occurred_at")
    if when:
        try:
            occurred_at = datetime.fromisoformat(str(when).replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return problem(400, "validation_error", "occurred_at must be ISO datetime")
    else:
        occurred_at = datetime.utcnow()

    # attach monthly period by UTC timestamp
    period = get_or_create_period(user_id, occurred_at)

    # Resolve a sensible expense category
    try:
        category_id = resolve_category_id_or_default(user_id, "expense", d.get("category_id"))
    except ValueError as e:
        return problem(400, "validation_error", str(e))

    # ----- occurrence (for current due date) -----
    occ_id = None
    occ = None
    original_due_for_occ = b.next_due_date or date.today()
    if BillOccurrence is not None:
        occ = BillOccurrence.query.filter(
            BillOccurrence.bill_id == b.id,
            BillOccurrence.due_date == original_due_for_occ
        ).first()
        if not occ:
            occ = BillOccurrence(
                bill_id=b.id,
                due_date=original_due_for_occ,
                status="due",
            )
            db.session.add(occ)
            db.session.flush()

        # mark as paid
        occ.status = "paid"
        try:
            occ.paid_at = occurred_at  # column exists in your schema
        except Exception:
            pass
        occ_id = occ.id

    # ----- bill payment -----
    bp_id = None
    bp_row = None
    if BillPayment is not None:
        pay_status = "complete"
        if b.amount_cents and amount_cents < b.amount_cents:
            pay_status = "partial"
        bp_row = BillPayment(
            bill_id=b.id,
            bill_occurrence_id=occ_id or 0,
            amount_cents=amount_cents,
            paid_at=occurred_at,
            status=pay_status,
        )
        db.session.add(bp_row)
        db.session.flush()
        bp_id = bp_row.id

    # ----- transaction (expense) -----
    t = Transaction(
        user_id=user_id,
        period_id=period.id,
        type="expense",
        amount_cents=amount_cents,
        occurred_at=occurred_at,
        timezone=u.timezone or "America/New_York",
        merchant=b.name,
        memo=d.get("memo") or "Bill paid",
        spend_class="need",              # bills are Needs by design
        mood=None,
        category_id=category_id,
        bill_payment_id=bp_id,
    )
    db.session.add(t)
    db.session.flush()  # ensure t.id is available

    # ----- back-link relations now that we know t.id -----
    if bp_row is not None:
        try:
            bp_row.transaction_id = t.id
        except Exception:
            pass

    if occ is not None:
        # link occurrence -> payment & transaction if columns exist
        if hasattr(occ, "bill_payment_id"):
            try:
                occ.bill_payment_id = bp_id
            except Exception:
                pass
        if hasattr(occ, "auto_txn_id"):
            try:
                occ.auto_txn_id = t.id
            except Exception:
                pass

    # Advance bill next_due_date (for the next cycle)
    if b.next_due_date and b.recurrence_rule:
        b.next_due_date = _advance_next_due(b.next_due_date, b.recurrence_rule)

    db.session.commit()

    occurred_utc = t.occurred_at.replace(tzinfo=get_zoneinfo("UTC"))
    tz = get_zoneinfo(u.timezone)
    occurred_local = occurred_utc.astimezone(tz)

    return {
        "ok": True,
        "transaction": {
            "id": t.id,
            "amount_cents": t.amount_cents,
            "occurred_at_utc": occurred_utc.isoformat().replace("+00:00", "Z"),
            "occurred_at_local": occurred_local.isoformat(),
            "bill_payment_id": bp_id,
        },
        "bill": {
            "id": b.id,
            "next_due": _ymd(b.next_due_date) if b.next_due_date else None,
            "status": b.status,
        },
        "occurrence": {
            "id": occ_id,
            # use the *original* due date we just paid, not the advanced one
            "due_date": _ymd(original_due_for_occ) if original_due_for_occ else None,
        }
    }, 201


# ------------------------------ POST /bills/<id>/unpay ------------------------------
@bp.post("/bills/<int:bill_id>/unpay")
def unpay_bill(bill_id: int):
    """
    Reverts the most recent payment (or a specific payment if bill_payment_id is provided):
      - Deletes the associated Transaction(s) with that bill_payment_id
      - Sets BillOccurrence back to status='due' and clears paid_at / links
      - Deletes the BillPayment row
      - Rewinds Bill.next_due_date back by one recurrence step (if previously advanced)

    Body:
      { user_id, [bill_payment_id] }
    """
    if BillPayment is None:
        return problem(400, "unsupported", "BillPayment model not present in this deployment")

    d = request.get_json(silent=True) or {}

    b: Bill = Bill.query.get(bill_id)
    if not b:
        return problem(404, "not_found", "bill")

    # auth
    try:
        user_id = int(d.get("user_id") or 0)
        _require_user(user_id)
        if b.user_id != user_id:
            return problem(403, "forbidden", "Bill does not belong to user")
    except Exception:
        return problem(400, "validation_error", "valid user_id required")

    # which payment?
    bp_id_req = d.get("bill_payment_id")
    if bp_id_req is not None:
        try:
            bp_id_req = int(bp_id_req)
        except Exception:
            return problem(400, "validation_error", "bill_payment_id must be integer")

    # latest payment for this bill if none provided
    q = BillPayment.query.filter(BillPayment.bill_id == b.id)
    if bp_id_req:
        q = q.filter(BillPayment.id == bp_id_req)
    bp_row = q.order_by(BillPayment.paid_at.desc(), BillPayment.id.desc()).first()

    if not bp_row:
        return problem(404, "not_found", "bill_payment")

    # delete linked transactions (there should typically be one)
    txs = Transaction.query.filter(Transaction.bill_payment_id == bp_row.id).all()
    for tx in txs:
        db.session.delete(tx)

    # reset occurrence if we have it
    if BillOccurrence is not None and getattr(bp_row, "bill_occurrence_id", None):
        occ = BillOccurrence.query.get(bp_row.bill_occurrence_id)
        if occ:
            occ.status = "due"
            try:
                occ.paid_at = None
            except Exception:
                pass
            # clear links if these columns exist
            if hasattr(occ, "bill_payment_id"):
                try:
                    occ.bill_payment_id = None
                except Exception:
                    pass
            if hasattr(occ, "auto_txn_id"):
                try:
                    occ.auto_txn_id = None
                except Exception:
                    pass

    # delete payment row
    db.session.delete(bp_row)

    # rewind next_due_date (only if we have a recurrence_rule and next_due_date)
    if b.next_due_date and b.recurrence_rule:
        b.next_due_date = _rewind_prev_due(b.next_due_date, b.recurrence_rule)

    db.session.commit()

    return {
        "ok": True,
        "bill": {
            "id": b.id,
            "next_due": _ymd(b.next_due_date) if b.next_due_date else None,
            "status": b.status,
        }
    }, 200
