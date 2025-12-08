from sqlalchemy.dialects.mysql import BIGINT, ENUM, DATETIME as MySQLDATETIME
from ..extensions import db

class BillPayment(db.Model):
    __tablename__ = "bill_payment"

    id = db.Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    bill_id = db.Column(BIGINT(unsigned=True), nullable=False, index=True)
    bill_occurrence_id = db.Column(BIGINT(unsigned=True), nullable=False, index=True)
    amount_cents = db.Column(BIGINT, nullable=False)
    paid_at = db.Column(MySQLDATETIME(fsp=3), nullable=False)
    status = db.Column(ENUM("partial", "complete", "refunded"), nullable=False, server_default="complete")

    def __repr__(self):
        return f"<BillPayment id={self.id} bill_id={self.bill_id} occ_id={self.bill_occurrence_id}>"
