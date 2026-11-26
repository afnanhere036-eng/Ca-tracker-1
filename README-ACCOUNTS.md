# CA Checklist - accounts, sync and offline (setup)

## What changed (compared with your repo)
| File | Change |
|---|---|
| `js/core.js` | Login / create account (username + password), sync to the server, profile name + picture, offline queue |
| `settings.html` | Profile (name + picture), account, change password, sync status, backup file, about |
| `errorlogs.html` | Statements and attached files now sync to your account (old entries are moved over automatically) |
| `track.html` | Edge-to-edge layout like the other pages (no top/bottom strips); footer text updated |
| `sw.js` | Cache v17, caches all paper files, never caches `/api/` |
| `server/server.js`, `server/package.json` | NEW - saves accounts, data and files |
| `.gitignore` | NEW - keeps `server-data/` (people's data) out of GitHub |

## Run it
Needs Node 18+ (nothing to install):
```
node server/server.js
```
Open http://localhost:3000. The server also serves the app, so one address does everything.
Data is written to `server-data/` (accounts, store, files). Back that folder up now and then.

## Putting it online
- Use a host with a **persistent disk** (VPS, home PC / Raspberry Pi, or a host volume). Hosts that wipe files
  on restart will lose accounts.
- Use **HTTPS** (passwords travel to the server).
- App on GitHub Pages + server elsewhere: put the server address in `API_BASE` at the top of `js/core.js`
  and start the server with `ALLOWED_ORIGIN=https://<you>.github.io`.

## Good to know
- First login / account creation needs internet. After that the app works offline and syncs when back online.
- Logging out clears this device's copy (after sending changes). Logging in again brings everything back.
- Limits: 40 MB per file, 1 GB of files and 8 MB of other data per account.
