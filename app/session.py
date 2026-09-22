import base64
import hashlib
import hmac
import json
import os

from fastapi import Response

COOKIE_NAME = "yanaloma_session"


def _secret() -> bytes:
    secret = os.environ.get("SESSION_SECRET")
    if not secret:
        raise RuntimeError("Falta SESSION_SECRET en las variables de entorno.")
    return secret.encode()


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign(payload: str) -> str:
    return hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()


def encode_session(user: dict) -> str:
    payload = _b64url_encode(json.dumps(user).encode())
    return f"{payload}.{_sign(payload)}"


def decode_session(value: str) -> dict | None:
    try:
        payload, signature = value.split(".", 1)
    except ValueError:
        return None

    if not hmac.compare_digest(signature, _sign(payload)):
        return None

    try:
        return json.loads(_b64url_decode(payload))
    except Exception:
        return None


def set_session_cookie(response: Response, user: dict) -> None:
    response.set_cookie(
        COOKIE_NAME,
        encode_session(user),
        httponly=True,
        samesite="lax",
        secure=os.environ.get("ENV") == "production",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")
