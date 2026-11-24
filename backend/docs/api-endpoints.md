# API guide and endpoints

Part 1 is the set of rules every endpoint follows. Part 2 lists every endpoint the screens in `screens.md` and the product doc need.

# Part 1: REST guide

## Layers

Each request passes through three layers. Each layer has one job and calls only the layer below it.

| Layer | Location | Does | Never does |
|---|---|---|---|
| Route | `app/routes/<name>/route.py` | Parses and validates the path, query and body. Resolves dependencies (`DatabaseDep`, `ActorDep`). Calls one service function. Builds the response model and sets the status code and `Location` header | SQL, business rules, permission checks, catching database errors |
| Service | `app/services/<name>/service.py` | Owns the use case. Opens the transaction. Decides what to query: filters, visibility, blocks, circle scope. Checks permissions and state transitions. Calls repositories. Queues side effects such as notifications and push. Raises typed errors | Importing FastAPI, building HTTP responses, writing SQL |
| Repository | `app/repositories/<name>.py` | Runs SQLAlchemy statements inside the session it is given. Returns models or plain tuples. Turns a named constraint violation into a typed repository error | Opening or committing transactions, business rules, permission checks, HTTP |

### Route

```python
@router.get("")
async def list_listings(
    query: Annotated[ListingQuery, Query()], actor: ActorDep, database: DatabaseDep
) -> Page[ListingSummary]:
    result = await listings.browse(database, actor, query.filters(), query.page())
    return Page.build(result, ListingSummary)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_listing(
    body: CreateListingBody, actor: ActorDep, database: DatabaseDep, response: Response
) -> ListingDetail:
    listing = await listings.create(database, actor, body.to_new_listing())
    response.headers["Location"] = f"/listings/{listing.id}"
    return ListingDetail.model_validate(listing)
```

- Keep the request and response models in the same folder as the route: in `route.py`, or in `schemas.py` once the file gets long.
- Use separate models for create, update and response. A body never includes `id`, owner ids, `status`, `acted_by_user_id` or timestamps.
- Set `model_config = ConfigDict(extra="forbid")` on every body and query model, so unknown fields return a 422.
- Give every string a maximum length, every list a maximum number of items, and every number a range.

### Service

```python
async def browse(
    database: Database, actor: Actor, filters: ListingFilters, page: PageRequest
) -> PageResult[Listing]:
    async with database.session() as session:
        circle_ids = await CircleRepository(session).approved_circle_ids(
            actor.subject_id
        )
        if filters.circle_id and filters.circle_id not in circle_ids:
            raise NotFoundError("Circle not found.")
        hidden = await BlockRepository(session).blocked_either_way(actor.subject_id)
        return await ListingRepository(session).search(
            circle_ids=circle_ids, exclude_owner_ids=hidden, filters=filters, page=page
        )
```

