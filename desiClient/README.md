# desiClient

SDK client for desiBackend API

## Installation

```bash
npm install desiClient
```

## Usage

```typescript
import { ApiClient } from 'desiClient';

const client = new ApiClient({
  baseUrl: 'https://api.example.com',
  token: 'your-api-token', // Optional
});

// Example API call
const response = await client._default.healthCheck(/* params */);
```

## API Methods

### _default

- `_default.healthCheck()`
- `_default.healthCheckReady()`
- `_default.artifacts(options?)`

### auth

- `auth.getMe()`
- `auth.getApiKeys()`
- `auth.createApiKeys(body)`
- `auth.deleteApiKeysById(id)`
- `auth.register(tenantSlug, body)`
- `auth.verifyEmailByToken(token)`
- `auth.resendVerification(tenantSlug, body)`
- `auth.login(tenantSlug, body)`
- `auth.logout()`
- `auth.forgotPassword(tenantSlug, body)`
- `auth.resetPassword(body)`
- `auth.invite(body)`
- `auth.acceptInvite(token, body)`

### users

- `users.list()`
- `users.getById(id)`
- `users.updateById(id, body)`
- `users.deleteById(id)`
- `users.createInvite(body)`

### agents

- `agents.list(options?)`
- `agents.create(body)`
- `agents.getById(id)`
- `agents.updateById(id, body)`
- `agents.deleteById(id)`
- `agents.activate(id)`
- `agents.resolveByName(name)`

### dags

- `dags.list(options?)`
- `dags.create(body)`
- `dags.createExecute(body)`
- `dags.resumeClarification(id, body)`
- `dags.getScheduled()`
- `dags.getById(id)`
- `dags.updateById(id, body)`
- `dags.deleteById(id)`
- `dags.execute(id, body)`
- `dags.createExperiments(body)`
- `dags.executionbyDagId(id)`

### executions

- `executions.list(options?)`
- `executions.getById(id)`
- `executions.deleteById(id)`
- `executions.getByIdDetails(id)`
- `executions.getSubSteps(id)`
- `executions.getEvents(id)`
- `executions.resume(id)`

### tools

- `tools.list()`

### costs

- `costs.getExecutionsById(id)`
- `costs.getDagsById(id)`
- `costs.getSummary(options?)`
- `costs.getMySummary(options?)`

### billing

- `billing.getUsage()`
- `billing.getUsageHistory(options?)`
- `billing.getInvoices(options?)`
- `billing.getInvoicesById(id)`

### admin

- `admin.getTenants(options?)`
- `admin.createTenants(body)`
- `admin.getTenantsById(id)`
- `admin.updateTenantsById(id, body)`
- `admin.deleteTenantsById(id, options?)`


## API Reference

### _default

#### `_default.healthCheck()`

Returns the current health status, version, and uptime of the service

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | string | No |  |
| `version` | string | No |  |
| `uptime` | number | No |  |

---

#### `_default.healthCheckReady()`

Checks if the service is ready to accept requests by verifying database connectivity

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | string | No |  |
| `checks` | object | No |  |

---

#### `_default.artifacts(options?)`

Retrieve all artifact names (files) created by the authenticated user's executions using readFile or writeFile tools. Optionally provide a path query parameter to get a single artifact with its content.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | No | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `artifacts` | array of object | No |  |
| `artifact` | object | No |  |

---

### auth

#### `auth.getMe()`

Returns the authenticated user's profile and tenant information

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `email` | string (email) | No |  |
| `name` | string | No |  |
| `role` | string | No |  |
| `tenant` | object | No |  |

---

#### `auth.getApiKeys()`

Returns all API keys for the authenticated user

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `apiKeys` | array of object | No |  |

---

#### `auth.createApiKeys(body)`

Creates a new API key for the authenticated user

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes |  |
| `scopes` | array of string enum: [`read`, `write`, `admin`] | No |  |
| `expiresAt` | string (date-time) | No |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `name` | string | No |  |
| `keyPrefix` | string | No |  |
| `key` | string | No |  |
| `scopes` | array of string enum: [`read`, `write`, `admin`] | No |  |
| `expiresAt` | string (date-time) | No |  |
| `createdAt` | string (date-time) | No |  |

