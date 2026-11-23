import hashlib
import hmac
import time

import pytest

from app.services.errors import BadRequestError, ServiceConfigurationError
from app.services.payments.service import _verify_stripe_signature
from app.settings import Settings

SECRET = "whsec_test_secret"


def _settings(secret: str | None = SECRET) -> Settings:
    return Settings(_env_file=None, stripe_webhook_secret=secret)


def _signature(payload: bytes, secret: str, timestamp: int | None = None) -> str:
    timestamp = timestamp if timestamp is not None else int(time.time())
    signed = hmac.new(
        secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={signed}"


def test_valid_signature_passes():
    payload = b'{"id":"evt_1","type":"payment_intent.succeeded"}'
    header = _signature(payload, SECRET)
    _verify_stripe_signature(_settings(), payload, header)


def test_tampered_signature_rejected():
    payload = b'{"id":"evt_1"}'
    header = _signature(payload, "wrong-secret")
    with pytest.raises(BadRequestError):
        _verify_stripe_signature(_settings(), payload, header)


def test_expired_timestamp_rejected():
    payload = b"{}"
    header = _signature(payload, SECRET, timestamp=int(time.time()) - 3600)
    with pytest.raises(BadRequestError):
        _verify_stripe_signature(_settings(), payload, header)


def test_malformed_header_rejected():
    with pytest.raises(BadRequestError):
        _verify_stripe_signature(_settings(), b"{}", "garbage")


def test_missing_secret_is_configuration_error():
    payload = b"{}"
    header = _signature(payload, SECRET)
    with pytest.raises(ServiceConfigurationError):
        _verify_stripe_signature(_settings(secret=None), payload, header)
