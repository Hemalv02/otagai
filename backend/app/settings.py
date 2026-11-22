from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import (
    AnyHttpUrl,
    Field,
    FilePath,
    SecretStr,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="forbid",
        hide_input_in_errors=True,
    )

    cors_allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    cors_allow_credentials: bool = False

    database_host: str | None = None
    database_port: int = Field(default=5432, ge=1, le=65535)
    postgres_user: str = "otagai"
    postgres_db: str = "otagai"
    postgres_password: SecretStr | None = None
    migration_database_host: str | None = None
    migration_database_port: int = Field(default=5432, ge=1, le=65535)
    database_ssl_mode: Literal["disable", "require", "verify-full"] = "disable"
    database_ssl_root_cert: FilePath | None = None

    supabase_url: AnyHttpUrl | None = None
    supabase_jwt_audience: str = "authenticated"

    redis_host: str | None = None
    redis_port: int = Field(default=6379, ge=1, le=65535)
    redis_password: SecretStr | None = None
    redis_db: int = Field(default=0, ge=0)
    queue_redis_db: int = Field(default=1, ge=0)

    s3_bucket: str | None = Field(
        default=None, pattern=r"^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$"
    )
    s3_endpoint_url: AnyHttpUrl | None = None
    s3_region: str = "us-east-1"
    s3_access_key: SecretStr | None = None
    s3_secret_key: SecretStr | None = None
    s3_create_bucket: bool = False

    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_from: str | None = None
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_tls: Literal["starttls", "implicit", "none"] = "starttls"

    expo_access_token: SecretStr | None = None
    openai_api_key: SecretStr | None = None
    openai_model: str | None = None

    @field_validator("cors_allowed_origins")
    @classmethod
    def validate_origins(cls, origins: list[str]) -> list[str]:
        for origin in origins:
            url = urlsplit(origin)
            if (
                url.scheme not in ("http", "https")
                or not url.hostname
                or url.username is not None
                or "*" in url.hostname
                or url.netloc.endswith(":")
                or origin != f"{url.scheme}://{url.netloc}"
                or any(character.isspace() for character in origin)
            ):
                raise ValueError(
                    "Use HTTP or HTTPS origins with no path or credentials."
                )
            if url.port == 0:
                raise ValueError("Use a CORS origin with a valid port.")
        return origins

    @model_validator(mode="after")
    def validate_service_settings(self) -> "Settings":
        if (
            self.database_host or self.migration_database_host
        ) and not self.postgres_password:
            raise ValueError("Set POSTGRES_PASSWORD for the database connection.")
        if self.redis_host and not self.redis_password:
            raise ValueError("Set REDIS_PASSWORD for the Redis connection.")
        if self.database_ssl_mode == "verify-full" and not self.database_ssl_root_cert:
            raise ValueError("Set DATABASE_SSL_ROOT_CERT for verify-full SSL.")
        if self.supabase_url and (
            self.supabase_url.scheme != "https"
            and self.supabase_url.host not in ("localhost", "127.0.0.1")
        ):
            raise ValueError("Use HTTPS for SUPABASE_URL.")
        if self.supabase_url and self.supabase_url.path not in (None, "", "/"):
            raise ValueError("Set SUPABASE_URL to the project URL with no path.")
        if bool(self.s3_access_key) != bool(self.s3_secret_key):
            raise ValueError("Set both S3 credentials.")
        if self.s3_endpoint_url and not (self.s3_bucket and self.s3_access_key):
            raise ValueError("Set the bucket and credentials for a custom S3 endpoint.")
        if self.s3_create_bucket and not self.s3_bucket:
            raise ValueError("Set S3_BUCKET before enabling bucket creation.")
        if self.smtp_host and not self.smtp_from:
            raise ValueError("Set SMTP_FROM for the SMTP connection.")
        if bool(self.smtp_username) != bool(self.smtp_password):
            raise ValueError("Set both SMTP credentials.")
        if self.smtp_password and self.smtp_tls == "none":
            raise ValueError("Enable TLS for authenticated SMTP.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
