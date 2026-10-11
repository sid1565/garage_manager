# Garage Repair Management — Auth & Security Foundation

- **Stage:** 3 (Okr-backend-auth-security)
- **Inputs:** `garage-repair-spec.md`, `garage-db-design.md`
- **Date:** 2026-10-08
- **Status:** implemented in `backend/` and verified by `test/e2e/auth.e2e-spec.ts` (24/24 e2e passing) and a live-server check (429, security headers, CORS).
- **Clients:** Next.js web app (now) and mobile (supported by the same API, no extra work).
- **Out of scope for v1** (spec): MFA, SSO, customer accounts.

---

## 1. Auth Flow

### Garage sign-up (UC-1) — `POST /auth/register` (public, 10/min per IP)
1. The client sends the garage details, admin name, email and password (policy: 8–72 chars, ≥1 letter, ≥1 digit).
2. The API rejects a duplicate email with 409 `EMAIL_ALREADY_REGISTERED`. Comparison ignores letter case (citext, plus a unique-violation catch for races).
3. In **one transaction**, the API creates the garage, the GARAGE_ADMIN user (bcrypt cost 12) and a `garage.registered` audit row, and starts a session.
4. It returns the session; how the refresh token is delivered depends on the platform (see below).

### Login (UC-2) — `POST /auth/login` (public, 10/min per IP)
1. The API looks up the user by email (case-insensitive).
2. **bcrypt always runs**, against a dummy hash when the user is unknown or locked, so response time doesn't reveal whether an account exists.
3. Unknown email, wrong password and locked account all return **the identical 401 `INVALID_CREDENTIALS`**.
4. Failed attempts are counted atomically in SQL. The 5th failure locks the account for 15 min and writes an `auth.account_locked` audit row.
5. Only after the password is verified: inactive user → 403 `ACCOUNT_INACTIVE`; suspended garage → 403 `GARAGE_SUSPENDED`.
6. On success: reset the counter, update `last_login_at`, write `auth.login_succeeded`, and start a new session (a new refresh **family**).

### Token delivery per platform
| | Web (`x-client-type: web`, default) | Mobile (`x-client-type: mobile`) |
|---|---|---|
| Access token | JSON body → keep **in memory only** | JSON body → memory |
| Refresh token | `Set-Cookie: gm_rt` — httpOnly, SameSite=Strict, Secure (prod), `Path=/api/v1/auth`. **Never in the body.** | JSON body → **Keychain (iOS) / Keystore (Android)**. Never AsyncStorage or localStorage. |
| Refresh call | cookie + `x-client-type: web` + allow-listed `Origin` | `{ refreshToken }` in body + `x-client-type: mobile` |

### Refresh — `POST /auth/refresh` (public + CsrfOriginGuard, 10/min per IP)
1. Lock the token row (`SELECT … FOR UPDATE`) so two parallel refreshes can't both succeed.
2. Unknown, expired or logged-out token → 401 `SESSION_REVOKED` (and the web cookie is cleared).
3. **Token already rotated (reuse)** → revoke the whole family, write `auth.refresh_reuse_detected`, return 401. Both the thief and the real user must log in again.
4. Re-check that the user is active and the garage active; otherwise revoke the family and return 401.
5. Issue a successor in the same family and mark the old token `revoked_at` + `replaced_by_id`. Return a new access token and refresh token.

### Logout
- `POST /auth/logout` (bearer): revokes the current family (`sid`) and clears the cookie. The access token dies **immediately** (per-request session check).
- `POST /auth/logout-all` (bearer): revokes every family of the user and writes an audit row.

### Temporary passwords and password change
- Staff created by an admin (UC-3) get `must_change_password = true`. Until it is changed, every route returns 403 `PASSWORD_CHANGE_REQUIRED`, except `me`, `change-password`, `logout` and `logout-all`.
- `POST /auth/change-password` (bearer, 10/min):
  1. Verify the current password (400 `CURRENT_PASSWORD_INCORRECT`).
  2. Reject reuse of the current password (400 `PASSWORD_REUSED`).
  3. Set `password_changed_at`, clear the flag and lockout, and **revoke all sessions**.
  4. Issue a fresh session for the caller.

