# Backend services

Run the API from `backend/` with `uv run uvicorn app.main:app --reload`. Check `/health` for liveness and `/ready` for configured dependencies.

`Settings` loads `.env` before `.env.local`. Shell variables take precedence. Each environment file accepts only defined keys.

## CORS

The default origins are `http://localhost:3000` and `http://127.0.0.1:3000`. Set `CORS_ALLOWED_ORIGINS` to a JSON array of complete origins without paths.

For Expo web on port 8081, export the origins before starting the API or Compose.

```sh
export CORS_ALLOWED_ORIGINS='["http://localhost:8081","http://127.0.0.1:8081"]'
```

Set `CORS_ALLOW_CREDENTIALS=true` only if the browser client needs credentials such as session cookies.

## Object storage

Compose configures RustFS and creates the private `otagai-media` bucket. Set `S3_BUCKET` to use a different bucket name.

Use `app.state.storage` for listing and handover photos. Check access to the listing or request before you use its object key.

## AI drafts

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in the shell before you start Compose. Choose a model that supports Structured Outputs.

For local development, set these variables in the shell or in `backend/.env.local`. Keep the key on the backend.

Use `write_request` from `app.services.ai.request_writer`. Pass a `RequestDraftInput` with the notes, relationship, and culture pack.

The service returns Japanese, English, and Bengali drafts. Show the drafts to the user for review before posting.

Use `app.services.ai.service.draft` with a Pydantic output model for other drafting flows. Choose a model with image input for photo-assisted drafts.
