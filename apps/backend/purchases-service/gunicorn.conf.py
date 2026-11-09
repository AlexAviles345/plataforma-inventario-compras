import os


def env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw_value = os.getenv(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise RuntimeError(f"{name} debe ser un número entero") from exc
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} debe estar entre {minimum} y {maximum}")
    return value


bind = f"0.0.0.0:{env_int('PORT', 8000, 1, 65535)}"
workers = env_int("WEB_CONCURRENCY", 2, 1, 32)
threads = 2
timeout = 30
graceful_timeout = 30
accesslog = "-"
errorlog = "-"
capture_output = True
