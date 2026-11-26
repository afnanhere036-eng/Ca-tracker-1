/* CA Checklist - shared core: styles, account (username + password), sync, profile (name + picture),
   usage timer, device info.
   Add <script src="js/core.js"></script> at the end of <body> on EVERY page.
   A page shows the top bar (Home link, sync dot, profile) only if it contains <div id="cat-topbar"></div>.

   HOW DATA IS SAVED
   - Pages keep using localStorage exactly as before (nothing to change in them).
   - This file watches localStorage and copies every change to the server (server/server.js),
     which writes it into files under server-data/. Log in on any device -> your data comes back.
   - Works offline: changes are queued and sent when the internet returns. */
(function () {
  "use strict";

  var APP = { name: "CA Checklist", version: "2.0.0" }; // <- change version here

  /* Address of the server. "" = same address that serves the app (recommended).
     If the app is on GitHub Pages and the server is elsewhere, put the server address here,
     e.g. "https://ca-tracker.onrender.com" */
  var API_BASE = (window.CAT_CONFIG && window.CAT_CONFIG.apiBase) || "";
  API_BASE = API_BASE.replace(/\/$/, "");

  /* LOCAL ONLY (default): no server, no login. Everything is saved in this browser on this device,
     so the app can be hosted for free on any static host (GitHub Pages, Netlify, Cloudflare Pages).
     To use the account + sync server again, set  window.CAT_CONFIG = { localOnly: false }  before core.js. */
  var LOCAL_ONLY = !(window.CAT_CONFIG && window.CAT_CONFIG.localOnly === false);

  var KEY = {
    token: "cat_auth_token", user: "cat_auth_user", device: "cat_auth_device",
    meta: "cat_sync_meta", since: "cat_sync_since",
    profile: "cat_profile", usagePrefix: "cat_usage_"
  };
  var INTERNAL = /^cat_(auth|sync)_/; // never sent to the server

  /* ---------- raw storage (so our own writes never trigger sync) ---------- */
  var ls = null;
  try { ls = window.localStorage; ls.getItem("x"); } catch (e) { ls = null; }
  var proto = Storage.prototype;
  var rawSet = proto.setItem, rawRemove = proto.removeItem, rawClear = proto.clear;

  function read(key, fallback) {
    try { var v = ls.getItem(key); return v === null || v === "" ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function write(key, value) { try { rawSet.call(ls, key, JSON.stringify(value)); } catch (e) { /* full */ } }
  function rawGet(key) { try { return ls.getItem(key); } catch (e) { return null; } }
  function syncedKeys() {
    var out = [];
    try { for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && !INTERNAL.test(k)) out.push(k); } } catch (e) {}
    return out;
  }

  /* Watch page writes: schedule a sync soon after any change. */
  var changeTimer = null;
  function touch() {
    if (!getToken() || changeTimer) return;
    changeTimer = setTimeout(function () { changeTimer = null; sync(); }, 3000);
  }
  if (ls) {
    proto.setItem = function (k, v) { rawSet.call(this, k, v); if (this === ls && !INTERNAL.test(String(k))) touch(); };
    proto.removeItem = function (k) { rawRemove.call(this, k); if (this === ls && !INTERNAL.test(String(k))) touch(); };
    /* clear() must never delete the login session or sync state */
    proto.clear = function () {
      if (this !== ls) return rawClear.call(this);
      syncedKeys().forEach(function (k) { rawRemove.call(ls, k); });
      touch();
    };
  }

  /* ---------- styles (match the app's dark ice-blue look) ---------- */
  var css = [
    ":root{--bg:#1A2029;--card:#232c38;--card2:#2b3644;--text:#e9f4fb;--muted:#9fb3c4;--ice:#7fd4ff;--good:#5fd3a0;--bad:#ff8a80;--warn:#ffcc66;--line:rgba(127,212,255,.15)}",
    "*{box-sizing:border-box}",
    "body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% -10%,#2a3646 0%,var(--bg) 55%);color:var(--text);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:0 18px max(24px,env(safe-area-inset-bottom))}",
    "button{font:inherit;color:inherit;cursor:pointer}",
    ":focus-visible{outline:3px solid var(--ice);outline-offset:2px}",
    ".wrap{max-width:560px;margin:0 auto;padding:6px 0 24px}",
    "h1{margin:6px 0 4px;font-size:26px;letter-spacing:.3px}",
    "h2{margin:24px 0 8px;font-size:16px}",
    ".sub{margin:0 0 16px;color:var(--muted);font-size:14px}",
    "@@TOPBAR@@",
    "#cat-topbar{max-width:560px;margin:0 auto;display:flex;align-items:center;gap:10px;padding:max(14px,env(safe-area-inset-top)) 0 10px}",
    "#cat-topbar .home{display:inline-block;min-height:0;background:none;border-radius:0;color:var(--ice);text-decoration:none;font-size:16px;font-weight:600;white-space:nowrap;margin:0 auto 0 0;padding:6px 0}",
    ".chip{display:flex;align-items:center;gap:8px;max-width:50vw;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:4px 12px 4px 4px}",
    ".chip .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}",
    ".avatar{flex:none;width:28px;height:28px;border-radius:50%;background:var(--ice);color:#10202c;display:grid;place-items:center;font-weight:700;font-size:14px;overflow:hidden}",
    ".avatar img{width:100%;height:100%;object-fit:cover;display:block}",
    ".avatar.big{width:84px;height:84px;font-size:34px}",
    ".sync-dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--muted)}",
    ".sync-dot.ok{background:var(--good)}.sync-dot.pending{background:var(--warn)}.sync-dot.error{background:var(--bad)}",
    "@@LISTS@@",
    ".crumbs{display:flex;flex-wrap:wrap;gap:6px;color:var(--muted);font-size:13.5px;margin:4px 0 8px}",
    ".crumbs a{color:var(--ice);text-decoration:none}",
    ".list{display:grid;gap:12px}",
    ".row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:16px;border-radius:16px;background:linear-gradient(160deg,var(--card2),var(--card));border:1px solid var(--line)}",
    ".row .grow{flex:1;min-width:0}",
    ".row .title{font-weight:600;font-size:16px}",
    ".row .meta{color:var(--muted);font-size:12.5px}",
    ".badge{border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:12px;color:var(--muted);white-space:nowrap}",
    ".empty{padding:22px 16px;border-radius:16px;border:1px dashed rgba(127,212,255,.3);color:var(--muted);text-align:center}",
    ".empty code{background:var(--card);padding:2px 6px;border-radius:6px;color:var(--text)}",
    /* questions */
    ".q{padding:16px;border-radius:16px;background:linear-gradient(160deg,var(--card2),var(--card));border:1px solid var(--line)}",
    ".q+.q{margin-top:12px}",
    ".q .tag{font-size:12px;color:var(--muted);margin-bottom:6px}",
    ".q .qtext{margin:0 0 10px;font-weight:600;white-space:pre-wrap}",
    ".opt{display:block;width:100%;text-align:left;margin-top:8px;padding:10px 12px;border-radius:10px;background:var(--bg);border:1px solid var(--line)}",
    ".opt.correct{border-color:var(--good);background:rgba(95,211,160,.15)}",
    ".opt.wrong{border-color:var(--bad);background:rgba(255,138,128,.15)}",
    ".opt[disabled]{cursor:default}",
    ".reveal{margin-top:10px;background:transparent;border:1px solid var(--ice);color:var(--ice);border-radius:999px;padding:6px 14px;font-weight:600}",
    ".answer{margin-top:10px;padding:10px 12px;border-left:4px solid var(--ice);background:var(--bg);border-radius:6px;white-space:pre-wrap}",
    ".answer[hidden]{display:none}",
    "@@SETTINGS@@",
    ".panel{padding:2px 16px;border-radius:16px;background:linear-gradient(160deg,var(--card2),var(--card));border:1px solid var(--line)}",
    ".kv{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:13px 0;border-bottom:1px solid var(--line)}",
    ".kv:last-child{border-bottom:0}",
    ".kv .k{color:var(--muted)}",
    ".kv .v{display:flex;align-items:center;gap:10px;font-weight:600;text-align:right;overflow-wrap:anywhere}",
    ".btn{border:0;border-radius:10px;padding:10px 16px;font-weight:600;background:#2f4a63;color:var(--text)}",
    ".btn.ghost{background:transparent;border:1px solid var(--ice);color:var(--ice)}",
    ".btn.danger{background:transparent;border:1px solid var(--bad);color:var(--bad)}",
    ".btn.small{padding:5px 12px;font-size:13px}",
    ".btn[disabled]{opacity:.6;cursor:default}",
    /* modal */
    ".overlay{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:16px;background:rgba(8,12,20,.78);overflow:auto}",
    ".modal{width:100%;max-width:380px;padding:20px;border-radius:18px;background:var(--card);border:1px solid var(--line)}",
    ".modal h3{margin:0 0 6px;font-size:20px}",
    ".modal p{margin:0 0 14px;color:var(--muted)}",
    ".modal label{display:block;margin:10px 0 4px;color:var(--muted);font-size:13px}",
    ".modal input[type=text],.modal input[type=password]{width:100%;font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:11px 12px}",
    ".modal .err{min-height:1.2em;margin:8px 0 0;color:var(--bad);font-size:13px}",
    ".modal .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}",
    ".modal .show{display:flex;align-items:center;gap:8px;margin-top:10px;color:var(--muted);font-size:13px}",
    ".tabs{display:flex;gap:8px;margin:0 0 6px}",
    ".tabs button{flex:1;padding:9px;border-radius:10px;border:1px solid var(--line);background:var(--bg);font-weight:600}",
    ".tabs button.on{border-color:var(--ice);color:var(--ice)}",
    ".photo-edit{display:flex;align-items:center;gap:14px;margin:6px 0 4px}",
    ".photo-edit .btns{display:flex;flex-direction:column;gap:8px}",
    ".toast{position:fixed;left:50%;bottom:max(20px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:100001;max-width:92vw;padding:10px 14px;border-radius:12px;background:var(--card2);border:1px solid var(--ice);display:flex;gap:12px;align-items:center}"
  ];
  /* Pages with their own design (<html data-own-styles>) keep their own body/.wrap/.row/button rules:
     only the shared top bar, account chip and dialogs are styled for them. */
  var ownStyles = document.documentElement.hasAttribute("data-own-styles");
  var iTop = css.indexOf("@@TOPBAR@@"), iLists = css.indexOf("@@LISTS@@"), iSet = css.indexOf("@@SETTINGS@@");
  var vars = css[0];
  css = ownStyles
    ? [vars.replace(":root{", "#cat-topbar,.overlay,.toast{"),
       "#cat-topbar,#cat-topbar *,.overlay,.overlay *,.toast,.toast *{box-sizing:border-box}",
       "#cat-topbar,.overlay,.toast{color:var(--text);font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif}",
       "#cat-topbar button,.overlay button,.toast button{font:inherit;color:inherit;cursor:pointer}",
       ":focus-visible{outline:3px solid var(--ice);outline-offset:2px}",
       ]
        .concat(css.slice(iTop + 1, iLists), css.slice(iSet + 1),
                ["#cat-topbar{max-width:596px;padding-left:18px;padding-right:18px}"])
    : css.filter(function (r) { return r.indexOf("@@") !== 0; });
  css = css.join("\n");
  var style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  /* ---------- DOM helper ---------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach(function (c) { node.append(c); });
    return node;
  }
  function toast(text, actionLabel, action) {
    var old = document.getElementById("cat-toast"); if (old) old.remove();
    var t = el("div", { class: "toast", id: "cat-toast", role: "status" }, [el("span", { text: text })]);
    if (actionLabel) t.append(el("button", { class: "btn small", text: actionLabel, onclick: function () { t.remove(); action(); } }));
    document.body.append(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 8000);
  }

  /* ---------- tiny helpers ---------- */
  function getToken() { return LOCAL_ONLY ? null : rawGet(KEY.token); }
  function getUser() { return LOCAL_ONLY ? "local" : rawGet(KEY.user); }
  function deviceId() {
    var d = rawGet(KEY.device);
    if (!d) { d = Math.random().toString(36).slice(2, 10); try { rawSet.call(ls, KEY.device, d); } catch (e) {} }
    return d;
  }
  function hash(s) { // fast change detector (not security)
    var h = 5381; s = s || "";
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h) + ":" + s.length;
  }

  /* ---------- server calls ---------- */
  function api(path, body, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (opts.auth !== false && getToken()) headers.Authorization = "Bearer " + getToken();
    var payload = JSON.stringify(body || {});
    return fetch(API_BASE + path, {
      method: "POST", headers: headers, body: payload,
      keepalive: !!opts.keepalive && payload.length < 60000
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var msg = j.error || (r.status === 404 || r.status === 405
            ? "The server is not reachable at this address. Check API_BASE in js/core.js."
            : "Something went wrong (" + r.status + ").");
          throw { status: r.status, message: msg };
        }
        return j;
      });
    }, function () { throw { offline: true, message: "No internet connection." }; });
  }

  /* ---------- sync engine ---------- */
  var meta = read(KEY.meta, {});      // key -> {t: time, h: hash, d: 1 if not yet sent, x: 1 if deleted}
  var busy = false, inflight = null, state = "pending", firstSyncDone = false;
  var stateListeners = [];

  function saveMeta() { write(KEY.meta, meta); }
  function setState(s) {
    state = s;
    stateListeners.forEach(function (fn) { try { fn(s); } catch (e) {} });
    var dot = document.getElementById("cat-sync-dot");
    if (dot) { dot.className = "sync-dot " + s; dot.title = stateText(s); }
  }
  function stateText(s) {
    return s === "ok" ? "All changes saved to your account" : s === "pending" ? "Changes waiting to sync"
      : s === "offline" ? "Offline - will sync when online" : "Sync problem - will retry";
  }
  function hasDirty() { return Object.keys(meta).some(function (k) { return meta[k].d; }); }

  /* Find what changed locally since the last sync (works even for changes made before this file loaded). */
  function reconcile(newKeyTime) {
    var now = Date.now();
    syncedKeys().forEach(function (k) {
      var h = hash(rawGet(k)), m = meta[k];
      if (!m) meta[k] = { t: newKeyTime || now, h: h, d: 1 };
      else if (m.x || m.h !== h) meta[k] = { t: now, h: h, d: 1 };
    });
    Object.keys(meta).forEach(function (k) {
      if (!meta[k].x && rawGet(k) === null) meta[k] = { t: now, x: 1, d: 1 };
    });
    saveMeta();
  }

  function applyRemote(list) {
    var applied = 0;
    list.forEach(function (r) {
      var m = meta[r.k];
      if (m && ((m.d && m.t >= r.t) || (!m.d && m.t >= r.t))) return; // we already have this or newer
      try {
        if (r.x) { rawRemove.call(ls, r.k); meta[r.k] = { t: r.t, x: 1 }; }
        else { rawSet.call(ls, r.k, r.v); meta[r.k] = { t: r.t, h: hash(r.v) }; }
        applied++;
      } catch (e) { /* storage full */ }
    });
    return applied;
  }

  function sync(opts) {
    opts = opts || {};
    if (!ls || !getToken()) return Promise.resolve({ ok: false });
    if (!navigator.onLine) { reconcile(); setState("offline"); return Promise.resolve({ ok: false, offline: true }); }
    if (busy) return inflight.then(function () { return sync(opts); }); // wait for the running sync, then run ours
    busy = true;
    reconcile(opts.newKeyTime);
    var sent = [];
    Object.keys(meta).forEach(function (k) {
      var m = meta[k];
      if (m.d) sent.push({ k: k, t: m.t, x: m.x ? 1 : 0, v: m.x ? undefined : rawGet(k), sentH: m.h });
    });
    if (sent.length) setState("pending");
    var body = { since: Number(rawGet(KEY.since)) || 0, changes: sent.map(function (c) { return { k: c.k, t: c.t, x: c.x, v: c.v }; }) };

    inflight = api("/api/sync", body, { keepalive: !!opts.keepalive }).then(function (res) {
      sent.forEach(function (c) { // mark as sent unless it changed again meanwhile
        var m = meta[c.k]; if (m && m.t === c.t) delete m.d;
      });
      var applied = applyRemote(res.changes || []);
      try { rawSet.call(ls, KEY.since, String(res.seq || 0)); } catch (e) {}
      saveMeta();
      busy = false;
      setState(hasDirty() ? "pending" : "ok");
      if (applied > 0) {
        document.dispatchEvent(new CustomEvent("cat:synced", { detail: { applied: applied } }));
        notifyProfile();
        if (!firstSyncDone && !opts.noReload && canAutoReload()) { location.reload(); }
        else toast("Updated from another device.", "Reload", function () { location.reload(); });
      }
      firstSyncDone = true;
      filesPump();
      return { ok: true, applied: applied };
    }, function (err) {
      busy = false;
      if (err && err.offline) setState("offline");
      else if (err && err.status === 401) { setState("error"); sessionExpired(); }
      else setState("error");
      return { ok: false, error: err };
    });
    return inflight;
  }
  function canAutoReload() { // never reload more than once every 10 seconds
    try {
      var last = Number(sessionStorage.getItem("cat_reload_at")) || 0;
      if (Date.now() - last < 10000) return false;
      sessionStorage.setItem("cat_reload_at", String(Date.now()));
      return true;
    } catch (e) { return false; }
  }

  function startSync() {
    sync();
    setInterval(function () { if (document.visibilityState === "visible") sync(); }, 60000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") sync({ keepalive: true }); else sync();
    });
    window.addEventListener("pagehide", function () { sync({ keepalive: true }); });
    window.addEventListener("online", function () { sync(); });
    window.addEventListener("offline", function () { setState("offline"); });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  }

  /* ---------- attachments (Error Logs files): uploaded to / downloaded from the server ---------- */
  var Q_UP = "cat_sync_up", Q_DEL = "cat_sync_del"; // queues survive offline + reloads
  function readQ(k) { var v = read(k, []); return Array.isArray(v) ? v : []; }
  function qAdd(k, id) { var a = readQ(k); if (a.indexOf(id) < 0) { a.push(id); write(k, a); } }
  function qDrop(k, id) { write(k, readQ(k).filter(function (x) { return x !== id; })); }
  function pendingWork() { return hasDirty() || readQ(Q_UP).length > 0 || readQ(Q_DEL).length > 0; }

  function blobFromIdb(uid) { // local copy of an attachment (stored by errorlogs.html)
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var r; try { r = indexedDB.open("ca-error-logs"); } catch (e) { return resolve(null); }
      r.onupgradeneeded = function () { r.transaction.abort(); }; // database does not exist yet: do not create it
      r.onerror = function () { resolve(null); };
      r.onsuccess = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains("blobs")) { db.close(); return resolve(null); }
        var q = db.transaction("blobs").objectStore("blobs").get(uid);
        q.onsuccess = function () { db.close(); resolve(q.result ? q.result.blob : null); };
        q.onerror = function () { db.close(); resolve(null); };
      };
    });
  }
  function fileRequest(method, id, body) {
    return fetch(API_BASE + "/api/file?id=" + encodeURIComponent(id), {
      method: method, body: body,
      headers: { Authorization: "Bearer " + getToken(), "Content-Type": "application/octet-stream" }
    }).then(function (r) {
      if (r.ok) return r;
      return r.json().catch(function () { return {}; }).then(function (j) { throw { status: r.status, message: j.error || "Server error" }; });
    }, function () { throw { offline: true }; });
  }

  var pumping = false;
  function filesPump() {
    if (pumping || !getToken() || !navigator.onLine) return Promise.resolve();
    pumping = true;
    var chain = Promise.resolve();
    readQ(Q_DEL).forEach(function (id) {
      chain = chain.then(function () {
        return api("/api/file-delete", { id: id }).then(function () { qDrop(Q_DEL, id); });
      });
    });
    readQ(Q_UP).forEach(function (id) {
      chain = chain.then(function () {
        return blobFromIdb(id).then(function (blob) {
          if (!blob) { qDrop(Q_UP, id); return; }            // file was deleted locally meanwhile
          return fileRequest("POST", id, blob).then(function () { qDrop(Q_UP, id); }, function (e) {
            if (e && (e.status === 413 || e.status === 400)) { qDrop(Q_UP, id); toast("A file could not be saved to your account: " + (e.message || "too large")); return; }
            throw e;
          });
        });
      });
    });
    return chain.then(function () { pumping = false; }, function () { pumping = false; });
  }
  var Files = {
    queueUpload: function (id) { if (LOCAL_ONLY) return Promise.resolve(); qAdd(Q_UP, id); return filesPump(); },
    remove: function (id) { if (LOCAL_ONLY) return Promise.resolve(); qDrop(Q_UP, id); qAdd(Q_DEL, id); return filesPump(); },
    download: function (id) { return fileRequest("GET", id).then(function (r) { return r.blob(); }); },
    pump: filesPump
  };

  /* ---------- usage time (per device, so devices never overwrite each other) ---------- */
  var TICK = 5, usageKey = KEY.usagePrefix + deviceId();
  setInterval(function () {
    if (document.visibilityState !== "visible" || !(LOCAL_ONLY || getToken())) return;
    try { rawSet.call(ls, usageKey, String((Number(rawGet(usageKey)) || 0) + TICK)); } catch (e) {}
  }, TICK * 1000);
  function totalUsage() {
    var sum = 0;
    syncedKeys().forEach(function (k) { if (k.indexOf(KEY.usagePrefix) === 0) sum += Number(rawGet(k)) || 0; });
    return sum;
  }
  function formatDuration(sec) {
    sec = Math.floor(sec || 0);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + "h " + m + "m";
    if (m > 0) return m + "m " + s + "s";
    return s + "s";
  }

  /* ---------- profile (name + picture) ---------- */
  function getProfile() {
    var p = read(KEY.profile, null) || {}, u = getUser() || "";
    return { id: u, username: u, name: p.name || (LOCAL_ONLY ? "Me" : u), photo: p.photo || "", created: p.created || null, usageSec: totalUsage() };
  }
  function saveProfile(patch) {
    var p = read(KEY.profile, null) || { created: Date.now() };
    Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
    write(KEY.profile, p);
    touch(); notifyProfile();
  }
  var listeners = [];
  function notifyProfile() {
    renderTopbar();
    listeners.forEach(function (fn) { try { fn(getProfile()); } catch (e) { console.error(e); } });
  }
  var Profiles = { // kept so older page code keeps working
    all: function () { return getUser() ? [getProfile()] : []; },
    active: function () { return getUser() ? getProfile() : null; }
  };
  function avatarNode(p, big) {
    var a = el("span", { class: "avatar" + (big ? " big" : "") });
    if (p.photo) a.append(el("img", { src: p.photo, alt: "" }));
    else a.textContent = (p.name || "?").charAt(0).toUpperCase();
    return a;
  }
  function resizeImage(file, size) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(img.width, img.height), c = document.createElement("canvas");
        c.width = c.height = size;
        c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src = url;
    });
  }

  /* ---------- modals ---------- */
  function closeModal() { var o = document.getElementById("cat-overlay"); if (o) o.remove(); }
  function openModal(children) {
    closeModal();
    document.body.append(el("div", { class: "overlay", id: "cat-overlay", role: "dialog", "aria-modal": "true" }, [el("div", { class: "modal" }, children)]));
  }

  /* Login / create account (cannot be closed until you are in) */
  function authModal(prefillUser, note) {
    var mode = "login";
    var user = el("input", { type: "text", maxlength: "24", placeholder: "Username", autocomplete: "username", autocapitalize: "none", spellcheck: "false", value: prefillUser || "" });
    var pass = el("input", { type: "password", placeholder: "Password", autocomplete: "current-password" });
    var pass2 = el("input", { type: "password", placeholder: "Repeat password", autocomplete: "new-password" });
    var pass2Box = el("div", { style: "display:none" }, [el("label", { text: "Repeat password" }), pass2]);
    var err = el("p", { class: "err", "aria-live": "polite", text: note || "" });
    var show = el("input", { type: "checkbox" });
    show.addEventListener("change", function () { pass.type = pass2.type = show.checked ? "text" : "password"; });
    var tabLogin = el("button", { class: "on", text: "Log in", type: "button", onclick: function () { setMode("login"); } });
    var tabNew = el("button", { text: "Create account", type: "button", onclick: function () { setMode("register"); } });
    var go = el("button", { class: "btn", text: "Log in", type: "button", onclick: submit });
    var hint = el("p", { text: "Log in to load your saved progress on this device." });

    function setMode(m) {
      mode = m; err.textContent = "";
      tabLogin.className = m === "login" ? "on" : ""; tabNew.className = m === "register" ? "on" : "";
      pass2Box.style.display = m === "register" ? "block" : "none";
      pass.autocomplete = m === "register" ? "new-password" : "current-password";
      go.textContent = m === "register" ? "Create account" : "Log in";
      hint.textContent = m === "register"
        ? "Pick a username and a password (8+ characters). Your progress will be saved to this account."
        : "Log in to load your saved progress on this device.";
    }
    function submit() {
      var u = user.value.trim().toLowerCase(), p = pass.value;
      if (!/^[a-z0-9_.-]{3,24}$/.test(u)) { err.textContent = "Username: 3-24 letters, numbers, dot, dash or underscore."; return; }
      if (p.length < 8) { err.textContent = "Password must be at least 8 characters."; return; }
      if (mode === "register" && p !== pass2.value) { err.textContent = "The two passwords do not match."; return; }
      err.textContent = ""; go.disabled = true; go.textContent = "Please wait…";
      var isNew = mode === "register";
      api(isNew ? "/api/register" : "/api/login", { username: u, password: p }, { auth: false }).then(function (res) {
        return onAuthenticated(res.username, res.token, isNew);
      }).catch(function (e) {
        go.disabled = false; go.textContent = isNew ? "Create account" : "Log in";
        err.textContent = (e && e.offline) ? "You need internet for the first login or to create an account." : (e && e.message) || "Failed.";
      });
    }
    pass.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    pass2.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });

    openModal([
      el("h3", { text: "Welcome to " + APP.name }),
      hint,
      el("div", { class: "tabs" }, [tabLogin, tabNew]),
      el("label", { text: "Username" }), user,
      el("label", { text: "Password" }), pass,
      pass2Box,
      el("label", { class: "show" }, [show, el("span", { text: "Show password" })]),
      err,
      el("div", { class: "actions" }, [go])
    ]);
    user.focus();
  }

  function wipeLocal() {
    syncedKeys().forEach(function (k) { rawRemove.call(ls, k); });
    [KEY.token, KEY.user, KEY.meta, KEY.since, Q_UP, Q_DEL].forEach(function (k) { rawRemove.call(ls, k); });
    try { if (window.indexedDB) indexedDB.deleteDatabase("ca-error-logs"); } catch (e) {}
    meta = {};
  }
  function migrateLegacy() { // old versions kept a local profile list; carry the active one over
    var list = read("cat_profiles", null);
    if (Array.isArray(list) && list.length) {
      var id = read("cat_active_profile", null);
      var p = list.filter(function (x) { return x.id === id; })[0] || list[0];
      write(KEY.profile, { name: p.name, photo: "", created: p.created || Date.now() });
      try { rawSet.call(ls, KEY.usagePrefix + "legacy", String(Math.floor(p.usageSec || 0))); } catch (e) {}
    }
    ["cat_profiles", "cat_active_profile", "cat_first_open"].forEach(function (k) { rawRemove.call(ls, k); });
  }

  function onAuthenticated(username, token, isNew) {
    var previous = getUser();
    if (previous && previous !== username) wipeLocal();      // different account on this device
    try { rawSet.call(ls, KEY.user, username); rawSet.call(ls, KEY.token, token); } catch (e) {}
    if (isNew) {
      migrateLegacy();                                       // keep progress made before accounts existed
      if (!read(KEY.profile, null)) write(KEY.profile, { name: username, photo: "", created: Date.now() });
    } else {
      ["cat_profiles", "cat_active_profile", "cat_first_open"].forEach(function (k) { rawRemove.call(ls, k); });
    }
    /* New account: local data is the newest. Existing account: server data wins on conflicts. */
    return sync({ newKeyTime: isNew ? Date.now() : 1, noReload: true }).then(function (r) {
      closeModal();
      if (!r.ok && !isNew) { /* could not pull data */ }
      if (r.applied > 0 || !isNew) { location.reload(); return; }
      startSync(); notifyProfile();
    });
  }

  function sessionExpired() {
    try { rawRemove.call(ls, KEY.token); } catch (e) {}
    authModal(getUser() || "", "Your login expired. Please log in again.");
  }

  function logout() {
    var go = function () {
      var t = getToken();
      var done = function () { wipeLocal(); location.reload(); };
      if (!t) return done();
      api("/api/logout", {}).then(done, done);
    };
    sync({ noReload: true }).then(function (r) { return filesPump().then(function () { return r; }); }).then(function (r) {
      if (pendingWork()) {
        if (!confirm("Some changes could not be sent to your account yet (you may be offline). If you log out now they will be lost. Log out anyway?")) return;
      }
      go();
    });
  }

  function editProfileModal() {
    var p = getProfile(), photo = p.photo;
    var input = el("input", { type: "text", maxlength: "30", placeholder: "Your name", autocomplete: "off", value: p.name });
    var err = el("p", { class: "err", "aria-live": "polite" });
    var holder = el("div");
    function paint() { holder.replaceChildren(avatarNode({ name: input.value || p.name, photo: photo }, true)); }
    var file = el("input", { type: "file", accept: "image/*", style: "display:none" });
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; if (!f) return;
      resizeImage(f, 256).then(function (data) { photo = data; err.textContent = ""; paint(); },
        function () { err.textContent = "Could not read that image."; });
    });
    input.addEventListener("input", paint);
    function save() {
      var v = input.value.trim();
      if (v.length < 2) { err.textContent = "Enter at least 2 characters."; return; }
      closeModal(); saveProfile({ name: v, photo: photo });
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") save(); });
    paint();
    openModal([
      el("h3", { text: "Edit profile" }),
      el("div", { class: "photo-edit" }, [holder, el("div", { class: "btns" }, [
        el("button", { class: "btn small", type: "button", text: "Choose picture", onclick: function () { file.click(); } }),
        el("button", { class: "btn ghost small", type: "button", text: "Remove picture", onclick: function () { photo = ""; paint(); } })
      ]), file]),
      el("label", { text: "Name" }), input, err,
      el("div", { class: "actions" }, [
        el("button", { class: "btn ghost", type: "button", text: "Cancel", onclick: closeModal }),
        el("button", { class: "btn", type: "button", text: "Save", onclick: save })
      ])
    ]);
  }

  function accountModal() {
    var p = getProfile();
    if (LOCAL_ONLY) {
      return openModal([
        el("div", { style: "display:flex;align-items:center;gap:14px;margin-bottom:12px" }, [
          avatarNode(p, true), el("div", {}, [el("h3", { text: p.name }), el("p", { style: "margin:0", text: "Saved on this device" })])
        ]),
        el("div", { class: "actions", style: "justify-content:flex-start" }, [
          el("button", { class: "btn", type: "button", text: "Edit profile", onclick: editProfileModal }),
          el("button", { class: "btn ghost", type: "button", text: "Settings", onclick: function () { location.href = "settings.html"; } })
        ]),
        el("div", { class: "actions" }, [el("button", { class: "btn ghost", type: "button", text: "Close", onclick: closeModal })])
      ]);
    }
    openModal([
      el("div", { style: "display:flex;align-items:center;gap:14px;margin-bottom:12px" }, [
        avatarNode(p, true),
        el("div", {}, [el("h3", { text: p.name }), el("p", { style: "margin:0", text: "@" + p.username })])
      ]),
      el("p", { text: stateText(state) }),
      el("div", { class: "actions", style: "justify-content:flex-start" }, [
        el("button", { class: "btn", type: "button", text: "Edit profile", onclick: editProfileModal }),
        el("button", { class: "btn ghost", type: "button", text: "Settings", onclick: function () { location.href = "settings.html"; } })
      ]),
      el("div", { class: "actions" }, [
        el("button", { class: "btn ghost", type: "button", text: "Close", onclick: closeModal }),
        el("button", { class: "btn danger", type: "button", text: "Log out", onclick: function () { closeModal(); logout(); } })
      ])
    ]);
  }

  function changePassword(oldPw, newPw) { return api("/api/change-password", { oldPassword: oldPw, newPassword: newPw }); }

  /* ---------- backup file (export / import) ---------- */
  /* Attached files (Error Logs) live in IndexedDB, so they are added to the backup too. */
  function openFilesDb() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var r; try { r = indexedDB.open("ca-error-logs", 2); } catch (e) { return resolve(null); }
      r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs", { keyPath: "id" }); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = r.onblocked = function () { resolve(null); };
    });
  }
  function blobToDataUrl(blob) {
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { resolve(null); };
      fr.readAsDataURL(blob);
    });
  }
  function dataUrlToBlob(u) { return fetch(u).then(function (r) { return r.blob(); }); }
  function exportFilesList() {
    return openFilesDb().then(function (db) {
      if (!db) return [];
      return new Promise(function (resolve) {
        var q = db.transaction("blobs").objectStore("blobs").getAll();
        q.onsuccess = function () { db.close(); resolve(q.result || []); };
        q.onerror = function () { db.close(); resolve([]); };
      }).then(function (rows) {
        return Promise.all(rows.map(function (row) {
          return blobToDataUrl(row.blob).then(function (d) { return d ? { id: row.id, data: d } : null; });
        })).then(function (list) { return list.filter(Boolean); });
      });
    });
  }
  function importFilesList(list) {
    if (!list || !list.length) return Promise.resolve();
    return openFilesDb().then(function (db) {
      if (!db) return;
      return Promise.all(list.map(function (f) {
        return dataUrlToBlob(f.data).then(function (blob) {
          return new Promise(function (resolve) {
            var t = db.transaction("blobs", "readwrite");
            t.objectStore("blobs").put({ id: f.id, blob: blob });
            t.oncomplete = t.onerror = t.onabort = function () { resolve(); };
          });
        });
      })).then(function () { db.close(); });
    });
  }

  function exportData() {
    var data = {};
    syncedKeys().forEach(function (k) { data[k] = rawGet(k); });
    return exportFilesList().then(function (files) {
      var blob = new Blob([JSON.stringify({ app: APP.name, exported: new Date().toISOString(), user: getUser(), data: data, files: files })], { type: "application/json" });
      var a = el("a", { href: URL.createObjectURL(blob), download: "ca-checklist-backup-" + new Date().toISOString().slice(0, 10) + ".json" });
      document.body.append(a); a.click(); a.remove();
      return { keys: Object.keys(data).length, files: files.length };
    });
  }
  function importData(file) {
    return file.text().then(function (txt) {
      var j = JSON.parse(txt);
      if (!j || typeof j.data !== "object") throw new Error("Not a backup file.");
      Object.keys(j.data).forEach(function (k) {
        if (INTERNAL.test(k)) return;
        if (j.data[k] === null) rawRemove.call(ls, k); else rawSet.call(ls, k, j.data[k]);
      });
      return importFilesList(j.files).then(function () { return sync({ noReload: true }); }).then(function () { location.reload(); });
    });
  }

  /* ---------- device info ---------- */
  function deviceInfo() {
    var ua = navigator.userAgent || "", os = "Unknown OS", model = "", m;
    if ((m = ua.match(/Android ([\d.]+)/))) {
      os = "Android " + m[1];
      var mm = ua.match(/Android [\d.]+; ([^;)]+)/);
      if (mm && mm[1].trim() !== "K") model = mm[1].replace(/ Build.*/, "").trim();
    } else if (/iPhone|iPad|iPod/.test(ua)) { os = "iOS"; model = /iPad/.test(ua) ? "iPad" : "iPhone"; }
    else if (/Windows NT/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Linux/.test(ua)) os = "Linux";
    var browser = "Browser";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/OPR\//.test(ua)) browser = "Opera";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    else if (/Chrome\//.test(ua)) browser = "Chrome";
    else if (/Safari\//.test(ua)) browser = "Safari";
    // Browsers cannot read a device's custom name (privacy), so we show model + OS.
    return { name: model ? model + " (" + os + ")" : os, browser: browser };
  }

  /* ---------- top bar (only on pages with <div id="cat-topbar">) ---------- */
  function renderTopbar() {
    var bar = document.getElementById("cat-topbar");
    if (!bar) return;
    bar.replaceChildren(el("a", { class: "home", href: "index.html", text: "\u2039 Home" }));
    if (!getUser()) return;
    var p = getProfile();
    if (!LOCAL_ONLY) bar.append(el("span", { class: "sync-dot " + state, id: "cat-sync-dot", title: stateText(state) }));
    bar.append(el("button", { class: "chip", "aria-label": "Account", onclick: accountModal }, [
      avatarNode(p), el("span", { class: "name", text: p.name })
    ]));
  }

  /* ---------- boot ---------- */
  function boot() {
    renderTopbar();
    if (!ls) { toast("This browser blocks storage, so the app cannot save your data."); return; }
    if (LOCAL_ONLY) {
      if (!read(KEY.profile, null)) { migrateLegacy(); if (!read(KEY.profile, null)) write(KEY.profile, { name: "Me", photo: "", created: Date.now() }); }
      notifyProfile();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(function () {});
      return;
    }
    if (!getToken()) { authModal(getUser() || ""); return; }
    state = navigator.onLine ? "pending" : "offline";
    notifyProfile();
    startSync();
  }

  window.CAT = {
    app: APP, localOnly: LOCAL_ONLY, profiles: Profiles, deviceInfo: deviceInfo, formatDuration: formatDuration,
    firstOpen: function () { return getProfile().created; },
    renameActive: editProfileModal, addProfile: editProfileModal, editProfile: editProfileModal,
    el: el, toast: toast, avatar: avatarNode,
    account: { user: getUser, logout: logout, changePassword: changePassword, menu: accountModal },
    sync: { now: function () { return sync({ noReload: true }); }, state: function () { return state; }, text: stateText,
            onState: function (fn) { stateListeners.push(fn); fn(state); }, hasUnsent: pendingWork },
    data: { exportFile: exportData, importFile: importData },
    files: Files,
    onChange: function (fn) { listeners.push(fn); fn(getUser() ? getProfile() : null); }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
