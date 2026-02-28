# PRD: Telegram Frontend Integration for desiBackend (V1 + V1.5 Profiles)

## Introduction

This feature adds Telegram as a frontend channel for desiBackend so verified users can submit text requests, trigger plan creation/execution, handle clarification loops, and receive final outputs and artifacts in Telegram.

The design intentionally uses a thin Telegram Gateway layer that maps chat interactions to existing backend APIs. V1 covers a single tenant (`freemium`) and one bot per tenant. V1.5 introduces profile-based routing so a Telegram user can target different backend APIs/workflows in the future without changing the user-facing chat contract.

## Goals

- Enable one-time email verification for Telegram users before allowing any execution actions.
- Allow verified users to submit text requests from Telegram that create and execute plans in desiBackend.
- Support clarification-required workflow from backend and resume execution from Telegram.
- Return final results and artifact files to Telegram.
- Ensure artifact delivery is scoped to the current `executionId` only.
- Establish profile routing UX (`/profiles`, `/use <profile>`) with an internal router abstraction for future multi-target APIs.

## User Stories

### US-001: Start and Verification Gate
**Description:** As a Telegram user, I want to register and verify once so that only authorized users can access backend execution features.

**Acceptance Criteria:**
- [ ] `/start` initializes a conversation state for an unverified user.
- [ ] Bot collects user email and triggers one-time verification flow.
- [ ] Verification method uses 6-digit OTP entered in Telegram.
- [ ] Unverified users are blocked from request execution and receive a clear guidance message.
- [ ] Verified mapping between Telegram identity and backend user is persisted.

### US-002: One Active Execution Guardrail
**Description:** As a Telegram user, I want predictable processing so that I do not accidentally trigger overlapping runs.

**Acceptance Criteria:**
- [ ] If a user has an active execution, a new request is rejected.
- [ ] Rejection message clearly states the user must wait for current execution completion.
- [ ] Guardrail check uses persisted active execution state keyed by Telegram-linked user.

### US-003: Submit Text Request and Start Execution
**Description:** As a verified Telegram user, I want to submit a text request so the backend creates and executes a plan.

**Acceptance Criteria:**
- [ ] In ready state, plain text message is treated as a new request.
- [ ] Gateway calls backend create-and-execute API and captures `dagId`/`executionId`.
- [ ] Bot sends immediate acknowledgment with request accepted status and execution reference.
- [ ] Request and correlation metadata are persisted for traceability.

### US-004: Clarification Required Loop
**Description:** As a Telegram user, I want to respond to clarification questions so ambiguous requests can still complete successfully.

**Acceptance Criteria:**
- [ ] If backend returns `clarification_required`, bot sends clarification prompt to user.
- [ ] Conversation state transitions to `AWAITING_CLARIFICATION` with associated `dagId`.
- [ ] User clarification response is routed to resume-clarification backend endpoint.
- [ ] Flow supports repeated clarification cycles until either success or failure.
- [ ] Clarification context remains bound to the originating request/profile.

### US-005: Completion and Failure Notifications
**Description:** As a Telegram user, I want concise lifecycle updates so I know when my request is done or failed.

**Acceptance Criteria:**
- [ ] Gateway sends only key updates: accepted, clarification-needed, completed, failed.
- [ ] Production status tracking uses polling-based monitoring of execution status.
- [ ] Completion message includes concise summary and execution ID.
- [ ] Failure message includes reason (when available) and execution ID.

### US-006: Execution-Scoped Artifact Attachments
**Description:** As a Telegram user, I want artifact files from my current run delivered in chat so I can consume outputs directly.

**Acceptance Criteria:**
- [ ] Gateway fetches artifacts only for the current `executionId`.
- [ ] Bot sends artifacts as Telegram file attachments by default.
- [ ] If artifact exceeds Telegram file-size constraints, bot sends signed download link fallback.
- [ ] No artifacts from other executions are returned in this flow.
- [ ] Artifact dispatch is idempotent (no duplicate files on retries).

### US-007: Profile Router Foundation (V1.5)
**Description:** As a Telegram user, I want to select a profile so future requests can route to different backend APIs/workflows.

