export const errorResponseSchema = (statusCode: number, error: string, message: string) =>
  ({
    type: "object",
    properties: {
      statusCode: { type: "number", example: statusCode },
      error: { type: "string", example: error },
      message: { type: "string", example: message },
    },
  }) as const;

export const error400Schema = errorResponseSchema(400, "Bad Request", "Validation failed");
export const error401Schema = errorResponseSchema(401, "Unauthorized", "Authentication required");
export const error403Schema = errorResponseSchema(403, "Forbidden", "Insufficient permissions");
export const error404Schema = errorResponseSchema(404, "Not Found", "Resource not found");
export const error409Schema = errorResponseSchema(409, "Conflict", "Resource already exists");

export const errorResponseSchemaExamples = (statusCode: number, error: string, message: string) =>
  ({
    type: "object",
    description: error,
    properties: {
      statusCode: { type: "number", examples: [statusCode] },
      error: { type: "string", examples: [error] },
      message: { type: "string", examples: [message] },
    },
  }) as const;

export const error401SchemaExamples = errorResponseSchemaExamples(401, "Unauthorized", "Invalid or missing authentication token");
export const error404SchemaExamples = errorResponseSchemaExamples(404, "Not Found", "Resource not found");
