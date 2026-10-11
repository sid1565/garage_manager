# Garage Repair Management — Database Design

- **Stage:** 2 (Okr-database-architect) · **Input:** `output/garage-repair-spec.md` · **Date:** 2026-10-08
- **Implemented in:** `backend/src/modules/*/entities/*.entity.ts` (18 entities) + `backend/src/core/database/migrations/1791448325341-InitialSchema.ts`

## Summary

**Engine**
- PostgreSQL 18, already the given stack.
- The data is highly relational (garage → customer → vehicle → job → estimate/invoice).
- Money and status changes need transactions and constraints.
- Partial unique indexes and trigram search are available natively.

**Key decisions**
- **Shared-schema multi-tenancy.** Every table that is queried directly by garage has a `garage_id` column. Composite indexes lead with `garage_id`, so every tenant-scoped query is an index range scan (NFR-3).
- **The database enforces business invariants, not just the service:**
  - one open job per vehicle (partial unique index)
  - one SENT estimate per job
  - a verbal approval must have a note
  - `PLATFORM_ADMIN` ⇔ no garage
  - payments must be greater than 0
  - amount paid ≤ invoice total
- **Money is `NUMERIC(12,2)`, exposed as strings** through a transformer, so floating-point maths is never applied (NFR-6). Invoice balance is derived (`total − amount_paid`), not stored.
- **History is never hard-deleted.** Customers, vehicles and users use `status` for soft delete. Jobs, estimates, invoices, payments, history and audit rows are kept forever, which is why their foreign keys are `RESTRICT`.
- **Native Postgres enums with stable names** (`job_card_status`, …). Enums used by several tables share one type, for example `record_status`.
- **Relations are mapped one way only** (many-to-one, plus an explicit `*_id` column). This avoids import cycles between entity files (`import/no-cycle` lint rule). Services load child collections with explicit queries.

**Assumptions**
- Year-scoped numbering: `JOB-2026-000123`. The sequence resets each year, tracked per garage in `garage_counters`.
- A job card snapshots `customer_id` at check-in, so service history stays correct after a vehicle transfer.
- The notification table doubles as the send queue (spec A-4); no Redis.
- Problems may be hard-deleted until they are linked to a sent estimate (UC-9 1a). That rule is enforced in the service.

## ER Diagram (Textual)

```
[garages] 1---* [users]                 (garage_id NULL only for PLATFORM_ADMIN)
[garages] 1---* [garage_counters]
[users]   1---* [refresh_tokens]
[garages] 1---* [customers] 1---* [vehicles]
[vehicles] 1---* [job_cards] *---1 [customers]     (owner snapshot at check-in)
[job_cards] *---1 [users]  (assigned_mechanic, opened_by)
[job_cards] 1---* [job_status_history]
[job_cards] 1---* [problems] 1---* [attachments]   (attachments also *---1 job_cards)
[job_cards] 1---* [estimates] 1---* [estimate_line_items] *---1 [problems]
[job_cards] 1---* [customer_access_links] *---1 [estimates]   (APPROVE_ESTIMATE links)
[job_cards] 1---1 [invoices] 1---* [invoice_line_items] *---1 [estimate_line_items]
[invoices]  1---* [payments]
[garages]   1---* [notifications] *---1 [customers], *---1 [job_cards]
[garages]   1---* [audit_logs] *---1 [users]
```

## Table Definitions

Conventions apply to every table unless stated otherwise:
- `id uuid PK DEFAULT gen_random_uuid()` and `created_at timestamptz NOT NULL DEFAULT now()`.
- Mutable tables also have `updated_at timestamptz`. Append-only tables (`refresh_tokens`, `job_status_history`, `attachments`, `customer_access_links`, `invoice_line_items`, `payments`, `audit_logs`) have no `updated_at`.
- Money means `numeric(12,2)`.

### `garages` (ENT-1)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| name | varchar(150) | NOT NULL | |
| address_line, city, state, postal_code | varchar | NULL | |
| phone | varchar(20) | NOT NULL | |
| email | varchar(255) | NULL | |
| tax_registration_number | varchar(30) | NULL | GSTIN etc. |
| currency | char(3) | NOT NULL DEFAULT 'INR' | ISO 4217 |
| tax_rate | numeric(5,2) | NOT NULL DEFAULT 0 | flat % (A-5) |
| timezone | varchar(64) | NOT NULL DEFAULT 'Asia/Kolkata' | reminders, dashboard "today" |
| status | garage_status | NOT NULL DEFAULT 'ACTIVE' | ACTIVE / SUSPENDED (UC-19) |

