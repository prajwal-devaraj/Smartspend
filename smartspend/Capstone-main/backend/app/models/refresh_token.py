from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy import text
from ..extensions import db

class RefreshToken(db.Model):
    __tablename__ = "refresh_token"

    id = db.Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id = db.Column(BIGINT(unsigned=True), db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = db.Column(db.String(64), nullable=False, unique=True)
    rotation_parent_id = db.Column(BIGINT(unsigned=True))
    ip_last = db.Column(db.String(45))
    user_agent = db.Column(db.String(200))
    device_label = db.Column(db.String(80))

    created_at = db.Column(db.DateTime, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    revoked_at = db.Column(db.DateTime)

    user = db.relationship("User", backref=db.backref("refresh_tokens", lazy="dynamic"))

    def __repr__(self):
        return f"<RefreshToken user_id={self.user_id} revoked={self.revoked_at is not None}>"