---

#### `auth.deleteApiKeysById(id)`

Revokes an existing API key by ID

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

---

#### `auth.register(tenantSlug, body)`

Register a new user with email/password for an existing tenant. Sends verification email.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tenantSlug` | string | Yes | |

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `email` | string (email) | Yes |  |
| `password` | string | Yes |  |
| `name` | string | Yes |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | string | No |  |

---

#### `auth.verifyEmailByToken(token)`

Verify user email using the token from verification email. Token expires after 24 hours.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | string | No |  |

---

#### `auth.resendVerification(tenantSlug, body)`

Resends the email verification link. Always returns 200 to prevent email enumeration.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tenantSlug` | string | Yes | |

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `email` | string (email) | Yes |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | string | No |  |

---

#### `auth.login(tenantSlug, body)`

Authenticate with email and password. Returns session token on success.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tenantSlug` | string | Yes | |

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `email` | string (email) | Yes |  |
| `password` | string | Yes |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `token` | string | No |  |
| `expiresAt` | number | No |  |
| `user` | object | No |  |

---

#### `auth.logout()`

Invalidates the current session token.

---

#### `auth.forgotPassword(tenantSlug, body)`

Sends a password reset email if the email exists. Always returns 200 to prevent email enumeration.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tenantSlug` | string | Yes | |

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `email` | string (email) | Yes |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | string | No |  |

---

#### `auth.resetPassword(body)`

Reset password using the token received via email. Invalidates all existing sessions.

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `token` | string | Yes |  |
| `newPassword` | string | Yes |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | string | No |  |

---

#### `auth.invite(body)`

Invite a new user by email. Creates user with no password and sends invite email.

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `email` | string (email) | Yes |  |
| `name` | string | Yes |  |
| `role` | string enum: [`admin`, `member`, `viewer`] | Yes |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | string | No |  |
| `userId` | string | No |  |

---

#### `auth.acceptInvite(token, body)`

Accept an invitation by setting a password. Creates a session on success.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | |

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `password` | string | Yes |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `token` | string | No |  |
| `expiresAt` | number | No |  |
| `user` | object | No |  |

---

### users

#### `users.list()`

Retrieves a list of all users in the tenant. Requires admin role.

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `users` | array of object | No |  |

---

#### `users.getById(id)`

Retrieves a specific user by their unique identifier.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `email` | string | No |  |
| `name` | string | No |  |
| `role` | string enum: [`admin`, `member`, `viewer`] | No |  |
| `createdAt` | string | No |  |
| `updatedAt` | string | No |  |

---

#### `users.updateById(id, body)`

Updates the role of a specific user. Requires admin role.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `role` | string enum: [`admin`, `member`, `viewer`] | Yes | New role for the user |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `email` | string | No |  |
| `name` | string | No |  |
| `role` | string enum: [`admin`, `member`, `viewer`] | No |  |
| `createdAt` | string | No |  |
| `updatedAt` | string | No |  |

---

#### `users.deleteById(id)`

Deletes a specific user from the tenant. Requires admin role. Cannot delete your own account.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

---

#### `users.createInvite(body)`

Creates a new user invitation in the tenant. Requires admin role.

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `email` | string (email) | Yes | Email address of the user to invite |
| `name` | string | Yes | Full name of the user |
| `role` | string enum: [`admin`, `member`, `viewer`] | No | Role to assign to the user (defaults to member) |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `email` | string | No |  |
| `name` | string | No |  |
| `role` | string enum: [`admin`, `member`, `viewer`] | No |  |
| `createdAt` | string | No |  |
| `updatedAt` | string | No |  |

---

### agents

#### `agents.list(options?)`

Retrieves a paginated list of agents with optional filtering by status and name.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string enum: [`active`, `inactive`] | No | |
| `name` | string | No | |
| `limit` | integer | No | |
| `offset` | integer | No | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `agents` | array of object | No |  |
| `pagination` | object | No |  |

---

#### `agents.create(body)`

