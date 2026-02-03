# Authentication & User Management Flows

## Overview

This document describes the authentication and user management flows for the desiBackend API. The system uses **session-based authentication** for users (with `desi_session_` prefixed tokens) and **API key authentication** for integrations (`desi_sk_` prefixed keys).

---

## Roles

| Role | Description |
|------|-------------|
| **admin** | Full access. Can invite users, manage tenant settings. |
| **member** | Standard access. Can use all API features. |
| **viewer** | Read-only access to resources. |

---

## Assumptions

1. **Multi-tenant architecture**: Each tenant has its own isolated SQLite database.
2. **Email verification required**: Users must verify their email before login (except for invited users).
3. **Password requirements**: Minimum 8 characters.
4. **Session limits**: Maximum 2 active sessions per user; oldest sessions are automatically removed.
5. **Rate limiting**: All auth endpoints are rate-limited to 10 requests per minute.
6. **Token expiry**:
   - Session tokens: 7 days
   - Email verification tokens: 24 hours
   - Password reset tokens: 1 hour
   - Invite tokens: 7 days
7. **Password hashing**: Argon2id via Bun's built-in API.

---

## API Endpoints

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/v2/auth/register/:tenantSlug` | POST | No | Self-register new user |
| `/api/v2/auth/verify-email/:token` | GET | No | Verify email address |
| `/api/v2/auth/login/:tenantSlug` | POST | No | Login with email/password |
| `/api/v2/auth/logout` | POST | Yes | Logout (invalidate session) |
| `/api/v2/auth/forgot-password/:tenantSlug` | POST | No | Request password reset |
| `/api/v2/auth/reset-password` | POST | No | Reset password with token |
| `/api/v2/auth/invite` | POST | Yes (admin) | Invite new user |
| `/api/v2/auth/accept-invite/:token` | POST | No | Accept invitation |

---

## Flow Details

### 1. User Registration

**Endpoint**: `POST /api/v2/auth/register/:tenantSlug`

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe"
}
```

**Flow**:
1. Validate tenant exists and is active
2. Validate email format and password strength (≥8 chars)
3. Check email is not already registered
4. Hash password with Argon2id
5. Create user with `role: member`, `emailVerified: false`
6. Generate 24-hour verification token
7. Send verification email with link
8. Return `201 Created`

**Response**: `{ "message": "Verification email sent" }`

---

### 2. Email Verification

**Endpoint**: `GET /api/v2/auth/verify-email/:token`

**Flow**:
1. Search all active tenant databases for the token
2. Validate token exists and is not expired (24h)
3. Set `emailVerified = true`, clear token fields
4. Return success message

**Response**: `{ "message": "Email verified successfully" }`

---

### 3. Login

**Endpoint**: `POST /api/v2/auth/login/:tenantSlug`

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Flow**:
1. Validate tenant exists and is active
2. Find user by email
3. Verify password using Argon2id
4. Check email is verified (return 403 if not)
5. Enforce max 2 sessions (delete oldest if needed)
6. Create session token (7-day expiry)
7. Log successful login event
8. Return session token and user info

**Response**:
```json
{
  "token": "desi_session_...",
  "expiresAt": 1706745600,
  "user": { "id": "...", "email": "...", "name": "...", "role": "member" }
}
```

---

### 4. Logout

**Endpoint**: `POST /api/v2/auth/logout`

**Headers**: `Authorization: Bearer desi_session_...`

**Flow**:
1. Extract session token from Authorization header
2. Search all tenant databases for the session
3. Delete the session record
4. Return `204 No Content`

---

### 5. Password Reset Request (Forgot Password)

**Endpoint**: `POST /api/v2/auth/forgot-password/:tenantSlug`

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Flow**:
1. Always return 200 (prevents email enumeration)
2. If tenant and user exist:
   - Generate 1-hour reset token
   - Store token in database
   - Send password reset email

**Response**: `{ "message": "If the email exists, a password reset link has been sent" }`

---

### 6. Password Reset

**Endpoint**: `POST /api/v2/auth/reset-password`

**Request Body**:
```json
{
  "token": "abc123...",
  "newPassword": "newSecurePassword123"
}
```

**Flow**:
1. Validate password strength (≥8 chars)
2. Search all tenant databases for the reset token
3. Validate token is not expired (1h)
4. Hash new password
5. Update user password, clear reset token
6. **Invalidate all existing sessions** for security
7. Return success message

**Response**: `{ "message": "Password reset successfully" }`

---

### 7. Invite User (Admin Only)

**Endpoint**: `POST /api/v2/auth/invite`

**Headers**: `Authorization: Bearer desi_session_...`

**Request Body**:
```json
{
  "email": "newuser@example.com",
  "name": "Jane Doe",
  "role": "member"
}
```

**Flow**:
1. Authenticate admin user
2. Validate email format
3. Check email doesn't exist in tenant
4. Create user with no password, `emailVerified: false`
5. Generate 7-day invite token
6. Send invitation email with link
7. Return user ID

**Response**: `{ "message": "Invitation sent", "userId": "..." }`

---

### 8. Accept Invite

**Endpoint**: `POST /api/v2/auth/accept-invite/:token`

**Request Body**:
```json
{
  "password": "securepassword123"
}
```

**Flow**:
1. Validate password strength (≥8 chars)
2. Search all tenant databases for invite token
3. Validate token is not expired (7d)
4. Hash password
5. Update user: set password, `emailVerified = true`, clear invite token
6. Create session
7. Return session token and user info

**Response**:
```json
{
  "token": "desi_session_...",
  "expiresAt": 1706745600,
  "user": { "id": "...", "email": "...", "name": "...", "role": "member" }
}
```

---

## Source Files

- [src/routes/v2/auth-session.ts](../src/routes/v2/auth-session.ts) - All auth endpoints
- [src/db/user-schema.ts](../src/db/user-schema.ts) - User and session schemas
- [src/middleware/authenticate.ts](../src/middleware/authenticate.ts) - Auth middleware
- [src/utils/password.ts](../src/utils/password.ts) - Password hashing utilities
- [src/services/email.ts](../src/services/email.ts) - Email sending service
