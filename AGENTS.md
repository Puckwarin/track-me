# AGENTS.md — Track Me Development Rules

## ภาษาและมาตรฐานเอกสาร

- เอกสารสำหรับผู้ดูแลโปรเจกต์และผู้ใช้งานที่เป็นเจ้าของโปรเจกต์ ให้เขียนเป็นภาษาไทย
- คงชื่อไฟล์ ชื่อตัวแปร ชื่อฟังก์ชัน ชื่อ API และคำศัพท์ทางเทคนิคเป็นภาษาอังกฤษตามมาตรฐาน
- อธิบายขั้นตอนทางเทคนิคด้วยภาษาไทยที่เข้าใจง่าย
- เอกสารต้องตรงกับระบบที่ Implement และตรวจสอบแล้วจริง ไม่เขียนถึงฟีเจอร์ที่ยังไม่ได้สร้างหรือไม่ได้ตรวจ
- หากมีเอกสารอยู่แล้ว ให้อัปเดตแทนการสร้างซ้ำ
- แยกสิ่งที่ Implement แล้ว สิ่งที่รอดำเนินการ และสิ่งที่ผู้ใช้ต้องตั้งค่าเองให้ชัดเจน

## 1. Project Overview

Track Me is a client-side web application built with **Vanilla JavaScript (ES modules) + Vite + Tailwind CSS + Firebase (Authentication & Cloud Firestore) + Vite PWA (Workbox)**, without React or a custom application backend.

Key subsystems include:
- Mobile-first personal tracking modules (`src/*.js`) with lazy-loaded heavy views/features
- Centralized client-side AI transport and fallback in `src/services/aiService.js` (`Gemini → Groq → OpenRouter`), plus AI Chat Assistant (`src/services/aiAssistant.js`, `src/services/chatRoles.js`, `src/chatWidget.js`)
- Scheduled Web Push notifications via `scripts/daily-push.mjs` and `.github/workflows/daily-push.yml`

The project must prioritize:
- Stability and reliability
- Performance and maintainability
- Data integrity and security
- Mobile and PWA compatibility
- Backward compatibility
- Automated quality assurance

Before making changes, inspect the actual repository structure, existing architecture, dependencies, scripts, and development conventions. Never assume that documented descriptions match the current implementation.

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

Execute only the task, audit, or scope explicitly requested by the user.

For each task:
1. Inspect relevant code and workflows.
2. Identify affected files and dependencies.
3. Prepare a concise implementation plan before non-trivial edits.
4. Implement only the requested changes.
5. Add or update automated tests where appropriate.
6. Perform appropriate local checks.
7. Update relevant documentation.
8. Inspect Git status/diff and version metadata when applicable.
9. Report results and outstanding issues.
10. Stop and wait for the next instruction.

Never automatically start subsequent tasks or unrequested feature work.

Do not perform risky migrations, production deployments, or security-sensitive changes without explicit approval.

## 4. Automated Testing & CI

Use automated testing and static analysis as primary quality assurance mechanisms.

Actual project tooling:
- **Vitest** (`npm test`, `npm run test:coverage`) for unit and deterministic logic tests (`src/**/*.test.js`)
- **ESLint** (`npm run lint`) for static code checks
- **Firebase Emulator Suite** (`npm run test:rules`) for Firestore Security Rules integration tests (`src/firestoreRules.test.js`)
- **Vite build** (`npm run build`) for production and PWA precache verification
- **GitHub Actions** (`.github/workflows/build.yml` and `.github/workflows/daily-push.yml`) for CI/CD and scheduled notifications

### Local Development

Do not run the entire test suite and production build after every small code edit.

Instead:
- Run targeted Vitest tests for modified logic (e.g., `npm test -- src/path/to/file.test.js`).
- Run `npm run lint` when modifying JavaScript modules.
- Run focused integration tests for affected features.
- Run full `npm test` / `npm run test:coverage` and `npm run build` at task completion.

### Continuous Integration

