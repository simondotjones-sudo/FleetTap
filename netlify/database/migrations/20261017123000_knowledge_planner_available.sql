-- Existing knowledge and planning workflows have been tested and accepted.
-- Preserve briefs, feedback and attribution; protect open editors with a version bump.
UPDATE product_roadmap
SET data=jsonb_set(data,'{status}','"Available"'::jsonb,true),
    version=version+1,
    updated_at=now()
WHERE id IN ('workshop-knowledge','workshop-planner')
  AND data->>'status' IS DISTINCT FROM 'Available';
