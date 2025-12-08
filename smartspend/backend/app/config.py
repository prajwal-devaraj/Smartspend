import os
from dotenv import load_dotenv
load_dotenv()

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev_secret_change_me")
    SQLALCHEMY_DATABASE_URI = os.getenv("MYSQL_URI")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_ISS = os.getenv("JWT_ISS", "smartspend")
    ACCESS_TTL_MIN = int(os.getenv("ACCESS_TTL_MIN", "30"))
    REFRESH_TTL_DAYS = int(os.getenv("REFRESH_TTL_DAYS", "30"))
    TIMEZONE = os.getenv("TIMEZONE", "America/New_York")
