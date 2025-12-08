# app/models/transaction.py
from ..extensions import db
from sqlalchemy import Computed

class Transaction(db.Model):
    __tablename__ = "transaction"

    id = db.Column(db.BigInteger, primary_key=True)

    user_id = db.Column(
        db.BigInteger,
        db.ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
    )
    period_id = db.Column(
        db.BigInteger,
        db.ForeignKey("monthly_period.id", ondelete="CASCADE"),
        nullable=False,
    )

    type = db.Column(db.Enum("income", "expense", name="txn_type"), nullable=False)
    amount_cents = db.Column(db.BigInteger, nullable=False)

    # Stored in UTC (naive) from the app
    occurred_at = db.Column(db.DateTime, nullable=False)

    # Per-row timezone, defaults in DB to 'America/New_York'
    timezone = db.Column(db.String(64), nullable=False, server_default="America/New_York")

    # ---- ONLY the columns that exist in your DB ----
    # Local-time generated fields
    local_occurred_at = db.Column(  # <-- match table name
        db.DateTime,
        Computed("CONVERT_TZ(occurred_at, '+00:00', timezone)"),
        nullable=True,
    )
    txn_date_local = db.Column(
        db.Date,
        Computed("DATE(CONVERT_TZ(occurred_at, '+00:00', timezone))"),
        nullable=True,
    )
    day_part_local = db.Column(
        db.Enum("morning", "afternoon", "evening", "late_night", name="txn_day_part_local"),
        Computed(
            """CASE
                 WHEN HOUR(CONVERT_TZ(occurred_at, '+00:00', timezone)) BETWEEN 4 AND 11 THEN 'morning'
                 WHEN HOUR(CONVERT_TZ(occurred_at, '+00:00', timezone)) BETWEEN 12 AND 15 THEN 'afternoon'
                 WHEN HOUR(CONVERT_TZ(occurred_at, '+00:00', timezone)) BETWEEN 16 AND 21 THEN 'evening'
                 ELSE 'late_night'
               END"""
        ),
        nullable=True,
    )

    # NOTE: We intentionally REMOVED these because your table doesn't have them:
    # txn_date (UTC), day_part (UTC), occurred_local (wrong name)

    # Optional user labels
    spend_class = db.Column(
        db.Enum("need", "want", "guilt", name="txn_spend_class"),
        nullable=True,
    )
    category_id = db.Column(
        db.BigInteger,
        db.ForeignKey("category.id", ondelete="SET NULL"),
        nullable=True,
    )
    merchant = db.Column(db.String(160), nullable=True)
    memo = db.Column(db.String(300), nullable=True)
    mood = db.Column(db.Enum("happy", "neutral", "stressed", name="txn_mood"), nullable=True)
    bill_payment_id = db.Column(db.BigInteger, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime, nullable=False, server_default=db.func.now(), onupdate=db.func.now()
    )
    deleted_at = db.Column(db.DateTime, nullable=True)

    # relationships
    user = db.relationship("User", backref=db.backref("transactions", passive_deletes=True))
    period = db.relationship("MonthlyPeriod", backref=db.backref("transactions", passive_deletes=True))
    category = db.relationship("Category", backref=db.backref("transactions", passive_deletes=True))

    def __repr__(self):
        return f"<Txn id={self.id} user_id={self.user_id} {self.type} {self.amount_cents}>"
