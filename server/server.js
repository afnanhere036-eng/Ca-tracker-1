/* CA Checklist server - accounts + data files + (optional) hosting of the app itself.
 * No npm packages needed. Requires Node 18 or newer.
 *
 *   node server/server.js
 *
 * Environment variables (all optional):
 *   PORT            port to listen on                      (default 3000)
 *   DATA_DIR        where account/data files are written   (default ../server-data)
 *   STATIC_DIR      folder with index.html etc.            (default ..  = repo root)
 *   ALLOWED_ORIGIN  site allowed to call the API from another address, e.g.
 *                   https://afnanhere036-eng.github.io     (default *)
 *
 * Files created in DATA_DIR:
 *   accounts/<username>.json   password hash + salt (never the password itself)
 *   store/<username>.json      that account's app data
 *   files/<username>/<id>.bin  uploaded Error Log attachments
 *   sessions.json              logged-in devices (hashed tokens)
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "server-data"));
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, ".."));
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const MAX_BODY = 3 * 1024 * 1024;          // one request
const MAX_STORE = 8 * 1024 * 1024;         // all data of one account
const SESSION_DAYS = 180;
const MAX_FILE = 40 * 1024 * 1024;         // one uploaded file (Error Logs attachments)
const MAX_FILES_TOTAL = 1024 * 1024 * 1024; // all uploaded files of one account
const USER_RE = /^[a-z0-9_.-]{3,24}$/;
const FILE_ID_RE = /^[a-z0-9]{6,40}$/;

for (const d of ["accounts", "store", "files"]) fs.mkdirSync(path.join(DATA_DIR, d), { recursive: true });

/* ---------- small file helpers (atomic writes) ---------- */
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; }
}
function writeJson(file, value) {
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}
const accountFile = (u) => path.join(DATA_DIR, "accounts", u + ".json");
const storeFile = (u) => path.join(DATA_DIR, "store", u + ".json");
const filesDir = (u) => path.join(DATA_DIR, "files", u);
const sessionsFile = path.join(DATA_DIR, "sessions.json");
let sessions = readJson(sessionsFile, {});

/* ---------- passwords + tokens ---------- */
function scrypt(password, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))));
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return { salt: salt.toString("hex"), hash: key.toString("hex") };
}
async function checkPassword(password, acct) {
  const key = await scrypt(password, Buffer.from(acct.salt, "hex"));
  const want = Buffer.from(acct.hash, "hex");
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

function newSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions[sha(token)] = { u: username, created: Date.now(), last: Date.now() };
  writeJson(sessionsFile, sessions);
  return token;
}
function userFromReq(req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || "");
  if (!m) return null;
  const s = sessions[sha(m[1])];
  if (!s) return null;
  if (Date.now() - s.created > SESSION_DAYS * 86400000) { delete sessions[sha(m[1])]; writeJson(sessionsFile, sessions); return null; }
  return { username: s.u, tokenHash: sha(m[1]) };
}
function dropSessionsOf(username, exceptHash) {
  for (const h of Object.keys(sessions)) if (sessions[h].u === username && h !== exceptHash) delete sessions[h];
  writeJson(sessionsFile, sessions);
}

/* ---------- very small brute-force limiter ---------- */
const fails = new Map(); // key -> {n, first}
function limited(key) {
  const f = fails.get(key);
  if (!f) return false;
  if (Date.now() - f.first > 15 * 60000) { fails.delete(key); return false; }
  return f.n >= 10;
}
function noteFail(key) {
  const f = fails.get(key);
  if (!f || Date.now() - f.first > 15 * 60000) fails.set(key, { n: 1, first: Date.now() });
  else f.n++;
}
const clientIp = (req) => (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim();

/* ---------- http helpers ---------- */
function send(res, status, body, extra) {
  const data = JSON.stringify(body);
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  }, extra || {}));
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject({ status: 413, message: "Too much data in one request." }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch (e) { reject({ status: 400, message: "Invalid JSON." }); }
    });
    req.on("error", () => reject({ status: 400, message: "Request failed." }));
  });
}

