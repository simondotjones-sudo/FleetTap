-- Voice dictation and review have been tested and accepted as available.
-- Preserve every brief, discussion note and attribution; protect open editors.
UPDATE product_roadmap
SET data=jsonb_set(data,'{status}','"Available"'::jsonb,true),
    version=version+1,
    updated_at=now()
WHERE id='voice-updates' AND data->>'status' IS DISTINCT FROM 'Available';
