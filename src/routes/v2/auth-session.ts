import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { Database } from "bun:sqlite";
import { getAdminDatabase, type Tenant } from "../../db/admin-schema";
import {
  initializeTenantUserSchema,
  generateSessionToken,
  type User,
  type AuthLogEvent,
  type Session,
} from "../../db/user-schema";
import { hashPassword, verifyPassword } from "../../utils/password";
import { sendVerificationEmail, sendPasswordResetEmail, sendInviteEmail } from "../../services/email";
import { authenticate, ensureRole, type AuthContext } from "../../middleware/authenticate";
import { error400Schema, error401Schema, error403Schema, error404Schema, error409Schema, errorResponseSchema } from "./schemas";

const MAX_SESSIONS_PER_USER = 2;

interface RegisterBody {
  email: string;
  password: string;
  name: string;
}

interface TenantSlugParams {
  tenantSlug: string;
}

interface VerifyEmailParams {
  token: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface ResetPasswordBody {
  token: string;
  newPassword: string;
}

interface InviteBody {
  email: string;
  name: string;
  role: "admin" | "member" | "viewer";
}

interface AcceptInviteParams {
  token: string;
}

interface AcceptInviteBody {
  password: string;
}

const AUTH_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: "1 minute",
    },
  },
};

function generateVerificationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function getTenantBySlug(slug: string): Tenant | null {
  const adminDb = getAdminDatabase();
  const stmt = adminDb.prepare(`
    SELECT id, name, slug, status, plan, quotas, createdAt, updatedAt
    FROM tenants
    WHERE slug = ?
  `);
  return (stmt.get(slug) as Tenant) ?? null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  apiKeyId: string | null;
  passwordHash: string | null;
  emailVerified: number;
  emailVerificationToken: string | null;
  emailVerificationExpiry: number | null;
  passwordResetToken: string | null;
  passwordResetExpiry: number | null;
  inviteToken: string | null;
  inviteExpiry: number | null;
  createdAt: string;
  updatedAt: string;
}

function rowToUser(row: UserRow): User {
  return {
    ...row,
    role: row.role as User["role"],
    emailVerified: Boolean(row.emailVerified),
  };
}

function getUserByEmail(db: Database, email: string): User | null {
  const stmt = db.prepare(`
    SELECT id, email, name, role, tenantId, apiKeyId, passwordHash,
           emailVerified, emailVerificationToken, emailVerificationExpiry,
           passwordResetToken, passwordResetExpiry, inviteToken, inviteExpiry,
           createdAt, updatedAt
    FROM users
    WHERE email = ?
  `);
  const row = stmt.get(email) as UserRow | undefined;
  if (!row) return null;
  return rowToUser(row);
}

function getUserByVerificationToken(db: Database, token: string): User | null {
  const stmt = db.prepare(`
    SELECT id, email, name, role, tenantId, apiKeyId, passwordHash,
           emailVerified, emailVerificationToken, emailVerificationExpiry,
           passwordResetToken, passwordResetExpiry, inviteToken, inviteExpiry,
           createdAt, updatedAt
    FROM users
    WHERE emailVerificationToken = ?
  `);
  const row = stmt.get(token) as UserRow | undefined;
  if (!row) return null;
  return rowToUser(row);
}

function getUserByPasswordResetToken(db: Database, token: string): User | null {
  const stmt = db.prepare(`
    SELECT id, email, name, role, tenantId, apiKeyId, passwordHash,
           emailVerified, emailVerificationToken, emailVerificationExpiry,
           passwordResetToken, passwordResetExpiry, inviteToken, inviteExpiry,
           createdAt, updatedAt
    FROM users
    WHERE passwordResetToken = ?
  `);
  const row = stmt.get(token) as UserRow | undefined;
  if (!row) return null;
  return rowToUser(row);
}

function getUserByInviteToken(db: Database, token: string): User | null {
  const stmt = db.prepare(`
    SELECT id, email, name, role, tenantId, apiKeyId, passwordHash,
           emailVerified, emailVerificationToken, emailVerificationExpiry,
           passwordResetToken, passwordResetExpiry, inviteToken, inviteExpiry,
           createdAt, updatedAt
    FROM users
    WHERE inviteToken = ?
  `);
  const row = stmt.get(token) as UserRow | undefined;
  if (!row) return null;
  return rowToUser(row);
}

