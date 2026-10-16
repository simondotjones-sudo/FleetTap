# FleetTap

## Content layout correction — 1.15.10.26.15

Removed the Organisation SOPs subtitle and shortened its tile captions. Organisation Checklists now uses the same compact six-tile layout, with a separate checklist library and a matching editor. Saving a checklist returns to its library. Short desktop viewports use tighter spacing so the tiles stay above the floating navigation. No permissions, storage or AI behaviour changed.

Validation: 68 existing tests and build passed. Browser checks covered both hubs at 1440×900, 1264×696 (zoomed desktop equivalent), 1024×768 and 390×844, with no horizontal overflow, and verified checklist creation/editing, return navigation and staff access denial.

## SOP workspace — 1.15.10.26.14

Organisation SOPs now opens as six large tiles: Create SOP, SOP library, Drafts, Upload & generate, Checklists and PM3 template. New SOPs open on an overview with summary, reference/revision, review date and precautions, then offer a guided step view, full instructions and the attached source PDF. The built-in PM3 overview links to the existing private source PDF for the selected garage; staff can read that current document, while access to superseded inspection sources remains manager-only. Existing technical-review warnings and the blocked regeneration task are unchanged.

Manual SOP authoring supports draft and published states. Publishing requires a summary, steps, full instructions and explicit administrator approval; approval is attributed to the authenticated account. Drafts and their source PDFs are excluded from staff, supervisor and garage-manager responses. Existing SOPs without a status retain their previous published visibility. Saving a published SOP as a draft explicitly withdraws it from staff access until it is published again; the editor explains this before saving. Changes retain previous content in the audit history.

After saving a draft, its author can attach an original PDF up to 4 MB. The additive `20261015235000_sop_documents.sql` migration stores private documents at organisation scope, so the published PDF is available in all of that organisation's garages. Uploads validate role, organisation/garage scope, same origin, file signature, size and content version. Sources cannot be replaced while published. Document responses are authenticated and `private, no-store`; bytes are never returned in workspace JSON or placed in the public build. Production `FLEETTAP_DATABASE_PROVIDER=netlify` was verified read-only before preparing this release; the managed migration is applied by deployment.

Upload & generate is a clearly labelled future flow and makes no OpenAI calls. Planned implementation: PDF/Word source → Responses API document input → schema-constrained SOP draft (summary, scope/responsibilities, precautions, steps, full instruction, references and unresolved questions) → administrator comparison with the source and approval → publication. Treat document contents as untrusted source material, retain source references and technical limits, and flag missing or contradictory instructions. Do not auto-publish generated material. PDF attachments and manual authoring work independently of future generation; Word attachment/conversion and generated standard PDFs are not implemented in this release.

Validation: 68 Node tests, including an isolated Netlify Database with real migrations, SOP publication and document access across roles and organisations; successful production build; desktop (1440px), tablet (1024px) and phone (390px) browser checks with synthetic data for draft creation, PDF attachment, approval validation, publication, staff reading and step navigation. Hosted deployment remains a separate release step.

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

### Garage operations (Build 23)

Garage Today now reads persisted garage jobs rather than the workshop sample. Managers can create drive-in/repair jobs, plan due scheduled inspections, assign active local staff, post a dated briefing, and switch between the jobs board, the team view and the daily schedule. Unfinished earlier jobs carry forward. The board refreshes every 30 seconds when no form is being edited; Refresh is also available.

Mechanics and supervisors land on My Jobs after login. Start my day records an explicit daily start; only the assigned account can start, pause or submit its job, and an account can work on one job at a time. End day & sign out records a handover and pauses unfinished work before ending the session. Start/end records indicate recorded day activity, not online presence or verified payroll hours. Existing eight-hour authentication sessions are unchanged. A missing end-day record is not silently invented.

Scheduled jobs link to the existing PM3 inspection workflow. Submission requires a submitted inspection, and job sign-off requires that inspection's completed review. Linked faults must be closed before job sign-off. The existing PM3 Technical Office conflict remains blocked. Completing a job never releases the bus.

