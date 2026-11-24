# Authentication

Supabase Auth signs users in. The API verifies the Supabase access token on each request.

## How it works

1. The app creates an account or signs in with an email address and password through `supabase-js`. The user enters the signup code from their email in the app to verify their address, then signs in with their password.
2. The app sends the access token as `Authorization: Bearer <token>`.
3. `TokenVerifier` in `app/services/auth/service.py` checks the token against the project JWKS at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`.
4. The verifier accepts only `ES256` or `RS256` keys from the JWKS. It checks the signature, `exp`, `iss`, `aud`, and `role`.
5. The `sub` claim maps to `users.auth_user_id`.

The API needs no Supabase secret. Set only `SUPABASE_URL`.

For a forgotten password, the app requests a recovery code and verifies it in a separate in-memory Supabase client. That recovery session can set the new password. The user then signs in with their new password.

## Dependencies

Use these dependencies from `app/routes/dependencies.py` in a route.

- `AuthClaimsDep` gives a verified token. Use it before a profile exists.
- `CurrentUserDep` gives the active profile. It returns 404 when the profile is missing and 403 when the account is not active.

## Profiles

- `GET /users/me` returns the profile.
- `POST /users` creates the profile for the signed-in account. It returns 409 when a profile exists.
- `PATCH /users/me` updates allowed fields.

A managed account has `kind = managed` and no `auth_user_id`. A caretaker creates it through proxy mode, and it cannot sign in.

## Supabase dashboard

- Enable the **Email** provider, allow new signups, and enable **Confirm email**.
- Configure **Authentication → Emails → SMTP Settings** with the SMTP relay credentials and a verified sender. Production uses Brevo on port 587.
- Use `{{ .Token }}` in the **Confirm sign up** and **Reset password** email bodies. Direct users to enter the code in Otagai. The mobile flow works without an email redirect URL.
- Set `EXPO_PUBLIC_API_URL` to `https://otagai.hemal.me` in the mobile environment. Use the matching Supabase project URL and its publishable or legacy anon key.