### `garage_counters`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| garage_id | uuid | FK → garages CASCADE | |
| counter_type | counter_type | NOT NULL | JOB_CARD / INVOICE |
| period | smallint | NOT NULL | year |
| last_value | integer | NOT NULL DEFAULT 0 | locked with `FOR UPDATE` when incremented |
| | | UNIQUE (garage_id, counter_type, period) | |

### `users` (ENT-2: staff and platform admins)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| garage_id | uuid | FK → garages RESTRICT, NULL | |
| name | varchar(120) | NOT NULL | |
| email | **citext** | UNIQUE | unique regardless of letter case, across the whole platform |
| phone | varchar(20) | NULL | |
| password_hash | varchar(255) | NOT NULL, `select:false` | bcrypt |
| role | user_role | NOT NULL | PLATFORM_ADMIN / GARAGE_ADMIN / SERVICE_ADVISOR / MECHANIC |
| status | record_status | DEFAULT 'ACTIVE' | |
| last_login_at, password_changed_at | timestamptz | NULL | `password_changed_at` invalidates older tokens |
| | | CHECK `(role='PLATFORM_ADMIN') = (garage_id IS NULL)` | |

### `refresh_tokens` (ENT-16)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| user_id | uuid | FK → users CASCADE | |
| token_hash | char(64) | UNIQUE | SHA-256 hex |
| family_id | uuid | NOT NULL | shared by all rotations of one login; a reused token revokes the whole family (AC-2.5) |
| expires_at | timestamptz | NOT NULL | |
| revoked_at | timestamptz | NULL | |
| replaced_by_id | uuid | NULL | set on rotation |
| created_by_ip | varchar(45) | NULL | IPv6-safe |
| user_agent | varchar(255) | NULL | |

### `customers` (ENT-3)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| garage_id | uuid | FK → garages RESTRICT | |
| name | varchar(120) | NOT NULL | trigram-indexed |
| phone | varchar(20) | NOT NULL, UNIQUE (garage_id, phone) | E.164; dedupe (AC-4.2) |
| email | varchar(255) | NULL | |
| address, notes | text | NULL | |
| preferred_channels | notification_channel[] | NOT NULL | {SMS, EMAIL} |
| status | record_status | DEFAULT 'ACTIVE' | |

### `vehicles` (ENT-4)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| garage_id | uuid | FK → garages RESTRICT | |
| customer_id | uuid | FK → customers RESTRICT | current owner |
| registration_number | varchar(20) | UNIQUE (garage_id, registration_number) | normalised; trigram-indexed |
| vin | varchar(17) | NULL | |
| make, model | varchar(60) | NOT NULL | |
| variant | varchar(60) | NULL | |
| manufacture_year | smallint | NULL | |
| fuel_type | fuel_type | NOT NULL | |
| color | varchar(30) | NULL | |
| odometer_km | integer | DEFAULT 0, CHECK ≥ 0 | |
| next_service_date | date | NULL | UC-18 |
| last_reminder_sent_for | date | NULL | reminder de-duplication (AC-18.1) |
| status | record_status | DEFAULT 'ACTIVE' | |

### `job_cards` (ENT-5)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| garage_id | uuid | FK → garages RESTRICT | |
| vehicle_id | uuid | FK → vehicles RESTRICT | |
| customer_id | uuid | FK → customers RESTRICT | owner snapshot |
| job_number | varchar(20) | UNIQUE (garage_id, job_number) | |
| status | job_card_status | DEFAULT 'CHECKED_IN' | spec §3.1 |
| checkin_odometer_km | integer | CHECK ≥ 0 | |
| fuel_level | fuel_level | NULL | |
| customer_complaints | text | NOT NULL | |
| promised_delivery_at | timestamptz | NULL | |
| assigned_mechanic_id | uuid | FK → users SET NULL, NULL | |
| opened_by_id | uuid | FK → users RESTRICT | |
| closed_at | timestamptz | NULL | |
| delivered_on_credit | boolean | DEFAULT false | UC-15 4a |
| cancellation_reason | text | NULL | |
| | | UNIQUE (vehicle_id) WHERE status NOT IN (DELIVERED, CANCELLED) | AC-8.2 |

