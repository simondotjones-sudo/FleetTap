CREATE TABLE IF NOT EXISTS inspection_documents (
 id uuid PRIMARY KEY,
 garage_id uuid NOT NULL REFERENCES garages(id),
 name text NOT NULL,
 content text NOT NULL CHECK(length(content) <= 5592408),
 uploaded_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inspection_documents_garage_idx ON inspection_documents(garage_id);
