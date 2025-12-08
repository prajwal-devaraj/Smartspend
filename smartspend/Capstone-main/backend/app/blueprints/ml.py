from flask import Blueprint, request, jsonify
from app.services.ml_loader import models
import numpy as np

ml_bp = Blueprint("ml", __name__)

@ml_bp.route("/ml/predict", methods=["POST"])  # 👈 KEEP this as /ml/predict
def ml_predict():
    try:
        data = request.get_json()

        if "features" not in data:
            return jsonify({"error": "Missing 'features'"}), 400

        X = np.array(data["features"]).reshape(1, -1)

        return jsonify({
            "tier2": {
                "burn_rate": float(models["tier2_burn"].predict(X)[0]),
                "runway_days": float(models["tier2_runway"].predict(X)[0])
            },
            "tier3": {
                "risk_late_night": float(models["tier3_late"].predict_proba(X)[0][1]),
                "risk_overspend": float(models["tier3_over"].predict_proba(X)[0][1]),
                "risk_guilt": float(models["tier3_guilt"].predict_proba(X)[0][1])
            }
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
