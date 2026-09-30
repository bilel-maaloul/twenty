# CRM Product Requirements

This repository is a customized fork of Twenty CRM.

## Calendar / Meetings

The calendar should eventually support:

- Day, week, month, and agenda views
- Create, edit, view, and delete meetings
- Meeting title, description, location, start date/time, and end date/time
- Meeting owner and participants
- Links to people, companies, prospects, and opportunities
- Meeting notes and activity history
- Search, filters, and sorting
- Recurring meetings
- Reminders and notifications
- Time zones
- Permissions
- Responsive web interface
- Future Google Calendar or Outlook synchronization

## Prospects

The prospect module should eventually support:

- Prospect list and detail pages
- Create, edit, view, and delete prospects
- Name, company, email, phone, job title, address, and website
- Owner, source, sector, status, tags, and notes
- List view and Kanban/card view
- Search, filters, sorting, and pagination
- Import and export
- Bulk actions
- Activity history
- Calls, emails, meetings, notes, tasks, and opportunities
- Conversion into person, company, and opportunity
- Duplicate detection
- Custom fields
- Permissions
- Responsive interface

## Development principle

Implement the requirements in small phases.

Do not implement the complete backlog in one task.

First inspect the existing Twenty architecture and reuse existing entities, components, services, GraphQL operations, permissions, and database patterns.

## Purpose

This document also defines the product behavior required for the CRM authentication, user administration, roles, permissions, and password-management features.

The implementation must reuse the existing repository architecture and must not break Calendar, MCP, API, navigation, or dashboard functionality.

## User administration

Only users with the applicable workspace administration authority may access these administration features. The exact workspace role and permission combination for each action remains to be decided; server-administrator access is separate.

Administrators may:

- Create users.
- Assign roles.
- Assign teams or services where supported.
- Assign permission levels where supported.
- Disable users.
- Resend temporary-password emails.
- Reset another user's password.
- Manage permissions where supported.

Normal users:

- Must not see Administration in the sidebar.
- Must not access administration pages directly.
- Must receive a backend authorization error when calling administration APIs.
- Must not create or manage users.
- May access only CRM features allowed by their role and permissions.

Hiding the Administration link is not a security control. Backend authorization is required for every protected administration route.

## Administrator-created users

When an administrator creates a user, the form should support:

- First name
- Last name
- Email
- Role
- Service or team, if supported
- Permission level, if supported

When the user is saved, the system must:

1. Create or associate a global `UserEntity`, create its `UserWorkspaceEntity` membership, and assign the approved workspace role through `RoleTargetEntity`.
2. Generate a cryptographically secure temporary password.
3. Hash the temporary password before storing it.
4. Record that password creation is required, using an existing equivalent or a proposed `mustChangePassword` field.
5. Apply the new-member lifecycle state once active-versus-invited behavior is decided.
6. Record a temporary-password expiration time, using an existing equivalent or a proposed `temporaryPasswordExpiresAt` field. The lifetime remains to be decided.
7. Send an email containing the temporary password.
8. Clearly state that the password is temporary and must be changed immediately.
9. Avoid logging or exposing the password anywhere else.

Temporary passwords may be emailed only for this approved administrator-created-user flow and the administrator password-reset flow.

Permanent passwords must never be sent by email.

Administrators must never be able to view a user's current password or password hash.

## Temporary-password requirements

Temporary passwords must:

- Be generated using a cryptographically secure random generator.
- Have sufficient entropy.
- Be hashed before storage.
- Have an expiration time.
- Be invalid after expiration.
- Be invalidated after a successful password change.
- Be replaced by a newly generated credential when an authorized administrator resends the email or resets the password; the previous credential must be invalidated.
- Never be logged.
- Never be returned in normal API responses.
- Never be included in URLs.
- Never be persisted in shared frontend state or exposed in errors, analytics, or telemetry; transient form input is permitted for submission.
- Never be shown again to administrators after generation.
- Be protected by login rate limits and abuse controls.

If email delivery fails, the system must not expose the password through an unsafe response. The failure must be handled using the repository's existing email retry or error-handling pattern.

## User login and first password change

When a user logs in:

1. The server verifies the email and password.
2. The server checks that the `UserEntity` is enabled, its `UserWorkspaceEntity` membership is valid, and the workspace permits access.
3. The server checks whether the temporary password has expired.
4. The server checks the required-password-change state, represented by a proposed `mustChangePassword` field or an existing equivalent.
5. If password creation is required, the user must not access normal CRM features.
6. The user is redirected to the Create Your Password screen.
7. The user enters a new password.
8. The user confirms the new password.
9. The system validates the password.
10. The new password must not equal the temporary password.
11. The system hashes the new password.
12. The system replaces the temporary-password hash.
13. The system clears the required-password-change state.
14. The system clears the temporary-password expiration state and invalidates the temporary credential.
15. Only then may the user receive or continue a normal CRM session through the existing `UserSessionEntity` flow and access the dashboard, other CRM routes, and APIs.

Before password creation succeeds, any authorization must be narrowly scoped to that flow. The backend must enforce this process; a user must not be able to bypass it by opening a CRM URL or calling an API directly.

## Password-creation screen

The screen must contain:

- New password
- Confirm new password
- Create my password action

Validation must include:

- Passwords must match.
- The repository's existing password policy on both client and server.
- The new password must not be the temporary password.

Frontend and backend validation must be consistent.

## User data

Reuse `UserEntity` for global identity and password hash, `UserWorkspaceEntity` for workspace membership, and `RoleTargetEntity` for the membership's workspace role. Use the existing workspace permission model; do not add a direct user `role_id`. Reuse `AppTokenEntity` for applicable reset, invitation, and refresh token records and `UserSessionEntity` for sessions. API keys have a separate existing model.

Assess whether required-password-change state, temporary-password expiry, last-login tracking, and an invited or active lifecycle state need new fields or can use existing equivalents. `mustChangePassword`, `temporaryPasswordExpiresAt`, `lastLoginAt`, `ACTIVE`, and `INVITED` are proposed concepts here, not claims about existing fields or states.

Before adding fields, inspect these entities and the existing workspace, token, session, role, and permission services.

Use migrations for schema changes. Add appropriate indexes and unique constraints.

## Administrator password reset

When an administrator resets another user's password, the system must:

1. Generate a new cryptographically secure temporary password.
2. Hash it before storing it.
3. Record that password creation is required, using an existing equivalent or a proposed `mustChangePassword` field.
4. Record a new temporary-password expiration time, using an existing equivalent or a proposed `temporaryPasswordExpiresAt` field.
5. Send the temporary password by email.
6. Force the user to create a new password after login.
7. Prevent the administrator from viewing the user's existing password.

This action must be logged as an administrative security event without logging the password.
Credential rotation increments the global `UserEntity.credentialEpoch`, invalidates user credentials, and revokes the user's refresh tokens and `UserSessionEntity` sessions across workspaces. Normal CRM access must not remain available while password creation is required.

## Forgot-password behavior

Users must have a Forgot password? option.

The self-service flow must remain separate from administrator-issued temporary credentials. The repository currently uses reset links with hashed, expiring `AppTokenEntity` records, token rotation, generic request responses, and revocation of `UserSessionEntity` sessions after a password change. The following are product requirements; concurrency-safe single use and attempt limits require verification or later work:

- Return generic responses that do not reveal whether an email exists.
- Generate tokens or codes securely.
- Store only token or code hashes.
- Use expiration times.
- Make tokens single-use.
- Invalidate older active tokens when a newer token is created.
- Invalidate tokens immediately after successful use.
- Apply rate limits and attempt limits.
- Revoke existing sessions where appropriate.
- Never log reset tokens, reset links, or reset codes.

## Roles and permissions

Backend and API authorization must verify:

1. The user is authenticated.
2. The `UserEntity` is enabled and the workspace state permits access.
3. The user has a valid `UserWorkspaceEntity` membership in the target workspace.
4. The membership's role target and workspace permissions authorize the operation.
5. The requested records are within the user's allowed scope.

Frontend checks are only for user experience and must not be treated as security controls.

## Security requirements

The system must:

- Use the existing secure password-hashing mechanism.
- Use secure random generation for passwords, tokens, and codes.
- Never store plaintext passwords.
- Never store plaintext reset tokens or verification codes.
- Never send permanent passwords by email.
- Never log passwords, tokens, codes, reset links, cookies, or secrets.
- Protect authentication endpoints from brute force and abuse.
- Keep secrets in environment variables.
- Never commit production credentials.
- Preserve Calendar, MCP, and API functionality.