### `job_status_history` (ENT-10, append-only)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| job_card_id | uuid | FK → job_cards CASCADE | |
| from_status | job_card_status | NULL | NULL for the first row |
| to_status | job_card_status | NOT NULL | |
| changed_by_id | uuid | FK → users RESTRICT, NULL | NULL = system or customer link |
| note | text | NULL | |

### `problems` (ENT-6)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| job_card_id | uuid | FK → job_cards CASCADE | |
| title | varchar(150) | NOT NULL | |
| description | text | NULL | |
| severity | problem_severity | NOT NULL | LOW…CRITICAL |
| category | problem_category | NOT NULL | ENGINE, BRAKES, … (UC-17 top categories) |
| requires_new_estimate | boolean | DEFAULT false | UC-9 1b |
| recorded_by_id | uuid | FK → users RESTRICT | |

### `attachments` (ENT-7, append-only)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| job_card_id | uuid | FK → job_cards CASCADE | |
| problem_id | uuid | FK → problems SET NULL, NULL | |
| storage_key | varchar(500) | NOT NULL | driver-specific key |
| original_name | varchar(255) | NOT NULL | |
| mime_type | varchar(100) | NOT NULL | allow-list enforced in service |
| size_bytes | integer | CHECK 0 < size ≤ 5 MB | NFR-8 |
| caption | varchar(255) | NULL | |
| uploaded_by_id | uuid | FK → users RESTRICT | |

### `estimates` (ENT-8)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| job_card_id | uuid | FK → job_cards RESTRICT | |
| version | smallint | UNIQUE (job_card_id, version) | |
| status | estimate_status | DEFAULT 'DRAFT' | |
| subtotal, tax_amount, total | money | DEFAULT 0, CHECK ≥ 0 | server-computed |
| tax_rate | numeric(5,2) | NOT NULL | snapshot of the garage rate |
| approved_total | money | NULL | AC-12.3 |
| valid_until, sent_at, responded_at | timestamptz | NULL | |
| customer_remark | text | NULL | |
| approval_method | approval_method | NULL | CUSTOMER_LINK / VERBAL |
| verbal_approval_note | text | CHECK required when VERBAL | AC-12.9 |
| created_by_id | uuid | FK → users RESTRICT | |
| responded_by_staff_id | uuid | FK → users RESTRICT, NULL | verbal approvals |
| | | UNIQUE (job_card_id) WHERE status = 'SENT' | UC-11 3a |

### `estimate_line_items` (ENT-9)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| estimate_id | uuid | FK → estimates CASCADE | |
| problem_id | uuid | FK → problems SET NULL, NULL | |
| item_type | line_item_type | NOT NULL | PART / LABOUR |
| description | varchar(255) | NOT NULL | |
| quantity | numeric(10,2) | CHECK > 0 | |
| unit_price | money | CHECK ≥ 0 | |
| line_total | money | NOT NULL | server-computed |
| approval_state | line_item_approval | DEFAULT 'PENDING' | |
| sort_order | smallint | DEFAULT 0 | |

### `customer_access_links` (ENT-12, append-only apart from timestamps)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| garage_id | uuid | FK → garages RESTRICT | |
| job_card_id | uuid | FK → job_cards CASCADE | |
| estimate_id | uuid | FK → estimates CASCADE, NULL | |
| purpose | link_purpose | NOT NULL | VIEW_JOB / APPROVE_ESTIMATE |
| token_hash | char(64) | UNIQUE | SHA-256 of a 256-bit token |
| expires_at | timestamptz | NOT NULL | |
| revoked_at, used_at, last_accessed_at | timestamptz | NULL | |
| | | CHECK `(purpose='APPROVE_ESTIMATE') = (estimate_id IS NOT NULL)` | |

