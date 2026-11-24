# Hackathon demo data

The seed command uses Supabase Auth to create three sign-in accounts and the Otagai API to build their circle, family, marketplace, request, exchange and chat histories. Use a dedicated demo Supabase project and an Otagai server backed by a demo PostgreSQL database. Apply the current Alembic migrations and configure media storage before running the command. The drill listing uses the bundled onboarding photo.

Set these variables in the shell you use to run the command. Set the two credentials through your secret manager or shell rather than writing them into this repository.

| Variable | Value |
| --- | --- |
| `OTAGAI_DEMO_API_URL` | Otagai server origin, such as `http://127.0.0.1:8000` |
| `OTAGAI_DEMO_SUPABASE_URL` | Supabase project origin, such as `http://127.0.0.1:54321` for the local stack |
| `OTAGAI_DEMO_NAMESPACE` | Unique lowercase name, 3–24 characters, starting with a letter and using letters, digits or hyphens |
| `OTAGAI_DEMO_PASSWORD` | Shared demo sign-in password of at least 12 characters |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role JWT for the demo Supabase project |

If the Otagai API has no suitable tool or skill category, the command inserts the missing reference category into its PostgreSQL database. Set `DATABASE_HOST`, `DATABASE_PORT`, `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, and, if needed, `DATABASE_SSL_MODE` for that database. An existing category is reused.

From `backend/`:

```sh
uv run python -m scripts_itest.seed_hackathon --check-config
uv run python -m scripts_itest.seed_hackathon
```

The command prints the three account emails and fixture IDs. Sign in with the printed email and the configured demo password. Keep the same namespace and password when rerunning against the same database. The command reuses its accounts, matching fixtures and chat messages. Existing recognition visibility is preserved. Use a new namespace to start a fresh demo beside an earlier one.

## Walkthrough

1. Sign in as Tanaka in Nagasaki. Her memberships include the port neighbourhood association and its Han 3. Use Assistant to find Rahim’s cordless drill or his shelf-installation help.
2. Open Tanaka’s completed shelf-moving exchange. The thank-you includes the sender’s permission to share and the recipient’s choice to publish it to Han 3. Rahim’s open request for help watering balcony plants is available as a way to return the favour.
3. Open the completed exchange’s conversation. Tanaka wrote in Japanese and Rahim replied in Bengali. Use the message translation action after selecting the target language. The environment needs an AI provider configured to generate translations.
4. Sign in as Rahim and open Family. His managed family member Amina is approved in the Cumilla building and has a request about carrying shopping bags. Select Amina to review or draft a request on her behalf. Sign in as Nusrat, the building leader, to see the request from the local helper’s side. Once both sides confirm the help, Rahim can use Amina’s consented thank-you access to show the bKash demo and send a real private note.

The seeded thank-you uses a note. The seed command makes no payments.
