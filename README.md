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

Platform Admin manages all organisations; Organisation Admin manages garage managers and mechanics in their organisation; Garage Managers manage mechanics in their garage. The initial bootstrap account cannot be disabled or reset by another account. Users can change their own password in Profile. Admins create manual activation/reset links: email delivery is not configured. There is no Netlify Identity dependency or public registration endpoint.

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
