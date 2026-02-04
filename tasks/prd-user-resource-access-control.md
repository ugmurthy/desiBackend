# PRD: User-Level Resource Access Control

## Introduction

Implement user-level access control for DAGs, executions, and sub_steps within a tenant. Currently, all users in a tenant can access all resources in that tenant's database. This feature restricts access so users can only view/modify resources they created, without modifying existing table schemas. A new `resource_ownership` table will track the userId-to-resource relationships.

## Goals

- Restrict DAG, execution, and sub_step access to the user who created them
- Implement ownership tracking via a new `resource_ownership` table (no schema changes to existing tables)
- Provide a new route to retrieve artifacts (files from readFile/writeFile tools) created by a user
- Provide a new route to get all executions for a DAG given an execution ID
- Return 403 Forbidden when users attempt to access resources they don't own

## User Stories

### US-001: Create resource_ownership table
**Description:** As a developer, I need a table to track which user owns which resources so that access control can be enforced.

**Acceptance Criteria:**
- [ ] Create `resource_ownership` table with columns: `id`, `userId`, `resourceType` (dag|execution), `resourceId`, `createdAt`
- [ ] Add index on `userId` and `resourceType` for efficient queries
- [ ] Add unique constraint on `(resourceType, resourceId)` to prevent duplicates
- [ ] Migration runs successfully on tenant databases
- [ ] Typecheck passes

### US-002: Record ownership when DAG is created
**Description:** As a system, I need to record the userId when a DAG is created so ownership can be tracked.

**Acceptance Criteria:**
- [ ] When POST /dags creates a DAG, insert a record into `resource_ownership` with userId from `request.auth.user.id`, resourceType='dag', resourceId=dagId
- [ ] Ownership record created in same transaction as DAG creation
- [ ] Typecheck passes

### US-003: Record ownership when execution is created
**Description:** As a system, I need to record the userId when an execution is started so ownership can be tracked.

**Acceptance Criteria:**
- [ ] When POST /dags/:id/execute creates an execution, insert ownership record with resourceType='execution'
- [ ] When POST /dags/execute-definition creates an execution, insert ownership record
- [ ] Ownership record created in same transaction as execution creation
- [ ] Typecheck passes

### US-004: Filter DAG list by user ownership
**Description:** As a user, I want to only see DAGs I created when listing DAGs.

**Acceptance Criteria:**
- [ ] GET /dags returns only DAGs where userId matches `request.auth.user.id` via join with `resource_ownership`
- [ ] Empty list returned if user has no DAGs (not an error)
- [ ] Pagination still works correctly
- [ ] Typecheck passes

### US-005: Restrict single DAG access by ownership
**Description:** As a user, I should get 403 Forbidden when accessing a DAG I don't own.

**Acceptance Criteria:**
- [ ] GET /dags/:id returns 403 if DAG exists but user doesn't own it
- [ ] PUT /dags/:id returns 403 if user doesn't own the DAG
- [ ] DELETE /dags/:id returns 403 if user doesn't own the DAG
- [ ] POST /dags/:id/execute returns 403 if user doesn't own the DAG
- [ ] 404 still returned if DAG doesn't exist at all
- [ ] Typecheck passes

### US-006: Filter execution list by user ownership
**Description:** As a user, I want to only see executions I created when listing executions.

**Acceptance Criteria:**
- [ ] GET /executions returns only executions where userId matches via `resource_ownership`
- [ ] Empty list returned if user has no executions
- [ ] Pagination still works correctly
- [ ] Typecheck passes

### US-007: Restrict single execution access by ownership
**Description:** As a user, I should get 403 Forbidden when accessing an execution I don't own.

**Acceptance Criteria:**
- [ ] GET /executions/:id returns 403 if execution exists but user doesn't own it
- [ ] GET /executions/:id/details returns 403 if user doesn't own the execution
- [ ] GET /executions/:id/sub-steps returns 403 if user doesn't own the execution
- [ ] DELETE /executions/:id returns 403 if user doesn't own the execution
- [ ] POST /executions/:id/resume returns 403 if user doesn't own the execution
- [ ] 404 still returned if execution doesn't exist at all
- [ ] Typecheck passes

### US-008: Create GET /artifacts/:userId route
**Description:** As a user, I want to retrieve all artifact names (files) created by my executions using readFile or writeFile tools.