/* ---------- API ---------- */
function cleanUsername(u) { return String(u || "").trim().toLowerCase(); }
function validPassword(p) { return typeof p === "string" && p.length >= 8 && p.length <= 200; }

async function register(req, res) {
  const b = await readBody(req);
  const username = cleanUsername(b.username);
  if (!USER_RE.test(username)) return send(res, 400, { error: "Username must be 3-24 characters: letters, numbers, dot, dash or underscore." });
  if (!validPassword(b.password)) return send(res, 400, { error: "Password must be at least 8 characters." });
  if (fs.existsSync(accountFile(username))) return send(res, 409, { error: "That username is already taken." });
  const pw = await hashPassword(b.password);
  writeJson(accountFile(username), { username, salt: pw.salt, hash: pw.hash, created: Date.now() });
  writeJson(storeFile(username), { seq: 0, entries: {} });
  send(res, 200, { token: newSession(username), username });
}

async function login(req, res) {
  const b = await readBody(req);
  const username = cleanUsername(b.username);
  const key = clientIp(req) + "|" + username;
  if (limited(key)) return send(res, 429, { error: "Too many attempts. Try again in 15 minutes." });
  const acct = USER_RE.test(username) ? readJson(accountFile(username), null) : null;
  const ok = acct && typeof b.password === "string" && (await checkPassword(b.password, acct));
  if (!ok) { noteFail(key); return send(res, 401, { error: "Wrong username or password." }); }
  fails.delete(key);
  send(res, 200, { token: newSession(username), username });
}

async function changePassword(req, res, user) {
  const b = await readBody(req);
  const acct = readJson(accountFile(user.username), null);
  if (!acct || !(await checkPassword(String(b.oldPassword || ""), acct))) return send(res, 401, { error: "Current password is wrong." });
  if (!validPassword(b.newPassword)) return send(res, 400, { error: "New password must be at least 8 characters." });
  const pw = await hashPassword(b.newPassword);
  writeJson(accountFile(user.username), Object.assign(acct, { salt: pw.salt, hash: pw.hash }));
  dropSessionsOf(user.username, user.tokenHash); // log out other devices
  send(res, 200, { ok: true });
}

/* Sync: client sends changed keys; server keeps the newest version of each key
 * (by timestamp) and returns everything that changed since the client's `since`. */
async function sync(req, res, user) {
  const b = await readBody(req);
  const since = Number(b.since) || 0;
  const incoming = Array.isArray(b.changes) ? b.changes : [];
  const store = readJson(storeFile(user.username), { seq: 0, entries: {} });
  const rejected = [];

  for (const c of incoming) {
    if (!c || typeof c.k !== "string" || c.k.length > 200) continue;
    const t = Number(c.t) || 0;
    const cur = store.entries[c.k];
    if (cur && cur.t >= t) { rejected.push(c.k); continue; }
    store.seq += 1;
    store.entries[c.k] = c.x
      ? { x: 1, t, s: store.seq }
      : { v: typeof c.v === "string" ? c.v : String(c.v), t, s: store.seq };
  }
  if (Buffer.byteLength(JSON.stringify(store)) > MAX_STORE) return send(res, 413, { error: "Account storage is full." });
  if (incoming.length) writeJson(storeFile(user.username), store);

  const out = [];
  for (const k of Object.keys(store.entries)) {
    const e = store.entries[k];
    if (e.s > since || rejected.includes(k)) out.push({ k, v: e.v, t: e.t, x: e.x ? 1 : 0, s: e.s });
  }
  send(res, 200, { seq: store.seq, changes: out });
}


