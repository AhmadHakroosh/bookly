CREATE TABLE "form_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"form_id" text NOT NULL,
	"form_version_id" text NOT NULL,
	"contact_id" text,
	"booking_id" text,
	"application_id" text,
	"routing_form_id" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"resume_token_hash" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"form_id" text NOT NULL,
	"version" integer NOT NULL,
	"schema" jsonb NOT NULL,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"shared" boolean DEFAULT true NOT NULL,
	"published_version_id" text,
	"draft" jsonb,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "form_id" text;--> statement-breakpoint
ALTER TABLE "routing_forms" ADD COLUMN "form_id" text;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_form_version_id_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."form_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_routing_form_id_routing_forms_id_fk" FOREIGN KEY ("routing_form_id") REFERENCES "public"."routing_forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_responses_ws_form_idx" ON "form_responses" USING btree ("workspace_id","form_id","submitted_at");--> statement-breakpoint
CREATE INDEX "form_responses_contact_idx" ON "form_responses" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "form_responses_booking_idx" ON "form_responses" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "form_responses_application_idx" ON "form_responses" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_responses_resume_idx" ON "form_responses" USING btree ("resume_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "form_versions_form_version_idx" ON "form_versions" USING btree ("form_id","version");--> statement-breakpoint
CREATE INDEX "forms_ws_purpose_idx" ON "forms" USING btree ("workspace_id","purpose");--> statement-breakpoint
-- Backfill (ADR 0004): booking questions and routing questionnaires become versioned forms.
-- Field ids are the old question ids, so bookings.answers keys and routing conditions stay
-- valid. Ids derive from the owner's, so every statement is idempotent. Keep the mapping in
-- step with fromEventQuestions() in packages/forms/src/index.ts.
INSERT INTO "forms" ("id", "workspace_id", "name", "purpose", "shared", "published_version_id")
SELECT 'f_et_' || et."id", et."workspace_id", et."title", 'booking', false, 'fv_et_' || et."id" || '_1'
FROM "event_types" et
WHERE jsonb_array_length(et."questions") > 0
  AND NOT EXISTS (SELECT 1 FROM "forms" f WHERE f."id" = 'f_et_' || et."id");--> statement-breakpoint
INSERT INTO "form_versions" ("id", "workspace_id", "form_id", "version", "schema")
SELECT 'fv_et_' || et."id" || '_1', et."workspace_id", 'f_et_' || et."id", 1,
  jsonb_build_object('v', 1, 'pages', jsonb_build_array(jsonb_build_object('id', 'p1', 'fieldIds', coalesce((SELECT jsonb_agg(q->'id' ORDER BY ord) FROM jsonb_array_elements(et."questions") WITH ORDINALITY AS e(q, ord)), '[]'::jsonb))), 'fields', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', q->>'id',
          'type', CASE
            WHEN q->>'type' = 'select' AND jsonb_typeof(q->'options') = 'array' AND jsonb_array_length(q->'options') > 0 THEN 'select'
            WHEN q->>'type' = 'textarea' THEN 'long_text'
            WHEN q->>'type' IN ('email', 'phone') THEN q->>'type'
            ELSE 'short_text' END,
          'label', q->>'label',
          'required', coalesce((q->>'required')::boolean, false)
        ) || CASE WHEN jsonb_typeof(q->'options') = 'array' AND jsonb_array_length(q->'options') > 0
          THEN jsonb_build_object('options', (SELECT jsonb_agg(jsonb_build_object('value', o, 'label', o) ORDER BY oo) FROM jsonb_array_elements_text(q->'options') WITH ORDINALITY AS x(o, oo)))
          ELSE '{}'::jsonb END
        ORDER BY ord)
      FROM jsonb_array_elements(et."questions") WITH ORDINALITY AS e(q, ord)), '[]'::jsonb))
FROM "event_types" et
WHERE jsonb_array_length(et."questions") > 0
  AND NOT EXISTS (SELECT 1 FROM "form_versions" v WHERE v."id" = 'fv_et_' || et."id" || '_1');--> statement-breakpoint
UPDATE "event_types" SET "form_id" = 'f_et_' || "id"
WHERE "form_id" IS NULL AND jsonb_array_length("questions") > 0;--> statement-breakpoint
INSERT INTO "forms" ("id", "workspace_id", "name", "purpose", "shared", "published_version_id")
SELECT 'f_rf_' || rf."id", rf."workspace_id", rf."name", 'routing', true, 'fv_rf_' || rf."id" || '_1'
FROM "routing_forms" rf
WHERE NOT EXISTS (SELECT 1 FROM "forms" f WHERE f."id" = 'f_rf_' || rf."id");--> statement-breakpoint
INSERT INTO "form_versions" ("id", "workspace_id", "form_id", "version", "schema")
SELECT 'fv_rf_' || rf."id" || '_1', rf."workspace_id", 'f_rf_' || rf."id", 1,
  jsonb_build_object('v', 1, 'pages', jsonb_build_array(jsonb_build_object('id', 'p1', 'fieldIds', coalesce((SELECT jsonb_agg(q->'id' ORDER BY ord) FROM jsonb_array_elements(rf."questions") WITH ORDINALITY AS e(q, ord)), '[]'::jsonb))), 'fields', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', q->>'id',
          'type', CASE
            WHEN q->>'type' = 'select' AND jsonb_typeof(q->'options') = 'array' AND jsonb_array_length(q->'options') > 0 THEN 'select'
            WHEN q->>'type' = 'textarea' THEN 'long_text'
            WHEN q->>'type' IN ('email', 'phone') THEN q->>'type'
            ELSE 'short_text' END,
          'label', q->>'label',
          'required', coalesce((q->>'required')::boolean, false)
        ) || CASE WHEN jsonb_typeof(q->'options') = 'array' AND jsonb_array_length(q->'options') > 0
          THEN jsonb_build_object('options', (SELECT jsonb_agg(jsonb_build_object('value', o, 'label', o) ORDER BY oo) FROM jsonb_array_elements_text(q->'options') WITH ORDINALITY AS x(o, oo)))
          ELSE '{}'::jsonb END
        ORDER BY ord)
      FROM jsonb_array_elements(rf."questions") WITH ORDINALITY AS e(q, ord)), '[]'::jsonb))
FROM "routing_forms" rf
WHERE NOT EXISTS (SELECT 1 FROM "form_versions" v WHERE v."id" = 'fv_rf_' || rf."id" || '_1');--> statement-breakpoint
UPDATE "routing_forms" SET "form_id" = 'f_rf_' || "id" WHERE "form_id" IS NULL;