Inspect existing invitation-token storage and consumption separately before describing them as meeting the reset-token guarantees. Decide whether a dedicated security review is required.

## Open decisions

- Choose the workspace role and permission combination for each administrator action; server-administrator access is separate.
- Set the temporary-password lifetime.
- Decide whether a new member is active, invited, or represented by another lifecycle state.
- Decide whether invitation-token storage and consumption require a separate security review.
- Decide whether the currently ignored `.agents/skills/twenty-crm-customization/SKILL.md` should later be deliberately tracked.

## Resolved security policy decisions

- Interactive email/password authentication locks the normalized email for 15 minutes after three consecutive genuine wrong-password attempts. CAPTCHA failures, unknown accounts, accounts without a password, and infrastructure failures do not increment the counter. A successful password check resets it unless another request has already activated the lock.
- Returning-user password sign-in uses password and CAPTCHA, followed by existing workspace TOTP where enabled; it does not issue or require an interactive email OTP. The email OTP infrastructure remains available for the existing email-verification and non-password authentication flows that require it. API keys, MCP, application/service tokens, refresh-token operations, and background authentication do not use interactive email OTP.
- Permanent-password expiration is 90 days. Existing permanent passwords receive a 90-day grace period from migration time. Password changes set a new expiration time; expired passwords must use the existing reset flow and then complete fresh CAPTCHA password authentication, with any existing provider-specific challenge rules still applying. Temporary-password expiry is separate.
- Inactivity is scoped to `UserWorkspaceEntity`. Ninety days without human interactive activity suspends only that workspace membership. API keys, MCP, app tokens, and background work do not refresh the human activity timestamp. Existing memberships start their inactivity clock at migration time because earlier human activity was not tracked. A user with `WORKSPACE_MEMBERS` permission can reactivate a membership; reactivation does not restore revoked sessions.
- Member Calendar reads follow the existing event-owner, connected-account owner, and calendar-channel visibility rules. A member sees their own events and events from a calendar they own; `SHARE_EVERYTHING` channels make events visible workspace-wide, while `METADATA` channels redact title and description. Write access comes from event ownership or ownership of the connected calendar, not merely from channel read visibility. Generic event creation remains restricted to the existing connected-calendar flow and its `CREATE_CALENDAR_EVENT_TOOL` permission. Nested event relations and junction records use the same user visibility boundary. Workspace boundaries remain enforced; administrator access still follows workspace permissions without a server-admin bypass.
- Password changes use the existing global `UserEntity.credentialEpoch`; password rotation invalidates user credentials, refresh tokens, and `UserSessionEntity` sessions across the user's workspaces. API keys and application/service credentials remain separate.

## Testing requirements

Tests must cover:

- Administrator user creation.
- Temporary-password generation.
- Temporary-password hashing.
- Temporary-password email delivery.
- Temporary-password expiration.
- Successful first login.
- Required first-login password change.
- Blocking CRM access before the password change.
- Password mismatch.
- Weak passwords.
- Temporary-password reuse.
- Successful password change.
- Administrator password reset.
- Forgot-password flow.
- Expired and reused reset tokens.
- Rate limiting.
- Disabled users.
- Unauthorized administration-page access.
- Unauthorized administration-API access.
- Role and permission enforcement.
- Session revocation.
- Calendar regression behavior.
- MCP regression behavior.
- API regression behavior.

## Documentation and deployment

### Production HTTPS

Production browser and API traffic must use HTTPS. The recommended deployment
terminates TLS at a trusted reverse proxy, ingress, or load balancer, redirects
HTTP requests to HTTPS, and prevents direct public access to the unencrypted
application port. Set `SERVER_URL` to the public `https://` URL. Keep
`TRUST_PROXY` restricted to the actual trusted proxy network; its default trusts
loopback and private/link-local addresses and is suitable only when the app is
behind a proxy on that network.

For direct NestJS HTTPS, configure both `SSL_KEY_PATH` and `SSL_CERT_PATH` to
certificate files managed outside the repository. The server enables its HTTPS
listener only when both are present. Local HTTP development remains supported.

When the public `SERVER_URL` uses HTTPS, Twenty issues its session cookie with
`Secure`, `HttpOnly`, `Path=/`, and the configured `AUTH_COOKIE_SAME_SITE`
policy, using its secure cookie name. Cookie security does not replace TLS at
the public edge.