### `notifications` (ENT-11, also the send queue)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| garage_id | uuid | FK → garages RESTRICT | |
| customer_id | uuid | FK → customers RESTRICT, NULL | NULL for staff mail |
| job_card_id | uuid | FK → job_cards RESTRICT, NULL | |
| type | notification_type | NOT NULL | JOB_CHECKED_IN, PROBLEMS_FOUND, … |
| channel | notification_channel | NOT NULL | |
| recipient | varchar(255) | NOT NULL | address captured at send time |
| subject | varchar(255) | NULL | |
| body | text | NOT NULL | rendered content |
| status | notification_status | DEFAULT 'QUEUED' | QUEUED / SENDING / SENT / FAILED |
| attempts | smallint | DEFAULT 0 | max 3 |
| next_attempt_at | timestamptz | DEFAULT now() | backoff |
| last_error | text | NULL | |
| provider_message_id | varchar(255) | NULL | |
| sent_at | timestamptz | NULL | |
| created_by_id | uuid | FK → users RESTRICT, NULL | |

### `invoices` (ENT-13)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| garage_id | uuid | FK → garages RESTRICT | |
| job_card_id | uuid | FK → job_cards RESTRICT, UNIQUE | one invoice per job (AC-15.5) |
| invoice_number | varchar(20) | UNIQUE (garage_id, invoice_number) | |
| status | invoice_status | DEFAULT 'UNPAID' | |
| subtotal, tax_amount, total | money | NOT NULL | |
| discount | money | DEFAULT 0, CHECK 0 ≤ discount ≤ subtotal | |
| tax_rate | numeric(5,2) | NOT NULL | snapshot |
| amount_paid | money | DEFAULT 0, CHECK 0 ≤ amount_paid ≤ total | AC-15.3 backstop |
| issued_at | timestamptz | NOT NULL | |
| notes | text | NULL | |
| created_by_id | uuid | FK → users RESTRICT | |

### `invoice_line_items` (append-only snapshot)
Same shape as `estimate_line_items`, without `approval_state` and `problem_id`. It adds `source_estimate_line_item_id` (FK → estimate_line_items SET NULL, NULL for extra items added at invoicing).

### `payments` (ENT-14, append-only)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| garage_id | uuid | FK → garages RESTRICT | copied from the invoice for revenue queries |
| invoice_id | uuid | FK → invoices RESTRICT | |
| amount | money | CHECK > 0 | |
| method | payment_method | NOT NULL | CASH / CARD / UPI / BANK_TRANSFER / OTHER |
| reference | varchar(100) | NULL | |
| received_at | timestamptz | NOT NULL | |
| received_by_id | uuid | FK → users RESTRICT | |

### `audit_logs` (ENT-15, append-only)
| Column | Type | Constraints | Notes |
|---|---|---|---|
| garage_id | uuid | FK → garages RESTRICT, NULL | NULL = platform action |
| actor_type | actor_type | NOT NULL | STAFF / CUSTOMER / SYSTEM |
| actor_user_id | uuid | FK → users RESTRICT, NULL | |
| action | varchar(80) | NOT NULL | e.g. `job_card.status_changed` |
| entity_type | varchar(50) | NOT NULL | |
| entity_id | uuid | NULL | |
| changes | jsonb | NULL | `{before, after}`, never secrets |
| ip_address | varchar(45) | NULL | |

## Relationships

`ON UPDATE CASCADE` is set everywhere; it is harmless because UUID keys never change. Delete behaviour:

- **`RESTRICT` (default):** every reference to `garages`, `customers`, `vehicles`, `job_cards`, `estimates` (from invoices), `invoices` and `users`.
  - Records with history are never hard-deleted (NFR-11), so any accidental delete fails loudly instead of cascading through financial history.
- **`CASCADE`:** child rows that only have meaning with their parent.
  - `job_status_history`, `problems`, `attachments` and `customer_access_links` → `job_cards`
  - `estimate_line_items` → `estimates`
  - `invoice_line_items` → `invoices`
  - `refresh_tokens` → `users`
  - `garage_counters` → `garages`
- **`SET NULL`:** optional links where the row should outlive its target.
  - `job_cards.assigned_mechanic_id`
  - `attachments.problem_id`
  - `estimate_line_items.problem_id` (a problem deleted during diagnosis)
  - `invoice_line_items.source_estimate_line_item_id`

## Index Strategy

Terms used below:
- **Composite index:** an index on several columns, used left to right.
- **Partial index:** covers only the rows matching a `WHERE` clause.
- **GIN trigram index:** speeds up `ILIKE '%text%'` searches by indexing 3-letter fragments.

