import asyncio
import logging
import time
import uuid
from dataclasses import dataclass

import httpx2
import jwt
from jwt import PyJWK, PyJWKSet

from app.services.errors import ServiceConfigurationError, ServiceError
from app.settings import Settings

logger = logging.getLogger(__name__)

ALLOWED_ALGORITHMS = frozenset({"ES256", "RS256"})


class AuthError(ServiceError):
    pass


class InvalidTokenError(AuthError):
    pass


class AuthUnavailableError(AuthError):
    pass


@dataclass(frozen=True)
class AuthClaims:
    auth_user_id: uuid.UUID
    email: str | None
    phone: str | None


class TokenVerifier:
    def __init__(
        self,
        supabase_url: str,
        audience: str,
        *,
        cache_seconds: float = 600,
        refresh_cooldown_seconds: float = 30,
        attempts: int = 3,
    ) -> None:
        self._issuer = f"{supabase_url.rstrip('/')}/auth/v1"
        self._jwks_url = f"{self._issuer}/.well-known/jwks.json"
        self._audience = audience
        self._cache_seconds = cache_seconds
        self._refresh_cooldown_seconds = refresh_cooldown_seconds
        self._attempts = attempts
        self._keys: dict[str, PyJWK] = {}
        self._fetched_at = 0.0
        self._attempted_at = float("-inf")
        self._lock = asyncio.Lock()

    @classmethod
    def from_settings(cls, settings: Settings) -> "TokenVerifier":
        if not settings.supabase_url:
            raise ServiceConfigurationError("Configure SUPABASE_URL.")
        return cls(str(settings.supabase_url), settings.supabase_jwt_audience)

    async def verify(self, token: str) -> AuthClaims:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as error:
            raise InvalidTokenError("The access token is malformed.") from error
        algorithm = header.get("alg")
        key_id = header.get("kid")
        if algorithm not in ALLOWED_ALGORITHMS or not isinstance(key_id, str):
            raise InvalidTokenError("The access token uses an unsupported key.")

        key = await self._key(key_id)
        if key.algorithm_name != algorithm:
            raise InvalidTokenError("The access token uses an unsupported key.")
        try:
            claims = jwt.decode(
                token,
                key.key,
                algorithms=[algorithm],
                audience=self._audience,
                issuer=self._issuer,
                leeway=30,
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            )
        except jwt.PyJWTError as error:
            raise InvalidTokenError(
                "The access token is invalid or expired."
            ) from error

        if claims.get("role") != "authenticated" or claims.get("is_anonymous"):
            raise InvalidTokenError("Sign in to continue.")
        try:
            auth_user_id = uuid.UUID(str(claims["sub"]))
        except ValueError as error:
            raise InvalidTokenError("The access token is invalid.") from error
        email = claims.get("email")
        phone = claims.get("phone")
        return AuthClaims(
            auth_user_id=auth_user_id,
            email=email if isinstance(email, str) and email else None,
            phone=phone if isinstance(phone, str) and phone else None,
        )

    async def _key(self, key_id: str) -> PyJWK:
        if key_id in self._keys and not self._is_stale():
            return self._keys[key_id]
        async with self._lock:
            now = time.monotonic()
            can_refresh = now - self._attempted_at >= self._refresh_cooldown_seconds
            if (self._is_stale() or key_id not in self._keys) and can_refresh:
                await self._refresh()
        key = self._keys.get(key_id)
        if key is None:
            if not self._keys:
                raise AuthUnavailableError("The sign-in service is unavailable.")
            raise InvalidTokenError("The access token uses an unknown key.")
        return key

    def _is_stale(self) -> bool:
        return time.monotonic() - self._fetched_at > self._cache_seconds

    async def _refresh(self) -> None:
        self._attempted_at = time.monotonic()
        try:
            body = await self._fetch_jwks()
            key_set = PyJWKSet.from_dict(body)
        except (AuthUnavailableError, jwt.PyJWTError, ValueError) as error:
            logger.warning("Could not refresh the JWKS (%s)", type(error).__name__)
            return
        keys = {
            key.key_id: key
            for key in key_set.keys
            if key.key_id
            and key.algorithm_name in ALLOWED_ALGORITHMS
            and key.public_key_use in (None, "sig")
        }
        if keys:
            self._keys = keys
            self._fetched_at = time.monotonic()

    async def _fetch_jwks(self) -> dict:
        delay = 0.2
        for attempt in range(1, self._attempts + 1):
            try:
                async with httpx2.AsyncClient(timeout=5) as client:
                    response = await client.get(self._jwks_url)
            except httpx2.RequestError:
                response = None
            if response is not None and response.is_success:
                return response.json()
            transient = (
                response is None
                or response.status_code in (429,)
                or (response.status_code >= 500)
            )
            if not transient or attempt == self._attempts:
                break
            await asyncio.sleep(delay)
            delay *= 3
        raise AuthUnavailableError("The sign-in service is unavailable.")