function logAuthEvent(
  db: Database,
  tenantId: string,
  email: string,
  event: AuthLogEvent,
  request: FastifyRequest
): void {
  const ipAddress = request.ip || null;
  const userAgent = request.headers["user-agent"] || null;
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO auth_logs (id, tenantId, email, event, ipAddress, userAgent)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, tenantId, email, event, ipAddress, userAgent);
}

interface SessionRow {
  id: string;
  userId: string;
  token: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

function enforceMaxSessions(db: Database, userId: string): void {
  const now = Math.floor(Date.now() / 1000);
  
  // Get all active (non-expired) sessions for the user, ordered by createdAt (oldest first)
  const sessionsStmt = db.prepare(`
    SELECT id, userId, token, expiresAt, createdAt, updatedAt
    FROM sessions
    WHERE userId = ? AND expiresAt > ?
    ORDER BY createdAt ASC
  `);
  const activeSessions = sessionsStmt.all(userId, now) as SessionRow[];
  
  // If we have MAX_SESSIONS_PER_USER or more, delete the oldest to make room for the new one
  if (activeSessions.length >= MAX_SESSIONS_PER_USER) {
    const sessionsToDelete = activeSessions.slice(0, activeSessions.length - MAX_SESSIONS_PER_USER + 1);
    const deleteStmt = db.prepare(`DELETE FROM sessions WHERE id = ?`);
    for (const session of sessionsToDelete) {
      deleteStmt.run(session.id);
    }
  }
}

function createSession(db: Database, userId: string): { token: string; expiresAt: number } {
  // Enforce max sessions before creating new one (US-008)
  enforceMaxSessions(db, userId);
  
  const token = generateSessionToken();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 7 * 24 * 60 * 60; // 7 days

  const stmt = db.prepare(`
    INSERT INTO sessions (id, userId, token, expiresAt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, userId, token, expiresAt, now, now);

  return { token, expiresAt };
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

const authSessionRoutes: FastifyPluginAsync = async (fastify) => {
  // US-005: User self-registration endpoint
  fastify.post<{ Params: TenantSlugParams; Body: RegisterBody }>(
    "/auth/register/:tenantSlug",
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ["Authentication"],
        summary: "Register new user",
        description: "Register a new user with email/password for an existing tenant. Sends verification email.",
        params: {
          type: "object",
          required: ["tenantSlug"],
          properties: {
            tenantSlug: { type: "string", example: "acme-corp" },
          },
        },
        body: {
          type: "object",
          required: ["email", "password", "name"],
          properties: {
            email: { type: "string", format: "email", example: "john@example.com" },
            password: { type: "string", minLength: 8, example: "securepassword123" },
            name: { type: "string", minLength: 1, maxLength: 100, example: "John Doe" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              message: { type: "string", example: "Verification email sent" },
            },
          },
          400: error400Schema,
          404: error404Schema,
          409: error409Schema,
        },
      },
    },
    async (request, reply) => {
      const { tenantSlug } = request.params;
      const { email, password, name } = request.body;

      // Validate tenant exists and is active
      const tenant = getTenantBySlug(tenantSlug);
      if (!tenant) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Tenant not found",
        });
      }

      if (tenant.status !== "active") {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Tenant not found",
        });
      }

      // Validate email format
      if (!isValidEmail(email)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid email format",
        });
      }

      // Validate password strength
      if (!isValidPassword(password)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Password must be at least 8 characters",
        });
      }

      // Get tenant database
      const tenantDb = await initializeTenantUserSchema(tenant.id);

      // Check if email already registered
      const existingUser = getUserByEmail(tenantDb, email);
      if (existingUser) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Email already registered",
        });
      }

      // Hash password and create verification token
      const passwordHash = await hashPassword(password);
      const verificationToken = generateVerificationToken();
      const now = Math.floor(Date.now() / 1000);
      const verificationExpiry = now + 24 * 60 * 60; // 24 hours

      // Create user
      const userId = crypto.randomUUID();
      const createStmt = tenantDb.prepare(`
        INSERT INTO users (id, email, name, role, tenantId, passwordHash, emailVerified, emailVerificationToken, emailVerificationExpiry)
        VALUES (?, ?, ?, 'member', ?, ?, 0, ?, ?)
      `);
      createStmt.run(userId, email, name, tenant.id, passwordHash, verificationToken, verificationExpiry);

      // Send verification email
      const baseUrl = fastify.config.BASE_URL;
      const verificationLink = `${baseUrl}/api/v2/auth/verify-email/${verificationToken}`;

      await sendVerificationEmail({
        email,
        name,
        tenantName: tenant.name,
        verificationLink,
      });

      return reply.status(201).send({
        message: "Verification email sent",
      });
    }
  );

  // US-006: Email verification endpoint
  fastify.get<{ Params: VerifyEmailParams }>(
    "/auth/verify-email/:token",
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ["Authentication"],
        summary: "Verify email",
        description: "Verify user email using the token from verification email. Token expires after 24 hours.",
        params: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", example: "abc123..." },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              message: { type: "string", example: "Email verified successfully" },
            },
          },
          400: error400Schema,
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params;

      // Look up token in all tenant databases by searching admin tenants first
      const adminDb = getAdminDatabase();
      const tenantsStmt = adminDb.prepare(`SELECT id FROM tenants WHERE status = 'active'`);
      const tenants = tenantsStmt.all() as { id: string }[];

      let foundUser: User | null = null;
      let foundTenantDb: Database | null = null;

      for (const t of tenants) {
        const tenantDb = await initializeTenantUserSchema(t.id);
        const user = getUserByVerificationToken(tenantDb, token);
        if (user) {
          foundUser = user;
          foundTenantDb = tenantDb;
          break;
        }
      }

      if (!foundUser || !foundTenantDb) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid or expired token",
        });
      }

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (foundUser.emailVerificationExpiry && foundUser.emailVerificationExpiry < now) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid or expired token",
        });
      }

      // Update user: set emailVerified = true, clear token fields
      const updateStmt = foundTenantDb.prepare(`
        UPDATE users
        SET emailVerified = 1, emailVerificationToken = NULL, emailVerificationExpiry = NULL, updatedAt = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(foundUser.id);

      return {
        message: "Email verified successfully",
      };
    }
  );

