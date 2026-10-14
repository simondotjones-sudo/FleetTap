# FleetTap — v0.3.0

Derived from PharmaTap commit 042e9f5746eecdd631704a1d0adb62b6de8a7807. Retains Gellix and layout with black/yellow FleetTap branding.

Run `npm test` and `npm run build`. Netlify: main branch, npm run build, dist. Runtime database configuration is required; see below.

Fleet: searchable vehicles, add sample vehicle, garage dashboard, vehicle profile and linked inspection/defect history. Due dates are manually entered. Missing history stays unknown.

Checks: draft PM3 mapping of 125 items across 17 sections. Save results explicitly per item, resume progress, record craftworker and readings, explain not-due decisions, create linked defects and submit locked records for review. Item edits retain audit snapshots. Drive-belt condition checking remains required even when replacement is not due.

Source: TO-PMS 035 Revision 8 (24 August 2026). Technical review required, including 1/2/3 task markings. Regeneration is blocked: PM3 references SI 361 / operation 26052-3 while SI 432 supersedes SI 361 and specifies 25920-3. Original PDFs are not included. Approved source instructions remain necessary for operational work.

Authentication and shared storage are enabled. Protected uploads, supervisor approval, automatic scheduling, AI and offline sync remain future work. Inspection submission is not maintenance certification or vehicle release.

Before pilot: validate mapping and instructions, import schedules/history, agree release authority, and test operational recovery/conflict handling.

Validation: model and rendering smoke tests, production build. Visual browser QA pending; supported browser-control skill unavailable.

## v0.3.0 accounts and shared storage

Netlify Functions use a separate Neon Postgres project (FleetTap). Runtime variables: FLEETTAP_DATABASE_URL (Functions, production only, secret), FLEETTAP_APP_ORIGIN, FLEETTAP_PLATFORM_ADMIN_EMAIL. Never configure production credentials for previews. The schema is tracked in database/001-auth.sql; the build does not run migrations.

Login uses salted scrypt passwords and eight-hour opaque HttpOnly/Secure/SameSite=Strict sessions stored as hashes. Single-use activation/reset links expire after 24 hours and are stored only as hashes. Credential-version changes revoke sessions and outstanding links. Passwords require 12–128 characters. Login and activation attempts are rate limited in the database. All mutation requests require the configured same origin and JSON. User deactivation takes immediate effect.

Platform Admin manages all organisations; Organisation Admin manages garage managers and mechanics in their organisation; Garage Managers manage mechanics in their garage. The initial bootstrap account cannot be disabled or reset by another account. Users can change their own password in Profile. Admins create manual activation/reset links: email delivery is not configured. There is no Netlify Identity dependency or public registration endpoint.

Garage data now lives in the database. Browser data from earlier demonstrations is not automatically imported. Server-side domain commands enforce scope, set actor identity from the session, record audit events, and use optimistic version checks to prevent silent overwrite. Existing source-defined PM3 tasks remain draft demonstration workflows; shared storage is not approval for operational use.

Validation: npm test for domain/security tests. scripts/check-backend.mjs accepts a validation-only database URL through stdin and exercises actual functions against an isolated Neon branch. It creates synthetic users and records only on that branch. Never point it at production.
