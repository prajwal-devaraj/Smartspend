from sqlalchemy.dialects.mysql import BIGINT, ENUM
from ..extensions import db

class Category(db.Model):
    __tablename__ = "category"
    __table_args__ = (
        db.UniqueConstraint("user_id", "name", name="ux_cat_user_name"),
        {"mysql_charset": "utf8mb4"},
    )

    id = db.Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id = db.Column(BIGINT(unsigned=True), db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    name = db.Column(db.String(80), nullable=False)

    parent_id = db.Column(BIGINT(unsigned=True), db.ForeignKey("category.id", ondelete="SET NULL"))
    kind = db.Column(ENUM("income", "expense", name="category_kind"), nullable=False)
    is_default = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now(), onupdate=db.func.now())
    deleted_at = db.Column(db.DateTime)

    created_by = db.Column(BIGINT(unsigned=True))
    updated_by = db.Column(BIGINT(unsigned=True))
    deleted_by = db.Column(BIGINT(unsigned=True))

    parent = db.relationship(
        "Category",
        remote_side="Category.id",
        backref=db.backref("children", cascade="all, delete-orphan", passive_deletes=True),
    )
    user = db.relationship("User", backref=db.backref("categories", passive_deletes=True))

    def __repr__(self):
        return f"<Category id={self.id} user_id={self.user_id} name={self.name!r} kind={self.kind}>"
