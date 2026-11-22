# Email

Use `app.services.email.service.send_email` to send plain-text mail through an SMTP server.

Set `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM`. Set `SMTP_USERNAME` and `SMTP_PASSWORD` together if the server requires authentication.

Use `SMTP_TLS=starttls` for port 587 or `SMTP_TLS=implicit` for port 465. Use `SMTP_TLS=none` only with a local test server.
