import joblib
import os

BASE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "ml_models")

def load_model(name):
    path = os.path.join(BASE_PATH, name)
    return joblib.load(path)

models = {
    "tier2_burn": load_model("tier2_burn_model (4).pkl"),
    "tier2_runway": load_model("tier2_runway_model (4).pkl"),
    "tier3_late": load_model("tier3_late_night_model (1).pkl"),
    "tier3_over": load_model("tier3_overspend_model (1).pkl"),
    "tier3_guilt": load_model("tier3_guilt_model (1).pkl"),
}
