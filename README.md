# FleetTap

Derived from PharmaTap commit 042e9f5746eecdd631704a1d0adb62b6de8a7807. Retains Gellix and layout with black/yellow FleetTap branding.

Run `npm test` and `npm run build`. Netlify: main branch, npm run build, dist. Runtime database configuration is required; see below.

App versioning follows TapTick: `major.DD.MM.YY.build`, starting at `1.14.10.26.1`. Update the release date and increment the build in `src/version.js` for every release, including small UI changes; the build never resets. Profile displays the version. The build applies the same build number to CSS/JavaScript entry URLs and all local module imports, and publishes `version.json` for release verification. This frontend release version is independent of npm package metadata and database record versions. HTML and app modules load from the network. The service worker caches only the public offline screen and its assets; authenticated data, photos and API requests never enter its cache. Updates activate when existing FleetTap windows close, without reloading an active check.

Fleet opens on Overview, followed by Buses, Models, Schedules and Add bus. The supplied model catalogue contains 12 fleet prefixes (AX, EV, EA, VG, VT, GT, SG, AH, PA, WS, EW, WH); combined source descriptions are retained. Existing buses are classified by fleet prefix, with a model-prefix fallback. Administrators can set a different model type or Other explicitly and edit names/fleet numbers while retaining linked records.

Schedules opens on a searchable, filterable due-date list (25 buses per page), with a separate creation/edit screen. PM3 schedules support days, weeks or calendar months, each bus's own completed history with a fallback first due date, an evidenced external service date, and paused schedules. Model rules are stored in the garage record and inherited dynamically by current and future matching buses. Individual exceptions take precedence, including paused exceptions. Applying a model rule can supersede individual rules with audit history retained; administrators can also return a bus to its model rule. Whole-garage setup applies to current buses. Only confirmed, non-deleted PM3 completions advance dates. A model rule does not approve the draft PM3 template for another model.

Checks: draft PM3 mapping of 125 items across 17 sections. Save results explicitly per item, resume progress, record craftworker and readings, explain not-due decisions, create linked defects and submit locked records for review. Item edits retain audit snapshots. Drive-belt condition checking remains required even when replacement is not due.

Source: TO-PMS 035 Revision 8 (24 August 2026). Technical review required, including 1/2/3 task markings. Regeneration is blocked: PM3 references SI 361 / operation 26052-3 while SI 432 supersedes SI 361 and specifies 25920-3. Original PDFs are stored privately through the administrator template page, never in this public repository. The source viewer links to the question’s page and the editor separates the mechanic question from the full instruction. New inspections snapshot their question version; edits do not rewrite old records. Approved source instructions remain necessary for operational work.

Authentication and shared storage are enabled. Protected photo/PDF uploads, inspection amendment/delete/restore with history, template editing and PM3 scheduling are implemented. AI, vehicle release approval and offline sync remain future work. Inspection submission is not maintenance certification or vehicle release.

Before pilot: validate mapping and instructions, import schedules/history, agree release authority, and test operational recovery/conflict handling.

Validation: model and rendering smoke tests, production build. Visual browser QA pending; supported browser-control skill unavailable.

## v0.3.0 accounts and shared storage

Netlify Functions use a separate Neon Postgres project (FleetTap). Runtime variables: FLEETTAP_DATABASE_URL (Functions, production only, secret), FLEETTAP_APP_ORIGIN, FLEETTAP_PLATFORM_ADMIN_EMAIL. Never configure production credentials for previews. The schema is tracked in database/001-auth.sql; the build does not run migrations.

Login uses salted scrypt passwords and eight-hour opaque HttpOnly/Secure/SameSite=Strict sessions stored as hashes. Single-use activation/reset links expire after 24 hours and are stored only as hashes. Credential-version changes revoke sessions and outstanding links. Passwords require 12–128 characters. Login and activation attempts are rate limited in the database. All mutation requests require the configured same origin and JSON. User deactivation takes immediate effect.

Platform Admin manages all organisations; Organisation Admin manages garage managers, supervisors and staff in their organisation; Garage Managers manage supervisors and staff in their garage. The initial bootstrap account cannot be disabled or reset by another account. Password reset uses the sign-in help flow and an administrator-issued link. Admins create manual activation/reset links: email delivery is not configured. There is no Netlify Identity dependency. Garage-code staff registration is described below.

Garage data now lives in the database. Browser data from earlier demonstrations is not automatically imported. Server-side domain commands enforce scope, set actor identity from the session, record audit events, and use optimistic version checks to prevent silent overwrite. Existing source-defined PM3 tasks remain draft demonstration workflows; shared storage is not approval for operational use.

Validation: npm test for domain/security tests. scripts/check-backend.mjs accepts a validation-only database URL through stdin and exercises actual functions against an isolated Neon branch. It creates synthetic users and records only on that branch. Never point it at production.

## Installable app (PWA)

