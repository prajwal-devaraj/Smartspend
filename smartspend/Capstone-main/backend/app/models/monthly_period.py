from sqlalchemy.dialects.mysql import BIGINT, ENUM
from ..extensions import db

class MonthlyPeriod(db.Model):
    __tablename__ = "monthly_period"

    id = db.Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id = db.Column(BIGINT(unsigned=True), nullable=False, index=True)
    month_utc = db.Column(db.Date, nullable=False)
    status = db.Column(ENUM("active", "closed"), nullable=False, server_default="active")
    opening_income_cents = db.Column(BIGINT, nullable=False, default=0)

    def __repr__(self):
        return f"<MonthlyPeriod id={self.id} user_id={self.user_id} month_utc={self.month_utc}>"
