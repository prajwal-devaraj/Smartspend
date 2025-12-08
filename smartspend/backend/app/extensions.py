# app/extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

db = SQLAlchemy()
cors = CORS()  # note: we INIT this in create_app via cors.init_app(app, ...)