**Acceptance Criteria:**
- [ ] GET /artifacts/:userId returns list of artifacts with: `path`, `toolName` (readFile|writeFile), `executionId`, `createdAt`
- [ ] Only returns artifacts from executions owned by the requesting user
- [ ] Returns 403 if requesting user's id doesn't match :userId parameter
- [ ] Extracts file paths from sub_steps where `toolOrPromptName` is 'readFile' or 'writeFile'
- [ ] File path extracted from `toolOrPromptParams` JSON field
- [ ] Returns empty array if no artifacts found
- [ ] Typecheck passes

### US-009: Create GET /dags/executions/:executionId route
**Description:** As a user, I want to get all executions for a DAG given any execution ID from that DAG.

**Acceptance Criteria:**
- [ ] GET /dags/executions/:executionId looks up the execution's dagId, then returns all executions for that DAG
- [ ] Response includes DAG info joined with executions: dagId, dagTitle, dagStatus, and array of executions
- [ ] Returns 403 if user doesn't own the specified execution
- [ ] Returns 404 if execution doesn't exist
- [ ] All returned executions must also be owned by the user (filter applied)
- [ ] Typecheck passes

### US-010: Migration script for existing resources
**Description:** As an admin, I need existing DAGs and executions to be assigned ownership so they remain accessible after the access control feature is deployed.

**Acceptance Criteria:**
- [ ] Create migration script that assigns all existing DAGs to user `ugmurthy@gmail.com`
- [ ] Create migration script that assigns all existing executions to user `ugmurthy@gmail.com`
- [ ] Script looks up userId by email from the users table
- [ ] Script is idempotent (safe to run multiple times)
- [ ] Script logs number of resources migrated
- [ ] Script can be run via `bun run migrate:ownership` or similar command
- [ ] Typecheck passes

## Functional Requirements

- FR-1: Create `resource_ownership` table in tenant database with schema: `id TEXT PRIMARY KEY, userId TEXT NOT NULL, resourceType TEXT NOT NULL, resourceId TEXT NOT NULL, createdAt INTEGER NOT NULL`
- FR-2: Add unique index on `(resourceType, resourceId)` in `resource_ownership`
- FR-3: Add index on `(userId, resourceType)` for efficient ownership lookups
- FR-4: Insert ownership record when DAG is created via POST /dags
- FR-5: Insert ownership record when execution is created via POST /dags/:id/execute or POST /dags/execute-definition
- FR-6: Modify GET /dags to join with `resource_ownership` and filter by userId
- FR-7: Modify GET /dags/:id to check ownership and return 403 if not owned
- FR-8: Modify PUT /dags/:id to check ownership and return 403 if not owned
- FR-9: Modify DELETE /dags/:id to check ownership and return 403 if not owned
- FR-10: Modify POST /dags/:id/execute to check ownership and return 403 if not owned
- FR-11: Modify GET /executions to join with `resource_ownership` and filter by userId
- FR-12: Modify all GET /executions/:id/* routes to check ownership and return 403 if not owned
- FR-13: Modify DELETE /executions/:id to check ownership and return 403 if not owned
- FR-14: Modify POST /executions/:id/resume to check ownership and return 403 if not owned
- FR-15: Implement GET /artifacts/:userId that queries sub_steps for readFile/writeFile tool usage
- FR-16: Implement GET /dags/executions/:executionId that returns all executions for the parent DAG with DAG info

## Non-Goals

- No modification to existing `dags`, `dag_executions`, or `sub_steps` table schemas
- No admin override to view all resources (explicitly excluded per requirements)
- No sharing/delegation of resource access between users
- No ownership transfer capability

## Technical Considerations

- The `resource_ownership` table lives in the tenant's `agent.db` database alongside dags/executions/sub_steps
- Ownership checks should be implemented as a reusable helper function to avoid code duplication
- Consider using SQL JOINs for list operations rather than fetching then filtering (performance)
- The userId comes from `request.auth.user.id` which is set by the authenticate middleware
- For artifacts, parse the `toolOrPromptParams` JSON to extract file paths
- Existing data will not have ownership records - those resources will be inaccessible (acceptable for new feature)

## Success Metrics

- Users can only see their own DAGs and executions
- 403 errors correctly returned when accessing others' resources
- Artifact list accurately reflects files touched by user's executions
- No performance regression on list operations (use indexed JOINs)

## Resolved Questions

- **Migration for existing resources:** Yes - a migration script will assign all existing DAGs and executions to `ugmurthy@gmail.com` (see US-010)
- **Admin override capability:** No - admins follow the same access control rules as regular users