Jobs, shifts and daily briefings are additive fields in the existing garage JSON records, protected by the same version compare-and-swap and authenticated garage scope. They are included in the garage export. No production fleet/staff data is fabricated and no database-provider cutover is required. Existing fleet data can be used now; the incoming Dublin Bus fleet file can be imported separately once supplied.

### Management visibility (Build 24)

Management visibility is available from My Garage, Manage FleetTap and Garage Today. Its Overview, Buses, Models and Warranty views filter the selected garage by Dublin reporting dates, bus type, model and fleet ID. They show elapsed off-road days, visits, longest absence within the period, repeat visits, estimated costs, outside-warranty time, unknown coverage and manufacturer repair delays. The filtered bus report exports to CSV. Administrators switch garages using the existing profile selector; this release does not aggregate multiple garages into a portfolio.

Managers record actual off-road/return timestamps with evidence. Overlapping periods for a bus are rejected; amendments and voiding retain the original values in an audit trail. These records are not a roadworthiness approval or a release mechanism. Active off-road records appear on the fleet screens and job detail. No downtime is inferred from inspection status alone.

Organisation and Platform Admins set standard warranty months and an optional agreed manufacturer repair window for each model. These terms are shared across the organisation. Managers enter the actual warranty start for each fleet ID and can extend coverage through a specified date. No manufacturer warranty duration is invented. Unknown dates remain unknown, not expired. Off-road periods snapshot the applicable warranty and costs; explicit, audited reassessment uses updated warranty dates. Extensions cannot shorten model coverage.

Default estimates use €190 per elapsed off-road day (prorated hours / 24) and €87 per bus per recorded working date. Rates are editable and apply to new off-road records. Mechanic dates are deduplicated across job-start events and manually evidenced dates, including multiple off-road episodes on the same day. Missing activity can understate the mechanic allowance. Figures exclude parts, mileage and other operating expenses and are not total cost per kilometre. The client's final accounting/day-counting convention remains to be confirmed.

A manufacturer case requires recorded warranty acceptance, notification time, agreement reference and an explicit repair window. Excess time runs from notification plus that window to manufacturer repair or return time, clipped to the reporting period. It is shown separately from time outside warranty coverage; both exposure costs are subsets of downtime cost, never additive charges or an assertion of recoverable damages. An incorrect case can be removed with a retained audit trail.

The new garage fields use the existing authenticated commands and atomic version checks; organisation model policies use the existing content version checks. Staff receive only the operational off-road marker, not management rates, case details or financial snapshots. No database-provider change or schema migration is required. Bus ID corrections retain linked jobs, downtime and checklist records.

### Active checks and instruction controls (build 25)

Organisation Admins can publish mandatory standard instructions / toolbox talks in the SOP editor, targeting all buses, a catalogue class, or explicit fleet IDs. Requirements are enforced on the server for job start/resume, inspection work and submission, and bus-linked checklist work. Every person acknowledges the current published version; revised versions require fresh acknowledgement. An overdue review date blocks work until an admin republishes after review. Withdrawing a mandatory instruction requires explicitly clearing Required; existing authoring audits retain the prior version. Fleet-ID corrections retain applicability through the bus identity history.

Menu → Required instructions provides the full text, private source PDF, toolbox talk link and personal understanding/watched declaration. Video opening does not prove viewing or comprehension. Garage Today → Active controls shows current team acknowledgements, historical declarations and unresolved rechecks. Acknowledgements include authenticated identity, timestamp and immutable instruction snapshot; staff see only their own declarations. Manager garage exports include these records. Requirements apply to relevant bus work, not unrelated garage checklists; no automatic manufacturer instructions or technical approvals are assumed.

PM3 out-of-tolerance readings are saved before a red recheck screen. Fresh readings and an explanatory note are required, and both attempts remain in the inspection audit. A persistent out-of-range recheck must create/retain a defect. Outstanding rechecks block submission and review completion; existing linked defects cannot be erased by changing a reading to OK. The original PM3 regeneration conflict remains blocked, and these controls do not authorise vehicle release. Model authoring, data provider and production fleet data are otherwise unchanged.