  // Resend verification email endpoint
  fastify.post<{ Params: TenantSlugParams; Body: { email: string } }>(
    "/auth/resend-verification/:tenantSlug",
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ["Authentication"],
        summary: "Resend verification email",
        description: "Resends the email verification link. Always returns 200 to prevent email enumeration.",
        consumes: ["application/json"],
        params: {
          type: "object",
          required: ["tenantSlug"],
          properties: {
            tenantSlug: { type: "string", example: "acme-corp" },
          },
        },
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email", example: "john@example.com" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              message: { type: "string", example: "If the email exists and is unverified, a verification link has been sent" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantSlug } = request.params;
      const { email } = request.body;

      const successResponse = {
        message: "If the email exists and is unverified, a verification link has been sent",
      };

      const tenant = getTenantBySlug(tenantSlug);
      if (!tenant || tenant.status !== "active") {
        return successResponse;
      }

      const tenantDb = await initializeTenantUserSchema(tenant.id);
      const user = getUserByEmail(tenantDb, email);

      if (!user || user.emailVerified) {
        return successResponse;
      }

      const verificationToken = generateVerificationToken();
      const now = Math.floor(Date.now() / 1000);
      const verificationExpiry = now + 24 * 60 * 60; // 24 hours

      const updateStmt = tenantDb.prepare(`
        UPDATE users
        SET emailVerificationToken = ?, emailVerificationExpiry = ?, updatedAt = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(verificationToken, verificationExpiry, user.id);

      const baseUrl = fastify.config.BASE_URL;
      const verificationLink = `${baseUrl}/api/v2/auth/verify-email/${verificationToken}`;

      await sendVerificationEmail({
        email: user.email,
        name: user.name,
        tenantName: tenant.name,
        verificationLink,
      });

      return successResponse;
    }
  );

  // US-007: Login endpoint
  fastify.post<{ Params: TenantSlugParams; Body: LoginBody }>(
    "/auth/login/:tenantSlug",
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ["Authentication"],
        summary: "Login with email/password",
        description: "Authenticate with email and password. Returns session token on success.",
        params: {
          type: "object",
          required: ["tenantSlug"],
          properties: {
            tenantSlug: { type: "string", example: "acme-corp" },
          },
        },
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email", example: "john@example.com" },
            password: { type: "string", example: "securepassword123" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: { type: "string", example: "desi_session_abc123..." },
              expiresAt: { type: "number", example: 1706745600 },
              user: {
                type: "object",
                properties: {
                  id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
                  email: { type: "string", example: "john@example.com" },
                  name: { type: "string", example: "John Doe" },
                  role: { type: "string", example: "member" },
                },
              },
            },
          },
          401: error401Schema,
          403: error403Schema,
          404: error404Schema,
        },
      },
    },
    async (request, reply) => {
      const { tenantSlug } = request.params;
      const { email, password } = request.body;

      // Validate tenant exists and is active
      const tenant = getTenantBySlug(tenantSlug);
      if (!tenant || tenant.status !== "active") {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Tenant not found",
        });
      }

      // Get tenant database
      const tenantDb = await initializeTenantUserSchema(tenant.id);

      // Find user by email
      const user = getUserByEmail(tenantDb, email);

      // Check if user exists and has password
      if (!user || !user.passwordHash) {
        logAuthEvent(tenantDb, tenant.id, email, "login_failed", request);
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid credentials",
        });
      }

      // Verify password
      const passwordValid = await verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        logAuthEvent(tenantDb, tenant.id, email, "login_failed", request);
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid credentials",
        });
      }

      // Check if email is verified
      if (!user.emailVerified) {
        logAuthEvent(tenantDb, tenant.id, email, "login_failed", request);
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Email not verified. Please check your email for verification link.",
        });
      }

      // Create session
      const session = createSession(tenantDb, user.id);

      // Log successful login
      logAuthEvent(tenantDb, tenant.id, email, "login_success", request);

      return {
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    }
  );

  // US-010: Logout endpoint
  fastify.post(
    "/auth/logout",
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ["Authentication"],
        summary: "Logout",
        description: "Invalidates the current session token.",
        security: [{ bearerAuth: [] }],
        response: {
          204: { type: "null", description: "Successfully logged out" },
          401: error401Schema,
        },
      },
    },
    async (request, reply) => {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid or missing session token",
        });
      }

      const token = authHeader.slice(7).trim();

      if (!token.startsWith("desi_session_")) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid session token format",
        });
      }

      // Search all tenant databases for the session
      const adminDb = getAdminDatabase();
      const tenantsStmt = adminDb.prepare(`SELECT id FROM tenants WHERE status = 'active'`);
      const tenants = tenantsStmt.all() as { id: string }[];

      let deleted = false;
      for (const t of tenants) {
        const tenantDb = await initializeTenantUserSchema(t.id);
        const deleteStmt = tenantDb.prepare(`DELETE FROM sessions WHERE token = ?`);
        const result = deleteStmt.run(token);
        if (result.changes > 0) {
          deleted = true;
          break;
        }
      }

      if (!deleted) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid or missing session token",
        });
      }

      return reply.status(204).send();
    }
  );

  // US-011: Password reset request endpoint
  fastify.post<{ Params: TenantSlugParams; Body: { email: string } }>(
    "/auth/forgot-password/:tenantSlug",
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ["Authentication"],
        summary: "Request password reset",
        description: "Sends a password reset email if the email exists. Always returns 200 to prevent email enumeration.",
        params: {
          type: "object",
          required: ["tenantSlug"],
          properties: {
            tenantSlug: { type: "string", example: "acme-corp" },
          },
        },
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email", example: "john@example.com" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              message: { type: "string", example: "If the email exists, a password reset link has been sent" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantSlug } = request.params;
      const { email } = request.body;

      // Always return 200 to prevent email enumeration
      const successResponse = {
        message: "If the email exists, a password reset link has been sent",
      };

      // Validate tenant exists and is active
      const tenant = getTenantBySlug(tenantSlug);
      if (!tenant || tenant.status !== "active") {
        return successResponse;
      }

      // Get tenant database
      const tenantDb = await initializeTenantUserSchema(tenant.id);

      // Find user by email
      const user = getUserByEmail(tenantDb, email);

      if (!user) {
        return successResponse;
      }

      // Generate reset token
      const resetToken = generateVerificationToken();
      const now = Math.floor(Date.now() / 1000);
      const resetExpiry = now + 60 * 60; // 1 hour

      // Store reset token in DB
      const updateStmt = tenantDb.prepare(`
        UPDATE users
        SET passwordResetToken = ?, passwordResetExpiry = ?, updatedAt = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(resetToken, resetExpiry, user.id);

      // Send reset email
      const baseUrl = fastify.config.BASE_URL;
      const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        tenantName: tenant.name,
        resetLink,
      });

