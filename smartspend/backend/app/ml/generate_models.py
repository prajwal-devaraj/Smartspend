import joblib
import json
from sklearn.linear_model import LinearRegression
import numpy as np

# ----------------------------------------
# 1. Burn Rate Model (simple regression)
# ----------------------------------------
burn_model = LinearRegression()
X = np.array([[100], [200], [300], [400]])
y = np.array([90, 180, 270, 360])
burn_model.fit(X, y)
joblib.dump(burn_model, "app/ml/burn_rate_model.pkl")

# ----------------------------------------
# 2. Runway Model (formula-based)
# ----------------------------------------
runway_model = {"type": "formula_based"}
joblib.dump(runway_model, "app/ml/runway_model.pkl")

# ----------------------------------------
# 3. Guilt Spend Detector (rule-based)
# ----------------------------------------
guilt_detector = {
    "threshold_amount": 50,
    "late_night_start": 22,
    "emotion_keywords": ["sad", "angry", "stressed"]
}
joblib.dump(guilt_detector, "app/ml/guilt_spend_detector.pkl")

# ----------------------------------------
# 4. NWG Classifier
# ----------------------------------------
nwg_classifier = {
    "needs_keywords": ["rent", "food", "grocery", "bill", "insurance"],
    "wants_keywords": ["movie", "shopping", "restaurant", "fun"],
    "guilt_keywords": ["late night", "impulse", "regret"]
}
joblib.dump(nwg_classifier, "app/ml/nwg_classifier.pkl")

# ----------------------------------------
# 5. Power Saving Trigger
# ----------------------------------------
power_model = {
    "trigger_threshold": 0.30
}
joblib.dump(power_model, "app/ml/power_saving_trigger.pkl")

# ----------------------------------------
# 6. Insight Alert v1
# ----------------------------------------
insight_alert_v1 = {
    "rules": {
        "high_burn": "Your spending increased today. Reduce small wants.",
        "low_balance": "Your balance is low. Review upcoming bills."
    }
}
joblib.dump(insight_alert_v1, "app/ml/insight_alert_v1.pkl")

# ----------------------------------------
# 7. Insight Alert Full v2
# ----------------------------------------
insight_alert_v2 = {
    "rules": {
        "overspend_trend": "3-day overspending trend detected.",
        "emotional_spend": "Mood suggests emotional spending.",
        "approaching_bill": "Upcoming bill within 3 days."
    }
}
joblib.dump(insight_alert_v2, "app/ml/insight_alert_full_v2.pkl")

# ----------------------------------------
# 8. Tier-3 Daily Risk Model
# ----------------------------------------
tier3_risk = {
    "weights": {
        "burn_rate": 0.4,
        "late_night": 0.3,
        "mood": 0.3
    }
}
joblib.dump(tier3_risk, "app/ml/tier3_daily_risk.pkl")

# ----------------------------------------
# 9. Encoder JSON
# ----------------------------------------
encoder = {
    "moods": ["happy", "sad", "angry", "stressed", "neutral"],
    "categories": ["needs", "wants", "guilt"]
}

with open("app/ml/encoder.json", "w") as f:
    json.dump(encoder, f, indent=4)

print("ML models generated successfully!")
