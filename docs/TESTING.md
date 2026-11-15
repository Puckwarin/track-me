# Testing, CI & Runtime Error Reports

## Local requirements

- Node.js 24.12 or newer
- Java 21 or newer for the Firestore Emulator

Install dependencies with `npm ci`, then run:

| Command | Purpose |
|---|---|
| `npm run lint` | ESLint checks for application source |
| `npm test` | Vitest unit tests; Firestore Rules tests are skipped unless the Emulator is running |
| `npm run test:coverage` | Unit tests plus text, HTML, and LCOV coverage reports in `coverage/` |
| `npm run test:rules` | Starts the Firestore Emulator and runs Rules integration tests |
| `npm run build` | Builds the production site |

Coverage thresholds are 10% statements, 8% branches, 7% functions, and 12% lines. They are regression floors, not a claim that the UI is comprehensively covered. Deterministic logic tests cover parsers, schema sanitizers, expense rules/budgets/recurrence, TDEE calculations, cycle statistics, food validation, AI fallback/cooldown, runtime monitoring, and onboarding state. Tests do not call paid or live external APIs. `src/services/aiService.test.js` has 12 active tests and no skipped tests; on a machine without the Emulator, the 5 Firestore Rules tests are skipped by the regular unit-test run.

The v4.1.0 local validation completed with 45 tests passing and 5 Firestore Rules tests skipped; ESLint reported 0 errors and the same 7 existing warnings; production build succeeded with the existing large-chunk warning (see [docs/PERFORMANCE.md](PERFORMANCE.md)). `npm run test:rules` could not run on the validation machine because no Java Runtime was installed.

Run a focused test while iterating:

```bash
npm test -- src/onboardingState.test.js
```

The onboarding tests cover first-sign-in detection, existing-account bypass, saved progress/resume, optional profile skip and validation, permission-denied handling, and completion persistence.

## GitHub Actions

`.github/workflows/build.yml` runs lint, unit tests with coverage, Firestore Rules Emulator tests, and a production build on pull requests to `main`, pushes to `main` and `integration/**`, and manual dispatch. The Pages artifact is deployed only after all checks pass on `main`. This replaces the former second Pages build workflow to avoid duplicate builds. The daily push workflow remains separate.

CI uses Node.js 24 and Java 21, caches npm dependencies and the Firebase Emulator, and uses `npm ci` so lockfile or install failures stop the check clearly. Local `npm run test:rules` also requires a Java 21+ runtime; it uses only the `track-me-rules-test` Emulator project and never production.

## Runtime error reporting and privacy

For signed-in users, the app sends a small, bounded set of runtime error reports to `users/{uid}/runtime_error_logs` when monitored errors occur. Reports contain only:

- `category` and `source` from fixed allowlists
- A sanitized error `code` (not the error message)
- `occurredAt` and server-generated `receivedAt` timestamps

The app does not send stack traces, prompts, OCR text, health/expense records, API keys, credentials, or tokens. Reports are suppressed while signed out, deduplicated for 10 minutes, limited to five per minute per browser session, buffered in memory, and flushed in batches of at most 10 while online. A failed report is dropped and logged locally by its error code; monitoring failures do not interrupt app behavior. Client-side limits reduce accidental writes but are not a server-enforced quota.

The dedicated rule in `firestore.rules` permits an authenticated owner to create allowlisted metadata only; reading, updating, and deleting these documents through the app are denied. Reports can be inspected by project administrators in Firebase Console. There is no automatic retention cleanup configured.

The repository change does not deploy Firebase Rules. Until the updated `firestore.rules` is published through the approved Firebase deployment process, runtime reports will be rejected by an older deployed ruleset; normal application features continue to work. Rules tests run against the local Emulator and never production.

## Coverage scope

The app is Vanilla JavaScript; React Testing Library and React Error Boundaries do not apply. Global browser errors, unhandled rejections, API/AI failures, Firebase sync/auth errors, and lazy chunk failures are captured by the lightweight runtime monitor instead.