### Password reset
- **Not in v1:** the spec has no self-service reset, and admins reset staff passwords. See Open Risks R-1.

### Vehicle owner (ACT-4) — link tokens, no login
1. Staff actions (notify, send estimate) call `CustomerLinkService.create()` inside their transaction. It generates 32 random bytes (base64url, 43 chars) and **stores only the SHA-256 hash**.
2. The owner opens `/portal/<token>`, which calls API routes decorated with `@CustomerLinkAccess(...)`.
3. `CustomerLinkGuard` checks the token:
   - malformed or unknown → 404 `LINK_NOT_FOUND`
   - expired or revoked → 410 `LINK_EXPIRED`
   - wrong purpose for the route → 403 `LINK_PURPOSE_MISMATCH`
4. If the token is valid, the guard attaches `request.customerLink` (scope = garage + job card + estimate).

---

## 2. Token Strategy

| | Access token | Refresh token | Customer link token |
|---|---|---|---|
| Format | JWT, **ES256** (ECDSA P-256), `kid` header | opaque, 256-bit random, base64url | opaque, 256-bit random, base64url |
| Claims | `sub` user id, `role`, `gid` garage id, `sid` session family, `iat`, `exp`, `iss=garage-api`, `aud=garage-clients`. **No email or PII.** | — | — |
| Lifetime | 15 min (`JWT_ACCESS_EXPIRES_IN`) | 7 days (`REFRESH_TOKEN_TTL_DAYS`), sliding via rotation | 7 days, or the estimate's `valid_until` |
| Server storage | none | `refresh_tokens.token_hash` (SHA-256), `family_id`, `expires_at`, `revoked_at`, `replaced_by_id`, ip, user-agent | `customer_access_links.token_hash`, purpose, expiry, revoked, used, last access |
| Rotation | — | every refresh; reuse → family revoked | none (single purpose) |
| Revocation | **effective immediately**: the guard checks on every request that the `sid` family has a live token, the user is active, the garage is active, and `iat ≥ password_changed_at` | logout (family), logout-all and password change (all), reuse detection (family), deactivation or suspension (refresh refused) | estimate superseded (`revokeForEstimate`), expiry |
| Cleanup | — | daily 03:00 cron deletes rows expired for more than 24 h | kept for audit |

- **Why ES256 rather than HS256:**
  - The algorithm is pinned on both sign and verify (`algorithms: ['ES256']`). The e2e tests prove that `alg=none` tokens and HS256 tokens signed with the public key are both rejected.
  - The verifying key is public, so another service could verify tokens without being able to mint them.
  - `kid` allows key rotation (R-4).
- **Keys:** `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` are base64-encoded PEMs, supplied only through env or a secret manager. The dev pair in `backend/.env` is local-only (`.env` is git-ignored). Generate a new pair with:
  ```bash
  openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out private.pem
  openssl ec -in private.pem -pubout -out public.pem
  base64 -w0 private.pem   # → JWT_PRIVATE_KEY ;  base64 -w0 public.pem → JWT_PUBLIC_KEY
  ```
- **Cost of immediate revocation:** one indexed query per authenticated request: users PK + garages PK + `EXISTS` on the `refresh_tokens(family_id)` index. That is well under 1 ms at NFR-1 scale. If needed later, cache it for at most 30 s (R-5).

---

## 3. Role & Scope Taxonomy (the contract for Okr-api-designer)

"Scopes" in this project are **sections**: values of `EUserModule` (garage staff) and `EAdminModule` (platform). Each protected endpoint gets exactly one `@Section(...)`. The role → section matrix lives in `backend/src/common/constants/section-permissions.ts` and is **default-deny**: a role absent from the matrix gets nothing.

## Roles
| Role | Description |
|---|---|
| PLATFORM_ADMIN | SaaS operator; no garage; only `EAdminModule` sections (suspend or reactivate garages) |
| GARAGE_ADMIN | Owns one garage; every `EUserModule` section, including staff, settings, revenue, audit, delivery on credit |
| SERVICE_ADVISOR | Front desk; customers, vehicles, jobs, estimates, notifications, invoicing. **No** staff management, settings changes, revenue, audit or delivery on credit |
| MECHANIC | Workshop; reads customers, vehicles, jobs and estimates; records diagnosis; limited status updates on **assigned** jobs only |
| Vehicle owner (link) | Unauthenticated customer reached by link token; only `@CustomerLinkAccess` routes, limited to that link's job and estimate |
| Public | Anonymous: `register`, `login`, `refresh` (cookie or body token), `health` |