| Table | Index | Type | Justifying query pattern |
|---|---|---|---|
| users | email (UNIQUE) | B-tree (citext) | login lookup (UC-2) |
| users | (garage_id, role) | B-tree | staff list; mechanic picker (UC-3, UC-14) |
| refresh_tokens | token_hash (UNIQUE) | B-tree | refresh lookup |
| refresh_tokens | user_id / family_id | B-tree | revoke all for a user; revoke a family on reuse |
| garage_counters | (garage_id, counter_type, period) UNIQUE | B-tree | `SELECT … FOR UPDATE` on number generation |
| customers | (garage_id, phone) UNIQUE | B-tree | dedupe and phone search (UC-4, UC-6) |
| customers | (garage_id, status, created_at) | B-tree | default customer list |
| customers | name gin_trgm_ops | GIN | name search (UC-6) |
| vehicles | (garage_id, registration_number) UNIQUE | B-tree | exact registration lookup |
| vehicles | (garage_id, customer_id) | B-tree | a customer's vehicles |
| vehicles | registration_number gin_trgm_ops | GIN | partial registration search |
| vehicles | next_service_date WHERE ACTIVE AND NOT NULL | partial B-tree | daily reminder cron (UC-18) |
| job_cards | (garage_id, job_number) UNIQUE | B-tree | lookup by job number |
| job_cards | vehicle_id UNIQUE WHERE open | partial unique | one open job per vehicle (AC-8.2) |
| job_cards | (garage_id, status, created_at) | B-tree | job board by status; dashboard counts (UC-17) |
| job_cards | (vehicle_id, created_at) | B-tree | service history (AC-6.3) |
| job_cards | (garage_id, assigned_mechanic_id) WHERE open | partial | "my jobs" for mechanics |
| job_cards | (garage_id, promised_delivery_at) WHERE open | partial | due today / overdue (UC-17) |
| job_status_history | (job_card_id, created_at) | B-tree | job timeline |
| problems / attachments | job_card_id, problem_id | B-tree | job detail and portal page |
| estimates | (job_card_id, version) UNIQUE | B-tree | latest estimate for a job |
| estimates | job_card_id UNIQUE WHERE SENT | partial unique | single active estimate (UC-11 3a) |
| estimate_line_items | (estimate_id, sort_order) | B-tree | render estimate |
| customer_access_links | token_hash UNIQUE | B-tree | public link lookup (UC-12) |
| customer_access_links | job_card_id, estimate_id | B-tree | revoke links on supersede |
| notifications | next_attempt_at WHERE QUEUED | partial | worker poll; stays tiny because sent rows leave it |
| notifications | (garage_id, job_card_id, created_at), (garage_id, customer_id, created_at), (garage_id, status, created_at) | B-tree | notification log and failed filter (UC-16) |
| invoices | (garage_id, invoice_number) UNIQUE; job_card_id UNIQUE | B-tree | lookup; one invoice per job |
| invoices | (garage_id, status, issued_at) | B-tree | unpaid invoices list |
| payments | invoice_id; (garage_id, received_at) | B-tree | payments per invoice; revenue sums (UC-17) |
| audit_logs | (garage_id, created_at); (entity_type, entity_id) | B-tree | audit feed; history of one record |

**Write cost.** `job_cards` carries 7 indexes. It is acceptable because job writes are rare (a handful of status changes per job), while reads are frequent. The two GIN trigram indexes add the most cost per insert or update, but they sit only on `customers` and `vehicles`, which change rarely.

## Scaling & Performance Notes

- **Hot paths:**
  - job board: `(garage_id, status, created_at)`
  - vehicle and customer search: trigram indexes
  - public link lookup: `token_hash`
  - notification worker: a partial index that only holds QUEUED rows
- **At 10× (≈100k vehicles per garage, thousands of garages):** single-node Postgres is fine.
  - Add a read replica for the dashboard and reports.
  - Cache dashboard aggregates for about 60 s.
- **At 100×:**
  - Partition `notifications`, `audit_logs` and `job_status_history` by month (range on `created_at`). These are the unbounded append-only tables, and old partitions can be archived to cold storage.
  - `garage_id` is the natural sharding key (Citus) if a single node is ever outgrown. Every tenant table already carries it.
- **Notification queue:** `FOR UPDATE SKIP LOCKED` on the partial index supports several workers. Above about 5k messages per day (OQ-3), move to BullMQ + Redis; the table stays as the delivery log.
- **Counter rows:** the `garage_counters` row lock serialises job creation within one garage only. Contention is negligible at garage-counter throughput.