Actual workflows in `.github/workflows/`:
- **`build.yml`**: Triggers on `pull_request` to `main`, `push` to `main` and `integration/**`, and `workflow_dispatch`. Uses Node.js `24` with npm cache (`npm ci --no-audit --no-fund`), runs `npm run lint`, `npm run test:coverage`, sets up Java `21` (Temurin) with cached Firebase emulators and runs `npm run test:rules`, builds with `npm run build` (`VITE_VAPID_PUBLIC_KEY`), and deploys `./dist` to `github-pages` on `main` (non-PR).
- **`daily-push.yml`**: Triggers on schedule (`15 5 * * *` UTC = 12:15 น. UTC+7) and `workflow_dispatch`. Uses Node.js `22`, installs dependencies in `./scripts`, and runs `node daily-push.mjs` with repository secrets (`FIREBASE_SERVICE_ACCOUNT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

Rules:
- Keep `package.json` and `package-lock.json` in sync so `npm ci --no-audit --no-fund` succeeds in CI.
- Do not report tests or CI as passing unless actual execution confirms success.
- If CI fails, investigate and fix the root cause before considering the task complete.

### Testing Principles

- Test critical business logic (parsers, sanitizers, calculations, validation, AI service/assistant routing).
- Include normal, boundary, invalid, and error cases.
- Mock external AI APIs, Firebase, and third-party services in unit tests.
- Never call paid or live AI APIs in ordinary unit tests.
- Use deterministic fixtures and avoid flaky tests.
- Keep test execution efficient.

## 5. Git & Branch Management

Use Conventional Commits.

Examples:
- `feat(ai): expand assistant roles and model routing`
- `fix(ci): sync package-lock for npm ci`
- `refactor(food): split food modules`
- `perf(app): implement lazy loading`
- `test: add automated parser tests`
- `docs: update architecture documentation`

Rules:
1. Inspect Git status before editing (when a `.git` repository is present).
2. Never overwrite unrelated user changes.
3. Never discard uncommitted work.
4. Review Git diff before committing.
5. Never commit secrets, credentials, `.env*` files, `coverage/`, or `dist/`.
6. Prefer a dedicated feature/fix branch when developing in Git.
7. Keep commits logically grouped.
8. Do not force-push.
9. Do not merge into `main` without user approval.
10. Do not push commits or tags without authorization.

Suggested branch naming:
- `feat/<scope>`
- `fix/<scope>`
- `refactor/<scope>`
- `perf/<scope>`
- `docs/<scope>`

## 6. Documentation Requirements

After completing code or configuration changes, inspect and update relevant existing documentation:

- `README.md`: Project overview, features, technology stack, and local commands.
- `CHANGELOG.md`: User-facing changes and version history.
- `docs/CHANGELOG.md`: Technical changes and implementation summary.
- `docs/SETUP.md`: Installation, Firebase/VAPID setup, and configuration instructions.
- `docs/ARCHITECTURE.md`: System architecture and data flow.
- `docs/PROJECT_STRUCTURE.md`: Directory layout and module responsibilities.
- `docs/FIRESTORE_SCHEMA.md`: Firestore data structure, sanitizers, and security rules.
- `docs/AI_SERVICE.md`: AI integration, model routing, quota cooldown, and assistant tools.
- `docs/TESTING.md`: Testing, coverage, CI, and runtime error monitoring.
- `docs/PERFORMANCE.md`: Bundle metrics and PWA precache notes.
- `docs/FOOD_MODULES.md`: Food module boundaries (update when food modules change).
- `docs/DEPLOYMENT.md`: GitHub Pages, Firestore Rules, and Daily Push deployment procedures.

Rules:
- Do not create redundant or placeholder documents.
- Do not rewrite unrelated documentation.
- All user/maintainer documentation must be written in Thai, except technical identifiers and standard technical terminology.
- Documentation must reflect implemented and verified behavior, not planned or assumed functionality.

## 7. Version Management

Follow Semantic Versioning:
- **PATCH**: Backward-compatible fixes.
- **MINOR**: Backward-compatible features and improvements.
- **MAJOR**: Breaking changes.

When preparing or auditing a release checkpoint:
1. Inspect current versions across `package.json`, `package-lock.json`, `src/backup.js`, `README.md`, `docs/SETUP.md`, and changelogs.
2. Inspect existing Git tags (when Git is available).
3. Determine whether a version increment is justified.
4. Update version metadata and changelogs only when appropriate or approved.
5. Prepare an annotated Git tag (`vMAJOR.MINOR.PATCH`) only after required checks pass and the user approves the release checkpoint.

Never reuse an existing tag, push tags, or publish releases without explicit approval. Do not create artificial version increments for documentation-only or incomplete work unless requested.

## 8. Firebase & Data Safety

- Apply least-privilege security rules in `firestore.rules`.
- Validate ownership using authenticated user identity (`users/{uid}/...`).
- Validate input fields, document size, and data types (`firestore.rules` + `src/schema.js`).
- Avoid broad wildcard permissions; keep `firestore.rules.migration` strictly temporary during controlled migrations.
- Preserve existing user data and maintain idempotent migration behavior.
- Never perform destructive migrations without explicit approval, backup, and rollback instructions.
- Test security rules using Firebase Emulator (`npm run test:rules`) where practical.

Never deploy production Firebase Rules without authorization.

## 9. Deployment & Manual Configuration

At the end of each task, identify additional actions required from the user and classify them into:

A. Completed automatically by the Agent.

B. Manual configuration required:
- Client-side AI / nutrition API keys (`localStorage` in Settings)
- Environment variables (`VITE_VAPID_PUBLIC_KEY`)
- Firebase configuration / Authorized domains
- GitHub Secrets (`FIREBASE_SERVICE_ACCOUNT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
- External service settings

C. Deployment required:
- GitHub Pages (via `.github/workflows/build.yml` on `main`)
- GitHub Actions workflows (including `daily-push.yml`)
- Firestore Rules (`firestore.rules` must be deployed separately from web builds)
- Firestore Indexes (if new composite queries are introduced)
- Database migrations
- PWA Service Worker / cache updates

For each action, explain: what needs to be done, where to do it, required values or commands, whether deployment is necessary, and consequences of not completing it.

Never claim deployment success without verification.

## 10. Security & Privacy

Never log or expose:
- API keys
- Passwords or PINs
- Authentication tokens or Push endpoints/keys
- Private user information
- Sensitive health or financial data

Client-side API keys stored in `localStorage` must be treated as potentially exposed. Never bake secrets into Vite client code (`VITE_*` variables are public) or `dist/`. Review dependencies and sanitize untrusted data before rendering HTML or passing tool results back to AI models.

## 11. Completion Report

At the end of each task, report:

1. Task / Scope completed.
2. Summary of changes.
3. Files created, modified, and deleted.
4. Automated tests and CI results.
5. Build and lint status.
6. Git branch and commit status (if applicable).
7. Merge / push status.
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
- The requested task or audit step is completed.
- A destructive operation requires approval.
- A migration may risk existing data.
- Production deployment or Firestore Rules deployment requires approval.
- Security-sensitive changes require approval.
- Unresolved failures prevent safe completion.

Do not start another task or audit phase unless explicitly instructed.

## 13. Final Priority

Correctness and data safety are more important than implementation speed.

Maintain the existing Track Me experience while making the codebase more stable, efficient, secure, and maintainable.