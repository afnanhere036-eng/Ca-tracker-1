# Using CA Checklist fully offline

The app has no online dependencies: no CDN scripts, web fonts, remote images or API calls. All data (ticks, time blocks) is stored on your device in the browser.

## Option 1: Install it (recommended for phones)
1. Put these files on any static host once (GitHub Pages, Netlify, etc.) and open `index.html` while online.
2. The app saves itself on your device on that first visit.
3. Choose "Add to Home Screen" / "Install app". It now opens with no internet, with all pages.

## Option 2: Open the files directly (no hosting)
1. Keep all files together in one folder and open `index.html` in Chrome or Edge.
2. Everything works, but the "install and cache" step does not apply to `file://` pages.
3. Use Chrome or Edge: Firefox gives each local file its own storage, so time blocks made on one page may not show on the other.

## After you change any file
Bump the version in `sw.js` (`ca-checklist-v12` to `v13`) so installed copies refresh.

## Notes
- Clearing browser data erases your ticks and time blocks. Data is per browser and per device.
- The four source links on the Syllabus page need internet when tapped; nothing else does.
