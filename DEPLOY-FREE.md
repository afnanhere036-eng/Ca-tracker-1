# Run it free, on your phone only (no server, no Termux)

The app now saves everything in the browser on your phone (no login, no server).

## Host it on GitHub Pages (free, always on)
1. Create a free GitHub account, then a new **public** repository (e.g. `ca-tracker`).
2. Upload ALL files from this folder (drag and drop on the repo page: "Add file" > "Upload files").
   `server/` and `README-ACCOUNTS.md` are not needed and can be skipped.
3. Repo > Settings > Pages > Source: "Deploy from a branch", Branch: `main`, folder `/ (root)` > Save.
4. After ~1 minute your link is `https://<username>.github.io/ca-tracker/`.
5. Open it in Chrome on your phone > menu (3 dots) > "Add to Home screen" / "Install app".
   It then opens like an app and works offline.

## Moving your existing progress (from localhost:3000)
Data does not move automatically because the address is different.
1. On the OLD address (localhost:3000): Settings > Backup file > Export.
2. On the NEW link: Settings > Backup file > Import, pick that file.
Error Log attachments (photos/files) are included in the backup file too.

## Good to know
- Data lives only in that browser. Clearing site data or uninstalling the browser deletes it, so Export a backup now and then.
- To go back to accounts + a server later, set `window.CAT_CONFIG = { localOnly: false }` before core.js (see js/core.js).
