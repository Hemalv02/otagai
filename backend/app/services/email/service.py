from email.errors import HeaderParseError
from email.headerregistry import Address
from email.message import EmailMessage

import aiosmtplib
from aiosmtplib.errors import SMTPException

from app.services.errors import ServiceConfigurationError, ServiceError
from app.settings import Settings


class EmailDeliveryError(ServiceError):
    pass


async def send_email(
    settings: Settings, *, recipient: str, subject: str, text: str
) -> None:
    if not settings.smtp_host or not settings.smtp_from:
        raise ServiceConfigurationError("Configure the SMTP connection and sender.")

    message = EmailMessage()
    try:
        message["From"] = Address(addr_spec=settings.smtp_from)
        message["To"] = Address(addr_spec=recipient)
        message["Subject"] = subject
        message.set_content(text)
    except (HeaderParseError, ValueError) as error:
        raise EmailDeliveryError("The email address or subject is invalid.") from error

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=settings.smtp_password.get_secret_value()
            if settings.smtp_password
            else None,
            use_tls=settings.smtp_tls == "implicit",
            start_tls=settings.smtp_tls == "starttls",
            timeout=10,
        )
    except (SMTPException, OSError) as error:
        raise EmailDeliveryError(
            "The SMTP server did not accept the message."
        ) from error