**Acceptance Criteria:**
- [ ] `/profiles` lists available profiles with short descriptions.
- [ ] `/use <profile>` changes the active profile for the user.
- [ ] Active profile is persisted and used for subsequent requests.
- [ ] Internal routing resolves profile to an allowlisted target handler.
- [ ] With one initial profile (`default`), behavior remains identical to V1.

### US-008: Secure and Reliable Delivery
**Description:** As a platform owner, I want secure and reliable Telegram integration so production behavior is safe and auditable.

**Acceptance Criteria:**
- [ ] Gateway does not expose backend API keys/session tokens to Telegram users.
- [ ] Rate limits apply to Telegram command/request endpoints.
- [ ] Outbound message dedupe/idempotency keys prevent duplicate sends.
- [ ] Audit logs include user, execution, profile, and delivery outcomes.

## Functional Requirements

- FR-1: The system must support Telegram onboarding via `/start`, email collection, OTP issuance, and OTP verification.
- FR-2: The system must block all execution-related actions for unverified users.
- FR-3: The system must map Telegram identity (`telegram_user_id`, `chat_id`) to backend identity (`user_id`, `tenant_id`).
- FR-4: The system must treat incoming plain text messages from verified users in ready state as new execution requests.
- FR-5: The system must invoke backend create-and-execute operation and persist `dagId` and `executionId`.
- FR-6: The system must enforce one active execution per user; new requests during active execution must be rejected.
- FR-7: The system must support clarification-required responses and resume-clarification requests until terminal outcome.
- FR-8: The system must send only major lifecycle updates (accepted, clarification needed, completed, failed).
- FR-9: The system must monitor execution status via polling (production baseline).
- FR-10: The system must deliver artifact files as Telegram attachments.
- FR-11: Artifact selection must be strictly filtered to the current `executionId`.
- FR-12: For oversized artifacts, the system must deliver signed download links instead of attachments.
- FR-13: The system must expose `/profiles` command to list available profiles.
- FR-14: The system must expose `/use <profile>` command to switch active profile.
- FR-15: The system must route requests through an internal profile router that resolves to allowlisted target handlers.
- FR-16: The system must include idempotency controls for outbound Telegram message and artifact delivery.
- FR-17: The system must log audit events for onboarding, execution dispatch, clarification handling, completion, failure, and artifact delivery.

## Non-Goals (Out of Scope)

- File or image input processing from Telegram in V1.
- Step-by-step execution progress streaming to Telegram.
- Multi-tenant user selection at runtime (tenant is fixed to `freemium`).
- Queueing multiple user requests while one execution is active.
- Advanced profile governance (RBAC by profile, scheduling, profile-level billing) beyond basic routing.

## Design Considerations

- Keep Telegram UX command-light and conversational: `/start`, `/profiles`, `/use <profile>`, plus plain text for requests.
- Return concise operational messages that avoid noisy updates.
- Ensure clarification prompts are clear and map directly to backend question context.
- Prefer user-readable profile names while keeping technical routing hidden.

## Technical Considerations

- Existing backend endpoints already support core flows:
  - Registration/verification/auth session: `src/routes/v2/auth-session.ts`
  - Create and execute + clarification resume: `src/routes/v2/dags.ts`
  - Execution status/events: `src/routes/v2/executions.ts`
  - Artifact retrieval: `src/routes/v2/artifacts.ts`
- Current artifact endpoint behavior may require augmentation to efficiently query artifacts by `executionId`; gateway logic must enforce execution scoping regardless.
- Suggested gateway state tables:
  - `telegram_identities`
  - `telegram_sessions`
  - `telegram_requests`
  - `telegram_dispatch_log`
  - `profile_registry`
- Dev deployment should use long polling; production should use webhook mode with secret token validation and async worker handling.
- Signed-link fallback should use short expiration and access controls.

## Success Metrics

- At least 95% of verified users can complete first request flow without manual support.
- 100% of execution-triggered artifact deliveries are scoped to the matching `executionId`.
- 0 token leakage incidents to Telegram clients.
- Duplicate outbound artifact/message rate under 0.5% with idempotency enabled.
- 90th percentile time from request submission to acknowledgment under 3 seconds.

## Open Questions

- Should OTP expiration and retry policy be standardized globally (for example: 10-minute validity, max 5 attempts), or tenant-configurable later?
- Should profile switching be allowed while a clarification is pending, or blocked until request lifecycle completion?
