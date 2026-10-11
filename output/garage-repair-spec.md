# Garage Repair Management — Specification

- **Spec ID:** GARAGE-SPEC
- **Version:** 1.0 (draft)
- **Date:** 2026-10-08
- **Stage:** 1 of 8 (Okr-spec-writer) — consumed by Okr-nestjs-scaffolder, Okr-database-architect, Okr-backend-auth-security, Okr-api-designer, Okr-service-layer, Okr-test-engineer, Okr-code-reviewer, Okr-doc-generator
- **Stack (given):** Backend NestJS + PostgreSQL · Frontend Next.js

---

## 1. Overview & Scope

A multi-garage SaaS for managing vehicle repairs. Garage staff register vehicle owners and their vehicles, open a **job card** when a vehicle comes in, record the **problems** found during diagnosis, and **notify the vehicle owner** about those problems. The owner reviews an **estimate** through a secure link and approves or rejects the work. Staff then track the repair through a status lifecycle (the owner is notified at key steps), invoice the work, and hand the vehicle back.

**In scope (v1):**
- Garage onboarding and staff accounts with roles
- Customer (vehicle owner) and vehicle management, including service history
- Job cards with a status lifecycle and mechanic assignment
- Problem/diagnosis recording with photo attachments
- Owner notifications by email and SMS, with a delivery log
- Estimates with parts/labour line items, and owner approval via a secure link
- Invoices with payment recording (manual: cash, card or UPI recorded by staff)
- Dashboard summary for the garage admin
- Scheduled next-service reminders

**Out of scope for v1:** see Section 9.

---

## 2. Actors

| ID | Actor | Description | Authenticates via |
|---|---|---|---|
| ACT-1 | Garage Admin | Owns or manages one garage. Full control of that garage's data, staff, and settings. | Email + password (JWT) |
| ACT-2 | Service Advisor | Front-desk staff. Registers customers and vehicles, opens job cards, sends notifications and estimates, and handles invoicing. | Email + password (JWT) |
| ACT-3 | Mechanic | Diagnoses and repairs vehicles. Records problems and updates the status of jobs assigned to them. | Email + password (JWT) |
| ACT-4 | Vehicle Owner (Customer) | Owns the vehicle. Has **no account in v1**. Receives notifications and views or approves estimates through a signed, expiring link. | Single-purpose access token in the link |
| ACT-5 | System | Sends notifications, runs scheduled reminders, and expires links. | n/a (internal) |
| ACT-6 | Platform Admin *(inferred, see OQ-1)* | SaaS operator who can suspend garages. Minimal in v1. | Email + password (JWT) |

ACT-1 to ACT-3 are **garage-scoped**: every read and write is limited to the garage they belong to (tenant isolation, NFR-3).

---

## 3. Domain Entities (conceptual — no types or column names)

| ID | Entity | Key attributes | Relationships |
|---|---|---|---|
| ENT-1 | Garage | name, address, phone, email, tax registration number, currency, tax rate, status (active/suspended) | has many StaffUser, Customer, Vehicle, JobCard |
| ENT-2 | StaffUser | name, email (unique platform-wide), phone, password (hashed), role (GARAGE_ADMIN / SERVICE_ADVISOR / MECHANIC), status (active/inactive), last login | belongs to Garage |
| ENT-3 | Customer (Vehicle Owner) | name, phone (required), email (optional), address, preferred notification channel(s), notes, status | belongs to Garage; has many Vehicle |
| ENT-4 | Vehicle | registration number (unique per garage), VIN (optional), make, model, variant, year, fuel type, colour, current odometer, next service date, status | belongs to Customer and Garage; has many JobCard |
| ENT-5 | JobCard (repair order) | job number (human-readable, unique per garage), check-in odometer, fuel level, customer-reported complaints, status, promised delivery date, assigned mechanic, opened by, closed at | belongs to Vehicle and Garage; has many Problem, Estimate, StatusHistory, Attachment, Notification; has at most one Invoice |
| ENT-6 | Problem (diagnosis finding) | title, description, severity (LOW/MEDIUM/HIGH/CRITICAL), category (engine, brakes, electrical, …), recorded by, recorded at | belongs to JobCard; has many Attachment; may link to EstimateLineItem |
| ENT-7 | Attachment | file reference, mime type, size, caption, uploaded by | belongs to JobCard, optionally to Problem |
| ENT-8 | Estimate | version number, status (DRAFT/SENT/APPROVED/PARTIALLY_APPROVED/REJECTED/EXPIRED/SUPERSEDED), subtotal, tax, total, valid until, sent at, responded at, customer remark | belongs to JobCard; has many EstimateLineItem |
| ENT-9 | EstimateLineItem | type (PART/LABOUR), description, quantity, unit price, line total, approval state (PENDING/APPROVED/REJECTED), linked problem | belongs to Estimate |
| ENT-10 | JobStatusHistory | from status, to status, changed by, note, changed at | belongs to JobCard (append-only) |
| ENT-11 | Notification | channel (EMAIL/SMS), template/type, recipient address, rendered content, delivery status (QUEUED/SENT/FAILED), failure reason, attempts, sent at | belongs to JobCard (optional), Customer, Garage |
| ENT-12 | CustomerAccessLink | purpose (VIEW_JOB/APPROVE_ESTIMATE), token (stored hashed), expires at, used/revoked state, last accessed | belongs to JobCard / Estimate |
| ENT-13 | Invoice | invoice number (unique per garage), line items (snapshot of approved estimate items plus any additions), subtotal, tax, discount, total, amount paid, balance, status (UNPAID/PARTIALLY_PAID/PAID/VOID) | belongs to JobCard (1:1) |
| ENT-14 | Payment | amount, method (CASH/CARD/UPI/BANK_TRANSFER/OTHER), reference, received by, received at | belongs to Invoice |
| ENT-15 | AuditLog | actor, action, entity type and id, before/after summary, timestamp | belongs to Garage |
| ENT-16 | RefreshToken / Session | token (hashed), expires at, revoked | belongs to StaffUser |

