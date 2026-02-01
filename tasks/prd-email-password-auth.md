# PRD: Email/Password Authentication

## Introduction

Add email/password-based authentication alongside the existing API key authentication. Users can register (self-signup or invite) to existing tenants, log in with credentials, and receive session-based access. The system auto-detects authentication type (API key vs session token) in a unified middleware, ensuring seamless coexistence of both methods.

## Goals

- Enable email/password login for tenant users
- Support both self-registration and admin-invite flows for existing tenants
- Require email verification before granting resource access
- Implement session-based auth with 7-day sliding window expiry
- Provide email-based password reset
- Unified middleware that auto-detects API key or session token
- Maintain tenant isolation throughout all flows

## User Stories

### US-001: Add sessions table to tenant database
**Description:** As a developer, I need to store user sessions in the tenant DB so login state persists.

**Acceptance Criteria:**
- [ ] Add `sessions` table with columns: `id`, `userId`, `token` (unique), `expiresAt`, `createdAt`, `updatedAt`
- [ ] Add index on `token` for fast lookups
- [ ] Session token is a secure random string (min 32 bytes, base64 encoded)
- [ ] Typecheck passes

### US-002: Add password field to users table
**Description:** As a developer, I need to store hashed passwords for email/password authentication.

**Acceptance Criteria:**
- [ ] Add `passwordHash` column to users table (nullable for API-key-only users)
- [ ] Add `emailVerified` boolean column (default false)
- [ ] Add `emailVerificationToken` column (nullable)
- [ ] Add `emailVerificationExpiry` column (nullable)
- [ ] Use Argon2id for password hashing
- [ ] Typecheck passes

### US-003: Implement user self-registration endpoint
**Description:** As a new user, I want to register with email/password for an existing tenant so I can access the system.

**Acceptance Criteria:**
- [ ] POST `/auth/register/:tenantSlug` endpoint
- [ ] Request body: `{ email, password, name }`
- [ ] Validates tenant slug exists and tenant is active
- [ ] Validates email format and password strength (min 8 chars)
- [ ] Returns 409 if email already registered in tenant
- [ ] Creates user with `emailVerified: false`
- [ ] Sends verification email with token link
- [ ] Returns 201 with message "Verification email sent"
- [ ] Typecheck passes

### US-004: Implement email verification endpoint
**Description:** As a user, I want to verify my email so I can access protected resources.

**Acceptance Criteria:**
- [ ] GET `/auth/verify-email/:token` endpoint
- [ ] Validates token exists and not expired (24h expiry)
- [ ] Sets `emailVerified: true` on user
- [ ] Clears verification token fields
- [ ] Returns 200 with success message
- [ ] Returns 400 for invalid/expired token
- [ ] Typecheck passes

### US-005: Implement login endpoint
**Description:** As a registered user, I want to log in with email/password so I can access the system.

**Acceptance Criteria:**
- [ ] POST `/auth/login/:tenantSlug` endpoint
- [ ] Request body: `{ email, password }`
- [ ] Validates tenant slug exists and is active
- [ ] Returns 401 if email not found or password incorrect (same message for security)
- [ ] Returns 403 if email not verified (with message to check email)
- [ ] Creates session in DB with 7-day expiry
- [ ] Returns session token and user info
- [ ] Typecheck passes

### US-006: Implement logout endpoint
**Description:** As a logged-in user, I want to log out so my session is invalidated.

**Acceptance Criteria:**
- [ ] POST `/auth/logout` endpoint
- [ ] Requires valid session token in Authorization header
- [ ] Deletes session from DB
- [ ] Returns 204 on success
- [ ] Typecheck passes

### US-007: Implement session-based authentication in middleware
**Description:** As a developer, I need the authenticate middleware to accept session tokens alongside API keys.

**Acceptance Criteria:**
- [ ] Middleware detects token type by prefix: `desi_sk_*` = API key, `desi_session_*` = session
- [ ] For session tokens: lookup in sessions table, validate not expired
- [ ] Extend session expiry by 7 days on each valid request (sliding window)
- [ ] Attach same `AuthContext` shape for both auth types
- [ ] For sessions: `apiKey` field in context is null or contains session info
- [ ] Returns 401 for expired/invalid sessions
- [ ] Typecheck passes

### US-008: Implement password reset request endpoint
**Description:** As a user who forgot my password, I want to request a reset link so I can regain access.

