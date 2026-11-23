# Authentication

Supabase Auth signs users in. The API verifies the Supabase access token on each request.

## How it works

1. The app creates an account or signs in with an email address and password through `supabase-js`. When email confirmation is enabled, the user opens the confirmation link before signing in.
2. The app sends the access token as `Authorization: Bearer <token>`.
3. `TokenVerifier` in `app/services/auth/service.py` checks the token against the project JWKS at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`.
4. The verifier accepts only `ES256` or `RS256` keys from the JWKS. It checks the signature, `exp`, `iss`, `aud`, and `role`.
5. The `sub` claim maps to `users.auth_user_id`.

The API needs no Supabase secret. Set only `SUPABASE_URL`.

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

- Enable the **Email** provider and allow new user sign-ups.
- When email confirmation is enabled, keep the confirmation link in the Confirm signup template.
- The built-in Supabase mailer sends only to project team addresses. Configure custom SMTP for confirmation emails to other people.
