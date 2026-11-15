# AGENTS.md — Track Me Development Rules
## ภาษาและมาตรฐานเอกสาร

- เอกสารสำหรับผู้ดูแลโปรเจกต์และผู้ใช้งานที่เป็นเจ้าของโปรเจกต์ ให้เขียนเป็นภาษาไทย
- คงชื่อไฟล์ ชื่อตัวแปร ชื่อฟังก์ชัน ชื่อ API และคำศัพท์ทางเทคนิคเป็นภาษาอังกฤษตามมาตรฐาน
- อธิบายขั้นตอนทางเทคนิคด้วยภาษาไทยที่เข้าใจง่าย
- เอกสารต้องตรงกับระบบที่ Implement และตรวจสอบแล้วจริง
- ไม่ต้องสร้างเอกสาร ARCHITECTURE.md และ DEPLOYMENT.md ล่วงหน้าหากข้อมูลยังไม่สมบูรณ์
- ให้รวบรวมข้อมูลจากแต่ละ Phase และสร้างเอกสารฉบับสมบูรณ์เมื่อระบบพร้อม
- หากมีเอกสารอยู่แล้ว ให้อัปเดตแทนการสร้างซ้ำ
- แยกสิ่งที่ Implement แล้ว สิ่งที่รอดำเนินการ และสิ่งที่ผู้ใช้ต้องตั้งค่าเองให้ชัดเจน

## 1. Project Overview

Track Me is a React + Vite + Firebase application.

The project must prioritize:
- Stability and reliability
- Performance and maintainability
- Data integrity and security
- Mobile and PWA compatibility
- Backward compatibility
- Automated quality assurance

Before making changes, inspect the actual repository structure, existing architecture, dependencies, scripts, and development conventions.

Never assume that the documented structure matches the current implementation.

## 2. Core Development Rules

1. Inspect existing code before modifying it.
2. Prefer improving existing implementations over unnecessary rewrites.
3. Preserve existing features and business logic.
4. Avoid unnecessary dependencies and abstractions.
5. Keep modules focused and maintainable.
6. Avoid duplicate API calls and duplicated business logic.
7. Handle loading, errors, empty states, and edge cases.
8. Never hardcode secrets, API keys, or credentials.
9. Do not expose sensitive user data in logs.
10. Maintain compatibility with existing user data.
11. Do not silently remove features or change existing behavior.
12. Do not introduce unrelated changes.

## 3. Incremental Execution

Development must follow `docs/implementation-plan.md`.

Execute only the Phase explicitly requested by the user.

For each Phase:
1. Inspect relevant code.
2. Identify affected files and dependencies.
3. Prepare a concise implementation plan.
4. Implement the requested changes.
5. Add or update automated tests where appropriate.
6. Perform appropriate local checks.
7. Update relevant documentation.
8. Prepare Git commits and version information.
9. Report results and outstanding issues.
10. Stop and wait for the next instruction.

Never automatically continue to the next Phase.

Do not perform risky migrations, production deployments, or security-sensitive changes without explicit approval.

## 4. Automated Testing & CI

Use automated testing as the primary quality assurance mechanism.

Preferred tools:
- Vitest for unit testing
- React Testing Library for component testing when appropriate
- Firebase Emulator Suite for Firebase integration and security testing
- GitHub Actions for CI automation

### Local Development

Do not run the entire test suite and production build after every small code edit.

Instead:
- Run targeted tests for modified logic.
- Run relevant lint checks when practical.
- Run focused integration tests for affected features.
- Avoid unnecessary repeated full builds.

### Continuous Integration

Configure GitHub Actions to automatically run:
- Dependency installation
- Lint
- Unit tests
- Integration tests where configured
- Production build
- Test coverage reporting

Run the full CI pipeline on:
- Pull Requests targeting the main branch
- Pushes to the main branch
- Release workflows when appropriate

Use dependency caching and avoid unnecessary duplicate workflow executions.

Do not report tests as passing unless the actual CI result confirms success.

If CI fails, investigate and fix the issue before considering the Phase complete.

### Testing Principles

- Test critical business logic.
- Include normal, boundary, invalid, and error cases.
- Mock external AI APIs and third-party services.
- Never call paid AI APIs in ordinary unit tests.
- Use deterministic fixtures.
- Avoid flaky tests.
- Keep test execution efficient.

## 5. Git & Branch Management

Use Conventional Commits.

Examples:
- feat(ai): centralize AI service
- fix(ai): improve quota cooldown
- refactor(food): split food modules
- perf(app): implement lazy loading
- test: add automated parser tests
- docs: update architecture documentation