Creates a new agent with the specified configuration. The agent name must be unique within the tenant.

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes |  |
| `version` | string | Yes |  |
| `systemPrompt` | string | Yes |  |
| `params` | object | No |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (uuid) | No |  |
| `name` | string | No |  |
| `version` | string | No |  |
| `description` | string | No |  |
| `systemPrompt` | string | No |  |
| `provider` | string | No |  |
| `model` | string | No |  |
| `isActive` | boolean | No |  |
| `metadata` | object | No |  |
| `createdAt` | string (date-time) | No |  |
| `updatedAt` | string (date-time) | No |  |

---

#### `agents.getById(id)`

Retrieves a specific agent by its unique identifier.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (uuid) | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (uuid) | No |  |
| `name` | string | No |  |
| `version` | string | No |  |
| `description` | string | No |  |
| `systemPrompt` | string | No |  |
| `provider` | string | No |  |
| `model` | string | No |  |
| `isActive` | boolean | No |  |
| `metadata` | object | No |  |
| `createdAt` | string (date-time) | No |  |
| `updatedAt` | string (date-time) | No |  |

---

#### `agents.updateById(id, body)`

Updates an existing agent with the provided fields. Only specified fields will be updated.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (uuid) | Yes | |

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | No |  |
| `version` | string | No |  |
| `systemPrompt` | string | No |  |
| `metadata` | object | No |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (uuid) | No |  |
| `name` | string | No |  |
| `version` | string | No |  |
| `description` | string | No |  |
| `systemPrompt` | string | No |  |
| `provider` | string | No |  |
| `model` | string | No |  |
| `isActive` | boolean | No |  |
| `metadata` | object | No |  |
| `createdAt` | string (date-time) | No |  |
| `updatedAt` | string (date-time) | No |  |

---

#### `agents.deleteById(id)`

Deletes an agent by its ID. Active agents cannot be deleted.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (uuid) | Yes | |

---

#### `agents.activate(id)`

Activates an agent, making it the active version for its name. This will deactivate any previously active agent with the same name.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string (uuid) | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (uuid) | No |  |
| `name` | string | No |  |
| `version` | string | No |  |
| `description` | string | No |  |
| `systemPrompt` | string | No |  |
| `provider` | string | No |  |
| `model` | string | No |  |
| `isActive` | boolean | No |  |
| `metadata` | object | No |  |
| `createdAt` | string (date-time) | No |  |
| `updatedAt` | string (date-time) | No |  |

---

#### `agents.resolveByName(name)`

Finds the currently active agent with the specified name.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (uuid) | No |  |
| `name` | string | No |  |
| `version` | string | No |  |
| `description` | string | No |  |
| `systemPrompt` | string | No |  |
| `provider` | string | No |  |
| `model` | string | No |  |
| `isActive` | boolean | No |  |
| `metadata` | object | No |  |
| `createdAt` | string (date-time) | No |  |
| `updatedAt` | string (date-time) | No |  |

---

### dags

#### `dags.list(options?)`

Retrieves a paginated list of DAGs with optional filtering by status and creation date range.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string enum: [`pending`, `active`, `paused`, `completed`, `failed`, `cancelled`] | No | |
| `createdAfter` | string (date-time) | No | |
| `createdBefore` | string (date-time) | No | |
| `limit` | integer | No | |
| `offset` | integer | No | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `dags` | array of object | No |  |
| `pagination` | object | No |  |

---

#### `dags.create(body)`

Creates a new DAG (Directed Acyclic Graph) from a goal text using an AI agent. The DAG represents a workflow that can be executed to achieve the specified goal.

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `goalText` | string | Yes |  |
| `agentName` | string | Yes |  |
| `provider` | string enum: [`openai`, `openrouter`, `ollama`] | No |  |
| `model` | string | No |  |
| `temperature` | number | No |  |
| `maxTokens` | integer | No |  |
| `seed` | integer | No |  |
| `cronSchedule` | string | No |  |
| `scheduleActive` | boolean | No |  |
| `timezone` | string | No |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | string | No |  |
| `dagId` | string | No |  |
| `result` | object | No |  |
| `usage` | object | No |  |
| `generationStats` | object | No |  |
| `attempts` | integer | No |  |

---

#### `dags.createExecute(body)`

