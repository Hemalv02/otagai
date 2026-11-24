# Photo listing draft verification

Verified on Linux on 2026-11-24 after merging main `583982e` into this branch.

## Automated checks

- `pnpm exec tsc --noEmit`: passed after Expo regenerated ignored route types.
- `pnpm lint`: passed.
- `node --experimental-strip-types --test --experimental-test-isolation=none tests/*.test.mjs`: 126 passed.
- `uv run pytest -q tests --ignore=tests/integration`: 54 passed, including storage short-read and incomplete-download checks.
- Fresh disposable PostgreSQL upgrade followed by `uv run pytest -q tests`: 293 passed. AI integration tests mock the model boundary; the separate HTTP run below used the live model.

## Real HTTP acceptance

Used local Supabase Auth with two approved same-circle accounts, this branch's FastAPI, disposable PostgreSQL, real S3-compatible storage and the configured backend-only OpenAI model (`gpt-6.1-terra`).

- Uploaded a household drill image once with `purpose=listing`; media was ready.
- Live photo draft returned a drill title, live category and parts.
- Edited the title to include “with spare battery” and published using the same media UUID.
- Reloaded My Listings, Browse as the second account, and listing detail. Corrected title, image and all five parts persisted.
- A ladder was forced to `help_only` on create and remained help-only after an attempted lend-mode update.
- A blank image returned `recognized=false`, supporting the manual fallback.
- Text-only drafting still returned a usable title.
- Another account's photo, an unready upload and an Ask-purpose photo each returned 404 before drafting.

## Pending two-account iPhone acceptance

1. Browse → Add listing → Tool → take/select a household-tool photo → Suggest details. Verify the image stays beside the editable suggestions and the manual form remains usable.
2. Edit a title and a part. Retry suggestions and change the photo; verify member edits remain. Publish, reload My Listings and Browse as the second account, and verify corrected fields, image and parts.
3. Select a risky category and verify the help-only notice before Publish.
4. Use an unclear photo and simulate a failed AI call. Verify manual entry remains usable.
5. Check English, Japanese and Bengali, keyboard layout and tap targets.

No iPhone or iOS simulator is available on this Linux host. HTTP acceptance does not establish native form behavior; record those outcomes in the PR after execution.