**Acceptance Criteria:**
- [ ] POST `/auth/forgot-password/:tenantSlug` endpoint
- [ ] Request body: `{ email }`
- [ ] Always returns 200 (don't reveal if email exists)
- [ ] If email exists: generates reset token, stores hash in DB, sends email
- [ ] Reset token expires in 1 hour
- [ ] Typecheck passes

### US-009: Implement password reset endpoint
**Description:** As a user, I want to reset my password using the link I received.

**Acceptance Criteria:**
- [ ] POST `/auth/reset-password` endpoint
- [ ] Request body: `{ token, newPassword }`
- [ ] Validates token exists and not expired
- [ ] Updates password hash
- [ ] Invalidates all existing sessions for user
- [ ] Clears reset token
- [ ] Returns 200 with success message
- [ ] Typecheck passes

### US-010: Implement admin invite user endpoint
**Description:** As a tenant admin, I want to invite users by email so they can join my tenant.

**Acceptance Criteria:**
- [ ] POST `/auth/invite` endpoint (requires admin role)
- [ ] Request body: `{ email, name, role }`
- [ ] Creates user with `emailVerified: false` and no password
- [ ] Generates invite token (different from verification token)
- [ ] Sends invite email with link to set password
- [ ] Returns 201 with invite info
- [ ] Returns 409 if email already exists in tenant
- [ ] Typecheck passes

### US-011: Implement accept invite endpoint
**Description:** As an invited user, I want to set my password and activate my account.

**Acceptance Criteria:**
- [ ] POST `/auth/accept-invite/:token` endpoint
- [ ] Request body: `{ password }`
- [ ] Validates invite token exists and not expired (7 days)
- [ ] Sets password hash and `emailVerified: true`
- [ ] Clears invite token
- [ ] Creates session and returns token
- [ ] Typecheck passes

### US-012: Add email service abstraction
**Description:** As a developer, I need an email service to send verification and reset emails.

**Acceptance Criteria:**
- [ ] Create `src/services/email.ts` with interface for sending emails
- [ ] Support pluggable providers (start with console logging for dev)
- [ ] Functions: `sendVerificationEmail`, `sendPasswordResetEmail`, `sendInviteEmail`
- [ ] Emails include tenant name and appropriate links
- [ ] Typecheck passes

### US-013: Enforce maximum sessions per user
**Description:** As a system, I need to limit active sessions per user to prevent resource abuse.

**Acceptance Criteria:**
- [ ] Maximum 2 active sessions per user
- [ ] On new login, if limit reached, delete oldest session
- [ ] Expired sessions don't count toward limit
- [ ] Typecheck passes

### US-014: Log failed authentication attempts
**Description:** As an admin, I want failed login attempts logged for security auditing.

**Acceptance Criteria:**
- [ ] Create `auth_logs` table: `id`, `tenantId`, `email`, `event` (login_failed, login_success), `ipAddress`, `userAgent`, `createdAt`
- [ ] Log on failed login with reason (invalid password, user not found, email not verified)
- [ ] Log on successful login
- [ ] Do not log passwords or sensitive data
- [ ] Typecheck passes

### US-015: Require email re-verification on email change
**Description:** As a user, if I change my email, I must verify the new email before accessing resources.

**Acceptance Criteria:**
- [ ] PUT `/auth/email` endpoint to change email (requires authentication)
- [ ] Sets `emailVerified: false` and sends verification to new email
- [ ] Old email receives notification of change
- [ ] User cannot access protected resources until new email verified
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Session tokens use format `desi_session_{random}` (min 32 bytes random, base64url encoded)
- FR-2: Passwords hashed with Argon2id using secure defaults
- FR-3: Session expiry is 7 days, extended on each authenticated request (sliding window)
- FR-4: Email verification tokens expire in 24 hours
- FR-5: Password reset tokens expire in 1 hour
- FR-6: Invite tokens expire in 7 days
- FR-7: Unified `authenticate` middleware auto-detects auth type by token prefix
- FR-8: All session/password endpoints include tenant slug to maintain isolation
- FR-9: Password minimum length: 8 characters
- FR-10: Users with `emailVerified: false` cannot access protected resources (except verification endpoints)
- FR-11: Password reset invalidates all existing sessions for security
- FR-12: Maximum 2 active sessions per user; oldest session deleted when limit exceeded
- FR-13: Failed login attempts logged with timestamp, email, tenant, and IP address
- FR-14: Email change requires re-verification; user set to `emailVerified: false` until verified

## Non-Goals

- No OAuth/social login providers
- No multi-factor authentication (MFA)
- No tenant creation via self-registration (tenants created via admin API only)
- No "remember me" checkbox (all sessions are 7 days)
- No rate limiting changes (use existing rate limit config)
- No password complexity rules beyond minimum length
- No user-facing session management (view/revoke own sessions)

## Technical Considerations

- Reuse existing `AuthContext` interface for consistency
- Session tokens stored in `Authorization: Bearer <token>` header (same as API keys)
- Add `authType: 'api_key' | 'session'` to AuthContext for downstream logic if needed
- Use existing tenant DB connection pattern
- Email service should be async and not block request response
- Consider adding `passwordResetToken` and `passwordResetExpiry` columns to users table
- Consider adding `inviteToken` and `inviteExpiry` columns to users table

## Success Metrics

- Users can register and log in within 2 minutes
- Password reset email delivered within 1 minute
- Session validation adds < 5ms latency per request
- Zero password storage in plain text
- Email verification prevents unauthorized access

## Open Questions

None - all questions resolved.
