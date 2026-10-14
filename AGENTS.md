# FleetTap

- Preserve the black/yellow branding, Gellix font, six large tiles and floating navigation. Keep status colours meaningful.
- Production site: fleettap.netlify.app. Repository: simondotjones-sudo/FleetTap. Do not alter PharmaTap or F2T-app.
- Authentication uses server/security.mjs and server/runtime.mjs. No Netlify Identity. Never expose database URLs, password hashes, activation hashes or session hashes to the browser or logs.
- Scope every data read and mutation by the authenticated user's organisation/garage. Never accept caller-supplied actor names or roles as authentication.
- Database: separate FleetTap Neon project. Never use production credentials in previews or automated integration tests. Keep schema changes tracked under database/.
- Shared garage writes must pass validated domain commands and compare the current version atomically. Do not accept arbitrary client state replacement.
- PM3 is a draft mapping. The regeneration conflict stays blocked pending Technical Office approval. Inspection submission does not release a vehicle.
- Run npm test and npm run build before release; exercise auth changes using the isolated validation branch. Do not send emails without explicit authorization.
