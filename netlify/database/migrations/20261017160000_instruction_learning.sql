CREATE TABLE IF NOT EXISTS instruction_learning (
 organisation_id uuid NOT NULL REFERENCES organisations(id),
 user_id uuid NOT NULL REFERENCES users(id),
 instruction_id uuid NOT NULL,
 version integer NOT NULL CHECK(version > 0),
 data jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organisation_id,user_id,instruction_id,version)
);
CREATE INDEX IF NOT EXISTS instruction_learning_person_idx ON instruction_learning(user_id,organisation_id);
