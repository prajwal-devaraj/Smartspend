from sqlalchemy.dialects.mysql import BIGINT, ENUM, DATETIME as MySQLDATETIME
from ..extensions import db

class BillOccurrence(db.Model):
    __tablename__ = "bill_occurrence"

    id = db.Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    bill_id = db.Column(BIGINT(unsigned=True), nullable=False, index=True)
    due_date = db.Column(db.Date, nullable=False)
    status = db.Column(ENUM("due", "paid", "skipped"), nullable=False, server_default="due")
    paid_at = db.Column(MySQLDATETIME(fsp=3))
    bill_payment_id = db.Column(db.BigInteger, nullable=True)
    auto_txn_id = db.Column(db.BigInteger, nullable=True)
    generated_for_period_id = db.Column(db.BigInteger, nullable=True)


    def __repr__(self):
        return f"<BillOccurrence id={self.id} bill_id={self.bill_id} due={self.due_date}>"
