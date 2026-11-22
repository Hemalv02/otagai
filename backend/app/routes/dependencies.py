from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database.connection import Database
from app.database.models import User
from app.services.auth.service import (
    AuthClaims,
    AuthUnavailableError,
    InvalidTokenError,
    TokenVerifier,
)
from app.services.users.service import (
    AccountInactiveError,
    ProfileNotFoundError,
    get_active_profile,
)

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
    try:
        return await get_active_profile(database, claims.auth_user_id)
    except ProfileNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error)) from error
    except AccountInactiveError as error:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(error)) from error


DatabaseDep = Annotated[Database, Depends(get_database)]
AuthClaimsDep = Annotated[AuthClaims, Depends(get_auth_claims)]
CurrentUserDep = Annotated[User, Depends(get_current_user)]