Creates a new DAG from a goal text and immediately starts execution. Returns the DAG ID and execution ID on success, or clarification/validation status if needed.

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `goalText` | string | Yes |  |
| `agentName` | string | Yes |  |
| `provider` | string enum: [`openai`, `openrouter`, `ollama`] | No |  |
| `model` | string | No |  |
| `temperature` | number | No |  |
| `maxTokens` | integer | No |  |
| `seed` | integer | No |  |
| `cronSchedule` | string | No |  |
| `scheduleActive` | boolean | No |  |
| `timezone` | string | No |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | string | No |  |
| `dagId` | string | No |  |
| `executionId` | string | No |  |

---

#### `dags.resumeClarification(id, body)`

Resumes DAG creation for a DAG that returned a clarification_required status. Provide the user's response to the clarification query.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `userResponse` | string | Yes |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | string | No |  |
| `dagId` | string | No |  |
| `result` | object | No |  |
| `usage` | object | No |  |
| `generationStats` | object | No |  |
| `attempts` | integer | No |  |

---

#### `dags.getScheduled()`

Retrieves all DAGs that have a cron schedule configured, along with their scheduling details.

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `dags` | array of object | No |  |

---

#### `dags.getById(id)`

Retrieves a specific DAG by its unique identifier, including all nodes, edges, and metadata.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `dagTitle` | string | No |  |
| `status` | string | No |  |
| `createdAt` | string (date-time) | No |  |
| `updatedAt` | string (date-time) | No |  |
| `metadata` | object | No |  |

---

#### `dags.updateById(id, body)`

Updates a DAG's properties such as status, schedule, or title. Only the provided fields will be updated.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | string | No |  |
| `cronSchedule` | string | No |  |
| `scheduleActive` | boolean | No |  |
| `timezone` | string | No |  |
| `dagTitle` | string | No |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `dagTitle` | string | No |  |
| `status` | string | No |  |
| `createdAt` | string (date-time) | No |  |
| `updatedAt` | string (date-time) | No |  |
| `metadata` | object | No |  |

---

#### `dags.deleteById(id)`

Safely deletes a DAG by its ID. This operation is idempotent.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

---

#### `dags.execute(id, body)`

Triggers the execution of an existing DAG. The execution runs asynchronously and returns immediately with an execution ID.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `provider` | string enum: [`openai`, `openrouter`, `ollama`] | No |  |
| `model` | string | No |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `status` | string | No |  |

---

#### `dags.createExperiments(body)`

Runs multiple DAG generation experiments with different model and temperature combinations to compare results.

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `goalText` | string | Yes |  |
| `agentName` | string | Yes |  |
| `provider` | string enum: [`openai`, `openrouter`, `ollama`] | Yes |  |
| `models` | array of string | Yes |  |
| `temperatures` | array of number | Yes |  |
| `seed` | integer | No |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `experimentId` | string | No |  |
| `totalRuns` | integer | No |  |
| `status` | string | No |  |

---

#### `dags.executionbyDagId(id)`

Given a DAG ID, returns the DAG info and all executions for that DAG.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `dagId` | string | No |  |
| `dagTitle` | string | No |  |
| `dagStatus` | string | No |  |
| `executions` | array of object | No |  |

---

### executions

#### `executions.list(options?)`

Retrieve a paginated list of executions with optional filters for status and DAG ID.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string enum: [`pending`, `running`, `waiting`, `completed`, `failed`, `partial`, `suspended`] | No | |
| `dagId` | string | No | |
| `limit` | integer | No | |
| `offset` | integer | No | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `executions` | array of object | No |  |
| `pagination` | object | No |  |

---

#### `executions.getById(id)`

Retrieve detailed information about a specific execution by its unique identifier.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `dagId` | string | No |  |
| `originalRequest` | string | No |  |
| `primaryIntent` | string | No |  |
| `status` | string | No |  |
| `totalTasks` | integer | No |  |
| `completedTasks` | integer | No |  |
| `failedTasks` | integer | No |  |
| `waitingTasks` | integer | No |  |
| `startedAt` | string (date-time) | No |  |
| `completedAt` | string (date-time) | No |  |
| `durationMs` | integer | No |  |
| `createdAt` | string (date-time) | No |  |
| `finalResult` | object | No |  |
| `synthesisResult` | string | No |  |
| `suspendedReason` | string | No |  |
| `suspendedAt` | string (date-time) | No |  |
| `retryCount` | integer | No |  |
| `totalUsage` | object | No |  |
| `totalCostUsd` | number | No |  |
| `updatedAt` | string (date-time) | No |  |