## Migration Strategy

- **Tool:** TypeORM migrations (`synchronize` is permanently off).
  - Files live in `src/core/database/migrations/`; applied ones are tracked in `typeorm_migrations`.
  - Each migration runs in its own transaction (`migrationsTransactionMode: 'each'`).
- **Initial migration:** `1791448325341-InitialSchema.ts`.
  - Creates the `citext` and `pg_trgm` extensions, 20 enum types, 18 tables, all foreign keys, checks and indexes, plus 2 hand-written GIN trigram indexes.
  - Verified: run → `migration:generate` reports **no changes** (entities and DB in sync) → revert leaves no tables or types → run again succeeds.
- **Hand-edits after `migration:generate`:**
  1. Remove duplicate `CREATE TYPE` statements for shared enums. TypeORM emits one per table that uses the type.
  2. Keep only the last `DROP TYPE` for each shared enum in `down()`.
  3. Write trigram or other non-B-tree indexes by hand, and mark them `@Index('name', { synchronize: false })` on the entity so later diffs ignore them.
  - Always finish with a drift check: `migration:generate -- Check` must report "No changes".
- **Numeric defaults:** use `default: 0`, not `'0.00'` or `() => '0'`. The other forms create a false diff on every generate.
- **Rules for future changes:**
  - Never edit a migration that has already been applied anywhere; add a new one.
  - **Expand → migrate → contract** for zero-downtime changes:
    1. add a nullable column or new table
    2. deploy code that writes both versions
    3. backfill in batches
    4. switch reads
    5. drop the old column in a later release
  - New enum values: `ALTER TYPE … ADD VALUE` in its own migration. It cannot run inside the same transaction that uses the new value.
  - Large-table indexes: `CREATE INDEX CONCURRENTLY` in a migration with `transaction = false`.
  - Every `up()` has a working `down()`. Destructive `down()`s (dropping data) must say so in a comment.

## Handoff Notes for Downstream Stages

- **For Okr-backend-auth-security (stage 3):**
  - Auth tables are `users` (role enum `user_role`, `status`, `password_hash` with `select:false`, `password_changed_at`), `refresh_tokens` (hashed, with `family_id` for reuse detection) and `audit_logs`.
  - Suspended-garage check: `garages.status`.
  - Customer links: `customer_access_links` (hashed token, purpose, expiry, revoked/used).
  - Roles are an enum, not a table. The section matrix stays in code (`section-permissions.ts`); no `permissions` table is needed unless per-garage custom roles are added later (additive migration).
- **For Okr-api-designer (stage 4):**
  - Money fields are strings with 2 decimals (`@IsNumberString`); quantity is a 2-decimal string.
  - IDs are UUID v4; dates are `timestamptz` (ISO 8601); `next_service_date` is a `date` (`YYYY-MM-DD`).
  - Soft-delete means `status = INACTIVE`; there is no DELETE for customers, vehicles or users.
  - Pagination uses limit/offset with `created_at DESC` as the default order. Sort keys must be whitelisted per endpoint, never passed through raw.
  - `varchar` lengths above define the `@MaxLength` values.
- **For Okr-service-layer (stage 5):**
  - Always filter by `garage_id` from the token. Child tables without `garage_id` (problems, estimates, line items, history) must be reached through their `job_card` and its garage check.
  - Wrap these flows in transactions, using `dataSource.transaction`:
    - UC-1: garage + admin
    - UC-8: counter lock → job + history + notification
    - UC-11: send estimate + supersede + link + job status
    - UC-12: item approvals + estimate + job status + history + audit
    - UC-15: counter → invoice + items; payment + `amount_paid` + status
  - Catch the database's unique-violation error (code 23505) and map it to 409, using the constraint name to choose the message (e.g. `UQ_job_cards_open_per_vehicle` → "vehicle already has an open job").
  - Normalise before writing: lower/trim email (citext still dedupes), E.164 phone, `normalizeRegistrationNumber()`.
  - Notification worker claim: `UPDATE … SET status='SENDING' WHERE id IN (SELECT id … WHERE status='QUEUED' AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT n FOR UPDATE SKIP LOCKED) RETURNING *`.
