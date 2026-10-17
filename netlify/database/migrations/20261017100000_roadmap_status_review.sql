-- Refresh only roadmap statuses. Preserve edited briefs, feedback and audit attribution.
-- Increment versions so an editor opened before the review cannot overwrite it silently.
UPDATE product_roadmap AS feature
SET data=jsonb_set(feature.data,'{status}',to_jsonb(review.status),true),
    version=feature.version+1,
    updated_at=now()
FROM (VALUES
 ('bus-work-pack','Available'),
 ('voice-updates','In dev'),
 ('workshop-knowledge','In dev'),
 ('garage-today','Available'),
 ('job-cards','Available'),
 ('shift-handover','Available'),
 ('return-to-service','Available'),
 ('parts-tracker','Idea'),
 ('bus-history','Available'),
 ('workshop-planner','In dev'),
 ('driver-reports','Available'),
 ('vehicle-record-pack','In dev'),
 ('model-campaigns','In dev')
) AS review(id,status)
WHERE feature.id=review.id AND feature.data->>'status' IS DISTINCT FROM review.status;
