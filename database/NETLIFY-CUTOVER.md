# Netlify Database cutover

Prepared for FleetTap 1.15.10.26.6. Production currently uses the separate Neon project `weathered-base-05562568`. The new schema is installed by Netlify from `netlify/database/migrations/`. Never apply DDL directly to a hosted Netlify database.

## Release gate

Simon’s explicit approval is required before merging/publishing `main`. The feature branch and preview are preparation only. Browser QA is outstanding because this environment has no supported browser-control skill for preview testing.

## Provision and rehearse

1. Let the feature PR build a Netlify preview. The installed `@netlify/database` package requests provisioning and applies the baseline and document migrations. Verify the deployment and `netlify database status --branch feature/fleet-admin-schedules` using an authenticated CLI, or Data & Storage in Netlify. Do not infer provisioning from a successful static build.
2. Obtain the preview database URL through the supported Netlify Database UI/CLI. Production credentials must never be configured on previews. Preview runtime uses `NETLIFY_DB_URL`; `FLEETTAP_DATABASE_URL` remains production-only.
3. Rehearse a data-only import into the empty preview using `scripts/copy-database.mjs`, supplying its JSON over hidden stdin. The script reads the source in one repeatable-read transaction, refuses nonempty targets, copies data in one transaction, checks row counts and restores audit ID sequencing. It never creates schema. This is the documented data-import exception to direct database writes.
4. Import the supplied PM3 PDF privately as part of that copy. Pass its local `document.path`, the exact destination garage ID and authorised uploader ID, and `confirmPM3Revision8: true` only for the verified TO-PMS 035 Revision 8 source. Existing legacy inspections receive an original template snapshot when attaching this first source. The file is not in Git or the public build.
5. Validate sign-in, bus rename, inspection amendment/deletion/restoration, source page viewing, question edits and scheduling on the preview. It contains copied data: keep the link private, require authentication, and warn before sharing it.

## Production after approval

1. Deploy the approved code with `FLEETTAP_READ_ONLY=true` (Functions / production) and leave the provider on Neon. Confirm a write returns 503. This establishes a write freeze while the new Netlify production schema is provisioned by deployment. Existing sessions and reads continue.
2. Use the same data-only import into the empty Netlify production database, with `confirmProduction: true`. Reconcile users, garages, garage records, inspections and audit events. Source counts observed during preparation were 2 organisations, 2 garages, 1 user, 2 garage records, 2 inspections and 36 audit events; re-read current counts at cutover rather than assuming these are still current.
3. Set `FLEETTAP_DATABASE_PROVIDER=netlify` and remove `FLEETTAP_READ_ONLY` in the production Functions environment, then deploy the approved revision. Do not change password, session or activation secrets/hashes. The existing administrator should use the same login.
4. Verify the production provider and read/write paths. Retain the old Neon database until the new database is verified. Reverting the provider after new writes is not a data-safe rollback; reconcile those writes first.

`copy-database.mjs` input (credentials must come from approved surfaces and never be printed or committed):

```json
{"sourceUrl":"<secret>","targetUrl":"<secret>","targetKind":"preview","document":{"path":"<local original PDF>","garageId":"<verified garage UUID>","uploaderId":"<verified admin UUID>","confirmPM3Revision8":true}}
```

Both connection strings are accepted only through stdin. The document is optional when rehearsing a synthetic fixture. The production flag does not substitute for user release approval.

## Current scope

Garage records retain the existing JSON state with atomic version comparisons. Documents are separate rows. This release is a functional pilot expansion, not the final storage model for a 1,100-bus rollout: normalise and paginate inspection histories before loading operational fleet volumes. Inspection templates are currently garage-scoped and PM3 is the configured inspection type. Pending review, deleted and unfinished inspections do not advance schedules. The unresolved regeneration task remains blocked.
