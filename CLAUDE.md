# Hackathon monorepo

This monorepo contains a mobile app and a backend for the hackathon.

## Tooling

- Use `pnpm` for the mobile app.
- Use `uv` for the backend.
- Do not use `npm`, `yarn`, `pip`, or `poetry`.
- Run mobile commands in `mobile/`.
- Run backend commands in `backend/`.
- The repository root has no package manager.
- Run `uvx pre-commit run --all-files` from the repository root to check the pre-commit hooks.
- Make all pre-commit hooks pass before you commit.
- The pre-commit hooks run Ruff on the backend and Prettier on the mobile app.

## Mobile

- Use Expo and React Native with TypeScript.
- Read [the Expo project rules](mobile/AGENTS.md) before changing the mobile app.
- Use Expo Router for navigation.
- Put routes in `mobile/src/app/`.
- Run `pnpm exec expo install <package>` to add an Expo-compatible dependency.
- Run `pnpm start` to start Expo.
- Run `pnpm lint` to check the code.
- Run `pnpm exec tsc --noEmit` to check TypeScript.

## Code comments

- Write a comment only when the user asks for it or the code needs it to work.
- Examples of required comments include a `# syntax=` directive, a pragma, and a lint suppression.
- Do not write comments that explain the code.
- Do not write decorative comments, section-header comments, or multi-line comment blocks.

## Security

- Assess security before you write code.
- Assess security again when you review code.
- Use the OWASP Top 10 as a checklist.
- Refer to the PortSwigger Web Security Academy for examples of each bug class.

### Backend

Prevent these backend bugs.

- SQL injection and NoSQL injection
- Command injection
- Path traversal
- Server-side request forgery (SSRF)
- XML external entity (XXE) injection
- Insecure deserialization
- Server-side template injection
- Broken authentication
- Broken access control
- Business logic flaws
- Information disclosure
- Race conditions

### Frontend

Prevent these frontend bugs.

- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Cross-origin resource sharing (CORS) misuse
- Clickjacking
- Prototype pollution
- Insecure WebSocket use

### Deployment configuration

- Keep secrets out of code, images, and logs.
- Do not run a container as the root user.
- Set a safe default for each configuration value.
- Keep debug mode off in production.

## Secrets and environment files

- Do not read a `.env` or `.env.local` file unless inspection is necessary.
- Inspect only a view with the sensitive values redacted.
- Never print a secret value in a command, a log, or a message.

## Error handling

- Handle every error.
- Do not hide an error or pass it silently.
- Raise or return a clear, typed error.
- Retry an operation only when the failure is transient.
- Examples of transient failures include a network timeout, a dropped connection, and a rate limit.
- Set a small retry limit.
- Use a backoff between attempts.
- Do not retry a validation error or an authorization error.
