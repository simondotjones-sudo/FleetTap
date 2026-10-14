# FleetTap demonstration — v0.2.0

Derived from PharmaTap commit 042e9f5746eecdd631704a1d0adb62b6de8a7807. Retains Gellix and layout with black/yellow FleetTap branding.

Run `npm test` and `npm run build`. Netlify: main branch, npm run build, dist. No dependencies, migrations or database credentials required.

Fleet: searchable vehicles, add sample vehicle, garage dashboard, vehicle profile and linked inspection/defect history. Due dates are manually entered. Missing history stays unknown.

Checks: draft PM3 mapping of 125 items across 17 sections. Save results explicitly per item, resume progress, record craftworker and readings, explain not-due decisions, create linked defects and submit locked records for review. Item edits retain audit snapshots. Drive-belt condition checking remains required even when replacement is not due.

Source: TO-PMS 035 Revision 8 (24 August 2026). Technical review required, including 1/2/3 task markings. Regeneration is blocked: PM3 references SI 361 / operation 26052-3 while SI 432 supersedes SI 361 and specifies 25920-3. Original PDFs are not included. Approved source instructions remain necessary for operational work.

Browser-only demonstration: no authentication, shared storage, protected uploads, authenticated signatures, supervisor approval, automatic scheduling, AI or offline sync. Submission is not maintenance certification or vehicle release. Existing local demo records are retained; export through the profile panel.

Before pilot: validate mapping and instructions, import schedules/history, agree release authority, provision FleetTap storage and login, and test recovery/conflict handling.

Validation: model and rendering smoke tests, production build. Visual browser QA pending; supported browser-control skill unavailable.
