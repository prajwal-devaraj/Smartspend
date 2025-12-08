# app/utils/tz.py
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TZ = "America/New_York"

def get_zoneinfo(tzname: str | None):
    name = (tzname or DEFAULT_TZ).strip() or DEFAULT_TZ
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        # if tzdata isn’t installed or the key is bad, fall back
        return ZoneInfo("UTC")