## Scopes
| Scope (section) | Description | GARAGE_ADMIN | SERVICE_ADVISOR | MECHANIC |
|---|---|:-:|:-:|:-:|
| GARAGE_PROFILE_VIEW | Read own garage profile and settings | ✓ | ✓ | ✓ |
| GARAGE_PROFILE_MANAGE | Edit garage profile, tax rate, timezone | ✓ | | |
| STAFF_VIEW | List staff (e.g. mechanic picker) | ✓ | ✓ | |
| STAFF_MANAGE | Create, edit, deactivate staff; reset passwords (UC-3) | ✓ | | |
| CUSTOMERS_VIEW | Search and read customers | ✓ | ✓ | ✓ |
| CUSTOMERS_MANAGE | Create, edit, deactivate customers (UC-4, UC-7) | ✓ | ✓ | |
| VEHICLES_VIEW | Search and read vehicles and service history (UC-6) | ✓ | ✓ | ✓ |
| VEHICLES_MANAGE | Create, edit, transfer, deactivate vehicles (UC-5, UC-7) | ✓ | ✓ | |
| JOB_CARDS_VIEW | Read jobs, problems, attachments, status history | ✓ | ✓ | ✓ |
| JOB_CARDS_MANAGE | Open job cards and edit check-in data (UC-8) | ✓ | ✓ | |
| JOB_ASSIGN | Assign a mechanic (UC-14) | ✓ | ✓ | |
| JOB_STATUS_UPDATE | Change job status (UC-13); mechanic is row-limited (see ownership) | ✓ | ✓ | ✓ |
| DIAGNOSIS_RECORD | Add, edit, remove problems and photos (UC-9) | ✓ | ✓ | ✓ |
| ESTIMATES_VIEW | Read estimates | ✓ | ✓ | ✓ |
| ESTIMATES_MANAGE | Create, edit and send estimates (UC-11) | ✓ | ✓ | |
| ESTIMATES_VERBAL_APPROVAL | Record an owner's verbal approval with a note (UC-12 2a) | ✓ | ✓ | |
| NOTIFICATIONS_VIEW | Notification log (UC-16) | ✓ | ✓ | |
| NOTIFICATIONS_SEND | Notify owner, retry failed (UC-10, UC-16) | ✓ | ✓ | |
| INVOICES_VIEW | Read invoices | ✓ | ✓ | |
| INVOICES_MANAGE | Generate invoices, add items and discount (UC-15) | ✓ | ✓ | |
| PAYMENTS_RECORD | Record payments (UC-15) | ✓ | ✓ | |
| DELIVER_ON_CREDIT | Mark DELIVERED with an unpaid balance (UC-15 4a) | ✓ | | |
| DASHBOARD_VIEW | Job counts and queues (UC-17) | ✓ | ✓ | ✓ |
| DASHBOARD_REVENUE | Revenue figures on the dashboard (AC-17.2) | ✓ | | |
| AUDIT_LOG_VIEW | Read the garage audit log | ✓ | | |
| `EAdminModule.GARAGE_MANAGEMENT` | Suspend or reactivate garages (UC-19). PLATFORM_ADMIN only | | | |

**Assignment rules for stage 4**
- One `@Section` per endpoint.
- A read endpoint uses the `_VIEW` section; a write endpoint uses `_MANAGE` or the specific action section.
- An endpoint whose response contains revenue fields must check `DASHBOARD_REVENUE` in the service and omit those fields, rather than add a second section.
- Self-service routes (`/auth/me`, `change-password`, `logout*`) have **no** `@Section`: they need authentication only.
- If no section fits, route back to the auth stage. Don't invent one.

