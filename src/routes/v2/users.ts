import type { FastifyPluginAsync } from "fastify";
import { authenticate, ensureRole } from "../../middleware/authenticate";
import type { Database } from "bun:sqlite";
import type { User, UserRole } from "../../db/user-schema";

interface UserIdParams {
  id: string;
}

interface UpdateUserBody {
  role: UserRole;
}

interface InviteUserBody {
  email: string;
  name: string;
  role?: UserRole;
}

function listUsers(db: Database): User[] {
  const stmt = db.prepare(`
    SELECT id, email, name, role, createdAt, updatedAt
    FROM users
    ORDER BY createdAt DESC
  `);
  return stmt.all() as User[];
}

function getUserById(db: Database, userId: string): User | null {
  const stmt = db.prepare(`
    SELECT id, email, name, role, createdAt, updatedAt
    FROM users
    WHERE id = ?
  `);
  const result = stmt.get(userId) as User | undefined;
  return result ?? null;
}

function updateUserRole(db: Database, userId: string, role: UserRole): boolean {
  const stmt = db.prepare(`
    UPDATE users
    SET role = ?, updatedAt = datetime('now')
    WHERE id = ?
  `);
  const result = stmt.run(role, userId);
  return result.changes > 0;
}

function deleteUser(db: Database, userId: string): boolean {
  const stmt = db.prepare(`
    DELETE FROM users
    WHERE id = ?
  `);
  const result = stmt.run(userId);
  return result.changes > 0;
}

function createUser(db: Database, data: { email: string; name: string; role: UserRole; tenantId: string }): User {
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO users (id, email, name, role, tenantId)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.email, data.name, data.role, data.tenantId);
  
  return getUserById(db, id)!;
}

