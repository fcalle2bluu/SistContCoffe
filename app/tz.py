from datetime import date, datetime, timedelta, timezone

BOLIVIA_TZ = timezone(timedelta(hours=-4))


def ahora_bolivia() -> datetime:
    return datetime.now(BOLIVIA_TZ)


def hoy_bolivia() -> date:
    return ahora_bolivia().date()
