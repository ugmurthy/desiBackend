# PRD: OpenAPI Specification & Interactive API Documentation

## Introduction

Add OpenAPI 3.0 specification generation and interactive API documentation to the desiBackend project. This enables developers to explore the API interactively via Scalar (a modern API reference UI) served at `/api/v2/docs`, and provides a machine-readable OpenAPI spec that can be used for future SDK generation.

## Goals

- Auto-generate OpenAPI 3.0 specification from existing Fastify route definitions in `src/routes/v2/`
- Serve interactive API documentation using Scalar at `/api/v2/docs`
- Expose raw OpenAPI JSON spec at `/api/v2/docs/json`
- Annotate all 10 route modules with proper schemas, descriptions, and tags
- Ensure documentation stays in sync with code automatically

## User Stories

### US-001: Install and configure OpenAPI documentation plugins
**Description:** As a developer, I need Fastify configured with Swagger and Scalar so the API has auto-generated OpenAPI specs and interactive documentation.

**Acceptance Criteria:**
- [ ] `@fastify/swagger` package installed
- [ ] `@scalar/fastify-api-reference` package installed
- [ ] Swagger plugin registered in app with OpenAPI 3.0 configuration
- [ ] API info (title, version, description) configured
- [ ] Scalar UI served at `/api/v2/docs`
- [ ] OpenAPI JSON available at `/api/v2/docs/json`
- [ ] UI renders correctly with all endpoints visible
- [ ] Typecheck passes (`bun run typecheck`)

### US-002: Add OpenAPI schemas to all route modules
**Description:** As a developer, I want all API endpoints documented with request/response schemas and example values so consumers understand how to use each endpoint.

**Acceptance Criteria:**
- [ ] All routes in `src/routes/v2/auth.ts` have OpenAPI schema definitions, tagged "Authentication"
- [ ] All routes in `src/routes/v2/users.ts` have OpenAPI schema definitions, tagged "Users"
- [ ] All routes in `src/routes/v2/agents.ts` have OpenAPI schema definitions, tagged "Agents"
- [ ] All routes in `src/routes/v2/executions.ts` have OpenAPI schema definitions, tagged "Executions"
- [ ] All routes in `src/routes/v2/dags.ts` have OpenAPI schema definitions, tagged "DAGs"
- [ ] All routes in `src/routes/v2/tools.ts` have OpenAPI schema definitions, tagged "Tools"
- [ ] All routes in `src/routes/v2/billing.ts` have OpenAPI schema definitions, tagged "Billing"
- [ ] All routes in `src/routes/v2/costs.ts` have OpenAPI schema definitions, tagged "Costs"
- [ ] All routes in `src/routes/v2/admin.ts` have OpenAPI schema definitions, tagged "Admin"
- [ ] All routes in `src/routes/v2/health.ts` have OpenAPI schema definitions, tagged "Health"
- [ ] Request body schemas defined for all POST/PUT/PATCH endpoints
- [ ] Response schemas defined with proper status codes (200, 400, 401, 404, 500, etc.)
- [ ] Example values included in all request/response schemas
- [ ] Typecheck passes (`bun run typecheck`)

### US-003: Add security schemes for authentication
**Description:** As a developer, I want the OpenAPI spec to document authentication requirements so consumers know how to authenticate.

**Acceptance Criteria:**
- [ ] Bearer token security scheme defined in OpenAPI config
- [ ] Protected routes marked with security requirements
- [ ] Scalar UI shows authentication options
- [ ] Typecheck passes (`bun run typecheck`)

### US-004: Export OpenAPI spec to file
**Description:** As a developer, I want to export the OpenAPI spec to a JSON file for SDK generation.

**Acceptance Criteria:**
- [ ] Script created at `scripts/export-openapi.ts`
- [ ] Script outputs spec to `artifacts/openapi.json`
- [ ] `artifacts/openapi.json` added to `.gitignore`
- [ ] npm script added: `"export-openapi": "bun run scripts/export-openapi.ts"`
- [ ] Generated spec is valid OpenAPI 3.0
- [ ] Typecheck passes (`bun run typecheck`)

## Functional Requirements

- FR-1: Register `@fastify/swagger` plugin with OpenAPI 3.0 configuration
- FR-2: Register `@scalar/fastify-api-reference` plugin to serve docs at `/api/v2/docs`
- FR-3: Expose OpenAPI JSON spec at `/api/v2/docs/json`
- FR-4: Define JSON Schema for all request bodies in POST/PUT/PATCH routes
- FR-5: Define JSON Schema for all response types with appropriate status codes
- FR-6: Tag routes by domain (Authentication, Users, Agents, etc.)
- FR-7: Define Bearer token security scheme for authenticated endpoints
- FR-8: Provide script to export OpenAPI spec to `artifacts/openapi.json`

## Non-Goals

- No SDK generation (Python/JS/TS) in this phase—spec export enables future generation
- No API versioning changes (stay with `/api/v2/`)
- No changes to actual API behavior or endpoints
- No custom Scalar theme or branding
- No automated spec validation in CI/CD

## Technical Considerations

- **Packages to install:**
  - `@fastify/swagger` - OpenAPI spec generation
  - `@scalar/fastify-api-reference` - Interactive docs UI
- **Schema approach:** Use Fastify's built-in JSON Schema support in route options
- **Existing route structure:** 10 route modules under `src/routes/v2/` must be annotated
- **Plugin registration order:** Swagger must be registered before routes

## Success Metrics

- All 10 route modules have complete OpenAPI annotations
- Scalar UI at `/api/v2/docs` displays all endpoints with schemas
- OpenAPI spec validates successfully with standard validators
- Developers can test API calls directly from Scalar UI

## Decisions

- **Example values:** Yes, add example values to all request/response schemas for better documentation
- **OpenAPI spec file:** `artifacts/openapi.json` should be gitignored (add to `.gitignore`)