The root manifest uses relative identity, scope and start URLs, so production installations belong to `https://fleet-tap.com/`. The current bus mark supplies standard 192/512px, maskable 512px and Apple 180px icons. Chrome/Edge install prompts appear on the home/sign-in screen when the browser offers installation; iOS users get Share → Add to Home Screen guidance. The sign-in screen and Profile also offer Install FleetTap. Dismissal suppresses automatic reminders for seven days, and standalone mode hides installation controls.

This release provides installation and an offline fallback, not offline record entry or synchronisation. Open screens show a connection warning without being reloaded. No background writes or notification permissions are introduced. The worker is generated by the build with the release build number; never edit `dist/sw.js`.

Production domain cutover: set the existing Netlify **Functions / production** variable `FLEETTAP_APP_ORIGIN` to `https://fleet-tap.com` alongside deployment, then verify HTTPS and sign-in/saves on that domain. This preserves exact-origin protections and makes new activation links use the custom domain. Keep the Netlify alias redirecting to the primary domain; do not expand allowed origins to preview hosts. Install the app from the custom domain once its certificate is active.

## Administrator expansion — 1.15.10.26.6

Use Profile/Menu → Manage FleetTap for template/source editing, schedules, users and deleted inspection recovery. Fleet → bus → Bus details provides Edit bus and Inspection schedule. Checks → Records → Manage inspection provides amendment, notes, recoverable deletion and review completion. Submitted records can be reopened by an administrator with a reason; old answers remain in the audit history. Faults and repair actions remain independent. Completion remains blocked while source conflicts or unfinished tasks exist.

Netlify Database setup and hosted migration are described in database/NETLIFY-CUTOVER.md. Installing @netlify/database and deploying the timestamped migrations provisions the new managed schema. Runtime remains on the existing Neon production database until FLEETTAP_DATABASE_PROVIDER=netlify is explicitly configured after copying data. Previews use only their isolated NETLIFY_DB_URL. Read-only mode protects the final copy. No passwords are reset by the provider change.

Validation includes an isolated local Netlify Database integration test for actual migrations, auth, role scope, command saves, simultaneous-write conflicts and private PDF access. Run npm test and npm run build. Visual browser QA and the hosted cutover remain release gates.

## Organisation roles — 1.15.10.26.13

Five stable permission keys are implemented: `platform_admin`, `organisation_admin`, `garage_manager`, `supervisor`, and `mechanic` (displayed as Garage Staff by default, retaining existing staff accounts). Organisation admins can rename all five labels in Users & access; changing a label never changes permissions. Platform admins create organisations and organisation admins; organisation admins create garages and managers; garage managers create staff and supervisors and promote/demote them within their own garage. User management cannot change its own account or the protected bootstrap admin. Role changes, password resets and account disabling revoke sessions and setup links.

Manage FleetTap is limited to managers and admins. Supervisors have a separate Review & sign off queue, can close reviewed actions, close faults/reports after linked actions are closed, and sign off submitted bus inspections. Staff can report faults/incidents, complete checks and submit action evidence; fleet and SOP access is read-only. Template editing and original-document uploads require organisation admin or platform admin. PM3's blocked source conflict and incomplete-item checks still prevent sign-off. No inspection or action closure releases a vehicle.

Organisation-authored SOPs and custom checklists are shared across all garages in that organisation. Checklist runs snapshot their questions and instructions; later authoring changes do not rewrite historical evidence. Staff save each answer and submit to the supervisor; fault answers create linked fault/report actions. Supervisors can return a checklist for correction or sign it off. Content changes and all reviews retain actor identity and audit history.

Users & access lets managers generate/replace or disable a garage-specific registration code. Codes are random, shown once and stored only as hashes; replacing a code invalidates its predecessor. Registration accepts name, employee ID and/or email plus a 12–128 character password, and always creates staff in the code's garage regardless of posted role/scope fields. Employee IDs are unique within an organisation; email is globally unique. Sign-in accepts email or employee ID plus password. The organisation login code resolves employee IDs used in multiple organisations; disabling registration does not block existing logins. Admin-created accounts continue to use private single-use activation links. No email is sent and Netlify Identity is not used.

The Platform Admin can generate a private demo account for each role from Users & access. Passwords are random, shown once and stored with scrypt. There is no public demo-role switcher. The platform demo is a real platform-scoped account and must be shared only with trusted administrators; demo accounts can be disabled from the same page. Demo creation is transactional.

Removing an organisation archives it and revokes all of its users' sessions. Records are retained and the organisation can be restored. Every login and garage read rejects archived organisations. Administrative writes lock and revalidate the actor and targeted account within a database transaction, preventing concurrent revocation/role changes from granting stale access.

Validation: full Node tests, including an isolated local Netlify Database with actual SQL migrations and all five roles, registration, privilege-escalation attempts, cross-organisation/garage denials, closure ordering, inspection sign-off, content snapshots, demo accounts and access revocation. Browser visual verification remains pending where the browser runtime is unavailable.