      return successResponse;
    }
  );

  // US-012: Password reset endpoint
  fastify.post<{ Body: ResetPasswordBody }>(
    "/auth/reset-password",
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ["Authentication"],
        summary: "Reset password",
        description: "Reset password using the token received via email. Invalidates all existing sessions.",
        body: {
          type: "object",
          required: ["token", "newPassword"],
          properties: {
            token: { type: "string", example: "abc123..." },
            newPassword: { type: "string", minLength: 8, example: "newSecurePassword123" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              message: { type: "string", example: "Password reset successfully" },
            },
          },
          400: error400Schema,
        },
      },
    },
    async (request, reply) => {
      const { token, newPassword } = request.body;

      if (!isValidPassword(newPassword)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Password must be at least 8 characters",
        });
      }

      // Search all tenant databases for the reset token
      const adminDb = getAdminDatabase();
      const tenantsStmt = adminDb.prepare(`SELECT id, name, slug, status FROM tenants WHERE status = 'active'`);
      const tenants = tenantsStmt.all() as { id: string; name: string; slug: string; status: string }[];

      let foundUser: User | null = null;
      let foundTenantDb: Database | null = null;

      for (const t of tenants) {
        const tenantDb = await initializeTenantUserSchema(t.id);
        const user = getUserByPasswordResetToken(tenantDb, token);
        if (user) {
          foundUser = user;
          foundTenantDb = tenantDb;
          break;
        }
      }

      if (!foundUser || !foundTenantDb) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid or expired reset token",
        });
      }

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (!foundUser.passwordResetExpiry || foundUser.passwordResetExpiry < now) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid or expired reset token",
        });
      }

      // Hash new password
      const passwordHash = await hashPassword(newPassword);

      // Update password and clear reset token
      const updateStmt = foundTenantDb.prepare(`
        UPDATE users
        SET passwordHash = ?, passwordResetToken = NULL, passwordResetExpiry = NULL, updatedAt = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(passwordHash, foundUser.id);

      // Invalidate all existing sessions for user
      const deleteSessionsStmt = foundTenantDb.prepare(`DELETE FROM sessions WHERE userId = ?`);
      deleteSessionsStmt.run(foundUser.id);

      return {
        message: "Password reset successfully",
      };
    }
  );

  // US-013: Admin invite user endpoint
  fastify.post<{ Body: InviteBody }>(
    "/auth/invite",
    {
      ...AUTH_RATE_LIMIT,
      preHandler: [authenticate, ensureRole("admin")],
      schema: {
        tags: ["Authentication"],
        summary: "Invite user (admin only)",
        description: "Invite a new user by email. Creates user with no password and sends invite email.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["email", "name", "role"],
          properties: {
            email: { type: "string", format: "email", example: "newuser@example.com" },
            name: { type: "string", minLength: 1, maxLength: 100, example: "Jane Doe" },
            role: { type: "string", enum: ["admin", "member", "viewer"], example: "member" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              message: { type: "string", example: "Invitation sent" },
              userId: { type: "string", example: "user_abc123" },
            },
          },
          400: error400Schema,
          401: error401Schema,
          403: error403Schema,
          409: error409Schema,
        },
      },
    },
    async (request, reply) => {
      const { email, name, role } = request.body;
      const auth = (request as typeof request & { auth: AuthContext }).auth;

      if (!isValidEmail(email)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid email format",
        });
      }

      // Check if email already exists in tenant
      const existingUser = getUserByEmail(auth.tenantDb, email);
      if (existingUser) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Email already exists in tenant",
        });
      }

      // Generate invite token
      const inviteToken = generateVerificationToken();
      const now = Math.floor(Date.now() / 1000);
      const inviteExpiry = now + 7 * 24 * 60 * 60; // 7 days

      // Create user with no password
      const userId = crypto.randomUUID();
      const insertStmt = auth.tenantDb.prepare(`
        INSERT INTO users (id, email, name, role, tenantId, emailVerified, inviteToken, inviteExpiry, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, datetime('now'), datetime('now'))
      `);
      insertStmt.run(userId, email, name, role, auth.tenant.id, inviteToken, inviteExpiry);

      // Send invite email
      const baseUrl = fastify.config.BASE_URL;
      const inviteLink = `${baseUrl}/accept-invite/${inviteToken}`;

      await sendInviteEmail({
        email,
        name,
        tenantName: auth.tenant.name,
        inviterName: auth.user.name,
        inviteLink,
        role,
      });

      return reply.status(201).send({
        message: "Invitation sent",
        userId,
      });
    }
  );

  // US-014: Accept invite endpoint
  fastify.post<{ Params: AcceptInviteParams; Body: AcceptInviteBody }>(
    "/auth/accept-invite/:token",
    {
      ...AUTH_RATE_LIMIT,
      schema: {
        tags: ["Authentication"],
        summary: "Accept invite",
        description: "Accept an invitation by setting a password. Creates a session on success.",
        params: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", example: "abc123..." },
          },
        },
        body: {
          type: "object",
          required: ["password"],
          properties: {
            password: { type: "string", minLength: 8, example: "securepassword123" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: { type: "string", example: "desi_session_abc123..." },
              expiresAt: { type: "number", example: 1706745600 },
              user: {
                type: "object",
                properties: {
                  id: { type: "string", example: "user_abc123" },
                  email: { type: "string", example: "user@example.com" },
                  name: { type: "string", example: "John Doe" },
                  role: { type: "string", example: "member" },
                },
              },
            },
          },
          400: error400Schema,
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params;
      const { password } = request.body;

      if (!isValidPassword(password)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Password must be at least 8 characters",
        });
      }

      // Search all tenant databases for the invite token
      const adminDb = getAdminDatabase();
      const tenantsStmt = adminDb.prepare(`SELECT id, name, slug, status FROM tenants WHERE status = 'active'`);
      const tenants = tenantsStmt.all() as { id: string; name: string; slug: string; status: string }[];

      let foundUser: User | null = null;
      let foundTenantDb: Database | null = null;

      for (const t of tenants) {
        const tenantDb = await initializeTenantUserSchema(t.id);
        const user = getUserByInviteToken(tenantDb, token);
        if (user) {
          foundUser = user;
          foundTenantDb = tenantDb;
          break;
        }
      }

      if (!foundUser || !foundTenantDb) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid or expired invite token",
        });
      }

      // Check if token is expired (7 days)
      const now = Math.floor(Date.now() / 1000);
      if (!foundUser.inviteExpiry || foundUser.inviteExpiry < now) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid or expired invite token",
        });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Update user: set password, emailVerified, clear invite token
      const updateStmt = foundTenantDb.prepare(`
        UPDATE users
        SET passwordHash = ?, emailVerified = 1, inviteToken = NULL, inviteExpiry = NULL, updatedAt = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(passwordHash, foundUser.id);

      // Create session and return token
      const session = createSession(foundTenantDb, foundUser.id);

      return {
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          id: foundUser.id,
          email: foundUser.email,
          name: foundUser.name,
          role: foundUser.role,
        },
      };
    }
  );
};

export default authSessionRoutes;
