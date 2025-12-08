# app/models/bill.py
from sqlalchemy.dialects.mysql import BIGINT, ENUM, DATETIME as MySQLDATETIME
from ..extensions import db

class Bill(db.Model):
    __tablename__ = "bill"

    id = db.Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id = db.Column(BIGINT(unsigned=True), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    amount_cents = db.Column(BIGINT, nullable=False)
    recurrence_rule = db.Column(ENUM("weekly","biweekly","monthly"), nullable=False, server_default="monthly")
    status = db.Column(ENUM("active","paused"), nullable=False, server_default="active")
    next_due_date = db.Column(db.Date, nullable=True)

    # NEW (must match the table you just altered)
    paused_at  = db.Column(MySQLDATETIME(fsp=3), nullable=True, index=True)
    resumed_at = db.Column(MySQLDATETIME(fsp=3), nullable=True, index=True)
    def __repr__(self):
        return f"<Bill id={self.id} user_id={self.user_id} name={self.name} status={self.status}>"