/* ---------- uploaded files (Error Logs attachments) ---------- */
function dirSize(dir) {
  let total = 0;
  try { for (const f of fs.readdirSync(dir)) total += fs.statSync(path.join(dir, f)).size; } catch (e) {}
  return total;
}
function fileId(url) {
  const id = new URL(url, "http://x").searchParams.get("id") || "";
  return FILE_ID_RE.test(id) ? id : null;
}
function uploadFile(req, res, user) {
  const id = fileId(req.url);
  if (!id) return send(res, 400, { error: "Bad file id." });
  const declared = Number(req.headers["content-length"]) || 0;
  if (declared > MAX_FILE) return send(res, 413, { error: "File is too large (limit 40 MB)." });
  const dir = filesDir(user.username);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, id + ".bin"), tmp = target + "." + process.pid + ".tmp";
  const existing = fs.existsSync(target) ? fs.statSync(target).size : 0;
  if (dirSize(dir) - existing + declared > MAX_FILES_TOTAL) return send(res, 413, { error: "Account file storage is full." });
  let size = 0, failed = false;
  const out = fs.createWriteStream(tmp);
  const fail = (status, message) => {
    if (failed) return; failed = true;
    out.destroy(); fs.unlink(tmp, () => {});
    send(res, status, { error: message });
  };
  req.on("data", (c) => { size += c.length; if (size > MAX_FILE) { fail(413, "File is too large (limit 40 MB)."); req.destroy(); } });
  req.on("error", () => fail(400, "Upload failed."));
  out.on("error", () => fail(500, "Could not save the file."));
  out.on("finish", () => {
    if (failed) return;
    fs.renameSync(tmp, target);
    send(res, 200, { ok: true, size });
  });
  req.pipe(out);
}
function downloadFile(req, res, user) {
  const id = fileId(req.url);
  if (!id) return send(res, 400, { error: "Bad file id." });
  const file = path.join(filesDir(user.username), id + ".bin");
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: "File not found." });
    res.writeHead(200, {
      "Content-Type": "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN
    });
    fs.createReadStream(file).pipe(res);
  });
}
async function deleteFile(req, res, user) {
  const b = await readBody(req);
  if (!FILE_ID_RE.test(String(b.id || ""))) return send(res, 400, { error: "Bad file id." });
  fs.unlink(path.join(filesDir(user.username), b.id + ".bin"), () => send(res, 200, { ok: true }));
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (pathname === "/api/health") return send(res, 200, { ok: true });
  if (pathname === "/api/file" && (req.method === "GET" || req.method === "POST")) {
    const u = userFromReq(req);
    if (!u) return send(res, 401, { error: "Please log in again." });
    return req.method === "GET" ? downloadFile(req, res, u) : uploadFile(req, res, u);
  }
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  if (pathname === "/api/register") return register(req, res);
  if (pathname === "/api/login") return login(req, res);

  const user = userFromReq(req);
  if (!user) return send(res, 401, { error: "Please log in again." });
  if (pathname === "/api/sync") return sync(req, res, user);
  if (pathname === "/api/file-delete") return deleteFile(req, res, user);
  if (pathname === "/api/change-password") return changePassword(req, res, user);
  if (pathname === "/api/logout") { delete sessions[user.tokenHash]; writeJson(sessionsFile, sessions); return send(res, 200, { ok: true }); }
  send(res, 404, { error: "Not found." });
}

/* ---------- static files (the app itself) ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".pdf": "application/pdf", ".zip": "application/zip", ".txt": "text/plain; charset=utf-8"
};
const HIDDEN = ["server", "server-data", "node_modules"];

function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(STATIC_DIR, rel));
  const inside = path.relative(STATIC_DIR, file);
  const first = inside.split(path.sep)[0];
  if (inside.startsWith("..") || path.isAbsolute(inside) || HIDDEN.includes(first) || first.startsWith(".")) { res.writeHead(404); return res.end("Not found"); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const ext = path.extname(file).toLowerCase();
    const noCache = ext === ".html" || path.basename(file) === "sw.js";
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": noCache ? "no-cache" : "public, max-age=3600"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://x").pathname;
  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname).catch((e) => {
      if (e && e.status) return send(res, e.status, { error: e.message });
      console.error(e); send(res, 500, { error: "Server error." });
    });
  } else serveStatic(req, res, pathname);
}).listen(PORT, () => {
  console.log("CA Checklist server running on http://localhost:" + PORT);
  console.log("Data files are saved in: " + DATA_DIR);
});
