from sqlalchemy.exc import IntegrityError


def violates(error: IntegrityError, constraint: str) -> bool:
    cause = error.orig.__cause__ if error.orig is not None else None
    name = getattr(cause, "constraint_name", None)
    if name is not None:
        return name == constraint
    return constraint in str(error.orig)