---

#### `executions.deleteById(id)`

Delete a specific execution by its unique identifier.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

---

#### `executions.getByIdDetails(id)`

Retrieve detailed information about a specific execution including all its sub-steps.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `dagId` | string | No |  |
| `originalRequest` | string | No |  |
| `primaryIntent` | string | No |  |
| `status` | string | No |  |
| `totalTasks` | integer | No |  |
| `completedTasks` | integer | No |  |
| `failedTasks` | integer | No |  |
| `waitingTasks` | integer | No |  |
| `startedAt` | string (date-time) | No |  |
| `completedAt` | string (date-time) | No |  |
| `durationMs` | integer | No |  |
| `createdAt` | string (date-time) | No |  |
| `finalResult` | object | No |  |
| `synthesisResult` | string | No |  |
| `suspendedReason` | string | No |  |
| `suspendedAt` | string (date-time) | No |  |
| `retryCount` | integer | No |  |
| `totalUsage` | object | No |  |
| `totalCostUsd` | number | No |  |
| `updatedAt` | string (date-time) | No |  |
| `subSteps` | array of object | No |  |

---

#### `executions.getSubSteps(id)`

Retrieve only the sub-steps for a specific execution.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `executionId` | string | No |  |
| `subSteps` | array of object | No |  |

---

#### `executions.getEvents(id)`

Stream real-time execution events via Server-Sent Events (SSE). The stream will close when the execution completes or fails.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

---

#### `executions.resume(id)`

Resume a suspended or waiting execution. Only executions in 'suspended' or 'waiting' status can be resumed.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `status` | string | No |  |

---

### tools

#### `tools.list()`

Retrieves a list of all available tools for the authenticated tenant

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `tools` | array of object | No |  |

---

### costs

#### `costs.getExecutionsById(id)`

Retrieves detailed cost and usage information for a specific execution, including token usage, compute time, and associated costs.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `executionId` | string | No |  |
| `dagId` | string | No |  |
| `status` | string | No |  |
| `usage` | object | No |  |
| `costs` | object | No |  |
| `model` | string | No |  |
| `startedAt` | string (date-time) | No |  |
| `completedAt` | string (date-time) | No |  |
| `durationMs` | number | No |  |

---

#### `costs.getDagsById(id)`

Retrieves aggregated cost and usage information for a DAG, including totals across all executions and per-execution breakdown.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `dagId` | string | No |  |
| `objective` | string | No |  |
| `totalExecutions` | number | No |  |
| `usage` | object | No |  |
| `costs` | object | No |  |
| `executions` | array of object | No |  |
| `createdAt` | string (date-time) | No |  |

---

#### `costs.getSummary(options?)`

Retrieves an aggregated cost summary for the tenant, including usage breakdown by resource type and model. Supports optional date range filtering. Requires admin role.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string (date) | No | |
| `endDate` | string (date) | No | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `tenantId` | string | No |  |
| `period` | object | No |  |
| `usage` | object | No |  |
| `costs` | object | No |  |
| `breakdown` | object | No |  |

---

#### `costs.getMySummary(options?)`

Retrieves an aggregated cost summary for the authenticated user, scoped to executions they own. Supports optional date range filtering.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string (date) | No | |
| `endDate` | string (date) | No | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `userId` | string | No |  |
| `tenantId` | string | No |  |
| `period` | object | No |  |
| `usage` | object | No |  |
| `costs` | object | No |  |
| `breakdown` | object | No |  |

---

### billing

#### `billing.getUsage()`

Retrieves usage statistics and costs for the current billing period including tokens, compute time, executions, and DAGs.

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `tenantId` | string | No |  |
| `period` | object | No |  |
| `usage` | object | No |  |
| `costs` | object | No |  |
| `quotas` | object | No |  |

