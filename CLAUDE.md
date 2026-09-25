# CLAUDE.md

Twenty is an open-source CRM — an Nx / Yarn 4 monorepo. Main packages: `twenty-front` (React 18, Jotai, Linaria, Vite), `twenty-server` (NestJS, TypeORM, PostgreSQL, Redis, GraphQL), `twenty-shared` (isomorphic types/utils), `twenty-ui`, `twenty-sdk` (application SDK + CLI), `twenty-e2e-testing` (Playwright).

Match the surrounding code — the adjacent files in the directory you are editing beat any written rule, including for file naming, which varies by area.

## House rules

Where this repo differs from your defaults:

- Short-form `//` comments, never JSDoc blocks; comment only WHY (a constraint the code cannot express, still true for a reader who never saw your change), never WHAT.
- Types over interfaces (except when extending third-party interfaces); string literals over enums (except GraphQL enums); no `any`; descriptive generics (`TData`, not `T`).
- Named exports only. Functional components only.
- Prefer event handlers over `useEffect` for state updates.
- No abbreviations in names (`fieldMetadata`, not `fm`); constants in SCREAMING_SNAKE_CASE; component props types suffixed `Props`.
- Use existing guards and helpers before writing your own: `isDefined`, `isNonEmptyArray`, `isPlainObject`, … from `twenty-shared/utils`; `isNonEmptyString`, `isString`, `isNull`, `isObject`, … from `@sniptt/guards`. Reimplementing an existing util is the most common AI-authored defect here.
- Lingui for user-facing strings; Linaria (zero-runtime, styled-components pattern) for twenty-front styling.
- For Twenty product concepts, consult `packages/twenty-ui/src/icon/icon-dictionary.md` and use the canonical icon.
- Import icons from `twenty-ui/icon`, never directly from `@tabler/icons-react`; action and status concepts should use their action or status icons.
- Test behavior, not implementation: query by user-visible text/roles, `@testing-library/user-event` for interactions.

## Commands

```bash
bash packages/twenty-utils/setup-dev-env.sh   # Postgres/Redis + DB init; only for tasks needing a running app
yarn start                                    # front + server + worker

npx jest path/to/file.spec.ts --config=packages/<pkg>/jest.config.mjs   # single test file (preferred)
npx vitest run --root packages/twenty-ui --project unit <file>          # twenty-ui runs on vitest, not jest
npx nx test twenty-server                     # package unit tests (same for twenty-front, ...)
npx nx run twenty-server:test:integration:with-db-reset
npx nx storybook:build twenty-front && npx nx storybook:test twenty-front

npx nx lint:diff-with-main twenty-server      # diff-based lint (fast; add --configuration=fix); run with typecheck after changes
npx nx fmt <pkg>                              # format
npx nx build twenty-shared                    # required before building/testing packages that depend on it
npx nx database:reset twenty-server
npx nx run twenty-front:graphql:generate      # after GraphQL schema changes (--configuration=metadata for metadata schema)
```

## Gotchas

- **`twenty-shared/dist` is per-branch state nothing tracks.** After switching branches or editing `twenty-shared`, run `npx nx build twenty-shared --skip-nx-cache` before trusting any typecheck or test failure in a dependent package.
- **Nx caching can serve a stale pass.** To verify a fix, run `npx tsgo -p tsconfig.json --noEmit` in the package directly rather than `nx typecheck`.
- **Do not commit translation catalogs unless translations are the task.** `lingui extract`/`compile` regenerate `packages/twenty-server/src/engine/core-modules/i18n/locales/*.po` and `locales/generated/*` with thousands of lines of churn as a side effect of touching any `msg` string. The i18n pipeline maintains them; leave them out of your commit.
- **Commit messages must not carry AI attribution.** CI rejects commits containing `@anthropic.com` co-author trailers or "Generated with Claude Code" lines.
- **Upgrade commands** (`packages/twenty-server/src/database/commands/upgrade-version-command/`): add or edit files only under the current `TWENTY_CURRENT_VERSION` directory, with a real epoch-ms timestamp strictly greater than every existing one in that directory — CI enforces both, and the upgrade cursor silently skips a command that sorts before an already-applied one. Include `up` and `down`; never rewrite committed command logic. See `packages/twenty-server/docs/UPGRADE_COMMANDS.md`.
- **Entity file changes need a generated instance command**: `npx nx run twenty-server:database:migrate:generate --name <name> --type <fast|slow>` (slow = adds a data-backfill step).
- A read-only Postgres MCP server is configured in `.mcp.json` for inspecting workspace data, metadata, and migration results. Writes go through the CLI commands above.
- E2E login: click "Continue with Email" and use the prefilled credentials.