## Ownership Rules
| Rule | Meaning |
|---|---|
| tenant:same-garage | **Every** garage-scoped read and write filters by `requireGarageId(currentUser)` (`common/utils/tenant.util.ts`) — never by a garage id from the URL, body or query. Child rows without `garage_id` (problems, estimates, line items, history) are reached through their job card, whose `garage_id` is checked. A resource from another garage returns **404, not 403**, so its existence isn't revealed (NFR-3, AC-NFR-3). |
| assigned-mechanic | A MECHANIC may record diagnosis (UC-9) and change status (UC-13) only when `job_card.assigned_mechanic_id = currentUser.id`, and may only make the transition IN_PROGRESS → QUALITY_CHECK. Otherwise → 403 (AC-9.2, AC-13.3). Enforced in the service. |
| self-only | `/auth/me`, `change-password` and `logout*` act only on `currentUser.id` and `currentUser.sessionId`. Staff endpoints that edit a user must block self-deactivation and demoting the last GARAGE_ADMIN (AC-3.4). |
| link-scoped | Portal handlers read scope **only** from `@CurrentCustomerLink()` (`garageId`, `jobCardId`, `estimateId`). Any id in the URL or body that differs → 404. Staff JWTs are never accepted on portal routes. |
| link-purpose | View routes: `@CustomerLinkAccess(VIEW_JOB, APPROVE_ESTIMATE)`. Approve or reject routes: `@CustomerLinkAccess(APPROVE_ESTIMATE)` only (AC-12.8). After approval, call `markUsed()`; the link stays valid for viewing. |
| platform-only | `EAdminModule` sections: PLATFORM_ADMIN, `garageId = null`; no access to garage data. |

---

## 4. Guard Architecture

Execution order for every request (global guards via `APP_GUARD`, in `app.module.ts`):

```
ThrottlerGuard ──► UserAuthGuard ──► SectionGuard ──► [route guards: CsrfOriginGuard | CustomerLinkGuard] ──► ValidationPipe ──► handler
     429             401 / 403           403                      400 / 403 / 404 / 410                         400
```

| Guard | Where | Validates | Failure → `errorCode` |
|---|---|---|---|
| `ThrottlerGuard` | global | 100 req/min per IP (`THROTTLE_LIMIT`); `@Throttle(AUTH_THROTTLE)` 10/min; `PORTAL_THROTTLE` 30/min | 429 `TOO_MANY_REQUESTS` |
| `UserAuthGuard` (`core/guards`) | global; skipped by `@Public()` | Bearer present; ES256 signature, `exp`, `iss`, `aud`; principal query: user exists and ACTIVE, garage ACTIVE (unless PLATFORM_ADMIN), session family alive, `iat ≥ password_changed_at`; `must_change_password` unless `@AllowPasswordChangeRequired()` | 401 `UNAUTHENTICATED` / `TOKEN_EXPIRED` (client should refresh) / `TOKEN_INVALID` / `SESSION_REVOKED` (client should re-login); 403 `ACCOUNT_INACTIVE` / `GARAGE_SUSPENDED` / `PASSWORD_CHANGE_REQUIRED` |
| `SectionGuard` (`core/guards`) | global | `@Section(x)` ∈ `SECTION_PERMISSIONS[role]`; no `@Section` → authentication only | 403 `FORBIDDEN_SECTION` |
| `CsrfOriginGuard` (`core/guards`) | `@UseGuards` on `/auth/refresh` | `x-client-type` is `web` or `mobile`; for web, `Origin` ∈ `CORS_ORIGINS` | 400 `CLIENT_TYPE_REQUIRED`, 403 `CSRF_REJECTED` |
| `CustomerLinkGuard` (`customer-links/guards`) | only via `@CustomerLinkAccess(...)` | `:token` format, hash lookup, not expired or revoked, purpose allowed | 404 `LINK_NOT_FOUND`, 410 `LINK_EXPIRED`, 403 `LINK_PURPOSE_MISMATCH` |

Errors use the standard envelope (`HttpExceptionFilter`), with i18n messages and no stack traces:
```json
{ "statusCode": 401, "errorCode": "TOKEN_EXPIRED", "message": "Your session has expired, please refresh", "timestamp": "…", "path": "/api/v1/…" }
```