### Interactive password lockout

The shared interactive email/password validation used by `signIn` and
`getLoginTokenFromCredentials` tracks genuine incorrect-password attempts in
Redis. Three consecutive failures lock password login for that normalized
email for 15 minutes. A successful password check clears the counter unless a
concurrent request has already activated the lock. The failure counter expires
after 15 minutes without another failed attempt. CAPTCHA rejection, missing or
expired CAPTCHA, unknown email, accounts without a password, and infrastructure
errors do not increment it. Lockout and credential failures use the same
generic client response; Redis failures fail closed. Lockout state is
automatically cleared on expiry, and no administrator unlock is required.

Authentication changes must document:

- Required environment variables.
- Email configuration.
- Local email testing.
- CAPTCHA configuration and development behavior.
- Temporary-password expiration.
- Password-reset behavior.
- Database migrations.
- Test commands.
- Important assumptions and security decisions.

### Interactive email verification code

Returning-user password sign-in does not issue or require an interactive email
OTP after password and CAPTCHA validation. Existing workspace TOTP remains in
force when configured. The AppTokenEntity-backed email OTP infrastructure
remains available for existing email-verification and non-password
authentication flows that require it. Those challenges remain cryptographically
generated, hash-only, short-lived, single-use, and rate-limited, with sensitive
email delivered immediately through SMTP rather than the normal queue or LOGGER
driver. API keys, MCP, application/service tokens, background jobs, and
refresh-token operations do not use the interactive email challenge.

The OTP email requires `EMAIL_DRIVER=SMTP`, an SMTP host and port, and TLS
(`EMAIL_SMTP_NO_TLS=false`). Configure `EMAIL_SMTP_USER` and
`EMAIL_SMTP_PASSWORD` when the SMTP service requires authentication, plus the
existing `EMAIL_FROM_ADDRESS` and `EMAIL_FROM_NAME`. Sensitive OTP delivery
does not fall back to LOGGER or the queued email driver.

### Permanent password expiration

Permanent password credentials expire 90 days after the password is created or
changed. The reversible 2.41 instance command adds
`UserEntity.permanentPasswordExpiresAt` and gives existing users with a
permanent password a 90-day grace period from migration time. Users without a
password and users still on a temporary password are excluded from that
backfill. Temporary-password lifetime remains separate.

Password sign-in checks the password expiry after password verification and
email-verification requirements. An expired password receives no login token,
OTP challenge, CRM session, or workspace list; the sign-in UI directs the user
to Twenty's existing email password-reset flow. The password-reset operation
updates the hash and 90-day expiry together, advances the credential epoch,
revokes refresh tokens and user sessions, requires CAPTCHA and password
confirmation during reset, and routes the user to fresh normal sign-in with
CAPTCHA. Password authentication does not require mandatory email OTP.
User-authenticated access and refresh credentials are also
rejected after the authoritative password expiry. API keys, MCP, application
tokens, and background credentials do not use the human password expiry rule.

### Permanent-password policy and requirements UI

Password creation and changes use the shared server/client rule: 8 to 50
characters, at least one uppercase letter, and at least one number. The live
requirements display is used during signup, first-password creation, and the
existing password-reset flow. Ordinary password login does not enforce
creation-time policy on a password that already exists.

### Workspace-membership inactivity

`UserWorkspaceEntity.lastHumanInteractiveActivityAt` is updated when a human
sign-in establishes a workspace session and when that browser session is
actively used. Workspace-agnostic sessions do not count until a workspace is
selected. Impersonation, API keys, MCP, application/service tokens, and
background jobs do not extend membership activity. The daily
`UserWorkspaceInactivityCronJob`, registered by `cron:register:all`, suspends
non-deleted memberships whose timestamp is older than 90 days and revokes
sessions tied to those memberships. It does not set `UserEntity.disabled` or
affect other workspace memberships. Reactivation requires
`PermissionFlagType.WORKSPACE_MEMBERS`, refreshes the inactivity timestamp,
and leaves prior sessions revoked so the member must sign in again.

The reversible 2.41 instance command adds
`UserWorkspaceEntity.lastHumanInteractiveActivityAt` and
`UserWorkspaceEntity.suspendedAt`. The activity column defaults to migration
time so existing members receive a 90-day baseline rather than being
suspended immediately based on activity Twenty did not previously record.
