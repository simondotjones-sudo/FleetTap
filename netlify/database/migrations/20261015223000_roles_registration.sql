ALTER TABLE organisations ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE organisations ADD COLUMN role_names jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE organisations ADD COLUMN login_code text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
ALTER TABLE organisations ADD CONSTRAINT organisations_login_code_key UNIQUE(login_code);
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users DROP CONSTRAINT users_check;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN employee_id text;
ALTER TABLE users ADD COLUMN demo boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('platform_admin','organisation_admin','garage_manager','supervisor','mechanic'));
ALTER TABLE users ADD CONSTRAINT users_scope_check CHECK (
 (role='platform_admin' AND organisation_id IS NULL AND garage_id IS NULL) OR
 (role='organisation_admin' AND organisation_id IS NOT NULL AND garage_id IS NULL) OR
 (role IN ('garage_manager','supervisor','mechanic') AND organisation_id IS NOT NULL AND garage_id IS NOT NULL));
ALTER TABLE users ADD CONSTRAINT users_identifier_check CHECK(email IS NOT NULL OR (employee_id IS NOT NULL AND organisation_id IS NOT NULL));
CREATE UNIQUE INDEX users_employee_org_key ON users(organisation_id,lower(employee_id)) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX garages_org_id_key ON garages(organisation_id,id);
ALTER TABLE users ADD CONSTRAINT users_garage_org_key FOREIGN KEY(organisation_id,garage_id) REFERENCES garages(organisation_id,id);
CREATE TABLE registration_codes(garage_id uuid PRIMARY KEY REFERENCES garages(id),code_hash text NOT NULL UNIQUE,enabled boolean NOT NULL DEFAULT true,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE organisation_content(organisation_id uuid PRIMARY KEY REFERENCES organisations(id),version integer NOT NULL DEFAULT 0,data jsonb NOT NULL DEFAULT '{"sops":[],"checklists":[]}'::jsonb);
