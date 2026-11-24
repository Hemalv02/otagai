# Photo listing implementation and verification

Implemented in the existing feature checkout, preserving Home work and unrelated changes.

## Behavior

`POST /ai/listing-drafts` accepts `description`, `image_media_id`, or both, with `language` (`en`, `ja`, `bn`). A photo must be an owned, ready image uploaded with `purpose=listing`. Foreign, wrong-purpose, missing, rejected and processing media return 404 before calling the model. Images are loaded from private storage and passed as display-image data URLs; image bytes are excluded from AI run logs.

The vision model returns structured suggestions. The backend maps category slugs to live tool categories, bounds and deduplicates parts, bounds title/safety text, and forces `help_only` for risky categories. Empty recognized titles become unrecognized. The existing text contract remains accepted.

The Add listing form provides Suggest details and retry, editable title/category/parts/safety, English/Japanese/Bengali status messages, and manual fallback for unrecognized images or service failures. A successful suggestion fills empty or untouched fields and preserves manual changes, including edits made while the request is running. Upload preparation is shared by drafting and publishing, so the ready media ID is reused. A help-only AI recommendation is preserved even when its suggested category is broader than the item. The server separately enforces risky-category restrictions on publication.

The assistant reuses the same owned-ready image loader with its original `purpose=ask` constraint.

## Automated verification

- New backend integration tests first failed: 9 failed, 1 passed because image_media_id was rejected and new category/recognition fields were missing.
- Focused photo/AI/assistant/listings regressions: 40 passed, 15 existing SQLAlchemy deprecation warnings.
- Complete backend suite against disposable local PostgreSQL: 281 passed, 28 existing SQLAlchemy deprecation warnings.
- Mobile suggestion tests cover manual-edit preservation, live category validation, bounded/deduplicated parts and help-only preservation. The recommendation-preservation regression failed before its fix and passed afterward.
- Combined mobile suite after the direct-request account-binding fix: 125 passed.
- Mobile TypeScript and lint passed.
- Backend Ruff check and format checks passed from the backend project directory.

Integration tests use isolated authentication and byte-preserving in-memory object storage, with a mocked model. Separately, real OpenAI calls were made for the three user-supplied images: cleaver recognized and help-only; multiple tools unrecognized for manual entry; screwdriver initially returned 503 and succeeded on retry. The original and retry JSON artifacts preserve the actual outputs. Live photo checks still use isolated authentication, in-memory storage and disposable catalog categories, not production services.

The backend-only OpenAI configuration specified in the brief was written to ignored backend/.env.local, with mode 0600; no secret value appears in code or result artifacts.

## Device acceptance still required

No iPhone/device or production account was used. Verify camera/library permission handling, edit a suggestion before publishing, reload Browse and My Listings, try a risky category and an unclear photo, and confirm a failed AI request leaves manual publishing usable. Use two approved test accounts for direct listing requests. Live photo smoke tests with isolated storage/auth do not replace this device acceptance.

## User-supplied live photo results

Consolidated evidence: `diagrams/photo-live-acceptance.json`.

- `screw_Driver.png`: first attempt 503; retry identified Flathead screwdriver and suggested lend. The first failure's upstream cause is unconfirmed.
- `knifr_image.png`: identified Kitchen cleaver, risky category true and help_only. Publication retained help_only.
- `multiple_tools.png`: recognized=false, no invented parts; manual entry remains available.
- Both recognized drafts passed edited-title/parts persistence, same-media reuse, lending-mode persistence, My Listings collection and Browse collection checks.

Live calls used the brief's specified model and credentials kept out of artifacts. The test catalog includes seeded hand-tools, ladder and cutting-tool categories; it is not a production category audit. Publication collection checks re-used the saved live draft without extra model calls, mapping slugs to current disposable category IDs.
