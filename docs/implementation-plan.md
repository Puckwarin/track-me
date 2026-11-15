# Track Me — Implementation Plan

**Project:** Track Me  
**Stack:** React + Vite + Firebase  
**Execution:** Incremental, Phase-by-Phase  
**Development Rules:** See `/AGENTS.md`

---

# Project Objectives

Improve Track Me in seven areas:

1. AI Service Centralization
2. Performance Optimization
3. Food Module Refactoring
4. Firebase Architecture & Security
5. Automated Testing & Error Monitoring
6. First-Time User Onboarding
7. Architecture Documentation

All changes must preserve existing features, user data, and backward compatibility whenever possible.

---

# PHASE 0 — PROJECT AUDIT

## Objectives

Understand the existing project before modifying application code.

## Tasks

- Inspect repository structure.
- Inspect package.json and dependencies.
- Inspect Vite configuration.
- Inspect React components, hooks, services, and utilities.
- Identify all AI API entry points.
- Inspect nutrition.js and services/aiAssistant.js.
- Inspect food.js and its responsibilities.
- Inspect existing Firebase collections and rules.
- Inspect Service Worker and PWA configuration.
- Inspect current bundle size and build configuration.
- Inspect existing tests and CI workflows.
- Inspect documentation and Git history.

## Deliverables

- Architecture audit.
- Dependency and bundle analysis.
- AI integration map.
- Firebase structure and security findings.
- Identified risks and technical debt.
- Proposed implementation plan.
- List of files expected to change in each Phase.

Do not modify production application logic during the initial audit.

---

# PHASE 1 — AI SERVICE CENTRALIZATION

## Objectives

Create one centralized AI service for Gemini and Groq.

## Tasks

### 1.1 AI Integration Audit

Identify every location that calls:
- Gemini API
- Groq API
- Model discovery endpoints
- Model selection logic

### 1.2 Centralized AI Service

Implement a shared service responsible for:
- Provider selection
- Model discovery
- Model selection
- API requests
- Request deduplication
- Error normalization
- Retry management
- Provider fallback
- Cooldown management

### 1.3 Quota & Cooldown

Handle:
- HTTP 429
- RESOURCE_EXHAUSTED
- Rate limit errors
- Temporary provider failures

Requirements:
- Respect Retry-After when available.
- Use bounded exponential backoff with jitter.
- Store cooldown state per provider/model or quota scope as appropriate.
- Prevent requests during active cooldown.
- Avoid infinite retry loops.
- Allow retry after cooldown expires.

### 1.4 Provider Fallback

- Attempt an eligible alternative provider when appropriate.
- Respect provider cooldown.
- Prevent repeated provider switching.
- Do not retry invalid requests or authentication failures without reason.
- Preserve feature-specific response formats.

### 1.5 Request Management

- Deduplicate identical in-flight requests where safe.
- Support AbortController.
- Prevent accidental duplicate submissions.
- Avoid sharing one cancellation signal across unrelated consumers.
- Avoid caching private or user-specific responses without an explicit policy.

### 1.6 Migration

Update existing AI consumers, including:
- nutrition.js
- services/aiAssistant.js
- Other AI entry points discovered during the audit.

All applicable AI features must use the centralized service.

Preserve existing prompts, output schemas, and feature behavior.

### 1.7 Security Review

- Identify client-side API key exposure.
- Review environment configuration.
- Recommend or implement a secure backend architecture where feasible.
- Do not silently migrate production secrets or break existing configuration.

## Tests

Add tests for:
- Provider selection
- Model selection
- Cooldown calculation
- Retry-After handling
- Exponential backoff
- Quota errors
- Provider fallback
- Request deduplication
- Request cancellation
- Invalid requests
- Authentication errors

Mock all external AI API calls.

## Acceptance Criteria

- No unintended duplicate AI implementation remains.
- All existing AI features use the centralized service.
- Cooldown prevents repeated requests during quota limits.
- Provider fallback works within defined limits.
- Existing feature response formats remain compatible.
- Critical AI service tests pass.

## Deliverables

- Centralized AI service.
- Updated AI consumers.
- AI unit tests.
- docs/AI_SERVICE.md.
- Updated README, changelogs, and setup instructions where relevant.

STOP after Phase 1.

---

# PHASE 2 — PERFORMANCE OPTIMIZATION

## Objectives

Reduce initial loading cost and improve PWA performance.

## Initial Findings

Reported baseline:
- Main JavaScript bundle: approximately 1.37 MB.
- Compressed size: approximately 362 KB.
- Service Worker cache: approximately 3.9 MB.

Verify these values against the actual repository before optimization.

## Tasks

- Analyze bundle composition.
- Identify large dependencies.
- Implement dynamic imports.
- Implement React.lazy and Suspense where appropriate.
- Split feature modules by route or tab.
- Evaluate Vite manual chunks.
- Improve tree shaking.
- Review dependency imports.
- Optimize Service Worker cache strategy.
- Implement cache versioning.
- Handle stale chunks after deployment.
- Preserve PWA and offline behavior.

Potential lazy-loaded features:
- Nutrition
- Workout
- Planner
- Statistics
- Calendar
- AI Assistant