### 3.1 JobCard status lifecycle

```
CHECKED_IN → DIAGNOSING → AWAITING_APPROVAL → APPROVED → IN_PROGRESS → QUALITY_CHECK → READY_FOR_PICKUP → DELIVERED
                  ↑               │
                  └── (rejected / re-estimate)
Any state except DELIVERED → CANCELLED
```

- `DELIVERED` and `CANCELLED` are terminal.
- `AWAITING_APPROVAL` is entered only when an Estimate is sent (UC-11).
- `APPROVED` is entered only when the customer approves the estimate, fully or partly (UC-12), or staff record a verbal approval (UC-12 alternate flow 2a).
- `DELIVERED` requires an Invoice with status `PAID`, unless a Garage Admin overrides it (UC-15, alternate flow 4a).

---

## 4. Use Cases

### Group A — Garage & staff

**UC-1: Garage admin registers a garage**
- Actor: ACT-1 (unauthenticated)
- Trigger: Sign-up form submitted
- Preconditions: Email not already registered
- Main flow:
  1. Actor submits the garage details and the admin's name, email and password.
  2. System validates the input and the password policy (NFR-4).
  3. System creates the Garage and a StaffUser with role GARAGE_ADMIN in one transaction.
  4. System returns an access token and a refresh token.
- Error flows:
  - 2a. Email already in use → conflict.
  - 2b. Invalid input or weak password → validation error.
- Postconditions: Garage is active; the admin can log in; an AuditLog entry is recorded.

**UC-2: Staff authentication (login / refresh / logout)**
- Actor: ACT-1, ACT-2, ACT-3
- Trigger: Login, refresh or logout request
- Preconditions: StaffUser exists and is active; Garage is active
- Main flow:
  1. Actor submits email and password.
  2. System verifies the credentials.
  3. System issues a short-lived access token and a rotating refresh token.
- Alternate flows:
  - 1a. Refresh: a valid refresh token is rotated and a new pair is issued.
  - 1b. Logout: the refresh token is revoked.
- Error flows:
  - 2a. Wrong credentials → unauthenticated (generic message, no user enumeration).
  - 2b. User inactive or garage suspended → forbidden.
  - 1c. Refresh token reused after rotation, expired, or revoked → unauthenticated, and all of that user's sessions are revoked.
- Postconditions: Session is recorded; last login is updated.

**UC-3: Garage admin manages staff**
- Actor: ACT-1
- Trigger: Create, update, deactivate or list staff
- Preconditions: Actor is authenticated as GARAGE_ADMIN
- Main flow:
  1. Actor submits the staff name, email, role and a temporary password.
  2. System creates the StaffUser in the actor's garage.
  3. System emails the staff member their login details.
- Alternate flows:
  - 1a. Deactivate: the staff status becomes inactive and their sessions are revoked.
  - 1b. Change role.
- Error flows:
  - 2a. Email exists → conflict.
  - 1c. Admin tries to deactivate themselves or demote the last GARAGE_ADMIN → validation error.
  - 1d. Actor is not GARAGE_ADMIN → forbidden.