# CRM Repository Instructions

## Project context

This repository contains a CRM application with existing:

- Calendar functionality
- MCP functionality
- API functionality
- CRM navigation and dashboards
- `UserEntity` global identities, `UserWorkspaceEntity` workspace memberships, roles assigned through `RoleTargetEntity`, and workspace permissions
- `AppTokenEntity` records for applicable authentication and application tokens, and `UserSessionEntity` records for sessions

Calendar, MCP, and API functionality must continue working after any change.

## Required reading

Before modifying code, read:

1. `AGENTS.md`
2. `docs/crm-product-requirements.md`
3. `.agents/skills/twenty-crm-customization/SKILL.md`
4. Relevant source code, tests, migrations, schemas, and configuration files

Do not assume that the requirements match the current implementation. Inspect the repository first.

## General working rules

- Inspect before editing.
- Reuse the existing architecture.
- Do not create duplicate authentication, user, role, permission, session, invitation, or email systems.
- Prefer small, reviewable changes.
- Do not rewrite unrelated modules.
- Do not remove or disable Calendar, MCP, or API functionality.
- Preserve existing routes and public APIs unless a compatibility change is necessary.
- Do not silently skip errors or failing tests.
- Do not claim that work is complete without running appropriate checks.
- Do not modify generated files unless required by the project.
- Do not commit secrets or production credentials.

## Authentication security rules

- Never store permanent passwords in plaintext.
- Never store temporary passwords in plaintext.
- Use the existing approved password-hashing mechanism.
- Generate temporary passwords using a cryptographically secure random generator.
- Temporary passwords must have an expiration time.
- Temporary passwords must be invalidated after expiration.
- Temporary passwords must be replaced after the user creates a new password.
- Resending a temporary-password email must generate a new credential and invalidate the previous one.
- Never send permanent passwords by email.
- Temporary passwords may be sent by email only for:
  - Administrator-created users.
  - Administrator-initiated password resets.
- Temporary-password emails must clearly state that the password is temporary and must be changed immediately.
- Do not log temporary passwords, permanent passwords, password-reset tokens, verification codes, invitation links, cookies, or secrets.
- Do not return temporary passwords or tokens in normal API responses.
- Administrators must never be able to view an existing user password.
- Keep password values only in transient form input needed for submission; do not persist them in shared frontend state or expose them in URLs, error messages, analytics, or telemetry.
- Protect login, invitation, verification, password-reset, and email-code endpoints against brute force and abuse.
- Store only hashes of reset tokens and verification codes. Require expiration, rate and attempt limits, single use, and invalidation of an older credential when a replacement is issued.
- Inspect existing invitation-token storage and consumption separately before claiming that invitation tokens meet those requirements; decide whether a dedicated security review is required.
- Use generic password-reset responses to prevent account enumeration.
- Keep secrets in environment variables.
- Never commit real secrets or production credentials.

## First-login password change

The following is required behavior to implement; `mustChangePassword` and `temporaryPasswordExpiresAt` are proposed concepts, not existing `UserEntity` fields. When a user logs in with a valid temporary password:

1. Verify the credentials.
2. Check that the temporary password has not expired.
3. Check whether `mustChangePassword` is true.
4. Prevent access to normal CRM features.
5. Require the user to create and confirm a new password.
6. Validate the new password using the existing password policy.
7. Reject reuse of the temporary password.
8. Hash the new password.
9. Replace the temporary-password hash.
10. Set `mustChangePassword` to false.
11. Clear `temporaryPasswordExpiresAt`.
12. Invalidate the temporary credential and create or continue a normal CRM session through the existing `UserSessionEntity` flow only after successful completion.