- Write one function per use case: `browse`, `create`, `cancel`, `accept_response`.
- Each function takes `(database, actor, ...)` and runs in exactly one `async with database.session()` block, so the whole use case commits or rolls back together.
- Check object-level access in every function that takes an id: the caller must be the owner, a participant, a member of the circle, or hold the right proxy scope. A missing check here is an IDOR bug.
- Check the state before changing it (for example, only an `open` request can be cancelled), and lock the row with `with_for_update` when two people can change it at once.
- Queue notifications, push and translation only after the commit succeeds.
- Raise errors from `app/services/errors.py` (see [Errors](#errors)), never `HTTPException`.

### Repository

```python
class ListingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def search(
        self,
        *,
        circle_ids: list[uuid.UUID],
        exclude_owner_ids: list[uuid.UUID],
        filters: ListingFilters,
        page: PageRequest,
    ) -> PageResult[Listing]:
        statement = (
            select(Listing)
            .join(CircleMembership, CircleMembership.user_id == Listing.owner_user_id)
            .where(
                CircleMembership.circle_id.in_(circle_ids),
                Listing.owner_user_id.not_in(exclude_owner_ids),
                Listing.status != ListingStatus.DELETED,
            )
        )
        if filters.kind:
            statement = statement.where(Listing.kind == filters.kind)
        return await paginate(
            self._session, statement, page, Listing.created_at, Listing.id
        )
```

- Repositories receive the session from the service; they never open their own.
- Use SQLAlchemy expressions with bound parameters. Never build SQL from strings or f-strings.
- Name methods by intent (`get`, `get_for_update`, `search`, `create`, `update`), not by table.
- Catch `IntegrityError` only for a named constraint (`uq_request_responses_one_accepted`), raise a typed repository error, and re-raise anything else.

## URLs

- Name every collection with a plural noun: `/listings`, `/requests`, `/thank-yous`.
- Write path segments in kebab-case and JSON fields in snake_case.
- Address one item as `/<collection>/{id}`. Ids are UUIDs, and the path parameter is typed as `uuid.UUID`, so a malformed id returns 422.
- Nest at most one level: `/requests/{request_id}/responses/{response_id}`. A deeper child gets its own top-level path: `/handover-checks/{check_id}/items/{item_id}`, not `/exchanges/{id}/handover-checks/{id}/items/{id}`.
- `me` stands for the caller: `/users/me`. Lists that belong only to the caller live under it: `/users/me/notifications`, `/users/me/blocks`.
- Resources that several people share live at the top level: `/requests/{id}`, `/conversations/{id}`, `/exchanges/{id}`.
- A singleton (one object per parent, never a list) uses a singular noun: `/users/me`, `/users/me/home`, `/users/{user_id}/pair`.
- Don't put a version prefix in paths yet. A breaking change later adds `/v2` for the affected routes only.

## Methods

| Method | Use | Body | Idempotent |
|---|---|---|---|
| `GET` | Read one item or a page of a list | none | yes |
| `POST /<collection>` | Create an item | the new item | no (use a retry key, see below) |
| `PATCH /<item>` | Change some fields. Send only the fields that change; `null` clears a field that allows it | the changed fields | yes |
| `PUT /<item>/<sub-collection>` | Replace a whole sub-list (listing parts, photo order) | the full list | yes |
| `DELETE /<item>` | Delete, or soft-delete. Deleting something already deleted still returns 204 | none | yes |
| `POST /<item>/<verb>` | A state change with rules or side effects | optional details | yes, for the same target state |

### Actions

Use an action instead of `PATCH status` when the change has rules or side effects: `cancel`, `accept`, `withdraw`, `confirm`, `widen`, `revoke`, `hand-over`, `return`, `dispute`.

- Name it with a verb in its base form: `POST /requests/{request_id}/cancel`.
- It returns 200 with the updated item.
- Repeating an action that has already happened returns 200 with no change. An action that the current state forbids returns 409.
- Status fields are read-only in `PATCH`. Only actions change them.

## Status codes

### Success

| Code | When |
|---|---|
| 200 OK | `GET`, `PATCH`, `PUT`, an action, an AI helper call, or a create that found an existing item (a resent message with the same `client_message_id`, an existing direct chat) |
| 201 Created | `POST` that created an item. Set `Location: /<collection>/{id}` and return the item |
| 202 Accepted | Work continues in the background, such as a media upload still processing. Return the item with `status: processing` and a `Location` to poll |
| 204 No Content | `DELETE`, and actions that return nothing (`POST /users/me/notifications/read-all`) |

### Errors

| Code | When | Example |
|---|---|---|
| 400 Bad Request | The request can't be understood, even though it is well-formed JSON | A tampered cursor, or an `X-Acting-For` value that isn't a UUID |
| 401 Unauthorized | The token is missing, invalid or expired. Include `WWW-Authenticate: Bearer` | |
| 403 Forbidden | The caller can see the item but may not do this | A member who isn't the leader approves someone; a proxy without `can_thank_and_pay` sends money |
| 404 Not Found | The item doesn't exist **or the caller can't see it**. Use 404, not 403, for hidden items so their existence doesn't leak | Another circle's listing; a blocked user's profile |
| 409 Conflict | The current state doesn't allow this, or it duplicates something unique | Cancelling a finished request; a second accepted response; a second profile; an `Idempotency-Key` reused with a different body |
| 413 Content Too Large | The upload is over the size limit | |
| 415 Unsupported Media Type | The upload isn't an allowed type | |
| 422 Unprocessable Content | The body, query or path fails validation | Missing field, unknown field, too long, bad enum value |
| 429 Too Many Requests | Rate limit hit. Include `Retry-After` | AI helpers, uploads, sign-up |
| 500 Internal Server Error | An unexpected bug. The body says only "Something went wrong." and the details go to the log | |
| 503 Service Unavailable | A dependency is down or not configured. Include `Retry-After` when known | Database, Supabase, the AI provider, Stripe |

## Errors

Every error body has the same shape:

```json
{ "message": "This request is no longer open." }
```

A service error can add machine-readable fields, so a client can branch without parsing the message. `code` is a stable string, and `request_id` is the id of an existing record the caller owns:

```json
{ "message": "You already have an open request for this listing.", "code": "open_request_exists", "request_id": "0b9e4c1e-6a1c-4c53-9a63-1f3f8f2d5b11" }
```

A 422 also lists each field:

```json
{ "message": "The request is invalid.", "errors": [{ "field": "title", "message": "Field required" }] }
```

- Write the message in plain language for a person. Never include SQL, stack traces, ids of hidden items, or other users' personal data.
- Services raise typed errors that inherit from a base class in `app/services/errors.py`. A single exception handler in `app/main.py` maps them, so routes don't need `try`/`except`:

| Base error | Status |
|---|---|
| `BadRequestError` | 400 |
| `NotFoundError` | 404 |
| `PermissionDeniedError` | 403 |
| `ConflictError` (including invalid state transitions and duplicates) | 409 |
| `RateLimitedError` | 429 |
| `UpstreamUnavailableError` | 503 |

- Create each specific error as a subclass with its message, such as `class RequestNotOpenError(ConflictError)`.
- `RateLimitedError` and `UpstreamUnavailableError` take `retry_after_seconds`, which becomes the `Retry-After` header.
- A `ServiceConfigurationError` returns 503 with a generic message. Any other unmapped error, or an unexpected exception, returns 500 "Something went wrong." with no details.

## Pagination

Every list endpoint uses cursor (keyset) pagination. Don't use offset pagination: it skips and repeats rows while new requests and messages arrive.

**Request**

| Parameter | Rule |
|---|---|
| `limit` | 1 to 50, default 20. Out of range returns 422 |
| `cursor` | The opaque `next_cursor` from the previous page. Leave it out for the first page |

**Response**

```json
{ "items": [ ... ], "next_cursor": "eyJjIjoiMjAyNi0xMS0yM1QxMDowMDowMFoiLCJpIjoiLi4uIn0" }
```

- `next_cursor` is `null` on the last page.
- Sort by a stable key plus `id` as the tie-breaker. The default is newest first: `ORDER BY created_at DESC, id DESC`.
- The cursor is base64url JSON of the last row's sort values. The next page uses `WHERE (created_at, id) < (:created_at, :id)`.
- Fetch `limit + 1` rows to know whether another page exists, then return only `limit`.
- Decode the cursor defensively, and return 400 if it is malformed or was made for a different sort.
- The cursor only positions the page. The service still applies every visibility filter on each page.
- Don't return a total count. When a screen needs a badge, use a dedicated count endpoint (`/users/me/unread-counts`).
- Chat history pages backwards with `?before=<message cursor>` and returns the oldest message last.
- Make sure each sort has an index that matches it (for example `(conversation_id, created_at DESC, id DESC)`).

Use the shared helpers instead of writing this by hand:

- `PageQuery` in `app/routes/pagination.py`: subclass it for each list's query model, so `limit` and `cursor` are validated the same way everywhere. Call `query.page()` to get a `PageRequest`.
- `paginate(session, statement, page, *keys, descending=True)` in `app/repositories/pagination.py`: takes a `select(Model)` statement and the sort columns, ending with a unique one (usually `Model.id`). All keys sort in the same direction.
- `Page.build(result, ItemModel)` in the route: turns the `PageResult` into the `{"items", "next_cursor"}` response.

## Filtering, sorting and search

- A filter's name matches the field: `?status=open`, `?kind=tool`, `?category_id=...`.
- Several values are comma-separated: `?status=open,matched`. Each value is checked against its enum.
- `q` is free-text search: at least 1 and at most 100 characters, trimmed, and passed as a bound parameter.
- `sort` accepts only a fixed list per endpoint, with `-` for descending: `?sort=-created_at`. Anything else returns 422.
- Declare all query parameters in a Pydantic model with `extra="forbid"`, so a typo returns 422 instead of being ignored.

## Request and response bodies

- Return a single item as the object itself, with no `data` wrapper. Lists use the page shape above.
- Always include every field in the response model, using `null` for empty values, so the app sees the same shape every time.
- Timestamps are ISO 8601 in UTC with an offset: `2026-11-23T10:00:00Z`.
- Money is `amount_minor` (an integer in the smallest unit; JPY has none, BDT uses poisha) plus `currency`.
- Enum values are lowercase strings from `app/database/models/enums.py`.
- Translated text is a map from language code to text: `{"ja": "...", "en": "...", "bn": "..."}`.
- Never return `auth_user_id`, phone, email, S3 keys or internal flags. Images come back as short-lived signed URLs.
- Show contact details only after both sides have accepted an exchange.
- Add fields freely; the app must ignore fields it doesn't know. Never rename or remove a field without a new version.

## Auth and acting for someone

- Every endpoint needs `Authorization: Bearer <Supabase access token>`, except `/health`, `/ready` and `/webhooks/*`. Webhooks check the provider's signature instead.
- `ActorDep` resolves the caller and an optional `X-Acting-For: <user_id>` header into an `Actor`:
  - `actor.user` is the person signed in. It is written to `acted_by_user_id`.
  - `actor.subject_id` is the person the action is for: the signed-in user, or the person named in the header.
  - `actor.grant` is the proxy grant, or `None`.
- `ActorDep` checks that an active grant exists and the person is active, and returns 403 otherwise. A value that isn't a UUID returns 400.
- Each service function checks the scope it needs with `actor.require(ProxyScope.POST_REQUESTS)` (also `CHAT`, `THANK_AND_PAY`, `VIEW_ACTIVITY`, `MANAGE_LISTINGS`). It does nothing when you act as yourself, and returns 403 when the grant lacks the scope.
- Use `CurrentUserDep` instead of `ActorDep` only for endpoints that can never be done for someone else, such as your own profile and settings.
- Hide blocked users in both directions in feeds, search, profiles and chat.

## Retries and concurrency

- `POST /payments` requires an `Idempotency-Key` header. The same key with the same body returns the first result; the same key with a different body returns 409.
- `POST .../messages` takes `client_message_id`. A resend returns 200 with the original message.
- Endpoints where two people race (accepting a response, approving a membership, confirming a checklist) lock the row in the service and rely on the database's unique indexes as the last guard. The loser gets 409.
- The app retries only on network failures, 429 and 503, with a small limit and backoff. It never retries 4xx errors.

## Rate limits

Apply per-user limits through Redis to AI helpers, uploads, profile creation, reports, and anything that sends a notification to other people. Return 429 with `Retry-After`.

## Checklist for a new endpoint

1. The path follows the URL rules, and the success status matches the tables above.
2. The route uses typed body and query models with `extra="forbid"` and limits on every field.
3. The service checks object-level access, proxy scope and state, then runs everything in one transaction.
4. The repository uses bound parameters and paginates with keyset.
5. Typed errors map to the right status, and no error message leaks hidden data.
6. Lists filter out blocked users and items from other circles.
7. Each new table enables row-level security in its migration.
8. Tests cover the success case, 401, another user's item (404), a forbidden state (409) and a bad body (422).
9. Ruff passes, and the endpoint shows up correctly in `/docs`.

# Part 2: Endpoints

Each row gives the success status, the screens it serves, and whether it's needed for the 24 Nov demo (**MVP**) or can wait (**Later**). **Done** means it already exists. Email/password registration and sign-in go straight to Supabase Auth from the app.

There is deliberately no "decline" endpoint for a request. Not answering is the no.

## 1. Account and profile

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `GET /users/me` | My profile | 200 | 3, 46 | Done |
| `POST /users` | Create my profile after the first sign-in. A second profile returns 409 | 201 | 3 | Done |
| `PATCH /users/me` | Edit name, avatar (`avatar_media_id`), languages, intro, "happy to help with", `accepts_money_orei`, simple mode, text size, quiet hours, push on/off | 200 | 3, 6, 46 | Done (add the new fields) |
| `DELETE /users/me` | Delete my account: soft delete, anonymise, withdraw open requests and responses, pause listings | 204 | 46 | MVP |
| `POST /users/me/push-tokens` | Register an Expo push token (returns 200 if it's already registered) | 201 | 43 | MVP |
| `DELETE /users/me/push-tokens/{token_id}` | Remove a token on sign-out | 204 | 46 | MVP |
| `GET /users/{user_id}` | Neighbour profile: intro, languages, skills summary. 404 if either side has blocked the other | 200 | 30 | MVP |
| `GET /users/{user_id}/pair` | Our pair history and balance ("helped each other 3 times each") | 200 | 30 | MVP |
| `GET /users/{user_id}/listings` | Their listings I'm allowed to see | 200 | 30 | MVP |
| `GET /users/{user_id}/requests?status=` | Their requests I'm allowed to see. Neighbours see open ones for "return the favour". A caretaker with `can_view_activity` sees everything | 200 | 30, 33 | MVP |
| `GET /users/{user_id}/exchanges` | Exchanges of someone I care for (needs `can_view_activity`) | 200 | 33 | MVP |
| `GET /users/{user_id}/thank-yous` | Thank-you notes they've received that are visible to me | 200 | 30 | MVP |

## 2. Home and badges

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `GET /users/me/home` | One call for the home screen: newest received requests, my active exchanges, things due today | 200 | 7 | MVP |
| `GET /users/me/unread-counts` | Unread notifications and messages, for badges | 200 | 7, 23, 43 | MVP |

## 3. Circles and membership

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `GET /circles?near=lat,lng` or `?q=` | Search open circles in the profile's region. Nearby results are limited to 3 km and ordered by distance. Returns approximate locations only | 200 | 4 | MVP |
| `GET /circles/{circle_id}` | Circle details. Members whose membership isn't approved get a limited view | 200 | 4, 38 | MVP |
| `POST /circles` | Start a circle; the creator becomes its leader | 201 | 4 | MVP |
| `PATCH /circles/{circle_id}` | Leader edits the name, translations or `open_to_nearby` | 200 | 40 | Later |
| `POST /circles/{circle_id}/archive` | Leader archives the circle | 200 | 40 | Later |
| `GET /circle-invites/{code}` | Preview the circle behind an invite code or QR before joining. 404 if the code is invalid or expired | 200 | 4 | MVP |
| `POST /users/me/memberships` | Join with `{invite_code}`, or ask to join a found circle with `{circle_id}`. Approved straight away if the invite auto-approves, otherwise pending | 201 | 4 | MVP |
| `GET /users/me/memberships` | My circles and their status (the "waiting for approval" screen polls this) | 200 | 5 | MVP |
| `DELETE /users/me/memberships/{circle_id}` | Leave a circle | 204 | 46 | Later |
| `GET /circles/{circle_id}/memberships?status=` | Members see approved members. Leaders can also see pending, rejected and removed | 200 | 38, 40 | Later |
| `POST /circles/{circle_id}/memberships/{user_id}/approve` | Leader approves a member | 200 | 40 | Later (MVP: seeded) |
| `POST /circles/{circle_id}/memberships/{user_id}/reject` | Leader rejects a pending member | 200 | 40 | Later (MVP: seeded) |
| `POST /circles/{circle_id}/memberships/{user_id}/remove` | Leader removes a member | 200 | 40 | Later |
| `PATCH /circles/{circle_id}/memberships/{user_id}` | Leader changes a member's role | 200 | 40 | Later |
| `POST /circles/{circle_id}/invites` | Leader creates an invite code (expiry, max uses, auto-approve) | 201 | 40 | Later |
| `GET /circles/{circle_id}/invites` | List the circle's invites | 200 | 40 | Later |
| `POST /circles/{circle_id}/invites/{invite_id}/revoke` | Revoke an invite | 200 | 40 | Later |

## 4. Media uploads

Files never go straight to S3 from the app. The backend strips EXIF and GPS data, writes WebP variants, and chooses the S3 key.

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `POST /media` | Multipart upload with a `purpose` (avatar, listing, ask, request, handover, chat, voice). Returns 201 if it's processed in the request, or 202 if processing is queued | 201 / 202 | 3, 11, 19, 23, 24 | MVP |
| `GET /media/{media_id}` | Status and short-lived signed URLs. Request photos are private to the owner until attached, then available to recipients reached by an attached request. Blocks prevent access, and a proxy must have `can_view_activity` | 200 | all | MVP |
| `DELETE /media/{media_id}` | Delete my upload if nothing uses it yet, otherwise 409 | 204 | 19 | MVP |

## 5. Categories

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `GET /categories?kind=tool\|skill` | Category tree with names in all three languages and the `is_risky` flag. Small and fixed, so not paginated | 200 | 8, 19, 20 | MVP |

## 6. Listings (tools and skills)

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `GET /listings` | Browse what my circles can see. Filters: `q`, `kind`, `category_id`, `circle_id`, `status`. `exclude_own=true` excludes listings owned by the effective actor before pagination. The default is `false`. | 200 | 8 | MVP |
| `GET /listings/{listing_id}` | Photos, owner, parts, availability, `available_again_at` | 200 | 9 | MVP |
| `POST /listings` | Create a tool or skill with parts and `media_ids`. Risky categories are forced to `help_only` | 201 | 19, 20 | MVP |
| `PATCH /listings/{listing_id}` | Edit the title, description, safety notes, lend mode, availability or visibility | 200 | 20, 21 | MVP |
| `POST /listings/{listing_id}/pause` | Pause the listing | 200 | 20, 21 | MVP |
| `POST /listings/{listing_id}/resume` | Resume a paused listing | 200 | 20, 21 | MVP |
| `DELETE /listings/{listing_id}` | Soft delete. 409 while the item is lent out | 204 | 21 | MVP |
| `PUT /listings/{listing_id}/parts` | Replace the parts list | 200 | 19 | MVP |
| `PUT /listings/{listing_id}/media` | Replace the photos and their order | 200 | 19 | MVP |
| `GET /users/me/listings` | My listings, including paused and lent-out ones. Optional filters: `kind=tool\|skill`, `status` (comma-separated) | 200 | 21 | MVP |

## 7. Asking for help (the AI ask flow)

An ask session holds the AI steps before anything is sent. Nothing reaches a neighbour until `POST /requests`.

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `POST /ask-sessions` | Start from text, a voice recording (`media_id`, transcribed) or a photo. Returns what the AI identified, or one follow-up question | 201 | 11, 12 | MVP |
| `GET /ask-sessions/{session_id}` | Identified tools and skills, plus matching listings and neighbours | 200 | 13 | MVP |
| `POST /ask-sessions/{session_id}/answer` | Answer the follow-up question, or correct the AI | 200 | 12 | MVP |
| `POST /ask-sessions/{session_id}/draft` | Polite message and translations for a chosen tone, time and audience (one person, the *han*, or a widening ripple). Call it again to change the tone | 200 | 14 | MVP |
| `DELETE /ask-sessions/{session_id}` | Abandon the ask | 204 | 11–14 | MVP |

### Assistant chat

| Method and path | Purpose | Success |
|---|---|---|
| `POST /assistant/turns` | Interpret a message or photo and return a reply, result cards and any request draft | 201 |
| `GET /assistant/threads` | List the signed-in member's conversations, most recent activity first | 200 |
| `GET /assistant/threads/{thread_id}/turns` | Read saved turns, newest first, with the current visible cards and posted request IDs | 200 |
| `POST /assistant/turns/{turn_id}/confirm` | Post the member's reviewed text. Retrying the same draft or listing returns its request | 201 or 200 |

Send `text`, `image_media_id`, or both. Upload a photo with `POST /media` and `purpose=ask`. For voice input, upload with `purpose=voice`, transcribe with `POST /ai/transcriptions`, then send the reviewed transcript as `text`. Send `previous_turn_id` to continue a conversation. Use `language` to choose `en`, `ja`, or `bn`. Both history endpoints accept `limit` and `cursor`.

Each turn includes `id`, `thread_id`, `reply`, `cards`, an optional `draft`, and any attachment or posted request ID. A card includes an actual listing and owner. Open tool details with `GET /listings/{id}` or a helper profile with `GET /users/{id}`. A card's `action` is `borrow` or `ask_for_help`, based on the listing's lending mode. When `no_matches` is true, the client can offer to draft a request in a follow-up turn using the same conversation.

When `clarification` is set, display the follow-up in `reply` and submit the answer as a new turn with the question's `id` as `previous_turn_id`. The turn can show relevant matches during clarification. Its draft is empty and its confirm endpoint returns 409 until the member answers in a new turn. A clear request can be drafted with no timing.

After the member confirms the draft or a card selection, send the reviewed `text` and `kind` to the confirm endpoint. The request may include `listing_id` from the same turn, `direct_to_user_id`, `home_circle_id`, and offset-aware `needed_from` and `needed_until` timestamps. A selected listing goes to its owner. History holds independent receipts for these requests under `listing_requests`. General drafts go to the member's circle unless they choose a recipient. For a broadcast, show the destination in the review and send its `home_circle_id`. The API requires a destination when the member has multiple approved circles. An off-topic turn provides a short redirect and has no draft or matches to post.

With Redis configured, repeated text prompts can reuse their interpretation for five minutes. Listings, access checks, and photo URLs are resolved from current data on every lookup.

## 8. Help requests

### Requester side

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `POST /requests` | Send a request: from an ask session or directly (`listing_id`, `direct_to_user_id`, times, ripple maximum, `media_ids`). Creates the first ripple of recipients. With `listing_id`, an omitted `direct_to_user_id` defaults to the listing owner; an explicitly supplied recipient must be the owner. The listing must be visible and active, and the kind must match its lend mode (`help_only` → `help`; `lend` → `borrow` or `borrow_with_help`). Paused or lent-out listings return 409. A member has at most one open request per listing: sending the same request again returns the existing open request (same id, still 201) with no new notification. A request with different content returns 409 with `code: "open_request_exists"` and the existing `request_id` | 201 | 14, 15 | MVP |
| `GET /users/me/requests?status=` | My requests: open, matched, in progress, done, cancelled, expired. `status` takes a comma-separated list; an unknown status or query parameter returns 422. With `X-Acting-For: <member_id>`, lists that member's requests and needs `can_view_activity` (403 without it, or when the grant is missing or revoked) | 200 | 16, 33 | MVP |
| `GET /requests/{request_id}` | Request detail includes the viewer's role and their response. The matched participants also get `exchange_id` | 200 | 17, 18 | MVP |
| `GET /requests/{request_id}/receipt` | Requester-only delivery timeline. Returns current and maximum stages, next scheduled widening and expiry, plus status and actual inbox recipient count per stage. Acting for the requester requires `can_view_activity` | 200 | 15, 17 | MVP |
| `PATCH /requests/{request_id}` | Edit the time or wording. 409 unless the request is open | 200 | 17 | MVP |
| `POST /requests/{request_id}/cancel` | Cancel. Notifies anyone with a pending or accepted response | 200 | 17 | MVP |
| `POST /requests/{request_id}/widen` | Advance a due stage, pass the observed `expected_stage` for immediate widening, or reopen an expired request under its existing cap. Reopening a listing request re-runs the listing checks: a paused or lent-out listing returns 409, and a hidden listing, a mismatched recipient or a kind the lend mode no longer allows returns the same error as `POST /requests`. A stale open request for the same listing is expired first. A live open request for the same listing returns 409 with `code: "open_request_exists"` and its `request_id` | 200 | 15, 16 | MVP |
| `GET /requests/{request_id}/responses` | Offers, questions and other suggested times. Only the requester sees all of them | 200 | 17 | MVP |
| `POST /requests/{request_id}/responses/{response_id}/accept` | Accept an offer or suggested time to create the exchange and chat and supersede the other responses. Retrying the same match returns the accepted response. Choosing a different response after matching returns 409 | 200 | 17 | MVP |

### Helper side

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `GET /users/me/received-requests?direct=` | Requests I'm a recipient of, newest first, with my response status. `direct=true` shows only the ones sent to me personally. Blocked users and hidden requests are left out | 200 | 7, 18, 22 | MVP |
| `PATCH /users/me/received-requests/{request_id}` | Mark as `seen`, or `hidden` from my feed. The requester never sees either | 200 | 18, 22 | MVP |
| `POST /requests/{request_id}/responses` | "I can help" (`offer`), a question, or another time (`counter_time`). Optional listing and `brings_tool`. 409 if I already have a live response | 201 | 18, 22 | MVP |
| `PATCH /requests/{request_id}/responses/{response_id}` | Edit my pending response | 200 | 18 | MVP |
| `POST /requests/{request_id}/responses/{response_id}/withdraw` | Withdraw. If it was already accepted, the request goes back to open and the exchange is cancelled | 200 | 17, 18 | MVP |

Questions on a request use responses with `kind=question`, so there is no separate comments endpoint.

Both request creation and Assistant draft confirmation accept `ripple_max_stage` (`family`, `han`, `association`, or `nearby`) and optional `ripple_start_stage` (`family` or `han`). A direct recipient or listing owner receives only a direct request. Without an explicit start, `han` starts in the home circle and wider audiences start with family. The home circle must be active and the sender must have an approved membership.

Family delivery uses accepted family links. The Han stage uses approved members of the home circle, including buildings or para that serve as the home circle. The association stage uses approved members of the enclosing association or moholla and its active, same-region child circles. The nearby stage uses approved members of other active, open circles within 3 km of the nearest approximate coordinates in the home circle's hierarchy. Without those coordinates, there is no nearby delivery. All stages exclude suspended or deleted users, both directions of a block, and anyone already reached by the request.

Empty stages are recorded and skipped immediately under the chosen cap. After a nonempty stage, an open request waits six hours before widening, provided it will still be open at that time. The receipt distinguishes `sent`, `no_recipients`, `scheduled`, `pending`, and `stopped`. A sent count describes committed in-app delivery and does not disclose identities, reads, or device push state.

With `X-Acting-For`, request detail, response lists, and incoming requests require `can_view_activity`. Request edits use the separate `can_post_requests` scope.

## 9. Exchanges (the loan or the help job)

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `GET /users/me/exchanges?status=` | My scheduled, active and finished exchanges, as lender or borrower | 200 | 25 | MVP |
| `GET /exchanges/{exchange_id}` | Detail: time, place note, due date, both confirmations | 200 | 23–27 | MVP |
| `PATCH /exchanges/{exchange_id}` | Set the agreed time, place note or due date | 200 | 23 | MVP |
| `POST /exchanges/{exchange_id}/hand-over` | Move a scheduled exchange to active. Loans require a completed pickup checklist | 200 | 24 | MVP |
| `POST /exchanges/{exchange_id}/return` | Mark the item as returned | 200 | 26 | MVP |
| `POST /exchanges/{exchange_id}/confirm` | My side confirms it's done. When both have confirmed: completed, pair stats updated, listing available again | 200 | 26, 27 | MVP |
| `POST /exchanges/{exchange_id}/cancel` | Cancel. 409 after the handover | 200 | 17 | MVP |
| `POST /exchanges/{exchange_id}/dispute` | Flag a problem and pause completion | 200 | 45 | Later |

### Loan extensions

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `POST /exchanges/{exchange_id}/extensions` | Borrower asks to keep it longer (timezone-aware future due date, later than the current due date, and optional message). 409 if one is already pending | 201 | 25 | MVP |
| `GET /exchanges/{exchange_id}/extensions` | Extension history | 200 | 25 | MVP |
| `POST /loan-extensions/{extension_id}/accept` | The lender accepts, and the due date moves | 200 | 25 | MVP |
| `POST /loan-extensions/{extension_id}/decline` | The lender declines | 200 | 25 | MVP |

### Handover checklist

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `POST /exchanges/{exchange_id}/handover-checks` | Start a pickup or return check with optional `media_ids`. The checklist starts with the listing's parts. 409 if that phase already has a check | 201 | 24, 26 | MVP |
| `GET /exchanges/{exchange_id}/handover-checks` | The exchange's pickup and return checks | 200 | 24, 26 | MVP |
| `GET /handover-checks/{check_id}` | One checklist with its items, `media_ids`, and `revision` | 200 | 24, 26 | MVP |
| `POST /handover-checks/{check_id}/media` | Attach the caller's handover uploads using `media_ids`, up to eight photos total. Either participant can read attached media | 200 | 24 | MVP |
| `POST /handover-checks/{check_id}/suggestions` | Suggest additional visible items and quantities from the pickup photos in `lang`. Add accepted items separately | 200 | 24 | MVP |
| `POST /handover-checks/{check_id}/items` | Add an item by hand | 201 | 24 | MVP |
| `PATCH /handover-checks/{check_id}/items/{item_id}` | Edit the label, quantity, present flag or dispute note. The person who flagged an issue can clear its note with `null` | 200 | 24, 26 | MVP |
| `DELETE /handover-checks/{check_id}/items/{item_id}` | Remove an item from the checklist | 204 | 24 | MVP |
| `POST /handover-checks/{check_id}/confirm` | Send the reviewed `revision` to confirm a scheduled loan pickup. A stale revision returns 409. The checklist must be nonempty, with every item present and every dispute resolved. Two distinct signers lock the checklist | 200 | 24, 26 | MVP |

Edits to a loan pickup checklist reset any existing confirmation. Photos and AI suggestions are optional. Caretakers need `can_view_activity` to view a pickup checklist, its photos, or suggestions. Participants with their own sign-in manage and confirm pickup directly. A caretaker can act for a managed participant with both `can_view_activity` and `can_post_requests`. The same person cannot sign both sides.

## 10. Chat

Contact details stay hidden in chat until both sides have accepted. The server enforces this, not the app.

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `GET /users/me/conversations` | My inbox with the last message and unread count, most recent first | 200 | 23 | MVP |
| `POST /conversations` | Start a listing chat ("ask the owner") or a direct chat with someone I share a circle with. Returns 200 with the existing chat if there is one | 201 | 9, 30 | MVP |
| `GET /conversations/{conversation_id}` | Participants and the linked request, exchange or listing | 200 | 23 | MVP |
| `GET /conversations/{conversation_id}/messages?before=` | Message history with translations in my language | 200 | 23 | MVP |
| `POST /conversations/{conversation_id}/messages` | Send text, image, voice or a card. A resend with the same `client_message_id` returns 200 with the original | 201 | 23 | MVP |
| `PATCH /conversations/{conversation_id}/messages/{message_id}` | Edit my message within a short window | 200 | 23 | Later |
| `DELETE /conversations/{conversation_id}/messages/{message_id}` | Delete my message (soft delete) | 204 | 23 | Later |
| `PATCH /conversations/{conversation_id}/participants/me` | Update my `last_read_at` (mark read), `muted_until` or `archived` | 200 | 23 | MVP |
| `GET /conversations/{conversation_id}/events` | Live new messages over SSE (polling the messages list is enough for the demo) | 200 | 23 | Later |

## 11. Thanks, points and payments

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `POST /thank-yous` | Send a note, sweets, points or money for a completed exchange. 409 if the exchange isn't completed | 201 | 28 | MVP |
| `GET /thank-yous/{thank_you_id}` | One thank-you | 200 | 28 | MVP |
| `PATCH /thank-yous/{thank_you_id}` | The recipient opts in to showing it on the wall | 200 | 32 | Later |
| `POST /thank-yous/{thank_you_id}/decline-money` | The helper turns down the money; the note is kept | 200 | 28 | MVP |
| `GET /users/me/thank-yous?direction=sent\|received` | My thank-yous | 200 | 30, 47 | MVP |
| `GET /circles/{circle_id}/thank-yous` | Opted-in notes for the circle's wall | 200 | 32 | Later |
| `POST /payments` | Start a payment for a thank-you (`Idempotency-Key` required). Returns a Stripe client secret, or a bKash mock checkout | 201 | 29 | MVP |
| `GET /payments/{payment_id}` | Payment status, polled after checkout | 200 | 29 | MVP |
| `POST /payments/{payment_id}/cancel` | Cancel before it is paid. 409 once it has succeeded | 200 | 29 | MVP |
| `POST /payments/{payment_id}/simulate-success` | Demo only: finish a bKash or Nagad mock payment. Returns 404 in production | 200 | 29 | MVP |
| `POST /webhooks/stripe` | Stripe events. Checks the signature instead of a token, and ignores repeats of the same event | 200 | 29 | MVP |
| `GET /users/me/payments` | Payments sent and received | 200 | 47 | Later |
| `GET /users/me/points` | My points balance | 200 | 28 | MVP |
| `GET /users/me/points-entries` | My points history | 200 | 28 | Later |

## 12. Neighbours, family and proxy

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `GET /users/me/neighbours` | Everyone I've exchanged with, most recent activity first, with the pair balance | 200 | 31 | MVP |
| `POST /managed-users` | Create a managed account with no phone, plus its proxy grant (consent method and witness) | 201 | 34 | MVP |
| `PATCH /managed-users/{user_id}` | A caretaker edits a managed person's profile | 200 | 34 | MVP |
| `GET /users/me/family-links` | My family links, both pending and accepted | 200 | 33 | MVP |
| `POST /family-links` | Link to an existing user (relation and an invite code). Pending until they accept | 201 | 34 | MVP |
| `POST /family-links/{link_id}/accept` | The other person accepts | 200 | 34 | MVP |
| `POST /family-links/{link_id}/revoke` | Either person ends the link | 200 | 34 | MVP |
| `GET /users/me/proxy-grants?as=caretaker\|member` | People I can act for, with their scopes (feeds the account switcher), or the people who can act for me | 200 | 33, 35 | MVP |
| `POST /proxy-grants` | Give someone proxy rights over me, or over a managed person I care for | 201 | 35 | MVP |
| `PATCH /proxy-grants/{grant_id}` | Change the scopes (post requests, chat, thank and pay, see activity, manage listings) | 200 | 35 | MVP |
| `POST /proxy-grants/{grant_id}/revoke` | The member or the caretaker ends the grant | 200 | 35 | MVP |

## 13. Notifications

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `GET /users/me/notifications` | My notifications, newest first. Optional `unread_only=true` filters unread items before cursor pagination | 200 | 43 | MVP |
| `PATCH /users/me/notifications/{notification_id}` | Mark one as read | 200 | 43 | MVP |
| `POST /users/me/notifications/read-all` | Mark all as read | 204 | 43 | MVP |

Quiet hours and turning push off go through `PATCH /users/me`.

## 14. Safety

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `POST /users/me/blocks` | Block a user. They aren't told, and they disappear from my feed, search and chat. Returns 200 if already blocked | 201 | 44 | MVP |
| `GET /users/me/blocks` | People I've blocked | 200 | 44, 46 | MVP |
| `DELETE /users/me/blocks/{user_id}` | Unblock | 204 | 44 | MVP |
| `POST /reports` | Report a user, listing, message or request | 201 | 44 | MVP |
| `GET /users/me/reports` | My reports and their status | 200 | 44 | Later |
| `GET /circles/{circle_id}/reports` | Leader's queue of reports | 200 | 40, 45 | Later |
| `POST /reports/{report_id}/resolve` | Leader resolves a report | 200 | 45 | Later |
| `POST /reports/{report_id}/dismiss` | Leader dismisses a report | 200 | 45 | Later |

## 15. AI helpers

Each call is one LLM request with structured JSON output, logged to `ai_runs` and rate-limited per user. These return 200 because they only compute a suggestion; nothing is saved or sent until a person confirms it through a normal endpoint.

| Method and path | What it does | Success | Screens | Build |
|---|---|---|---|---|
| `POST /ai/intro-cards` | Draft an intro card from skills and "happy to help with" | 200 | 3 | MVP |
| `POST /ai/listing-drafts` | Send `description`, `image_media_id` (a ready `purpose=listing` upload you own), or both, plus `language`. Returns suggestions (title, legacy `parts` labels, `part_items` with `label` and nullable `quantity`, safety notes, brand, model, condition, details, `unsure_fields`) with a checked `category_id`, `category_is_risky` and `recognized`. Text in the photo is treated as data and all output is sanitized | 200 | 19 | MVP |
| `POST /ai/transcriptions` | Voice recording → text | 200 | 11 | MVP |
| `POST /ai/translations` | Translate text into the reader's language | 200 | 23 | MVP |
| `POST /ai/thank-you-drafts` | Thank-you note and a suggested *orei* from the culture pack | 200 | 28 | MVP |
| `POST /ai/extension-drafts` | A polite "could I keep it one more day?" or a gentle reminder | 200 | 25 | MVP |
| `POST /ai/tool-guides` | A 3-line usage and safety summary of a tool in my language | 200 | 9 | Later |

Task → tools and the polite request writer run inside the ask-session endpoints. The handover checklist runs inside `POST /exchanges/{exchange_id}/handover-checks`.

## 16. Later features that need new tables

These have no table yet. Add a migration (with row-level security on) when one is built.

| Endpoints | Feature | Screens |
|---|---|---|
| `GET/POST /circles/{circle_id}/notices`, `GET/PATCH/DELETE /notices/{notice_id}` | Digital *kairanban* notices | 38, 40 |
| `GET/POST /circles/{circle_id}/events`, `GET/PATCH /events/{event_id}`, `POST /events/{event_id}/cancel`, `POST /events/{event_id}/signups`, `DELETE /events/{event_id}/signups/me` | Cleaning days and festival volunteer slots | 38, 39 |
| `GET /circles/{circle_id}/requests`, `GET /circles/{circle_id}/unmet-needs`, `GET /circles/{circle_id}/helpers` | Coordinator dashboard for approved leaders and coordinators. Request views require the home-circle audience to have been reached and respect delivery and blocks for the viewer | 41 |
| `POST /circles/{circle_id}/disaster-alerts`, `POST /disaster-alerts/{alert_id}/check-ins`, `GET /disaster-alerts/{alert_id}/check-ins` | Disaster safety check-ins | 42 |
| `GET/PUT /users/me/check-in-settings` | Gentle check-in buddy | 37 |
| `GET /map-pins?bbox=` | Approximate pins for approved circles. Request counts use the same active home-circle, delivery, and viewer access rules as the dashboard | 10 |

## 17. Already there

| Method and path | What it does | Success |
|---|---|---|
| `GET /health` | Liveness check | 200 |
| `GET /ready` | Readiness check (database and Redis) | 200 / 503 |

## Background jobs (not endpoints)

These run on a schedule or a queue, not behind an HTTP call:

- Widen a request's ripple at `next_widen_at`, and expire requests at `expires_at`.
- Send due-date reminders and overdue nudges for loans.
- Send push notifications and respect quiet hours.
- Translate new messages, requests and listings into each reader's language.
- Process uploaded media, and delete unattached uploads after `delete_after`.
- Process stored payment events.

Docker Compose starts `ripple-scheduler` and `push-dispatch` with the backend. Apply database migrations before running the workers. For local QA, run `uv run python -m app.services.requests.scheduler --once --request-id <uuid>` from `backend/` to process a due request. Add `--at <timezone-aware ISO timestamp>` to advance that disposable request against a test clock without editing its database row. The normal worker always uses the current time.

## Demo build order

The demo path in `screens.md` (1 → 2 → 4 → 7 → 11–15 → 18 → 23 → 24 → 27 → 28 → 29 → 30 → 33 → 34) needs these endpoints first:

1. Shared pieces: `ActorDep`, the typed errors and their handler, and the `Page` helpers.
2. Circles: `GET /circle-invites/{code}`, `POST /users/me/memberships`, `GET /users/me/memberships`, plus seeded circles.
3. Media and listings: `POST /media`, `GET /categories`, `POST /ai/listing-drafts`, `POST /listings`, `GET /listings`, `GET /listings/{listing_id}`.
4. Asking: the ask-session endpoints, then `POST /requests`.
5. Helping: `GET /users/me/received-requests`, `GET /requests/{request_id}`, `POST /requests/{request_id}/responses`, then `.../accept`.
6. Exchange: the conversation and message endpoints, the handover-check endpoints, and `POST /exchanges/{exchange_id}/confirm`.
7. Thanks: `POST /ai/thank-you-drafts`, `POST /thank-yous`, `POST /payments`, `POST /webhooks/stripe` and the bKash mock.
8. Relationships and proxy: `GET /users/{user_id}`, `GET /users/{user_id}/pair`, `GET /users/me/proxy-grants`, `POST /managed-users`, `POST /proxy-grants`.
9. Then `GET /users/me/home`, `GET /users/me/unread-counts` and the notification endpoints.
