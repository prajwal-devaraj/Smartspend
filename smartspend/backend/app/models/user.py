from datetime import datetime
from sqlalchemy.dialects.mysql import BIGINT, VARCHAR, ENUM, DATETIME as MySQLDATETIME
from sqlalchemy import text
from ..extensions import db

class User(db.Model):
    __tablename__ = "user"

    id = db.Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    name = db.Column(VARCHAR(120), nullable=False)
    email = db.Column(VARCHAR(190), nullable=False, unique=True, index=True)
    password_hash = db.Column(VARCHAR(255), nullable=False)

    status = db.Column(
        ENUM("pending_onboarding", "active", "locked", "deleted"),
        nullable=False,
        server_default="pending_onboarding",
    )
    timezone = db.Column(VARCHAR(64), nullable=False, server_default="America/New_York")

    created_at = db.Column(MySQLDATETIME(fsp=3), nullable=False, server_default=text("CURRENT_TIMESTAMP(3)"))
    created_by = db.Column(BIGINT(unsigned=True))
    updated_at = db.Column(
        MySQLDATETIME(fsp=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP(3)"),
        onupdate=datetime.utcnow,
    )
    updated_by = db.Column(BIGINT(unsigned=True))
    deleted_at = db.Column(MySQLDATETIME(fsp=3))
    deleted_by = db.Column(BIGINT(unsigned=True))

    def __repr__(self):
        return f"<User id={self.id} email={self.email!r} tz={self.timezone}>"
