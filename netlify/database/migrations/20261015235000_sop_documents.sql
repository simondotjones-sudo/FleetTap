CREATE TABLE IF NOT EXISTS sop_documents (
 id uuid PRIMARY KEY,
 organisation_id uuid NOT NULL REFERENCES organisations(id),
 sop_id uuid NOT NULL,
 name text NOT NULL,
 content text NOT NULL CHECK(length(content) <= 5592408),
 uploaded_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sop_documents_org_idx ON sop_documents(organisation_id, sop_id);
