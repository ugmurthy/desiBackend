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

function createUser(db: Database, data: { email: string; name: string; role: UserRole }): User {
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO users (id, email, name, role)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, data.email, data.name, data.role);
  
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
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
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
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["role"],
          properties: {
            role: { type: "string", enum: ["admin", "member", "viewer"] },
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
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
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
        body: {
          type: "object",
          required: ["email", "name"],
          properties: {
            email: { type: "string", format: "email" },
            name: { type: "string", minLength: 1, maxLength: 100 },
            role: { type: "string", enum: ["admin", "member", "viewer"] },
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

      const user = createUser(auth.tenantDb, { email, name, role });

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