- Postconditions: StaffUser is created or changed; an AuditLog entry is recorded.

### Group B — Customers & vehicles

**UC-4: Register a vehicle owner (customer)**
- Actor: ACT-1, ACT-2
- Preconditions: Authenticated
- Main flow:
  1. Actor submits the customer's name, phone, optional email and preferred channel.
  2. System validates the input (phone in E.164 format).
  3. System creates the Customer in the actor's garage.
- Alternate flows:
  - 2a. A customer with the same phone already exists in this garage → the existing record is returned with a duplicate flag (no duplicate is created).
- Error flows:
  - 2b. Invalid input → validation error.
- Postconditions: Customer exists in the garage.

**UC-5: Add a vehicle to a customer**
- Actor: ACT-1, ACT-2
- Preconditions: Authenticated; Customer exists in the actor's garage
- Main flow:
  1. Actor submits the registration number, make, model, year, fuel type, optional VIN, and odometer.
  2. System normalises the registration number (uppercase, no spaces) and validates it.
  3. System creates the Vehicle linked to the Customer.
- Error flows:
  - 2a. Registration number already exists in this garage → conflict.
  - 1a. Customer not found, or in another garage → not found.
- Postconditions: Vehicle exists and is linked to its owner.

**UC-6: Search, list and view vehicles and customers (with service history)**
- Actor: ACT-1, ACT-2, ACT-3
- Main flow:
  1. Actor searches by registration number, owner name or phone (limit/offset/search/order).
  2. System returns paginated results from the actor's garage only.
  3. Actor opens a vehicle; System returns its details, owner, and past JobCards with their totals.
- Error flows:
  - 3a. Vehicle in another garage → not found (never forbidden; existence is not leaked).

**UC-7: Update or deactivate a customer or vehicle**
- Actor: ACT-1, ACT-2
- Main flow: Actor edits the fields → System validates and saves.
- Alternate flows:
  - Deactivate: status becomes inactive and the record is hidden from default lists.
  - Transfer a vehicle to another customer in the same garage.
- Error flows:
  - Changed registration number collides → conflict.
  - Vehicle has a non-terminal JobCard and deactivation is attempted → conflict.

### Group C — Job cards & diagnosis

**UC-8: Open a job card (vehicle check-in)**
- Actor: ACT-1, ACT-2
- Preconditions: Vehicle is active; it has no other non-terminal JobCard
- Main flow:
  1. Actor submits the vehicle, check-in odometer, fuel level, customer complaints and promised delivery date.
  2. System generates a job number (e.g. `JOB-2026-000123`, sequential per garage).
  3. System creates the JobCard with status CHECKED_IN, writes StatusHistory, and updates the vehicle's odometer.
  4. System notifies the owner that the vehicle was checked in (UC-10 template `JOB_CHECKED_IN`).
- Error flows:
  - 1a. Vehicle already has an open JobCard → conflict.
  - 1b. Odometer is lower than the vehicle's last recorded value → validation error.
- Postconditions: JobCard is open; a notification is queued.

**UC-9: Record diagnosed problems**
- Actor: ACT-1, ACT-2, ACT-3 (a mechanic only on jobs assigned to them)
- Preconditions: JobCard status is CHECKED_IN, DIAGNOSING or IN_PROGRESS
- Main flow:
  1. Actor adds a Problem (title, description, severity, category) and optional photos.
  2. System saves the Problem and its Attachments.
  3. If the JobCard is CHECKED_IN, System moves it to DIAGNOSING.
- Alternate flows:
  - 1a. Edit or remove a Problem that is not yet linked to a sent estimate.
  - 1b. A Problem found during IN_PROGRESS (additional work) is flagged as "requires new estimate".
- Error flows:
  - Mechanic not assigned to the job → forbidden.
  - JobCard is terminal → conflict.
  - Attachment is too large or not an image or PDF → validation error (NFR-8).
- Postconditions: Problem is recorded and visible to the owner once notified.

**UC-10: Notify the vehicle owner about vehicle problems**
- Actor: ACT-1, ACT-2 (manual); ACT-5 (automatic, on events)
- Preconditions: JobCard has at least one Problem (for type `PROBLEMS_FOUND`); Customer has a phone or email on a preferred channel
- Main flow:
  1. Actor selects "Notify owner" and optionally adds a personal message.
  2. System creates a CustomerAccessLink (VIEW_JOB, 7-day expiry).
  3. System renders the template with the garage name, vehicle, problem summary (title and severity), and the link.
  4. System queues one Notification per selected channel (EMAIL and/or SMS).
  5. A background worker sends the message through the provider and updates the delivery status.
