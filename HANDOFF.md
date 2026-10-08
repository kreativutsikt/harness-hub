# Harness Hub: handoff to Cursor

## Paste this into Cursor first

> You are taking over a finished, tested project in this repo (`harness-hub`). Read `HANDOFF.md` fully before changing anything. Your job: deploy it to Cloudflare Pages with a D1 database so anyone with the link can read it and anyone with a shared group code can write to it, with no per-user accounts. Do not redesign the UI or change the API contract unless a step below fails. Do not commit secrets. Ask me before anything that needs my Cloudflare login (I will run `wrangler login` myself). When done, give me the live `*.pages.dev` URL and the group code to share.

## What this is

A shared board for an informal group learning to use AI. Four tabs:

- **Dates**: propose meetup dates, vote Yes / Maybe / Can't, the date with the most support is highlighted "Best so far".
- **Show & tell**: what members built or are building (industry, status, link, "will demo").
- **Ideas**: problems/questions with upvotes; top ones become the agenda.
- **Prompts**: shared prompts and setups with a copy button.

Audience: a Signal group of non-technical-to-technical people, mostly on phones. The owner is Ian (mushroom farm operator, interested in custom dashboards and physical systems such as a harvest log). The group name is not decided; the page is titled "Harness Hub".

## Architecture

```
public/index.html          static page: all HTML, CSS and JS in one file, no build step
functions/api/[[route]].js Cloudflare Pages Function, handles /api/state, /api/set, /api/delete
schema.sql                 D1 table + two seed ideas
README.md                  dashboard deploy steps
```

- Hosting: Cloudflare Pages, output directory `public`, no build command, no framework.
- Storage: one D1 table `docs(coll, id, data JSON text, ts)`, primary key `(coll, id)`.
- Binding name must be exactly **`DB`**. Optional secret: **`GROUP_CODE`**.
- Realtime: none. The page polls `GET /api/state` every 6 seconds while the tab is visible, and refreshes after each own write. It re-renders only when the response text changed.
- Fonts come from Google Fonts (IBM Plex Sans/Mono, Bricolage Grotesque) with fallbacks. No other external requests.

## API contract (do not break; the client depends on it)

| Request | Auth | Body | Result |
|---|---|---|---|
| `GET /api/state` | none | none | `{needCode: bool, dates:[], votes:[], projects:[], ideas:[], ideaVotes:[], prompts:[]}`; each item is its stored fields plus `id` |
| `POST /api/set` | header `x-group-code` if `GROUP_CODE` is set | `{coll, id, data}` | `{ok:true}`; upsert |
| `POST /api/delete` | same | `{coll, id}` | `{ok:true}` |

Status codes: `401` wrong or missing code, `400` bad collection/id/body, `413` entry over 6000 chars or database over 5000 rows, `405` wrong method, `404` unknown route.
`coll` must be one of: `dates`, `votes`, `projects`, `ideas`, `ideaVotes`, `prompts`. `id` matches `^[A-Za-z0-9_-]{1,80}$`.
Reads are always open. Writes need the code only when `GROUP_CODE` is set; if it is unset the board is open for writing.

## Data model (fields inside `data`)

- `dates`: `date` (YYYY-MM-DD), `time` (HH:MM or ""), `note`, `name`, `uid`, `ts`
- `votes`, doc id `<dateId>_<uid>`: `dateId`, `uid`, `state` ("yes" | "maybe" | "no"), `name`, `ts`
- `projects`: `title`, `industry`, `status` ("idea" | "building" | "working"), `what`, `link` (http/https only, else ""), `demo` (bool), `name`, `uid`, `ts`
- `ideas`: `text`, `name`, `uid`, `ts`
- `ideaVotes`, doc id `<ideaId>_<uid>`: `ideaId`, `uid`, `ts`
- `prompts`: `title`, `tool`, `body`, `name`, `uid`, `ts`