## Tests

- Verify lazy-loaded routes.
- Verify page navigation.
- Verify direct URL access and refresh.
- Verify chunk loading errors.
- Verify PWA installation.
- Verify offline behavior.
- Verify cache updates after deployment.

## Acceptance Criteria

- Initial bundle is reduced where practical.
- Unused feature code is not loaded unnecessarily.
- No broken routes or missing chunks.
- PWA and offline functionality remain operational.

## Deliverables

- Optimized Vite configuration.
- Updated Service Worker.
- Performance comparison report.
- Updated documentation.

STOP after Phase 2.

---

# PHASE 3 — FOOD MODULE REFACTORING

## Objectives

Break down the approximately 1,368-line food.js into maintainable modules.

Verify the current line count before refactoring.

## Tasks

Analyze and separate:
- UI Components
- Business Logic
- API Integration
- Food Parsing
- Nutrition Calculations
- Validation
- Constants
- State Management

Suggested structure:

src/
  features/
    food/
      components/
      hooks/
      services/
      utils/
      constants/
      index.js

Potential modules:
- foodService.js
- foodParser.js
- foodCalculator.js
- foodValidator.js
- foodConstants.js

Adjust the structure to match the actual project conventions.

## Requirements

- Preserve existing business logic.
- Preserve historical food records.
- Avoid circular dependencies.
- Maintain existing imports or provide compatibility exports when necessary.
- Avoid unnecessary abstractions.

## Tests

Test:
- Food parsing
- Nutrition calculations
- Validation
- Empty inputs
- Invalid inputs
- Boundary values
- Historical data handling

## Acceptance Criteria

- Responsibilities are clearly separated.
- No existing food feature is lost.
- Existing data remains compatible.
- Critical food tests pass.

## Deliverables

- Modular food architecture.
- Updated tests.
- Updated project structure documentation.

STOP after Phase 3.

---

# PHASE 4 — FIREBASE DATA ARCHITECTURE & SECURITY

## Objectives

Improve Firestore organization and Security Rules.

## Initial Findings

Some unrelated data types may currently share the settings area:
- User settings
- Planner
- Push notifications
- Expenses

Verify the actual schema before proposing changes.

## Tasks

- Audit all collections and subcollections.
- Identify ownership and access patterns.
- Review current Security Rules.
- Identify overly broad permissions.
- Separate unrelated domains where justified.
- Document all data structures.
- Apply least-privilege access.
- Validate field types and ownership.
- Review query and index requirements.

Possible domains:
- Profile
- Settings
- Planner
- Push subscriptions
- Expenses
- Nutrition
- Workouts
- Reminders

Use the existing schema as the source of truth.

## Migration Requirements

If restructuring is necessary:
- Prepare a migration plan.
- Back up existing data.
- Define old-to-new mapping.
- Prevent duplicate writes.
- Support compatibility during transition.
- Test using Firebase Emulator.
- Prepare rollback instructions.
- Obtain approval before production migration.

Never delete original data before successful verification.

## Tests

- Authenticated user access.
- Cross-user access prevention.
- Read and write permissions.
- Invalid field rejection.
- Ownership validation.
- Migration correctness.

## Acceptance Criteria

- Security Rules enforce user ownership.
- No unnecessary broad permissions remain.
- Existing user data remains safe.
- Migration is documented and reversible.

## Deliverables

- Updated Firestore architecture.
- Security Rules changes.
- docs/FIRESTORE_SCHEMA.md.
- Migration documentation.

STOP after Phase 4.

---

# PHASE 5 — AUTOMATED TESTING & RUNTIME ERROR MONITORING

## Objectives

Build a sustainable automated quality assurance system.

## 5.1 Testing Infrastructure

Use:
- Vitest
- React Testing Library where appropriate
- Firebase Emulator Suite where appropriate
- GitHub Actions

Add tests for:

- foodParser
- workoutParser
- reminderParser
- slipOcr
- sanitizer
- TDEE calculations
- Menstrual cycle statistics
- AI cooldown
- AI provider fallback
- Important validation utilities

Test normal, boundary, invalid, and error cases.

Use mocks and deterministic test fixtures.

Do not call paid external APIs in unit tests.

## 5.2 GitHub Actions CI

Create or update workflows for:
- Dependency installation
- Lint
- Unit tests
- Integration tests
- Production build
- Coverage reporting

Trigger on:
- Pull Requests targeting main.
- Pushes to main.
- Relevant release workflows.

Requirements:
- Cache dependencies.
- Avoid duplicate workflows.
- Use appropriate Node.js versions.
- Secure GitHub Actions secrets.
- Fail clearly when required checks fail.

Set reasonable coverage thresholds based on actual baseline.

## 5.3 Runtime Error Monitoring

Implement lightweight error monitoring for:
- Global JavaScript errors.
- Unhandled promise rejections.
- React Error Boundaries.
- API errors.
- AI provider errors.
- Firebase errors.
- Chunk loading errors.

Firestore logging may be used if appropriate.

