from flask import Flask
from app.extensions import db, cors

def create_app():
    app = Flask(__name__)

    # Init extensions
    db.init_app(app)
    cors.init_app(app)

    # Register blueprints
    from app.blueprints.ml import ml_bp
    app.register_blueprint(ml_bp, url_prefix="/api")

    return app