`uid` is a random per-device id kept in the browser's localStorage (`hh_anon`). Display name is `hh_name`, group code is `hh_code`, last tab is `hh_tab`. There are no accounts. Deleting a date or idea also deletes its votes from the client side.

All user text is rendered with `textContent`, never `innerHTML`. Keep it that way.

## Status

Tested locally with `wrangler pages dev` against a local D1: state read, write rejected without/with wrong code, write accepted with code, invalid collection rejected, oversize rejected, overwrite, delete, wrong method. The page was also driven in jsdom against that API: posting an idea (with the code prompt on first try), proposing a date, voting, and upvoting all worked with no page errors.

**Not tested**: real Cloudflare deployment, real phones, load, or anything past a handful of rows.

## Deploy path A: Cloudflare dashboard with Git integration (simplest)

1. Push this repo to GitHub (already connected in Cursor).
2. Cloudflare dashboard, Workers & Pages, Create, Pages, Connect to Git, choose the repo. Framework None, build command empty, output directory `public`.
3. Storage & databases, D1, create `harness-hub`. In its Console, run all of `schema.sql`.
4. Pages project, Settings, Bindings, add D1 binding named `DB` pointing at `harness-hub`.
5. Pages project, Settings, Variables and secrets, add `GROUP_CODE`.
6. Redeploy the latest deployment so the binding and secret apply.

Do **not** add a `wrangler.toml` on this path. As far as I know, a `wrangler.toml` with `pages_build_output_dir` makes the file the source of truth for bindings and the dashboard bindings stop applying. Verify against current Cloudflare docs before mixing the two.

## Deploy path B: Wrangler CLI (if Cursor drives it)

The user must run `npx wrangler login` themselves (browser sign-in). Then:

```bash
npx wrangler d1 create harness-hub               # note the database_id it prints
npx wrangler d1 execute harness-hub --remote --file=schema.sql
npx wrangler pages project create harness-hub --production-branch main
```

Create `wrangler.toml` (this is only for path B):

```toml
name = "harness-hub"
pages_build_output_dir = "public"
compatibility_date = "2025-07-01"

[[d1_databases]]
binding = "DB"
database_name = "harness-hub"
database_id = "<id from d1 create>"
```

```bash
npx wrangler pages secret put GROUP_CODE --project-name harness-hub
npx wrangler pages deploy public --project-name harness-hub
```

Local run: `npx wrangler pages dev public --d1=DB --binding GROUP_CODE=test` (apply `schema.sql` to the local D1 first; the `d1 execute --local` command needs a `wrangler.toml` with the `DB` binding to resolve the name).

## Acceptance checklist

1. `GET /api/state` on the live URL returns `needCode: true` and the two seed ideas.
2. A POST to `/api/set` without the code returns 401.
3. In a phone browser: enter a name and the code, propose a date, vote Yes, post an idea, upvote it, share a prompt and copy it, add a Show & tell entry. All appear after the next 6-second refresh on a second device.
4. Reload: name, code and last tab are remembered.
5. Dark mode renders correctly (the page follows the system theme).
6. No secrets in the repo; `GROUP_CODE` exists only in Cloudflare.

## Known limits (be honest with the group)

- Trust-based: anyone with the code can post; delete buttons show only for items created on the same device. The server does not verify ownership, so anyone with the code and curl can delete or overwrite anything.
- No rate limiting. Add Cloudflare rate-limiting rules if abuse is a concern.
- Polling, not push. Fine at this scale.

## Good next steps (only after it is live)

1. Organizer-only delete/moderation via a second secret (`ADMIN_CODE`), checked server-side.
2. `.ics` export for the winning date.
3. A harvest-log demo module for the first meetup: phone form or QR code per grow container, rows into D1, and a dashboard (yield per container, trends by species, days to harvest). This is the owner's own interest and the planned live demo.
4. Optional ESP32 temperature/humidity/CO2 readings posted to a new collection, charted on the same dashboard.

## Fallback

A Claude-hosted copy exists as a published artifact, but only people invited by email as Editors can write to it. The Cloudflare version replaces it.