**Building blocks for stage 4 and later:**
- **Controller decorators:**
  - `@Public()` for anonymous routes; avoid it, and prefer `@CustomerLinkAccess` for portal routes.
  - `@Section(EUserModule.X)` on every protected route.
  - `@CurrentUser() user: IAuthUser`, which provides `{ id, email, role, garageId, sessionId }`.
  - `@AllowPasswordChangeRequired()` for self-service routes only.
  - `@CustomerLinkAccess(...purposes)` + `@CurrentCustomerLink()` for portal routes.
  - `@Throttle(AUTH_THROTTLE | PORTAL_THROTTLE)` for extra rate limiting.
- **Services and helpers:**
  - `requireGarageId(user)` for tenant scoping.
  - `PasswordService.hash()` — the staff module creates temporary passwords and sets `mustChangePassword: true`.
  - `TokenService.revokeAllForUser(userId, manager)` on staff deactivation or role change.
  - `CustomerLinkService.create()` / `revokeForEstimate()` / `markUsed()` inside the business transaction.
  - `AuditService.record(entry, manager)` together with the change it describes.
  - `@IsAppPassword()` for any DTO field that sets a password.

---

## 5. Security Hardening Rules (apply to every endpoint)

| Area | Rule (implemented value) |
|---|---|
| Transport | TLS everywhere in prod; HSTS `max-age=15552000; includeSubDomains` (helmet). `COOKIE_SECURE=true` is **required** in prod: env validation refuses to boot without it. |
| Secure headers | `helmet()` defaults: CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy: no-referrer`, no `X-Powered-By`. |
| CORS | Explicit allow-list (`CORS_ORIGINS`), `credentials: true`, methods GET/POST/PATCH/PUT/DELETE, allowed headers `Authorization, Content-Type, Accept-Language, X-Client-Type, X-Correlation-Id`. Never `*`. Verified: a preflight from an unlisted origin gets no allow header. |
| CSRF | Bearer-header routes are not CSRF-exposed. The only cookie route (`/auth/refresh`) requires the `x-client-type` custom header (forces a CORS preflight) plus an allow-listed `Origin`, with `SameSite=Strict` and `Path=/api/v1/auth` on the cookie. Deploy web and API on the same registrable domain (e.g. `app.example.com` and `api.example.com`) so SameSite=Strict cookies flow. |
| Rate limits | Global 100/min per IP; auth routes 10/min (AC-2.6, verified live: 11th → 429); portal 30/min (NFR-5). Set `TRUST_PROXY` behind a load balancer, or every client shares one IP bucket. |
| Brute force | Per-account lock after 5 failures for 15 min (`LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`); per-IP throttle; constant-time path for unknown users. |
| Passwords | bcrypt cost 12 (`BCRYPT_ROUNDS`, min 10); 8–72 chars with a letter and a digit (`@IsAppPassword`); >72 rejected, not truncated; `password_hash` is `select:false`. |
| Input | Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`); `UUIDValidationPipe` on every id param; `@MaxLength` matching column sizes; list `order` keys must be **whitelisted per endpoint** (never pass raw keys to TypeORM). |
| Object-level authorisation | `tenant:same-garage` on every query; cross-garage → 404. This is the main defence against OWASP API1 (BOLA); the test stage must cover the AC-NFR-3 matrix. |
| Mass assignment | DTOs list only allowed fields. Never spread request bodies into entities. `garageId`, `role`, `status` and money totals are always set server-side. |
| Data exposure | Response DTOs never include `passwordHash`, token hashes or other garages' data. Portal responses exclude staff-internal fields (AC-12.1). JWTs carry no PII. |
| Secrets | Only env or a secret manager (AWS Secrets Manager / Vault / Doppler) in prod. `.env` is git-ignored. Rotate the JWT key pair with a new `JWT_KEY_ID` (R-4). |
| Audit | Login success, failure and lockout, refresh-reuse detection, logout-all, password change and garage registration are recorded. Business actions follow NFR-7 (same transaction). |
| Logging | Never log tokens, passwords or `Authorization` / `Cookie` headers. `LoggingInterceptor` logs method, path, status, latency and correlation id only. |
| **Static analysis (release-blocking)** | ESLint with **`eslint-plugin-security` (`plugin:security/recommended-legacy`)**, `no-console`, `no-explicit-any`, `no-floating-promises`, `import/no-cycle`. `npm run lint:check` must pass with **zero errors and zero warnings** in auth-adjacent code, and must be a **blocking CI step** for this and every future project. Current state: 0 errors, 0 warnings. |

