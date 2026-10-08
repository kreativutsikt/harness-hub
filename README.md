# Harness Hub

Shared board for an AI group: meetup date poll, show & tell, ideas wall, prompt library.
Static page (`public/`) + one Cloudflare Pages Function (`functions/api/[[route]].js`) + a D1 database.
No visitor accounts. Writes are gated by an optional group code.

## Deploy (Cloudflare dashboard, all from a phone browser)

1. Push this folder to a GitHub repo.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick the repo.
   Framework preset: None. Build command: leave empty. Build output directory: `public`. Save and deploy.
3. **Storage & databases** → **D1** → **Create database** named `harness-hub`.
   Open it → **Console** → paste the whole of `schema.sql` → run.
4. Pages project → **Settings** → **Bindings** → **Add** → **D1 database**. Variable name must be exactly `DB`. Pick `harness-hub`.
5. Pages project → **Settings** → **Variables and secrets** → add `GROUP_CODE` (a word the group will share). Leave it unset for an open board.
6. **Deployments** → retry the latest deployment so the binding and secret apply.
7. Open the `*.pages.dev` link, enter your name and the group code, post a date, then share the link in Signal.

## Notes
- Anyone with the link can read. Posting needs the group code. Delete buttons show only on your own items (per device); this is a trust-based board, not a hardened one.
- Limits: 6000 characters per entry, 5000 entries in total.
- Page refreshes every 6 seconds while open.
- Local test: `npx wrangler pages dev public --d1=DB --binding GROUP_CODE=test`
