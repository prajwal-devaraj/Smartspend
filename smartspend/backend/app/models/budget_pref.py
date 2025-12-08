# app/models/budget_pref.py

from sqlalchemy.dialects.mysql import BIGINT, ENUM, DATETIME as MySQLDATETIME
from sqlalchemy import SmallInteger, Date, text, func
from ..extensions import db


class BudgetPref(db.Model):
    __tablename__ = "budget_pref"

    id = db.Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)

    user_id = db.Column(
        BIGINT(unsigned=True),
        db.ForeignKey("user.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # How often the user is paid
    pay_cadence = db.Column(ENUM("weekly", "biweekly", "monthly"))

    # Anchors for determining next paycheck
    pay_anchor_day_of_month = db.Column(SmallInteger)  # 1–31
    pay_anchor_weekday = db.Column(
        ENUM("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
    )
    biweekly_anchor_date = db.Column(Date)

    # Expected paycheck amount (ALWAYS per pay_cadence)
    expected_amount_cents = db.Column(BIGINT)
    expected_amount_cadence = db.Column(ENUM("weekly", "biweekly", "monthly"))

    created_at = db.Column(
        MySQLDATETIME(fsp=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP(3)"),
    )
    updated_at = db.Column(
        MySQLDATETIME(fsp=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP(3)"),
        onupdate=func.current_timestamp(),
    )

    user = db.relationship(
        "User",
        backref=db.backref("budget_pref", uselist=False, passive_deletes=True),
    )

    def __repr__(self) -> str:
        return f"<BudgetPref user_id={self.user_id} cadence={self.pay_cadence}>"
