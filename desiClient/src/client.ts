import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export interface ApiClientConfig {
  baseUrl: string;
  token?: string;
  timeout?: number;
}

class AuthService {
  constructor(
    private client: AxiosInstance,
    private baseUrl: string,
    private getToken: () => string | undefined
  ) {}

  /** Get current user info */
  async getMe(): Promise<Record<string, unknown>> {
    let url = '/api/v2/auth/me';

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** List API keys */
  async getApiKeys(): Promise<Record<string, unknown>> {
    let url = '/api/v2/auth/api-keys';

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Create API key */
  async createApiKeys(params: { body: Record<string, unknown> }): Promise<Record<string, unknown>> {
    let url = '/api/v2/auth/api-keys';

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Revoke API key */
  async deleteApiKeysById(params: { id: string }): Promise<void> {
    let url = '/api/v2/auth/api-keys/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.delete<void>(url, config);
    return response.data;
  }

  /** Register new user */
  async register(params: {
    tenantSlug: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/auth/register/{tenantSlug}';
    url = url.replace('{' + 'tenantSlug' + '}', encodeURIComponent(String(params.tenantSlug)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Verify email */
  async verifyEmailByToken(params: { token: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/auth/verify-email/{token}';
    url = url.replace('{' + 'token' + '}', encodeURIComponent(String(params.token)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Resend verification email */
  async resendVerification(params: {
    tenantSlug: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/auth/resend-verification/{tenantSlug}';
    url = url.replace('{' + 'tenantSlug' + '}', encodeURIComponent(String(params.tenantSlug)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Login with email/password */
  async login(params: {
    tenantSlug: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/auth/login/{tenantSlug}';
    url = url.replace('{' + 'tenantSlug' + '}', encodeURIComponent(String(params.tenantSlug)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Logout */
  async logout(): Promise<void> {
    let url = '/api/v2/auth/logout';

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<void>(url, config);
    return response.data;
  }

  /** Request password reset */
  async forgotPassword(params: {
    tenantSlug: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/auth/forgot-password/{tenantSlug}';
    url = url.replace('{' + 'tenantSlug' + '}', encodeURIComponent(String(params.tenantSlug)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Reset password */
  async resetPassword(params: { body: Record<string, unknown> }): Promise<Record<string, unknown>> {
    let url = '/api/v2/auth/reset-password';

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Invite user (admin only) */
  async invite(params: { body: Record<string, unknown> }): Promise<Record<string, unknown>> {
    let url = '/api/v2/auth/invite';

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Accept invite */
  async acceptInvite(params: {
    token: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/auth/accept-invite/{token}';
    url = url.replace('{' + 'token' + '}', encodeURIComponent(String(params.token)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }
}

class UsersService {
  constructor(
    private client: AxiosInstance,
    private baseUrl: string,
    private getToken: () => string | undefined
  ) {}

  /** List all users */
  async list(): Promise<Record<string, unknown>> {
    let url = '/api/v2/users';

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Get user by ID */
  async getById(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/users/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Update user role */
  async updateById(params: {
    id: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/users/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.patch<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Delete user */
  async deleteById(params: { id: string }): Promise<void> {
    let url = '/api/v2/users/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.delete<void>(url, config);
    return response.data;
  }

  /** Invite new user */
  async createInvite(params: { body: Record<string, unknown> }): Promise<Record<string, unknown>> {
    let url = '/api/v2/users/invite';

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }
}

class AgentsService {
  constructor(
    private client: AxiosInstance,
    private baseUrl: string,
    private getToken: () => string | undefined
  ) {}

  /** List agents */
  async list(params: {
    status?: 'active' | 'inactive';
    name?: string;
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/agents';

    const config: AxiosRequestConfig = {
      params: {
        status: params.status,
        name: params.name,
        limit: params.limit,
        offset: params.offset,
      },
    };

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Create a new agent */
  async create(params: { body: Record<string, unknown> }): Promise<Record<string, unknown>> {
    let url = '/api/v2/agents';

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Get agent by ID */
  async getById(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/agents/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Update agent */
  async updateById(params: {
    id: string;
    body?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/agents/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.patch<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Delete agent */
  async deleteById(params: { id: string }): Promise<void> {
    let url = '/api/v2/agents/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.delete<void>(url, config);
    return response.data;
  }

  /** Activate agent */
  async activate(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/agents/{id}/activate';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Resolve agent by name */
  async resolveByName(params: { name: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/agents/resolve/{name}';
    url = url.replace('{' + 'name' + '}', encodeURIComponent(String(params.name)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }
}

class DagsService {
  constructor(
    private client: AxiosInstance,
    private baseUrl: string,
    private getToken: () => string | undefined
  ) {}

  /** List DAGs with filters */
  async list(params: {
    status?: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
    createdAfter?: string;
    createdBefore?: string;
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/dags';

    const config: AxiosRequestConfig = {
      params: {
        status: params.status,
        createdAfter: params.createdAfter,
        createdBefore: params.createdBefore,
        limit: params.limit,
        offset: params.offset,
      },
    };

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Create DAG from goal */
  async create(params: { body: Record<string, unknown> }): Promise<Record<string, unknown>> {
    let url = '/api/v2/dags';

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Create DAG and execute in one step */
  async createExecute(params: { body: Record<string, unknown> }): Promise<Record<string, unknown>> {
    let url = '/api/v2/create-execute';

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Resume DAG creation after clarification */
  async resumeClarification(params: {
    id: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/dags/{id}/resume-clarification';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** List scheduled DAGs */
  async getScheduled(): Promise<Record<string, unknown>> {
    let url = '/api/v2/dags/scheduled';

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Get DAG by ID */
  async getById(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/dags/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Update DAG */
  async updateById(params: {
    id: string;
    body?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/dags/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.patch<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Delete DAG */
  async deleteById(params: { id: string }): Promise<void> {
    let url = '/api/v2/dags/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.delete<void>(url, config);
    return response.data;
  }

  /** Execute a DAG */
  async execute(params: {
    id: string;
    body?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/dags/{id}/execute';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Run experiments */
  async createExperiments(params: {
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/dags/experiments';

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Get DAG executions by DAG ID */
  async executionbyDagId(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/dags/executions/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }
}

class ExecutionsService {
  constructor(
    private client: AxiosInstance,
    private baseUrl: string,
    private getToken: () => string | undefined
  ) {}

  /** List executions */
  async list(params: {
    status?: 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'partial' | 'suspended';
    dagId?: string;
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/executions';

    const config: AxiosRequestConfig = {
      params: {
        status: params.status,
        dagId: params.dagId,
        limit: params.limit,
        offset: params.offset,
      },
    };

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Get execution by ID */
  async getById(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/executions/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Delete execution */
  async deleteById(params: { id: string }): Promise<void> {
    let url = '/api/v2/executions/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.delete<void>(url, config);
    return response.data;
  }

  /** Get execution with sub-steps */
  async getByIdDetails(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/executions/{id}/details';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Get execution sub-steps */
  async getSubSteps(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/executions/{id}/sub-steps';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Stream execution events */
  async getEvents(params: { id: string }): Promise<string> {
    let url = '/api/v2/executions/{id}/events';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<string>(url, config);
    return response.data;
  }

  /** Resume suspended execution */
  async resume(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/executions/{id}/resume';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, config);
    return response.data;
  }
}

class ToolsService {
  constructor(
    private client: AxiosInstance,
    private baseUrl: string,
    private getToken: () => string | undefined
  ) {}

  /** List available tools */
  async list(): Promise<Record<string, unknown>> {
    let url = '/api/v2/tools';

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }
}

class CostsService {
  constructor(
    private client: AxiosInstance,
    private baseUrl: string,
    private getToken: () => string | undefined
  ) {}

  /** Get execution cost details */
  async getExecutionsById(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/costs/executions/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Get DAG cost details */
  async getDagsById(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/costs/dags/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Get overall cost summary */
  async getSummary(params: {
    startDate?: string;
    endDate?: string;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/costs/summary';

    const config: AxiosRequestConfig = {
      params: {
        startDate: params.startDate,
        endDate: params.endDate,
      },
    };

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }
}

class BillingService {
  constructor(
    private client: AxiosInstance,
    private baseUrl: string,
    private getToken: () => string | undefined
  ) {}

  /** Get current billing period usage */
  async getUsage(): Promise<Record<string, unknown>> {
    let url = '/api/v2/billing/usage';

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Get usage history with pagination */
  async getUsageHistory(params: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/billing/usage/history';

    const config: AxiosRequestConfig = {
      params: {
        startDate: params.startDate,
        endDate: params.endDate,
        limit: params.limit,
        offset: params.offset,
      },
    };

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** List invoices */
  async getInvoices(params: {
    status?: 'draft' | 'pending' | 'paid' | 'cancelled';
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/billing/invoices';

    const config: AxiosRequestConfig = {
      params: {
        status: params.status,
        limit: params.limit,
        offset: params.offset,
      },
    };

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Get invoice details */
  async getInvoicesById(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/billing/invoices/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }
}

class AdminService {
  constructor(
    private client: AxiosInstance,
    private baseUrl: string,
    private getToken: () => string | undefined
  ) {}

  /** List all tenants */
  async getTenants(params: {
    status?: 'active' | 'suspended' | 'pending';
    plan?: 'free' | 'pro' | 'enterprise';
    limit?: string;
    offset?: string;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/admin/tenants';

    const config: AxiosRequestConfig = {
      params: {
        status: params.status,
        plan: params.plan,
        limit: params.limit,
        offset: params.offset,
      },
    };

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Create new tenant */
  async createTenants(params: { body: Record<string, unknown> }): Promise<Record<string, unknown>> {
    let url = '/api/v2/admin/tenants';

    const config: AxiosRequestConfig = {};

    const response = await this.client.post<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Get tenant by ID */
  async getTenantsById(params: { id: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/admin/tenants/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Update tenant */
  async updateTenantsById(params: {
    id: string;
    body?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/admin/tenants/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {};

    const response = await this.client.patch<Record<string, unknown>>(url, params.body, config);
    return response.data;
  }

  /** Delete or suspend tenant */
  async deleteTenantsById(params: {
    id: string;
    action?: 'suspend' | 'delete';
  }): Promise<Record<string, unknown>> {
    let url = '/api/v2/admin/tenants/{id}';
    url = url.replace('{' + 'id' + '}', encodeURIComponent(String(params.id)));

    const config: AxiosRequestConfig = {
      params: {
        action: params.action,
      },
    };

    const response = await this.client.delete<Record<string, unknown>>(url, config);
    return response.data;
  }
}

export class ApiClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private token?: string;

  public readonly auth: AuthService;
  public readonly users: UsersService;
  public readonly agents: AgentsService;
  public readonly dags: DagsService;
  public readonly executions: ExecutionsService;
  public readonly tools: ToolsService;
  public readonly costs: CostsService;
  public readonly billing: BillingService;
  public readonly admin: AdminService;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.token = config.token;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((reqConfig) => {
      if (this.token) {
        reqConfig.headers.Authorization = `Bearer ${this.token}`;
      }
      return reqConfig;
    });

    this.auth = new AuthService(this.client, this.baseUrl, () => this.token);
    this.users = new UsersService(this.client, this.baseUrl, () => this.token);
    this.agents = new AgentsService(this.client, this.baseUrl, () => this.token);
    this.dags = new DagsService(this.client, this.baseUrl, () => this.token);
    this.executions = new ExecutionsService(this.client, this.baseUrl, () => this.token);
    this.tools = new ToolsService(this.client, this.baseUrl, () => this.token);
    this.costs = new CostsService(this.client, this.baseUrl, () => this.token);
    this.billing = new BillingService(this.client, this.baseUrl, () => this.token);
    this.admin = new AdminService(this.client, this.baseUrl, () => this.token);
  }

  setToken(token: string): void {
    this.token = token;
  }

  /** Health check */
  async healthCheck(): Promise<Record<string, unknown>> {
    let url = '/api/v2/health';

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Readiness check */
  async healthCheckReady(): Promise<Record<string, unknown>> {
    let url = '/api/v2/health/ready';

    const config: AxiosRequestConfig = {};

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }

  /** Get artifacts for authenticated user */
  async artifacts(params: { path?: string }): Promise<Record<string, unknown>> {
    let url = '/api/v2/artifacts';

    const config: AxiosRequestConfig = {
      params: {
        path: params.path,
      },
    };

    const response = await this.client.get<Record<string, unknown>>(url, config);
    return response.data;
  }
}
