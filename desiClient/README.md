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
- `dags.resumeClarification(id, body)`
- `dags.getScheduled()`
- `dags.getById(id)`
- `dags.updateById(id, body)`
- `dags.deleteById(id)`
- `dags.execute(id, body)`
- `dags.createExecuteDefinition(body)`
- `dags.createExperiments(body)`

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


## License

MIT
