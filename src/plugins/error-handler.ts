import type { FastifyPluginAsync, FastifyError, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

interface StandardError {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

interface ValidationError extends FastifyError {
  validation?: Array<{
    keyword: string;
    instancePath: string;
    schemaPath: string;
    params: Record<string, unknown>;
    message?: string;
  }>;
}

function isValidationError(error: FastifyError): error is ValidationError {
  return error.validation !== undefined;
}

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler(
    (error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
      const statusCode = error.statusCode ?? 500;

      const response: StandardError = {
        statusCode,
        error: getErrorName(statusCode),
        message: error.message,
      };

      if (isValidationError(error) && error.validation) {
        response.statusCode = 400;
        response.error = "Bad Request";
        response.message = "Validation failed";
        response.details = error.validation.map((v) => ({
          field: v.instancePath || v.params?.missingProperty || "unknown",
          message: v.message || v.keyword,
        }));
        return reply.status(400).send(response);
      }

      if (statusCode === 404) {
        response.error = "Not Found";
        response.message = error.message || "Resource not found";
        return reply.status(404).send(response);
      }

      if (statusCode >= 500) {
        response.error = "Internal Server Error";
        response.message = "An unexpected error occurred";
        fastify.log.error(error);
      }

      return reply.status(statusCode).send(response);
    }
  );
};

function getErrorName(statusCode: number): string {
  const errorNames: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
  };
  return errorNames[statusCode] || "Error";
}

export default fp(errorHandlerPlugin, {
  name: "error-handler",
});