---

## Threats Mitigated

| Threat (OWASP) | Control |
|---|---|
| API1 Broken Object Level Authorisation | `tenant:same-garage` + 404 policy; `link-scoped` portal; `assigned-mechanic` |
| API2 / A07 Broken Authentication | ES256 + pinned alg/iss/aud; 15-min access tokens; rotating refresh with reuse detection; lockout; uniform 401; constant-time login; per-request session validation |
| API3 Broken Object Property Level Authorisation | whitelisting ValidationPipe; server-set `garageId`/`role`/totals; response DTOs without secrets |
| API4 Unrestricted Resource Consumption | global, auth and portal throttles; bcrypt input capped at 72; body limit 100 kB (Nest default); pagination `limit ≤ 100` |
| API5 Broken Function Level Authorisation | default-deny `SectionGuard` matrix; global auth guard (opt-out, not opt-in) |
| A01 / CSRF | SameSite=Strict, path-scoped cookie; custom header + Origin allow-list on the only cookie route |
| A02 Cryptographic Failures | bcrypt-12; SHA-256 at rest for refresh and link tokens; 256-bit random tokens; TLS + HSTS; no custom crypto (`crypto`, `bcrypt`, `jsonwebtoken`) |
| A03 Injection | parameterised queries only; validated UUID params; order-key whitelisting rule |
| A05 Security Misconfiguration | helmet; CORS allow-list; Swagger off in prod; env validation (prod requires Secure cookies; keys must be base64 PEM) |
| XSS → token theft | refresh token is httpOnly; access token in memory only; strict CSP |
| A09 Logging & Monitoring | auth audit events; correlation ids; no secrets in logs |
| Stolen link / link enumeration | 2^256 search space; hash-only storage; expiry and revocation; purpose scoping; portal rate limit |

## Open Risks / Follow-ups

| # | Risk | Recommendation | Owner |
|---|---|---|---|
| R-1 | No self-service password reset: a locked-out GARAGE_ADMIN with no other admin can't recover | Add `password_reset_tokens` (hashed, 30 min, single use) plus forgot/reset endpoints that always return 202 → schema addition | spec-writer (new UC) → database-architect |
| R-2 | Account lockout lets an attacker lock a known user out for 15 min | Acceptable for v1 (IP throttle limits the rate). Later: email the user on lock; progressive delays instead of a hard lock | auth (v2) |
| R-3 | Signup returns 409 for existing emails (account enumeration via register), required by AC-1.2 | Throttled at 10/min. If it becomes a concern: email-verification signup that always returns 202 | product decision |
| R-4 | Single signing key; no automated rotation | Support a `JWT_PUBLIC_KEY_PREVIOUS` verify list keyed by `kid`; rotate every 90 days | auth (follow-up) |
| R-5 | Per-request principal query adds one DB round-trip | Fine at NFR-1 scale. If needed, cache for ≤ 30 s and accept that revocation takes up to 30 s | service layer, if profiling demands |
| R-6 | Two tabs refreshing at once: the second one hits reuse detection and logs the user out | Frontend must make refresh single-flight (one shared in-flight promise, plus BroadcastChannel across tabs) | frontend |
| R-7 | No MFA for GARAGE_ADMIN / PLATFORM_ADMIN | Add TOTP for admins in v2 (schema: `users.mfa_secret_enc`, recovery codes) | spec-writer (v2) |
| R-8 | Login CSRF (an attacker logs the victim into the attacker's account) | Low impact (staff app). Could apply `CsrfOriginGuard` to login and register too | auth (optional) |
| R-9 | Upload endpoints (UC-9) are a new attack surface | Stage 4/5: validate magic bytes (not just the extension), 5 MB cap (DB check exists), random storage keys, serve through signed URLs with `Content-Disposition: attachment` | api-designer + service layer |

**Schema additions made in this stage** (routed back to Okr-database-architect and applied): migration `1791448770061-AuthHardening` adds `users.failed_login_attempts`, `users.locked_until` and `users.must_change_password`. The drift check is clean.
