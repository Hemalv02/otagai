import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any, ClassVar

from sqlalchemy import CheckConstraint, DateTime, MetaData, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map: ClassVar[dict[Any, Any]] = {
        str: Text,
        datetime: DateTime(timezone=True),
        dict[str, Any]: JSONB,
        list[str]: ARRAY(Text),
    }


class UUIDPrimaryKey:
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )


class CreatedAt:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class Timestamps(CreatedAt):
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


def check_in(
    column: str, values: type[StrEnum], *, nullable: bool = False
) -> CheckConstraint:
    allowed = ", ".join(f"'{value.value}'" for value in values)
    condition = f"{column} IN ({allowed})"
    if nullable:
        condition = f"{column} IS NULL OR {condition}"
    return CheckConstraint(condition, name=f"{column}_valid")
