import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis

from app.database.connection import Database
from app.database.models import User
from app.services.actors.service import Actor, resolve_actor
from app.services.auth.service import (
    AuthClaims,
    AuthUnavailableError,
    InvalidTokenError,
    TokenVerifier,
)
from app.services.storage.service import Storage
from app.services.users.service import get_active_profile
from app.settings import Settings, get_settings

MAX_TOKEN_LENGTH = 8192

bearer = HTTPBearer(auto_error=False)


def unauthorized(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_database(request: Request) -> Database:
    database = getattr(request.app.state, "database", None)
    if database is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "The database is not configured."
        )
    return database


def get_optional_storage(request: Request) -> Storage | None:
    return getattr(request.app.state, "storage", None)


def get_storage(request: Request) -> Storage:
    storage = get_optional_storage(request)
    if storage is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Media storage is not configured."
        )
    return storage


def get_app_settings(request: Request) -> Settings:
    return getattr(request.app.state, "settings", None) or get_settings()


def get_redis(request: Request) -> "Redis | None":
    return getattr(request.app.state, "redis", None)


def get_token_verifier(request: Request) -> TokenVerifier:
    verifier = getattr(request.app.state, "token_verifier", None)
    if verifier is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Sign-in is not configured."
        )
    return verifier


async def get_auth_claims(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    verifier: Annotated[TokenVerifier, Depends(get_token_verifier)],
) -> AuthClaims:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized("Sign in to continue.")
    if len(credentials.credentials) > MAX_TOKEN_LENGTH:
        raise unauthorized("The access token is invalid.")
    try:
        return await verifier.verify(credentials.credentials)
    except InvalidTokenError as error:
        raise unauthorized(str(error)) from error
    except AuthUnavailableError as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error


async def get_current_user(
    claims: Annotated[AuthClaims, Depends(get_auth_claims)],
    database: Annotated[Database, Depends(get_database)],
) -> User:
    return await get_active_profile(database, claims.auth_user_id)


async def get_actor(
    user: Annotated[User, Depends(get_current_user)],
    database: Annotated[Database, Depends(get_database)],
    acting_for: Annotated[str | None, Header(alias="X-Acting-For")] = None,
) -> Actor:
    subject_id = None
    if acting_for is not None:
        try:
            subject_id = uuid.UUID(acting_for.strip())
        except ValueError as error:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "X-Acting-For must be a user id."
            ) from error
    return await resolve_actor(database, user, subject_id)


DatabaseDep = Annotated[Database, Depends(get_database)]
StorageDep = Annotated[Storage, Depends(get_storage)]
OptionalStorageDep = Annotated[Storage | None, Depends(get_optional_storage)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]
RedisDep = Annotated[Redis | None, Depends(get_redis)]
AuthClaimsDep = Annotated[AuthClaims, Depends(get_auth_claims)]
CurrentUserDep = Annotated[User, Depends(get_current_user)]
ActorDep = Annotated[Actor, Depends(get_actor)]
