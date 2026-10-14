# FleetTap foundation

Independent demonstration derived from PharmaTap commit 042e9f5746eecdd631704a1d0adb62b6de8a7807 (retrieved 14 October 2026).

The current PharmaTap workspace stylesheet and bundled Gellix fonts are retained unchanged. Header, home tiles and navigation follow the current workspace components. FleetTap adds a bus mark and six sections: Report, SOPs, Checks, Faults, Actions and Fleet.

Run `npm test` and `npm run build`. Netlify build command: `npm run build`; publish directory: `dist`. No dependencies, credentials, migrations or database are required for this demonstration.

Implemented: six-tile navigation, sample garage switching, searchable vehicle list and vehicle details, local incident/defect capture with linked actions, completion evidence awaiting review, sample inspection handover and source-document register. Records persist only in the same browser. Export is available in the profile panel. All vehicles and operational records are fictional.

Not implemented: authentication, server authorisation, shared database, full PM3 checklist, supervisor approval, return-to-service decisions, source-file downloads, uploads, AI, notifications, scheduling or offline/PWA installation. The handover exercise is explicitly not a PM3 inspection. No service status is inferred from action completion. No original Dublin Bus documents are included in the public build.

Before pilot: obtain full schedules and diagnostic sheets, resolve SI 361 / SI 432 and Techtool-operation conflict, confirm PM3 task markers, build the full approved templates, agree roles and release authority, provision a separate FleetTap database and file store, add access controls and audit history, and test offline/conflict handling. Original PharmaTap database migrations and deployment configuration have not been copied.

Source documents reviewed: TO-PMS 035 PM3 SG271+ Revision 8 (24 August 2026); TO 01 Shift Diagnostic Check Sheets Procedure Revision 3 with July 2026 edits; SI 432 Parked Regeneration Revision 0 (13 March 2026). Supplied technical documents are not treated as approval of a new digital workflow.

Next deployment target: user's new FleetTap GitHub repository and Netlify project. No deployment has been performed. Browser visual QA remains pending; stylesheet identity and domain checks are verified locally.
