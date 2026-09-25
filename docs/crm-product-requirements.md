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
The timing and scope of revoking `UserSessionEntity` sessions and `AppTokenEntity` refresh-token records after an administrator reset remain to be decided, including sessions in other workspaces. Normal CRM access must not remain available while password creation is required.

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
- Decide when sessions and refresh tokens are revoked after administrator reset, including sessions in other workspaces.
- Decide whether invitation-token storage and consumption require a separate security review.
- Decide whether the currently ignored `.agents/skills/twenty-crm-customization/SKILL.md` should later be deliberately tracked.

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
