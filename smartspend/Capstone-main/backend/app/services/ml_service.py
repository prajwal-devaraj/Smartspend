import joblib
import numpy as np

class MLService:
    def __init__(self):
        # Load model once at startup
        self.model = joblib.load("app/models/model.pkl")
        self.feature_cols = joblib.load("app/models/feature_cols.pkl")

    def predict(self, features):
        # reshape into 2D for sklearn
        features = np.array(features).reshape(1, -1)

        # run prediction
        prediction = self.model.predict(features)[0]

        return float(prediction)

ml_service = MLService()