Before completion, any authorization must be narrowly scoped to password creation. The backend must deny normal CRM routes and APIs; frontend route guards alone are not a security boundary.

## Authorization rules

Every protected backend or API operation must verify:

1. The user is authenticated.
2. The `UserEntity` is enabled and the workspace is in a state that permits access.
3. The user has a valid `UserWorkspaceEntity` membership in the target workspace.
4. The membership's role target and workspace permissions authorize the operation.
5. The record is within the user's allowed scope.

Map administrator authority for each action to the applicable workspace role and permission combination before implementation. This is separate from server-administrator access such as `canAccessFullAdminPanel`. Only users with the approved authority may:

- View Administration navigation.
- Create users.
- Assign roles.
- Assign teams or services.
- Manage permissions.
- Disable users.
- Resend temporary-password emails.
- Reset another user's password.

Frontend checks improve user experience but are not a security boundary. Backend routes must independently enforce authorization and return the appropriate authorization error for unauthorized requests.

Never trust client-provided roles or permissions.

## Database rules

- Inspect existing models before adding new ones.
- Reuse `UserEntity` for global identity, `UserWorkspaceEntity` for workspace membership, `RoleTargetEntity` for workspace role assignment, `AppTokenEntity` for applicable authentication and application tokens, `UserSessionEntity` for sessions, and their existing services where possible. API keys use their separate existing model.
- Add migrations for schema changes.
- Add indexes and unique constraints where appropriate.
- Do not modify production data manually.
- Do not edit generated database files unless required by the project.
- Reuse existing equivalent fields before adding new fields.
- Assess whether the requirements need new fields or existing equivalents for `mustChangePassword`, `temporaryPasswordExpiresAt`, last-login tracking, and an invited or active lifecycle state. Do not treat these as existing fields or settled schema choices.

## Frontend rules

- Follow the existing design system and visual language.
- Reuse existing form, modal, notification, routing, and API patterns.
- Add loading, error, expired-password, invalid-password, and rate-limit states.
- Keep authentication pages accessible and responsive.
- Do not reveal whether an email exists during password reset.
- Do not rely only on hidden navigation to protect administration pages.
- Keep protected routes protected after frontend changes.
- Prevent access to CRM features while a first-login password change is required.

## Testing rules

For changed code:

- Add or update unit tests.
- Add integration or API tests for authentication behavior.
- Test successful and failed paths.
- Test temporary-password expiration.
- Test first-login password creation.
- Test temporary-password reuse rejection.
- Test administrator password reset.
- Test expired and reused reset tokens.
- Test authorization failures.
- Test session revocation.
- Test disabled users.
- Test Calendar regression behavior.
- Test MCP/API regression behavior.

Before completion, discover and run the repository's:

- Formatter
- Linter
- Type checker
- Unit tests
- Integration tests
- Database migration checks
- Production build

If a command cannot be run, report the reason clearly.

## Change process

For a complex feature:

1. Inspect the repository.
2. Produce an implementation plan.
3. Identify assumptions, risks, and affected files.
4. Wait for plan approval when using Plan mode.
5. Implement in small phases.
6. Run tests after each meaningful phase.
7. Review the final diff for security and unrelated changes.
8. Report changed files, commands, test results, and remaining issues.

## Authentication scope

The authentication task may include:

- Administrator user creation
- Temporary-password generation
- Temporary-password email delivery
- Role assignment
- CAPTCHA integration
- Email verification
- First-login password creation
- Normal login
- Logout
- Forgot password
- Administrator password reset
- Session management
- Server-side authorization
- Protected routes
- Tests and documentation

Do not implement unrelated future CRM features.

## Documentation requirements

When changing authentication:

- Document required environment variables.
- Document local email testing.
- Document local CAPTCHA testing or development bypass behavior.
- Document temporary-password expiration.
- Document administrator reset behavior.
- Document migrations.
- Document test commands.
- Record important assumptions and decisions.