- Alternate flows:
  - 4a. Automatic notifications on events: JOB_CHECKED_IN, ESTIMATE_SENT, JOB_APPROVED, READY_FOR_PICKUP, INVOICE_ISSUED, SERVICE_REMINDER.
  - 5a. Provider fails temporarily → up to 3 retries with backoff, then FAILED.
- Error flows:
  - 1a. Customer has no contact on any channel → validation error.
  - 1b. No problems recorded (for PROBLEMS_FOUND) → validation error.
- Postconditions: Notification rows exist with their delivery status; an AuditLog entry is recorded.

**UC-11: Create and send an estimate**
- Actor: ACT-1, ACT-2
- Preconditions: JobCard is DIAGNOSING (or IN_PROGRESS for additional work, UC-9 1b)
- Main flow:
  1. Actor creates a DRAFT estimate with line items (PART or LABOUR, quantity, unit price, optional linked Problem).
  2. System computes the line totals, subtotal, tax (garage tax rate) and total server-side.
  3. Actor sends the estimate.
  4. System marks it SENT, creates a CustomerAccessLink (APPROVE_ESTIMATE, valid until the estimate's valid-until date, default 7 days), moves the JobCard to AWAITING_APPROVAL, and notifies the owner (ESTIMATE_SENT).
- Alternate flows:
  - 3a. Re-estimate: sending a new version marks the earlier SENT version SUPERSEDED and revokes its link.
- Error flows:
  - 1a. No line items, or negative or zero quantity or price → validation error.
  - 3b. Estimate is not DRAFT → conflict.
- Postconditions: The owner can review the estimate through the link.

**UC-12: Vehicle owner views the job and approves or rejects the estimate**
- Actor: ACT-4 (through the link, no login)
- Preconditions: Link is valid (not expired or revoked); Estimate is SENT
- Main flow:
  1. Owner opens the link; System shows the garage, vehicle, problems (with photos), estimate items and total.
  2. Owner approves all items, or approves some and rejects others, with an optional remark.
  3. System records the per-item approval and sets the Estimate to APPROVED, PARTIALLY_APPROVED or REJECTED.
  4. On APPROVED or PARTIALLY_APPROVED, the JobCard moves to APPROVED; on REJECTED it moves back to DIAGNOSING.
  5. System notifies the garage staff (in-app) and confirms to the owner (JOB_APPROVED).
- Alternate flows:
  - 2a. Verbal approval: staff record the approval on the owner's behalf with a mandatory note. This is audited as a staff action.
  - 1a. A VIEW_JOB link shows the job and its status read-only (no approval actions).
- Error flows:
  - 1b. Link expired or revoked → gone (410); the Estimate becomes EXPIRED once past its valid-until date.
  - 2b. Estimate already responded to → conflict.
  - 1c. Token is invalid or tampered → not found (no detail leaked).
- Postconditions: The approval decision is immutable; the link is consumed for approval but stays valid for viewing until it expires.

**UC-13: Update job status**
- Actor: ACT-1, ACT-2, ACT-3 (a mechanic only on their own assigned jobs, and only for IN_PROGRESS → QUALITY_CHECK)
- Main flow:
  1. Actor requests a transition with an optional note.
  2. System validates the transition against the lifecycle in §3.1.
  3. System updates the status and appends StatusHistory.
  4. If the target status has an owner template (READY_FOR_PICKUP and the others listed in UC-10 4a), System notifies the owner.
- Error flows:
  - 2a. Illegal transition → conflict (`INVALID_STATUS_TRANSITION`).
  - 2b. Transition to IN_PROGRESS without an approved estimate → conflict.
  - Mechanic acting on an unassigned job, or attempting a transition other than the one allowed → forbidden.
- Postconditions: Full status history is kept.

**UC-14: Assign a mechanic to a job**
- Actor: ACT-1, ACT-2
- Main flow: Actor picks an active MECHANIC in the same garage → System sets the assignee and audits the change.
- Error flows:
  - Target is not a mechanic, is inactive, or belongs to another garage → validation error or not found.
  - JobCard is terminal → conflict.

### Group D — Billing & close-out

**UC-15: Generate an invoice, record payment, and deliver the vehicle**
- Actor: ACT-1, ACT-2
- Preconditions: JobCard is READY_FOR_PICKUP
- Main flow:
  1. Actor generates an invoice. System snapshots the APPROVED line items into an Invoice with a sequential invoice number per garage.
  2. System notifies the owner (INVOICE_ISSUED) with the amount due.
  3. Actor records one or more Payments; System updates the amount paid and balance (UNPAID → PARTIALLY_PAID → PAID).
  4. Actor marks the JobCard DELIVERED; System sets closed-at and updates the vehicle's next service date if one was provided.
- Alternate flows:
  - 1a. Add extra line items or a discount before the invoice is issued (discount ≤ subtotal).
  - 4a. Garage Admin delivers with an unpaid balance (credit), with a mandatory note and an audit entry.
- Error flows:
  - 1b. Invoice already exists → conflict.
  - 3a. Payment exceeds the balance → validation error.
  - 4b. Invoice is not PAID and the actor is not GARAGE_ADMIN → conflict.
- Postconditions: Job is closed; the vehicle's service history includes the invoice total.

### Group E — Reporting & system

**UC-16: View the notification log and retry failed messages**
- Actor: ACT-1, ACT-2
- Main flow: Actor lists the notifications for a job or customer → actor retries a FAILED one → System re-queues it.
- Error flows: Retrying a message that is not FAILED → conflict.

**UC-17: Garage dashboard**
- Actor: ACT-1 (full view), ACT-2 (no revenue figures)
- Main flow: System returns counts of open jobs by status, jobs due today or overdue against the promised date, estimates awaiting approval, today's and this month's revenue (sum of payments), and the top 5 problem categories over the last 30 days.

**UC-18: Scheduled next-service reminders**
- Actor: ACT-5
- Trigger: Daily cron job at 09:00 in the garage's timezone (see OQ-6)
- Main flow: System finds active vehicles whose next service date is 7 days away (or today) and queues a SERVICE_REMINDER notification for each, at most once per vehicle per service date.
- Postconditions: No duplicate reminders.

**UC-19: Platform admin suspends or reactivates a garage** *(minimal, see OQ-1)*
- Actor: ACT-6
- Main flow: Set the garage status → while suspended, that garage's staff cannot log in and their existing access tokens are rejected.

---

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Performance:** p95 under 300 ms for read and list endpoints and under 500 ms for writes (excluding provider send time), at 50 concurrent users per garage and 10k vehicles per garage. |
| NFR-2 | **Notification latency:** queued notifications are attempted within 60 s; sending is asynchronous and never blocks the API request. |
| NFR-3 | **Tenant isolation:** every garage-scoped query filters by the actor's garage. Cross-garage access returns 404. This is enforced in the service layer and covered by tests. |
| NFR-4 | **Security:** bcrypt (cost ≥ 12) password hashing; passwords ≥ 8 characters with at least one letter and one digit; access token TTL 15 min; refresh token 7 days, rotated and stored hashed; login rate limit 10/min per IP; global limit 100/min; helmet and a CORS allow-list. |
| NFR-5 | **Customer links:** tokens have ≥ 256 bits of entropy, are stored as a SHA-256 hash, are scoped to one purpose and one job or estimate, expire, and are revocable. Rate limit 30/min per IP on public link endpoints. |
| NFR-6 | **Money:** every amount is stored as NUMERIC(12,2) and calculated server-side. Client-sent totals are ignored. Currency is set per garage (default INR, see OQ-4). |
| NFR-7 | **Auditability:** status changes, approvals (including verbal), payments, staff changes, and deliveries on credit are written to AuditLog in the same transaction as the change. |
| NFR-8 | **Uploads:** images (jpeg, png, webp) and PDFs only, ≤ 5 MB each, ≤ 10 per problem. Stored through a storage abstraction (local disk in dev, S3-compatible in prod). |
| NFR-9 | **i18n:** all API messages are translation keys resolved from `Accept-Language` (en by default). |
| NFR-10 | **API conventions:** REST under `/api/v1`, Swagger at `/docs` (disabled in prod), the standard error envelope, and limit/offset/search/order pagination. |
| NFR-11 | **Data retention:** soft-delete via a status field. Job, invoice and payment records are never hard-deleted. |
| NFR-12 | **Code quality:** ESLint with eslint-plugin-security and Prettier; `npm run lint:check` passes with zero errors. |
| NFR-13 | **Frontend:** Next.js (App Router). A staff web app plus a public customer page for the link flows. Responsive and usable on a mobile phone at the service counter. |

---

## 6. Acceptance Criteria

### UC-1
- AC-1.1: Given a new email, when a valid registration is submitted, then 201 is returned with tokens, and a Garage plus a GARAGE_ADMIN StaffUser exist.
- AC-1.2: Given an email already registered, when registration is submitted, then 409 is returned and no Garage is created.
- AC-1.3: Given a password of "abc", when registration is submitted, then 400 `VALIDATION_FAILED` is returned.

### UC-2
- AC-2.1: Given an active staff user, when correct credentials are posted, then 200 is returned with an access token and a refresh token.
- AC-2.2: Given wrong credentials, when login is posted, then 401 is returned with the same message as for an unknown email.
- AC-2.3: Given an inactive user or a suspended garage, when login is posted, then 403 is returned.
- AC-2.4: Given a valid refresh token, when refresh is called, then a new pair is returned and the old refresh token no longer works (401).
- AC-2.5: Given a refresh token that has already been rotated, when it is reused, then 401 is returned and all of the user's sessions are revoked.
- AC-2.6: Given 11 login attempts within 1 minute from one IP, when the 11th is made, then 429 is returned.

### UC-3
- AC-3.1: Given a GARAGE_ADMIN, when they create a staff user, then 201 is returned and the user belongs to the admin's garage.
- AC-3.2: Given a SERVICE_ADVISOR or MECHANIC, when they call create-staff, then 403 is returned.
- AC-3.3: Given an unauthenticated request, when create-staff is called, then 401 is returned.
- AC-3.4: Given the only GARAGE_ADMIN, when they demote or deactivate themselves, then 400 is returned.
- AC-3.5: Given a staff user who has been deactivated, when they use an existing refresh token, then 401 is returned.

### UC-4
- AC-4.1: Given an advisor, when a valid customer is posted, then 201 is returned and the customer is in the advisor's garage.
- AC-4.2: Given a phone that already exists in the same garage, when it is posted, then 200 is returned with the existing customer and `duplicate: true`.
- AC-4.3: Given the same phone in a different garage, when it is posted, then a new customer is created (201).
- AC-4.4: Given a MECHANIC, when they create a customer, then 403 is returned.

### UC-5
- AC-5.1: Given an existing customer, when a vehicle with registration "mh 12 ab 1234" is added, then 201 is returned and the stored registration is "MH12AB1234".
- AC-5.2: Given a registration already in the garage, when it is added again, then 409 is returned.
- AC-5.3: Given a customer id from another garage, when a vehicle is added to it, then 404 is returned.

### UC-6
- AC-6.1: Given vehicles in garages A and B, when an A user searches, then only A's vehicles are returned, with limit/offset metadata.
- AC-6.2: Given a vehicle id from garage B, when an A user requests it, then 404 is returned.
- AC-6.3: Given a vehicle with 2 closed jobs, when its history is requested, then both jobs are returned, newest first, with invoice totals.

### UC-7
- AC-7.1: Given a vehicle with an open job, when deactivation is attempted, then 409 is returned.
- AC-7.2: Given a vehicle, when it is transferred to another customer in the same garage, then 200 is returned and the owner changes; transfer to a customer in another garage returns 404.

### UC-8
- AC-8.1: Given an active vehicle with no open job, when a job card is opened, then 201 is returned, the status is CHECKED_IN, the job number is unique within the garage, a StatusHistory row exists, and a JOB_CHECKED_IN notification is queued.
- AC-8.2: Given a vehicle with an open job, when another job is opened, then 409 is returned.
- AC-8.3: Given an odometer below the last recorded value, when a job is opened, then 400 is returned.
- AC-8.4: Given two concurrent job openings in the same garage, then both get distinct sequential job numbers.

### UC-9
- AC-9.1: Given an assigned mechanic, when they add a problem to a CHECKED_IN job, then 201 is returned and the job becomes DIAGNOSING.
- AC-9.2: Given a mechanic who is not assigned to the job, when they add a problem, then 403 is returned.
- AC-9.3: Given a DELIVERED job, when a problem is added, then 409 is returned.
- AC-9.4: Given a 6 MB file or a .exe file, when it is uploaded, then 400 is returned.

### UC-10
- AC-10.1: Given a job with problems and a customer with phone and email, when the advisor notifies on both channels, then 202 is returned, two Notification rows are QUEUED, and a VIEW_JOB link exists.
- AC-10.2: Given a job with no problems, when a PROBLEMS_FOUND notification is requested, then 400 is returned.
- AC-10.3: Given a provider that fails 3 times, when the worker processes the notification, then its status is FAILED with a failure reason and 3 attempts recorded.
- AC-10.4: Given a queued notification, then the API response returns before the provider is called (sending is asynchronous).
- AC-10.5: Given a user from garage B, when they notify the owner on a job in garage A, then 404 is returned.

### UC-11
- AC-11.1: Given line items 2 × 500.00 (PART) and 1 × 300.00 (LABOUR) at 18% tax, when the estimate is created, then subtotal = 1300.00, tax = 234.00, total = 1534.00, regardless of any totals the client sends.
- AC-11.2: Given a DRAFT estimate, when it is sent, then the estimate is SENT, the job is AWAITING_APPROVAL, an APPROVE_ESTIMATE link exists, and an ESTIMATE_SENT notification is queued.
- AC-11.3: Given an earlier SENT estimate, when a new version is sent, then the old one is SUPERSEDED and its link returns 410.
- AC-11.4: Given an estimate with zero items, when it is sent, then 400 is returned.
- AC-11.5: Given a MECHANIC, when they send an estimate, then 403 is returned.

### UC-12
- AC-12.1: Given a valid approval link, when the owner GETs it, then 200 is returned with the vehicle, problems and estimate, and no staff-internal fields (cost price, staff emails).
- AC-12.2: Given a valid link, when the owner approves all items, then the estimate is APPROVED, the job is APPROVED, and the response is 200.
- AC-12.3: Given a valid link, when the owner approves 1 of 2 items, then the estimate is PARTIALLY_APPROVED and only the approved item counts towards the approved total.
- AC-12.4: Given a valid link, when the owner rejects all items, then the estimate is REJECTED and the job returns to DIAGNOSING.
- AC-12.5: Given an expired link, when it is opened, then 410 is returned.
- AC-12.6: Given a random or tampered token, when it is opened, then 404 is returned.
- AC-12.7: Given an estimate that has already been responded to, when approval is submitted again, then 409 is returned.
- AC-12.8: Given a VIEW_JOB link, when an approval is posted with it, then 403 is returned.
- AC-12.9: Given an advisor recording a verbal approval without a note, then 400 is returned; with a note, then 200 is returned and an AuditLog entry is written.

### UC-13
- AC-13.1: Given an APPROVED job, when the status is set to IN_PROGRESS, then 200 is returned and a StatusHistory row is appended.
- AC-13.2: Given a CHECKED_IN job, when the status is set to DELIVERED, then 409 `INVALID_STATUS_TRANSITION` is returned.
- AC-13.3: Given an IN_PROGRESS job, when the assigned mechanic moves it to QUALITY_CHECK, then 200 is returned; when the same mechanic tries READY_FOR_PICKUP, then 403 is returned.
- AC-13.4: Given a transition to READY_FOR_PICKUP, then a READY_FOR_PICKUP notification is queued.

### UC-14
- AC-14.1: Given an active mechanic in the same garage, when they are assigned, then 200 is returned.
- AC-14.2: Given a SERVICE_ADVISOR user id as the assignee, then 400 is returned; given a mechanic from another garage, then 404 is returned.

### UC-15
- AC-15.1: Given a READY_FOR_PICKUP job with an approved estimate, when an invoice is generated, then 201 is returned, its items equal the approved items, the invoice number is sequential, and an INVOICE_ISSUED notification is queued.
- AC-15.2: Given an invoice total of 1534.00, when payments of 1000.00 and 534.00 are recorded, then the status goes UNPAID → PARTIALLY_PAID → PAID with balance 0.00.
- AC-15.3: Given a balance of 534.00, when a payment of 600.00 is recorded, then 400 is returned.
- AC-15.4: Given an UNPAID invoice, when an advisor marks the job DELIVERED, then 409 is returned; when a GARAGE_ADMIN does so with a note, then 200 is returned and an AuditLog entry is written.
- AC-15.5: Given a job that already has an invoice, when another invoice is generated, then 409 is returned.

### UC-16
- AC-16.1: Given a FAILED notification, when it is retried, then it becomes QUEUED and 202 is returned; retrying a SENT notification returns 409.

### UC-17
- AC-17.1: Given 3 jobs IN_PROGRESS and 1 AWAITING_APPROVAL, when the admin requests the dashboard, then the counts match, and revenue equals the sum of payments in the period.
- AC-17.2: Given a SERVICE_ADVISOR, when they request the dashboard, then revenue fields are absent.

### UC-18
- AC-18.1: Given a vehicle whose next service date is 7 days away, when the reminder job runs twice the same day, then exactly one SERVICE_REMINDER notification exists.

### UC-19
- AC-19.1: Given a suspended garage, when one of its staff uses a still-valid access token, then 403 is returned.

### Non-functional
- AC-NFR-1: Given seeded data (10k vehicles per garage) and 50 concurrent users, when list endpoints are load-tested, then p95 is below 300 ms.
- AC-NFR-3: For every garage-scoped GET/PATCH/DELETE endpoint, given a resource id from another garage, then 404 is returned (auth-invariant matrix).
- AC-NFR-6: Given any money field, when it is returned by the API, then it is a string with 2 decimals, and the stored value is NUMERIC(12,2).
- AC-NFR-LINT: Given the delivered code, when CI runs, then ESLint (with eslint-plugin-security) passes via `npm run lint:check` with zero errors.

---

## 7. Assumptions

- A-1: One staff user belongs to exactly one garage. Multi-branch chains are out of scope for v1.
- A-2: Vehicle owners do not have accounts in v1. All customer interaction is through signed links plus SMS/email.
- A-3: Email goes through SMTP (Nodemailer) and SMS through a provider interface (Twilio adapter). Development uses a console/log provider.
- A-4: The notification queue uses a Postgres-backed table polled by a worker (no Redis needed in v1). BullMQ + Redis is an upgrade path (see OQ-3).
- A-5: Tax is one flat rate per garage. GST split (CGST/SGST/IGST) is deferred (OQ-4).
- A-6: Job, invoice and estimate numbers are sequential per garage using a per-garage counter row locked in the transaction.
- A-7: Default currency is INR and default timezone is Asia/Kolkata, both configurable per garage.
- A-8: Backend is NestJS 10 with TypeORM and PostgreSQL. The frontend lives in a separate `frontend/` Next.js app that talks to the REST API.

## 8. Open Questions

| ID | Question | Blocking? | Default if unanswered |
|---|---|---|---|
| OQ-1 | Do you need a Platform Admin (SaaS operator) console, or is this a single-garage install? | Non-blocking | Keep multi-garage with minimal UC-19 |
| OQ-2 | Should owners be notified by WhatsApp as well as SMS and email? | Non-blocking | Email + SMS; channel interface allows WhatsApp later |
| OQ-3 | What is the expected notification volume? Above roughly 5k/day justifies Redis + BullMQ. | Non-blocking | Postgres-backed queue |
| OQ-4 | Is GST-compliant invoicing (HSN/SAC codes, CGST/SGST split, PDF invoice) required in v1? | Non-blocking | Flat tax, no PDF |
| OQ-5 | Do you need parts inventory (stock levels, auto-deduct on job)? | Non-blocking | Out of scope; parts are free-text line items |
| OQ-6 | Should reminder timing be per-garage-timezone or a single platform timezone? | Non-blocking | Per-garage timezone |
| OQ-7 | Should customers be able to book appointments online? | Non-blocking | Out of scope |

No **[BLOCKING]** questions. The pipeline can proceed on the defaults above.

## 9. Out of Scope (v1)

Online payments or payment gateway; parts inventory and suppliers; appointment booking; a customer mobile app or customer login; multi-branch chains; payroll and mechanic commissions; insurance claims; GST e-invoicing; WhatsApp.

## 10. Handoff Notes

- **Okr-nestjs-scaffolder:** modules → `auth`, `garages`, `staff`, `customers`, `vehicles`, `job-cards` (includes problems, attachments, status history), `estimates`, `customer-portal` (public link endpoints), `notifications` (+ worker), `invoices` (+ payments), `dashboard`, `audit`, `storage`. Also `frontend/` Next.js app.
- **Okr-database-architect:** ENT-1..ENT-16. Watch: unique (garage, registration number), unique (garage, job number) and (garage, invoice number), a partial unique index on "one non-terminal job per vehicle", NUMERIC(12,2) money (NFR-6), per-garage counters (A-6), and a notification queue index on (status, next attempt).
- **Okr-backend-auth-security:** ACT-1..ACT-6 roles, NFR-3/4/5, UC-2, UC-12 link tokens, UC-19 suspended-garage check. Publish the `EAdminModule`/`EUserModule` section taxonomy covering the modules above.
- **Okr-api-designer:** UC-1..UC-19, status machine §3.1, NFR-10 conventions, public `customer-portal` endpoints (rate-limited, NFR-5).
- **Okr-service-layer:** transactions on UC-1, UC-8, UC-11, UC-12, UC-15; server-side money maths (AC-11.1); audit in the same transaction (NFR-7).
- **Okr-test-engineer:** every AC-N.M plus the AC-NFR-3 cross-tenant matrix.