---

#### `billing.getUsageHistory(options?)`

Retrieves historical usage records with optional date filtering and pagination support.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string (date) | No | |
| `endDate` | string (date) | No | |
| `limit` | integer | No | |
| `offset` | integer | No | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `tenantId` | string | No |  |
| `period` | object | No |  |
| `records` | array of object | No |  |
| `summary` | object | No |  |
| `pagination` | object | No |  |

---

#### `billing.getInvoices(options?)`

Retrieves a paginated list of invoices for the authenticated tenant with optional status filtering.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string enum: [`draft`, `pending`, `paid`, `cancelled`] | No | |
| `limit` | integer | No | |
| `offset` | integer | No | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `tenantId` | string | No |  |
| `invoices` | array of object | No |  |
| `pagination` | object | No |  |

---

#### `billing.getInvoicesById(id)`

Retrieves detailed information for a specific invoice including line items and totals.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `tenantId` | string | No |  |
| `period` | object | No |  |
| `lineItems` | array of object | No |  |
| `subtotal` | number | No |  |
| `total` | number | No |  |
| `status` | string enum: [`draft`, `pending`, `paid`, `cancelled`] | No |  |
| `createdAt` | string (date-time) | No |  |

---

### admin

#### `admin.getTenants(options?)`

Retrieves a paginated list of all tenants with optional filtering by status and plan. Requires admin scope.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string enum: [`active`, `suspended`, `pending`] | No | |
| `plan` | string enum: [`free`, `pro`, `enterprise`] | No | |
| `limit` | string | No | |
| `offset` | string | No | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `tenants` | array of object | No |  |
| `total` | number | No |  |
| `limit` | number | No |  |
| `offset` | number | No |  |

---

#### `admin.createTenants(body)`

Creates a new tenant with the specified name, slug, and optional plan. Requires admin scope.

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes |  |
| `slug` | string | Yes |  |
| `plan` | string enum: [`free`, `pro`, `enterprise`] | No |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `name` | string | No |  |
| `slug` | string | No |  |
| `status` | string enum: [`active`, `suspended`, `pending`] | No |  |
| `plan` | string enum: [`free`, `pro`, `enterprise`] | No |  |
| `quotas` | object | No |  |
| `createdAt` | string | No |  |
| `updatedAt` | string | No |  |

---

#### `admin.getTenantsById(id)`

Retrieves a single tenant by its unique identifier. Requires admin scope.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `name` | string | No |  |
| `slug` | string | No |  |
| `status` | string enum: [`active`, `suspended`, `pending`] | No |  |
| `plan` | string enum: [`free`, `pro`, `enterprise`] | No |  |
| `quotas` | object | No |  |
| `createdAt` | string | No |  |
| `updatedAt` | string | No |  |

---

#### `admin.updateTenantsById(id, body)`

Updates an existing tenant's properties such as name, status, plan, or quotas. Requires admin scope.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Request Body:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | No |  |
| `status` | string enum: [`active`, `suspended`, `pending`] | No |  |
| `plan` | string enum: [`free`, `pro`, `enterprise`] | No |  |
| `quotas` | object | No |  |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `name` | string | No |  |
| `slug` | string | No |  |
| `status` | string enum: [`active`, `suspended`, `pending`] | No |  |
| `plan` | string enum: [`free`, `pro`, `enterprise`] | No |  |
| `quotas` | object | No |  |
| `createdAt` | string | No |  |
| `updatedAt` | string | No |  |

---

#### `admin.deleteTenantsById(id, options?)`

Deletes or suspends a tenant. Use action=delete for permanent deletion or action=suspend (or omit) to suspend. Requires admin scope.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string enum: [`suspend`, `delete`] | No | |

**Response:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | No |  |
| `name` | string | No |  |
| `slug` | string | No |  |
| `status` | string enum: [`active`, `suspended`, `pending`] | No |  |
| `plan` | string enum: [`free`, `pro`, `enterprise`] | No |  |
| `quotas` | object | No |  |
| `createdAt` | string | No |  |
| `updatedAt` | string | No |  |

---


## License

MIT