function getUserByEmail(db: Database, email: string): User | null {
  const stmt = db.prepare(`
    SELECT id, email, name, role, createdAt, updatedAt
    FROM users
    WHERE email = ?
  `);
  const result = stmt.get(email) as User | undefined;
  return result ?? null;
}

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/users",
    {
      preHandler: [authenticate, ensureRole("admin")],
      schema: {
        tags: ["Users"],
        summary: "List all users",
        description: "Retrieves a list of all users in the tenant. Requires admin role.",
        response: {
          200: {
            description: "List of users retrieved successfully",
            type: "object",
            properties: {
              users: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
                    email: { type: "string", example: "user@example.com" },
                    name: { type: "string", example: "John Doe" },
                    role: { type: "string", enum: ["admin", "member", "viewer"], example: "member" },
                    createdAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
                    updatedAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
                  },
                },
              },
            },
            example: {
              users: [
                {
                  id: "550e8400-e29b-41d4-a716-446655440000",
                  email: "admin@example.com",
                  name: "Admin User",
                  role: "admin",
                  createdAt: "2024-01-15T10:30:00.000Z",
                  updatedAt: "2024-01-15T10:30:00.000Z",
                },
              ],
            },
          },
          401: {
            description: "Unauthorized - Invalid or missing authentication",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Authentication required" },
            },
          },
          500: {
            description: "Internal server error",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 500 },
              error: { type: "string", example: "Internal Server Error" },
              message: { type: "string", example: "An unexpected error occurred" },
            },
          },
        },
      },
    },
    async (request) => {
      const auth = request.auth!;
      const users = listUsers(auth.tenantDb);

      return {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
      };
    }
  );

  fastify.get<{ Params: UserIdParams }>(
    "/users/:id",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["Users"],
        summary: "Get user by ID",
        description: "Retrieves a specific user by their unique identifier.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "User ID", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        response: {
          200: {
            description: "User retrieved successfully",
            type: "object",
            properties: {
              id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
              email: { type: "string", example: "user@example.com" },
              name: { type: "string", example: "John Doe" },
              role: { type: "string", enum: ["admin", "member", "viewer"], example: "member" },
              createdAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
              updatedAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
            },
            example: {
              id: "550e8400-e29b-41d4-a716-446655440000",
              email: "user@example.com",
              name: "John Doe",
              role: "member",
              createdAt: "2024-01-15T10:30:00.000Z",
              updatedAt: "2024-01-15T10:30:00.000Z",
            },
          },
          401: {
            description: "Unauthorized - Invalid or missing authentication",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Authentication required" },
            },
          },
          404: {
            description: "User not found",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "User not found" },
            },
          },
          500: {
            description: "Internal server error",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 500 },
              error: { type: "string", example: "Internal Server Error" },
              message: { type: "string", example: "An unexpected error occurred" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      const user = getUserById(auth.tenantDb, id);

      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User not found",
        });
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    }
  );

  fastify.patch<{ Params: UserIdParams; Body: UpdateUserBody }>(
    "/users/:id",
    {
      preHandler: [authenticate, ensureRole("admin")],
      schema: {
        tags: ["Users"],
        summary: "Update user role",
        description: "Updates the role of a specific user. Requires admin role.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "User ID", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        body: {
          type: "object",
          required: ["role"],
          properties: {
            role: { type: "string", enum: ["admin", "member", "viewer"], description: "New role for the user", example: "admin" },
          },
          example: {
            role: "admin",
          },
        },
        response: {
          200: {
            description: "User role updated successfully",
            type: "object",
            properties: {
              id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
              email: { type: "string", example: "user@example.com" },
              name: { type: "string", example: "John Doe" },
              role: { type: "string", enum: ["admin", "member", "viewer"], example: "admin" },
              createdAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
              updatedAt: { type: "string", example: "2024-01-16T14:20:00.000Z" },
            },
            example: {
              id: "550e8400-e29b-41d4-a716-446655440000",
              email: "user@example.com",
              name: "John Doe",
              role: "admin",
              createdAt: "2024-01-15T10:30:00.000Z",
              updatedAt: "2024-01-16T14:20:00.000Z",
            },
          },
          400: {
            description: "Bad request - Invalid input",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 400 },
              error: { type: "string", example: "Bad Request" },
              message: { type: "string", example: "Invalid role value" },
            },
          },
          401: {
            description: "Unauthorized - Invalid or missing authentication",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Authentication required" },
            },
          },
          404: {
            description: "User not found",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "User not found" },
            },
          },
          500: {
            description: "Internal server error",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 500 },
              error: { type: "string", example: "Internal Server Error" },
              message: { type: "string", example: "Failed to update user" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;
      const { role } = request.body;

      const existingUser = getUserById(auth.tenantDb, id);

      if (!existingUser) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User not found",
        });
      }

      const updated = updateUserRole(auth.tenantDb, id, role);

      if (!updated) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to update user",
        });
      }

      const user = getUserById(auth.tenantDb, id)!;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    }
  );

  fastify.delete<{ Params: UserIdParams }>(
    "/users/:id",
    {
      preHandler: [authenticate, ensureRole("admin")],
      schema: {
        tags: ["Users"],
        summary: "Delete user",
        description: "Deletes a specific user from the tenant. Requires admin role. Cannot delete your own account.",
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", description: "User ID", example: "550e8400-e29b-41d4-a716-446655440000" },
          },
        },
        response: {
          204: {
            description: "User deleted successfully",
            type: "null",
          },
          400: {
            description: "Bad request - Cannot delete own account",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 400 },
              error: { type: "string", example: "Bad Request" },
              message: { type: "string", example: "Cannot delete your own user account" },
            },
          },
          401: {
            description: "Unauthorized - Invalid or missing authentication",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Authentication required" },
            },
          },
          404: {
            description: "User not found",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 404 },
              error: { type: "string", example: "Not Found" },
              message: { type: "string", example: "User not found" },
            },
          },
          500: {
            description: "Internal server error",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 500 },
              error: { type: "string", example: "Internal Server Error" },
              message: { type: "string", example: "Failed to delete user" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { id } = request.params;

      if (id === auth.user.id) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Cannot delete your own user account",
        });
      }

      const existingUser = getUserById(auth.tenantDb, id);

      if (!existingUser) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "User not found",
        });
      }

      const deleted = deleteUser(auth.tenantDb, id);

      if (!deleted) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Failed to delete user",
        });
      }

      return reply.status(204).send();
    }
  );

  fastify.post<{ Body: InviteUserBody }>(
    "/users/invite",
    {
      preHandler: [authenticate, ensureRole("admin")],
      schema: {
        tags: ["Users"],
        summary: "Invite new user",
        description: "Creates a new user invitation in the tenant. Requires admin role.",
        body: {
          type: "object",
          required: ["email", "name"],
          properties: {
            email: { type: "string", format: "email", description: "Email address of the user to invite", example: "newuser@example.com" },
            name: { type: "string", minLength: 1, maxLength: 100, description: "Full name of the user", example: "Jane Smith" },
            role: { type: "string", enum: ["admin", "member", "viewer"], description: "Role to assign to the user (defaults to member)", example: "member" },
          },
          example: {
            email: "newuser@example.com",
            name: "Jane Smith",
            role: "member",
          },
        },
        response: {
          201: {
            description: "User invited successfully",
            type: "object",
            properties: {
              id: { type: "string", example: "550e8400-e29b-41d4-a716-446655440001" },
              email: { type: "string", example: "newuser@example.com" },
              name: { type: "string", example: "Jane Smith" },
              role: { type: "string", enum: ["admin", "member", "viewer"], example: "member" },
              createdAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
              updatedAt: { type: "string", example: "2024-01-15T10:30:00.000Z" },
            },
            example: {
              id: "550e8400-e29b-41d4-a716-446655440001",
              email: "newuser@example.com",
              name: "Jane Smith",
              role: "member",
              createdAt: "2024-01-15T10:30:00.000Z",
              updatedAt: "2024-01-15T10:30:00.000Z",
            },
          },
          400: {
            description: "Bad request - Invalid input",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 400 },
              error: { type: "string", example: "Bad Request" },
              message: { type: "string", example: "Invalid email format" },
            },
          },
          401: {
            description: "Unauthorized - Invalid or missing authentication",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 401 },
              error: { type: "string", example: "Unauthorized" },
              message: { type: "string", example: "Authentication required" },
            },
          },
          409: {
            description: "Conflict - User already exists",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 409 },
              error: { type: "string", example: "Conflict" },
              message: { type: "string", example: "User with this email already exists" },
            },
          },
          500: {
            description: "Internal server error",
            type: "object",
            properties: {
              statusCode: { type: "number", example: 500 },
              error: { type: "string", example: "Internal Server Error" },
              message: { type: "string", example: "An unexpected error occurred" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const auth = request.auth!;
      const { email, name, role = "member" } = request.body;

      const existingUser = getUserByEmail(auth.tenantDb, email);

      if (existingUser) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "User with this email already exists",
        });
      }

      const user = createUser(auth.tenantDb, { email, name, role, tenantId: auth.tenant.id });

      return reply.status(201).send({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    }
  );
};

export default usersRoutes;