Rules:
1. Inspect Git status before editing.
2. Never overwrite unrelated user changes.
3. Never discard uncommitted work.
4. Review Git diff before committing.
5. Never commit secrets, credentials, or local environment files.
6. Prefer a dedicated branch for each Phase.
7. Keep commits logically grouped.
8. Do not force-push.
9. Do not merge into main without user approval.
10. Do not push commits or tags without authorization.

Suggested branch naming:
`refactor/phase-1-ai-service`
`perf/phase-2-code-splitting`
`refactor/phase-3-food-modules`

## 6. Documentation Requirements

After each Phase, inspect and update relevant documentation.
- Required documents are maintained progressively.
- Do not create placeholder documents solely to satisfy this list.
- Create ARCHITECTURE.md and DEPLOYMENT.md when sufficient implementation details are available.
- All documentation must be written in Thai, except technical identifiers and standard technical terminology.

Required documents:

- `README.md`: Project overview, features, technology stack, and usage.
- `CHANGELOG.md`: User-facing changes and version history.
- `docs/changelog.md`: Technical changes and implementation details.
- `SETUP.md`: Installation, configuration, and development instructions.
- `docs/ARCHITECTURE.md`: System architecture.
- `docs/FIRESTORE_SCHEMA.md`: Firestore data structure and security.
- `docs/AI_SERVICE.md`: AI integration and quota management.
- `docs/DEPLOYMENT.md`: Deployment procedures and configuration.

Create missing documents when appropriate.

Do not rewrite unrelated documentation.

Documentation must reflect implemented and verified behavior, not planned or assumed functionality.

## 7. Version Management

Follow Semantic Versioning:

- PATCH: Backward-compatible fixes.
- MINOR: Backward-compatible features and improvements.
- MAJOR: Breaking changes.

At each completed Phase:
1. Inspect the current package version.
2. Inspect existing Git tags.
3. Determine whether a version increment is justified.
4. Update package.json when appropriate.
5. Update CHANGELOG.md.
6. Prepare an annotated Git tag for the completed release checkpoint.

Use the format:
`vMAJOR.MINOR.PATCH`

Never reuse an existing tag.

Only create a release tag after the corresponding changes have passed required checks and the user has approved the release checkpoint.

Do not push tags or publish releases without explicit approval.

Do not create artificial version increments for documentation-only or incomplete work unless there is a genuine release reason.

## 8. Firebase & Data Safety

- Apply least-privilege security rules.
- Validate ownership using authenticated user identity.
- Validate input fields and data types.
- Avoid broad wildcard permissions.
- Preserve existing user data.
- Never perform destructive migrations without approval.
- Prepare backup and rollback procedures before migrations.
- Test security rules using Firebase Emulator where practical.

Never deploy production Firebase Rules or Functions without authorization.

## 9. Deployment & Manual Configuration

At the end of each Phase, identify additional actions required from the user.

Classify them into:

A. Completed automatically by the Agent.

B. Manual configuration required:
- API keys
- Environment variables
- Firebase configuration
- GitHub Secrets
- External service settings

C. Deployment required:
- Firebase Hosting
- Firebase Functions
- Firestore Rules
- Firestore Indexes
- Database migrations
- PWA updates

For each action, explain:
- What needs to be done.
- Where to do it.
- Required values or commands.
- Whether deployment is necessary.
- Consequences of not completing it.

Never claim deployment success without verification.

## 10. Security & Privacy

Never log:
- API keys
- Passwords
- Authentication tokens
- Private user information
- Sensitive health data

Use environment variables or appropriate secure backend configuration.

Client-side API keys must be treated as potentially exposed.

Review dependencies and avoid introducing unnecessary security risks.

## 11. Completion Report

At the end of each Phase, report:

1. Phase completed.
2. Summary of changes.
3. Files created, modified, and deleted.
4. Automated tests and CI results.
5. Build and lint status.
6. Git branch and commit hashes.
7. Merge status.
8. Version and tag status.
9. Documentation updated.
10. Manual configuration required.
11. Deployment required.
12. Known issues and remaining tasks.

Use these statuses:
- Completed
- Partially Completed
- Not Started
- Blocked

Never claim completion without evidence.

## 12. Stop Conditions

Stop immediately when:
- The requested Phase is completed.
- A destructive operation requires approval.
- A migration may risk existing data.
- Production deployment requires approval.
- Security-sensitive changes require approval.
- Unresolved failures prevent safe completion.

Do not start another Phase unless explicitly instructed.

## 13. Final Priority

Correctness and data safety are more important than implementation speed.

Maintain the existing Track Me experience while making the codebase more stable, efficient, secure, and maintainable.