Requirements:
- Rate limiting.
- Batching where useful.
- Duplicate error suppression.
- Minimal metadata.
- Privacy-safe logging.
- Dedicated Security Rules.
- Logging must never crash the application.

Do not log credentials, tokens, or sensitive health information.

## Acceptance Criteria

- CI automatically runs on relevant Git events.
- Critical unit tests are automated.
- Failed CI checks are visible.
- Runtime errors can be investigated.
- Monitoring does not create excessive Firestore writes.

## Deliverables

- Vitest configuration.
- Test suite.
- GitHub Actions workflows.
- Runtime error monitoring.
- docs/TESTING.md.

STOP after Phase 5.

---

# PHASE 6 — FIRST-TIME USER ONBOARDING

## Objectives

Make Track Me easier for new users to configure and start using.

## Proposed Steps

### Step 1: Welcome
- Brief introduction to Track Me.
- Overview of major features.

### Step 2: Profile Setup
- Basic profile information.
- Required information for relevant calculations.
- Allow optional fields to be skipped.

### Step 3: AI Setup
- Explain AI features.
- Provide API configuration instructions.
- Validate configuration when possible.
- Explain potential API costs.
- Allow users to skip this step.

### Step 4: Notifications
- Explain notification benefits.
- Request permission only after user interaction.
- Allow skipping.

### Step 5: Ready to Use
- Summarize setup.
- Navigate to Dashboard.

## UX Requirements

- Mobile-first responsive design.
- Simple navigation.
- Progress indicator.
- Back / Next / Skip.
- Persist progress.
- Resume incomplete onboarding.
- Do not repeat after completion.
- Allow later settings changes.
- Do not require AI configuration to use core features.

## Tests

- New user onboarding.
- Existing user onboarding bypass.
- Partial completion.
- Resume after reload.
- Skipped optional steps.
- Notification permission denied.
- Completed onboarding.

## Acceptance Criteria

- New users can start without configuring every feature.
- Existing users are not forced through onboarding again.
- Optional services can be configured later.

## Deliverables

- Onboarding components.
- State management.
- Tests.
- Updated setup documentation.

STOP after Phase 6.

---

# PHASE 7 — ARCHITECTURE DOCUMENTATION

## Objectives

Complete and maintain technical documentation.

## Required Documents

### docs/ARCHITECTURE.md

Document:
- System overview.
- Technology stack.
- Application architecture.
- Component organization.
- Service layer.
- Hooks and utilities.
- Data flow.
- AI architecture.
- Firebase architecture.
- PWA architecture.

### docs/PROJECT_STRUCTURE.md

Document:
- Folder structure.
- Important files.
- Module responsibilities.
- Naming conventions.
- Guidelines for new modules.

### docs/FIRESTORE_SCHEMA.md

Document:
- Collections.
- Subcollections.
- Fields and data types.
- Ownership.
- Relationships.
- Security Rules.
- Migration notes.

### docs/AI_SERVICE.md

Document:
- Provider integration.
- Model selection.
- Cooldown.
- Retry.
- Fallback.
- Error handling.
- API configuration.

### docs/TESTING.md

Document:
- Test setup.
- Running tests.
- Coverage.
- Mocking.
- CI workflow.
- Adding new tests.

### docs/DEPLOYMENT.md

Document:
- Development setup.
- Environment variables.
- Build.
- Firebase deployment.
- Hosting.
- PWA updates.
- Cache versioning.
- Rollback.

## Acceptance Criteria

- Documents match actual implementations.
- No obsolete architecture descriptions remain.
- Setup instructions are reproducible.
- Deployment steps are clear.

STOP after Phase 7.

---

# GLOBAL DELIVERY REQUIREMENTS

Apply these requirements at the end of every Phase.

## Documentation

Review and update:
- README.md
- CHANGELOG.md
- docs/changelog.md
- SETUP.md

Update only when relevant, and never describe unimplemented features as completed.

## Git

- Use Conventional Commits.
- Keep changes grouped logically.
- Use dedicated Phase branches where appropriate.
- Review Git diff before committing.
- Never force-push.
- Do not merge into main without approval.

## Versioning

Use Semantic Versioning.

Check package.json and existing Git tags before selecting a new version.

Prepare an annotated release tag for approved, completed release checkpoints.

Do not create duplicate tags or push tags without approval.

## Manual Configuration

Report any additional user actions involving:
- API keys
- Environment variables
- Firebase
- GitHub Secrets
- Firestore Rules
- Firestore Indexes
- Firebase Functions
- Hosting
- Database migration
- Deployment

## Final Report

For every Phase, provide:
- Summary
- Files changed
- Tests and CI results
- Build and lint results where applicable
- Git commit hash
- Branch
- Merge status
- Version
- Tag
- Documentation updates
- Manual configuration
- Deployment requirements
- Remaining issues

## Execution Control

Only execute the Phase explicitly requested by the user.

Do not start subsequent Phases automatically.

Wait for user approval before:
- Production deployment.
- Production database migration.
- Firebase Security Rules deployment.
- Merging into main.
- Pushing release tags.
- Publishing releases.

**The project is considered complete only when implemented changes have appropriate verification evidence and all outstanding risks are documented.**