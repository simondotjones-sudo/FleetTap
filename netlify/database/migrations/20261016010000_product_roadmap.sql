-- Platform-wide product planning; only platform administrators can access this table through the API.
CREATE TABLE product_roadmap (
 id text PRIMARY KEY,
 data jsonb NOT NULL,
 version integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
