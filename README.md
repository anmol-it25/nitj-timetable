# NITJ IT Timetable (B.Tech IT III Year, 2026–27 Odd)

Static site: HTML + CSS + JS, data in `data/timetable.json`. No build step, no backend.

## Run locally
    python3 -m http.server 8000     # or: npx serve
Open http://localhost:8000 (use a server; `fetch` won't work from file://).

## Deploy (GitHub + Vercel / Cloudflare Pages)
1. `git init && git add . && git commit -m "init"`; create a GitHub repo and `git push`.
2. Vercel: Add New Project → import repo → Framework "Other", no build command, output dir `.`.
   Cloudflare Pages: Connect repo → no build command, output directory `/`.
3. Every push to `main` redeploys. Your laptop is not needed.

Open clients re-fetch `timetable.json` every 60 s (`cache: "no-store"`), so edits show up without a reload.
If `sw.js` / app files change, bump `C = "nitj-v1"` in `sw.js`.

## Update the timetable
Edit `data/timetable.json`, commit, push.
- `groups.<Group>.schedule.<Day>.<periodId>` is an **array** of entries (several allowed per period, e.g. a lab + a lecture).
  Entry: `{"subject":"DS","room":"SAC-206","type":"class"}`. Omit a period = Free. Period ids: `p1`–`p8` (lunch is automatic).
  A 2-period lab = same entry in both periods.
- Set a group to `null` for "Timetable not configured yet." Groups 2–4 are `null` now; nothing was copied from Group 1.
- New subject → add to `subjects` (`name`, `color`: csa/dbms/ds/oop/wt/dss/lab). Rooms metadata is in `rooms`.
- Subject names for `DS-2` and `CSA-2` were not supplied; edit them if needed.

## One-off changes (`overrides`, applied on top of the weekly timetable for that date)
    {"date":"2026-10-05","group":"Group 1","action":"cancel","period":"p3"}
    {"date":"2026-10-05","group":"Group 1","action":"room_change","period":"p3","room":"SAC-402"}
    {"date":"2026-10-05","group":"Group 1","action":"time_change","period":"p3","start":"10:45","end":"11:40"}
    {"date":"2026-10-05","group":"Group 1","action":"add","period":"p8","entry":{"subject":"WT","room":"LT-101","type":"class"}}
Optional `"subject"` limits cancel/room_change to one entry in a period. Extra classes also work on weekends.

## Notes / future
- Offline: last good data is cached in localStorage; a banner says when you're seeing saved data.
- Admin panel: put it under `/admin` later, behind real auth, committing JSON via the GitHub API. Don't ship an unsecured editor.
- Auto-sync: first check whether the official site has an API/JSON/downloadable file; poll gently, keep manual edits as fallback.
