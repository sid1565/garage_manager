import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791448325341 implements MigrationInterface {
  name = 'InitialSchema1791448325341';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extensions: citext (case-insensitive staff email), pg_trgm (fuzzy search, UC-6).
    // gen_random_uuid() is built into PostgreSQL 13+, so no uuid extension is needed.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "citext"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
    await queryRunner.query(`CREATE TYPE "public"."garage_status" AS ENUM('ACTIVE', 'SUSPENDED')`);
    await queryRunner.query(
      `CREATE TABLE "garages" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(150) NOT NULL, "address_line" character varying(255), "city" character varying(100), "state" character varying(100), "postal_code" character varying(20), "phone" character varying(20) NOT NULL, "email" character varying(255), "tax_registration_number" character varying(30), "currency" character(3) NOT NULL DEFAULT 'INR', "tax_rate" numeric(5,2) NOT NULL DEFAULT 0, "timezone" character varying(64) NOT NULL DEFAULT 'Asia/Kolkata', "status" "public"."garage_status" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_5aab32f702d77c87b2555553919" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."notification_channel" AS ENUM('EMAIL', 'SMS')`);
    await queryRunner.query(`CREATE TYPE "public"."record_status" AS ENUM('ACTIVE', 'INACTIVE')`);
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "garage_id" uuid NOT NULL, "name" character varying(120) NOT NULL, "phone" character varying(20) NOT NULL, "email" character varying(255), "address" text, "preferred_channels" "public"."notification_channel" array NOT NULL, "notes" text, "status" "public"."record_status" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_customers_garage_status_created" ON "customers" ("garage_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_customers_garage_phone" ON "customers" ("garage_id", "phone") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fuel_type" AS ENUM('PETROL', 'DIESEL', 'CNG', 'LPG', 'ELECTRIC', 'HYBRID', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vehicles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "garage_id" uuid NOT NULL, "customer_id" uuid NOT NULL, "registration_number" character varying(20) NOT NULL, "vin" character varying(17), "make" character varying(60) NOT NULL, "model" character varying(60) NOT NULL, "variant" character varying(60), "manufacture_year" smallint, "fuel_type" "public"."fuel_type" NOT NULL, "color" character varying(30), "odometer_km" integer NOT NULL DEFAULT '0', "next_service_date" date, "last_reminder_sent_for" date, "status" "public"."record_status" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "CHK_vehicles_odometer_non_negative" CHECK ("odometer_km" >= 0), CONSTRAINT "PK_18d8646b59304dce4af3a9e35b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_vehicles_next_service_active" ON "vehicles" ("next_service_date") WHERE "status" = 'ACTIVE' AND "next_service_date" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_vehicles_garage_customer" ON "vehicles" ("garage_id", "customer_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_vehicles_garage_registration" ON "vehicles" ("garage_id", "registration_number") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_role" AS ENUM('PLATFORM_ADMIN', 'GARAGE_ADMIN', 'SERVICE_ADVISOR', 'MECHANIC')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "garage_id" uuid, "name" character varying(120) NOT NULL, "email" citext NOT NULL, "phone" character varying(20), "password_hash" character varying(255) NOT NULL, "role" "public"."user_role" NOT NULL, "status" "public"."record_status" NOT NULL DEFAULT 'ACTIVE', "last_login_at" TIMESTAMP WITH TIME ZONE, "password_changed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "CHK_users_garage_matches_role" CHECK (("role" = 'PLATFORM_ADMIN') = ("garage_id" IS NULL)), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_garage_role" ON "users" ("garage_id", "role") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."job_card_status" AS ENUM('CHECKED_IN', 'DIAGNOSING', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY_FOR_PICKUP', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fuel_level" AS ENUM('EMPTY', 'QUARTER', 'HALF', 'THREE_QUARTER', 'FULL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "job_cards" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "garage_id" uuid NOT NULL, "vehicle_id" uuid NOT NULL, "customer_id" uuid NOT NULL, "job_number" character varying(20) NOT NULL, "status" "public"."job_card_status" NOT NULL DEFAULT 'CHECKED_IN', "checkin_odometer_km" integer NOT NULL, "fuel_level" "public"."fuel_level", "customer_complaints" text NOT NULL, "promised_delivery_at" TIMESTAMP WITH TIME ZONE, "assigned_mechanic_id" uuid, "opened_by_id" uuid NOT NULL, "closed_at" TIMESTAMP WITH TIME ZONE, "delivered_on_credit" boolean NOT NULL DEFAULT false, "cancellation_reason" text, CONSTRAINT "CHK_job_cards_checkin_odometer_non_negative" CHECK ("checkin_odometer_km" >= 0), CONSTRAINT "PK_4810b52d9df46e7ef0d41beffe3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_cards_garage_promised_open" ON "job_cards" ("garage_id", "promised_delivery_at") WHERE "status" NOT IN ('DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_cards_garage_mechanic_open" ON "job_cards" ("garage_id", "assigned_mechanic_id") WHERE "status" NOT IN ('DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_cards_vehicle_created" ON "job_cards" ("vehicle_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_cards_garage_status_created" ON "job_cards" ("garage_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_job_cards_open_per_vehicle" ON "job_cards" ("vehicle_id") WHERE "status" NOT IN ('DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_job_cards_garage_job_number" ON "job_cards" ("garage_id", "job_number") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_type" AS ENUM('JOB_CHECKED_IN', 'PROBLEMS_FOUND', 'ESTIMATE_SENT', 'JOB_APPROVED', 'READY_FOR_PICKUP', 'INVOICE_ISSUED', 'SERVICE_REMINDER', 'STAFF_WELCOME')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_status" AS ENUM('QUEUED', 'SENDING', 'SENT', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "garage_id" uuid NOT NULL, "customer_id" uuid, "job_card_id" uuid, "type" "public"."notification_type" NOT NULL, "channel" "public"."notification_channel" NOT NULL, "recipient" character varying(255) NOT NULL, "subject" character varying(255), "body" text NOT NULL, "status" "public"."notification_status" NOT NULL DEFAULT 'QUEUED', "attempts" smallint NOT NULL DEFAULT '0', "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_error" text, "provider_message_id" character varying(255), "sent_at" TIMESTAMP WITH TIME ZONE, "created_by_id" uuid, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_garage_status_created" ON "notifications" ("garage_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_garage_customer_created" ON "notifications" ("garage_id", "customer_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_garage_job_created" ON "notifications" ("garage_id", "job_card_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_queue" ON "notifications" ("next_attempt_at") WHERE "status" = 'QUEUED'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."problem_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."problem_category" AS ENUM('ENGINE', 'TRANSMISSION', 'BRAKES', 'SUSPENSION', 'STEERING', 'ELECTRICAL', 'AIR_CONDITIONING', 'BODY', 'TYRES', 'COOLING', 'EXHAUST', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "problems" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "job_card_id" uuid NOT NULL, "title" character varying(150) NOT NULL, "description" text, "severity" "public"."problem_severity" NOT NULL, "category" "public"."problem_category" NOT NULL, "requires_new_estimate" boolean NOT NULL DEFAULT false, "recorded_by_id" uuid NOT NULL, CONSTRAINT "PK_b3994afba6ab64a42cda1ccaeff" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_problems_job_card" ON "problems" ("job_card_id") `);
    await queryRunner.query(
      `CREATE TABLE "job_status_history" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "job_card_id" uuid NOT NULL, "from_status" "public"."job_card_status", "to_status" "public"."job_card_status" NOT NULL, "changed_by_id" uuid, "note" text, CONSTRAINT "PK_971859ffd3de1d3118837cb4d9d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_status_history_job_created" ON "job_status_history" ("job_card_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "attachments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "job_card_id" uuid NOT NULL, "problem_id" uuid, "storage_key" character varying(500) NOT NULL, "original_name" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "size_bytes" integer NOT NULL, "caption" character varying(255), "uploaded_by_id" uuid NOT NULL, CONSTRAINT "CHK_attachments_size" CHECK ("size_bytes" > 0 AND "size_bytes" <= 5242880), CONSTRAINT "PK_5e1f050bcff31e3084a1d662412" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_problem" ON "attachments" ("problem_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_job_card" ON "attachments" ("job_card_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."invoice_status" AS ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOID')`,
    );
    await queryRunner.query(
      `CREATE TABLE "invoices" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "garage_id" uuid NOT NULL, "job_card_id" uuid NOT NULL, "invoice_number" character varying(20) NOT NULL, "status" "public"."invoice_status" NOT NULL DEFAULT 'UNPAID', "subtotal" numeric(12,2) NOT NULL, "discount" numeric(12,2) NOT NULL DEFAULT 0, "tax_rate" numeric(5,2) NOT NULL, "tax_amount" numeric(12,2) NOT NULL, "total" numeric(12,2) NOT NULL, "amount_paid" numeric(12,2) NOT NULL DEFAULT 0, "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL, "notes" text, "created_by_id" uuid NOT NULL, CONSTRAINT "CHK_invoices_paid_range" CHECK ("amount_paid" >= 0 AND "amount_paid" <= "total"), CONSTRAINT "CHK_invoices_discount_range" CHECK ("discount" >= 0 AND "discount" <= "subtotal"), CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invoices_garage_status_issued" ON "invoices" ("garage_id", "status", "issued_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_invoices_job_card" ON "invoices" ("job_card_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_invoices_garage_number" ON "invoices" ("garage_id", "invoice_number") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "garage_id" uuid NOT NULL, "invoice_id" uuid NOT NULL, "amount" numeric(12,2) NOT NULL, "method" "public"."payment_method" NOT NULL, "reference" character varying(100), "received_at" TIMESTAMP WITH TIME ZONE NOT NULL, "received_by_id" uuid NOT NULL, CONSTRAINT "CHK_payments_amount_positive" CHECK ("amount" > 0), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_garage_received" ON "payments" ("garage_id", "received_at") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_payments_invoice" ON "payments" ("invoice_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."estimate_status" AS ENUM('DRAFT', 'SENT', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'EXPIRED', 'SUPERSEDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."approval_method" AS ENUM('CUSTOMER_LINK', 'VERBAL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "estimates" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "job_card_id" uuid NOT NULL, "version" smallint NOT NULL, "status" "public"."estimate_status" NOT NULL DEFAULT 'DRAFT', "subtotal" numeric(12,2) NOT NULL DEFAULT 0, "tax_rate" numeric(5,2) NOT NULL, "tax_amount" numeric(12,2) NOT NULL DEFAULT 0, "total" numeric(12,2) NOT NULL DEFAULT 0, "approved_total" numeric(12,2), "valid_until" TIMESTAMP WITH TIME ZONE, "sent_at" TIMESTAMP WITH TIME ZONE, "responded_at" TIMESTAMP WITH TIME ZONE, "customer_remark" text, "approval_method" "public"."approval_method", "verbal_approval_note" text, "created_by_id" uuid NOT NULL, "responded_by_staff_id" uuid, CONSTRAINT "CHK_estimates_verbal_note" CHECK ("approval_method" IS DISTINCT FROM 'VERBAL' OR "verbal_approval_note" IS NOT NULL), CONSTRAINT "CHK_estimates_amounts_non_negative" CHECK ("subtotal" >= 0 AND "tax_amount" >= 0 AND "total" >= 0), CONSTRAINT "PK_447af75b2f6025adf7f80703810" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_estimates_one_sent_per_job" ON "estimates" ("job_card_id") WHERE "status" = 'SENT'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_estimates_job_version" ON "estimates" ("job_card_id", "version") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."line_item_type" AS ENUM('PART', 'LABOUR')`);
    await queryRunner.query(
      `CREATE TYPE "public"."line_item_approval" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "estimate_line_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "estimate_id" uuid NOT NULL, "problem_id" uuid, "item_type" "public"."line_item_type" NOT NULL, "description" character varying(255) NOT NULL, "quantity" numeric(10,2) NOT NULL, "unit_price" numeric(12,2) NOT NULL, "line_total" numeric(12,2) NOT NULL, "approval_state" "public"."line_item_approval" NOT NULL DEFAULT 'PENDING', "sort_order" smallint NOT NULL DEFAULT '0', CONSTRAINT "CHK_estimate_line_items_unit_price_non_negative" CHECK ("unit_price" >= 0), CONSTRAINT "CHK_estimate_line_items_quantity_positive" CHECK ("quantity" > 0), CONSTRAINT "PK_b1b8c9a8ec2caf90b4c1f41df87" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_estimate_line_items_problem" ON "estimate_line_items" ("problem_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_estimate_line_items_estimate" ON "estimate_line_items" ("estimate_id", "sort_order") `,
    );
    await queryRunner.query(
      `CREATE TABLE "invoice_line_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "invoice_id" uuid NOT NULL, "source_estimate_line_item_id" uuid, "item_type" "public"."line_item_type" NOT NULL, "description" character varying(255) NOT NULL, "quantity" numeric(10,2) NOT NULL, "unit_price" numeric(12,2) NOT NULL, "line_total" numeric(12,2) NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', CONSTRAINT "CHK_invoice_line_items_unit_price_non_negative" CHECK ("unit_price" >= 0), CONSTRAINT "CHK_invoice_line_items_quantity_positive" CHECK ("quantity" > 0), CONSTRAINT "PK_4e8ccaadaf5d0619db9d219b061" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_line_items_invoice" ON "invoice_line_items" ("invoice_id", "sort_order") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."counter_type" AS ENUM('JOB_CARD', 'INVOICE')`);
    await queryRunner.query(
      `CREATE TABLE "garage_counters" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "garage_id" uuid NOT NULL, "counter_type" "public"."counter_type" NOT NULL, "period" smallint NOT NULL, "last_value" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_598fde6adad9c4a9ddd60e6ea6e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_garage_counters_garage_type_period" ON "garage_counters" ("garage_id", "counter_type", "period") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."link_purpose" AS ENUM('VIEW_JOB', 'APPROVE_ESTIMATE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_access_links" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "garage_id" uuid NOT NULL, "job_card_id" uuid NOT NULL, "estimate_id" uuid, "purpose" "public"."link_purpose" NOT NULL, "token_hash" character(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "used_at" TIMESTAMP WITH TIME ZONE, "last_accessed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_cbce0d1c284721ad2458261c399" UNIQUE ("token_hash"), CONSTRAINT "CHK_customer_access_links_estimate_purpose" CHECK (("purpose" = 'APPROVE_ESTIMATE') = ("estimate_id" IS NOT NULL)), CONSTRAINT "PK_3526abb5464c2bcdeb5a9c0a4cc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_access_links_estimate" ON "customer_access_links" ("estimate_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_access_links_job" ON "customer_access_links" ("job_card_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "token_hash" character(64) NOT NULL, "family_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "replaced_by_id" uuid, "created_by_ip" character varying(45), "user_agent" character varying(255), CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE ("token_hash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_family" ON "refresh_tokens" ("family_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_user" ON "refresh_tokens" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."actor_type" AS ENUM('STAFF', 'CUSTOMER', 'SYSTEM')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "garage_id" uuid, "actor_type" "public"."actor_type" NOT NULL, "actor_user_id" uuid, "action" character varying(80) NOT NULL, "entity_type" character varying(50) NOT NULL, "entity_id" uuid, "changes" jsonb, "ip_address" character varying(45), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_garage_created" ON "audit_logs" ("garage_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_91dad1ff5fee012a69829e12a02" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD CONSTRAINT "FK_d662047bedecdaaa056f7d02089" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD CONSTRAINT "FK_c1cda98f67cb9c79a1f1153e627" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_cf5fa896055a9ddfbf40b492d35" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" ADD CONSTRAINT "FK_c3708beb97e2ad034645436362c" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" ADD CONSTRAINT "FK_beb5447fd922453cc91e4961ea2" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" ADD CONSTRAINT "FK_3119c539d6a38261b0313babd81" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" ADD CONSTRAINT "FK_d0019e9db85df41ba7eb2135684" FOREIGN KEY ("assigned_mechanic_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" ADD CONSTRAINT "FK_d799e22462cfdb7270b906f0f0d" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_69c5006cb54eb32762f9aee790f" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_b55350bc786b052e8523f313b9a" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_5268193dc6e926baaac5116e338" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_8abe9303bccd29799a4d435eb03" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "problems" ADD CONSTRAINT "FK_cfb60f1baa4a8a7c50af45c87ee" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "problems" ADD CONSTRAINT "FK_9e95f586993b448a20548aa4752" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_status_history" ADD CONSTRAINT "FK_78d2cc2e83bd16d8739ad264015" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_status_history" ADD CONSTRAINT "FK_b4bac1623138b3d4e33cf9f23e5" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_3305c771ab3235016d7acd3f7c5" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_9d3e8e7060292198da06ae919fc" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_70a38fc450d3b433c86b67e69d6" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_08349cbb7a3d9fb6b5551cac8bd" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_f6d3a188a40c8f2bf14c0dc1021" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_7e369959f4952d563122ef12f11" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_b60298a1c69fcb1108023afb01a" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_563a5e248518c623eebd987d43e" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_fdb95dd85ac02027afaed80f139" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD CONSTRAINT "FK_90804e9e72bbb597aa71ee45919" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD CONSTRAINT "FK_562feff47fd40416c8bdb0d1704" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD CONSTRAINT "FK_a7504a086e8802c59d68d1d169b" FOREIGN KEY ("responded_by_staff_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "estimate_line_items" ADD CONSTRAINT "FK_1d2d611176987901de14f6fc1af" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "estimate_line_items" ADD CONSTRAINT "FK_73ae6eb9133659ee589e6d1ac73" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_line_items" ADD CONSTRAINT "FK_e554609a06b180dac66a9a977c5" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_line_items" ADD CONSTRAINT "FK_3e525a5bd3d4c7a2b25aee31dd7" FOREIGN KEY ("source_estimate_line_item_id") REFERENCES "estimate_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "garage_counters" ADD CONSTRAINT "FK_a8a2c52ca1f2764a293d23b61d5" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_access_links" ADD CONSTRAINT "FK_a954305c588e3b6ab5385c64a2c" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_access_links" ADD CONSTRAINT "FK_b9e02064e1987bf5bb4d04eb66b" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_access_links" ADD CONSTRAINT "FK_9022f0b4104508974fd351b4a2b" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_bacf7b91ba2f96fe9392fe18810" FOREIGN KEY ("garage_id") REFERENCES "garages"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_f160d97a931844109de9d04228f" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    // Trigram (GIN) indexes for ILIKE '%term%' search — declared synchronize:false on the entities.
    await queryRunner.query(
      `CREATE INDEX "IDX_customers_name_trgm" ON "customers" USING GIN ("name" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_vehicles_registration_trgm" ON "vehicles" USING GIN ("registration_number" gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_vehicles_registration_trgm"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_customers_name_trgm"`);
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_f160d97a931844109de9d04228f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_bacf7b91ba2f96fe9392fe18810"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_access_links" DROP CONSTRAINT "FK_9022f0b4104508974fd351b4a2b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_access_links" DROP CONSTRAINT "FK_b9e02064e1987bf5bb4d04eb66b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_access_links" DROP CONSTRAINT "FK_a954305c588e3b6ab5385c64a2c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "garage_counters" DROP CONSTRAINT "FK_a8a2c52ca1f2764a293d23b61d5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_line_items" DROP CONSTRAINT "FK_3e525a5bd3d4c7a2b25aee31dd7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_line_items" DROP CONSTRAINT "FK_e554609a06b180dac66a9a977c5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "estimate_line_items" DROP CONSTRAINT "FK_73ae6eb9133659ee589e6d1ac73"`,
    );
    await queryRunner.query(
      `ALTER TABLE "estimate_line_items" DROP CONSTRAINT "FK_1d2d611176987901de14f6fc1af"`,
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP CONSTRAINT "FK_a7504a086e8802c59d68d1d169b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP CONSTRAINT "FK_562feff47fd40416c8bdb0d1704"`,
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP CONSTRAINT "FK_90804e9e72bbb597aa71ee45919"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_fdb95dd85ac02027afaed80f139"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_563a5e248518c623eebd987d43e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_b60298a1c69fcb1108023afb01a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_7e369959f4952d563122ef12f11"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_f6d3a188a40c8f2bf14c0dc1021"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_08349cbb7a3d9fb6b5551cac8bd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP CONSTRAINT "FK_70a38fc450d3b433c86b67e69d6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP CONSTRAINT "FK_9d3e8e7060292198da06ae919fc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP CONSTRAINT "FK_3305c771ab3235016d7acd3f7c5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_status_history" DROP CONSTRAINT "FK_b4bac1623138b3d4e33cf9f23e5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_status_history" DROP CONSTRAINT "FK_78d2cc2e83bd16d8739ad264015"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problems" DROP CONSTRAINT "FK_9e95f586993b448a20548aa4752"`,
    );
    await queryRunner.query(
      `ALTER TABLE "problems" DROP CONSTRAINT "FK_cfb60f1baa4a8a7c50af45c87ee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_8abe9303bccd29799a4d435eb03"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_5268193dc6e926baaac5116e338"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_b55350bc786b052e8523f313b9a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_69c5006cb54eb32762f9aee790f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" DROP CONSTRAINT "FK_d799e22462cfdb7270b906f0f0d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" DROP CONSTRAINT "FK_d0019e9db85df41ba7eb2135684"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" DROP CONSTRAINT "FK_3119c539d6a38261b0313babd81"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" DROP CONSTRAINT "FK_beb5447fd922453cc91e4961ea2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "job_cards" DROP CONSTRAINT "FK_c3708beb97e2ad034645436362c"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_cf5fa896055a9ddfbf40b492d35"`);
    await queryRunner.query(
      `ALTER TABLE "vehicles" DROP CONSTRAINT "FK_c1cda98f67cb9c79a1f1153e627"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" DROP CONSTRAINT "FK_d662047bedecdaaa056f7d02089"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_91dad1ff5fee012a69829e12a02"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_garage_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_entity"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."actor_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_family"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_customer_access_links_job"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_customer_access_links_estimate"`);
    await queryRunner.query(`DROP TABLE "customer_access_links"`);
    await queryRunner.query(`DROP TYPE "public"."link_purpose"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_garage_counters_garage_type_period"`);
    await queryRunner.query(`DROP TABLE "garage_counters"`);
    await queryRunner.query(`DROP TYPE "public"."counter_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_invoice_line_items_invoice"`);
    await queryRunner.query(`DROP TABLE "invoice_line_items"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_estimate_line_items_estimate"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_estimate_line_items_problem"`);
    await queryRunner.query(`DROP TABLE "estimate_line_items"`);
    await queryRunner.query(`DROP TYPE "public"."line_item_approval"`);
    await queryRunner.query(`DROP TYPE "public"."line_item_type"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_estimates_job_version"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_estimates_one_sent_per_job"`);
    await queryRunner.query(`DROP TABLE "estimates"`);
    await queryRunner.query(`DROP TYPE "public"."approval_method"`);
    await queryRunner.query(`DROP TYPE "public"."estimate_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_invoice"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payments_garage_received"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payment_method"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_invoices_garage_number"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_invoices_job_card"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_invoices_garage_status_issued"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TYPE "public"."invoice_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_attachments_job_card"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_attachments_problem"`);
    await queryRunner.query(`DROP TABLE "attachments"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_job_status_history_job_created"`);
    await queryRunner.query(`DROP TABLE "job_status_history"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_problems_job_card"`);
    await queryRunner.query(`DROP TABLE "problems"`);
    await queryRunner.query(`DROP TYPE "public"."problem_category"`);
    await queryRunner.query(`DROP TYPE "public"."problem_severity"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_queue"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_garage_job_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_garage_customer_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_garage_status_created"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "public"."notification_status"`);
    await queryRunner.query(`DROP TYPE "public"."notification_type"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_job_cards_garage_job_number"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_job_cards_open_per_vehicle"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_job_cards_garage_status_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_job_cards_vehicle_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_job_cards_garage_mechanic_open"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_job_cards_garage_promised_open"`);
    await queryRunner.query(`DROP TABLE "job_cards"`);
    await queryRunner.query(`DROP TYPE "public"."fuel_level"`);
    await queryRunner.query(`DROP TYPE "public"."job_card_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_users_garage_role"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."user_role"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_vehicles_garage_registration"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_vehicles_garage_customer"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_vehicles_next_service_active"`);
    await queryRunner.query(`DROP TABLE "vehicles"`);
    await queryRunner.query(`DROP TYPE "public"."fuel_type"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_customers_garage_phone"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_customers_garage_status_created"`);
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP TYPE "public"."record_status"`);
    await queryRunner.query(`DROP TYPE "public"."notification_channel"`);
    await queryRunner.query(`DROP TABLE "garages"`);
    await queryRunner.query(`DROP TYPE "public"."garage_status"`);
  }
}
