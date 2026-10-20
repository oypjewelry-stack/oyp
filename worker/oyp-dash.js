/**
 * Cloudflare Worker in front of the staff Apps Script web app.
 * Free tier only: Workers + workers.dev, one KV namespace, the Cache API. No Durable Objects.
 *
 * Caches two reads: action dashboard, and dashDrill with what jobs or job.
 * Every other action is forwarded and not stored. That includes client pages, shop, and every write.
 *
 * The session is forwarded to Apps Script (action me) until that check is 60 seconds old.
 * A hit inside those 60 seconds does not forward. The saved check is the role only, never the token.
 * The answer is kept for 60 seconds, per role.
 * A write tells Apps Script to POST /purge with header X-Oyp-Purge. That bumps a KV generation, so the next read misses.
 *
 * Deploy (free):
 *   npx wrangler kv namespace create OY_KV
 *   Put that id in wrangler.toml.
 *   npx wrangler secret put OY_PURGE_SECRET
 *   npx wrangler deploy
 * Point the staff app's API at the workers.dev URL after it deploys. Do not point it there before.
 * Set the same secret on the Apps Script project as script property OY_PURGE_SECRET, and OY_PURGE_URL to the worker origin.
 * Scope for the purge call only: https://www.googleapis.com/auth/script.external_request
 */
var ROLES = { admin: 1, production_manager: 1, accounting: 1, staff: 1 };
var EDGE_TTL = 60;
var EDGE_MAX = 400000;

export default {
  fetch(req, env) { return handle(req, env); }
};

export async function handle(req, env) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
  if (url.pathname === '/purge') return cors(await purge(req, env));
  if (req.method !== 'POST') return cors(json({ ok: false, error: 'POST only' }, 405));
  const raw = await req.text();
  let body;
  try { body = JSON.parse(raw || '{}'); } catch (e) { return cors(json({ ok: false, error: 'Bad request' }, 400)); }
  if (!dashRead(body)) return cors(await proxy(env, raw));
  return cors(await serveDash(env, raw, body));
}

function dashRead(body) {
  if (!body) return false;
  if (body.action === 'dashboard') return true;
  if (body.action !== 'dashDrill') return false;
  const what = String(body.what || '');
  if (what === 'jobs') return true;
  if (what !== 'job') return false;
  return /^[A-Za-z0-9-]{1,24}$/.test(String(body.jo || '').replace(/[^A-Za-z0-9-]/g, ''));
}

function dashRes(text, status) {
  return new Response(text, { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

async function serveDash(env, raw, body) {
  const token = String(body.session || '');
  if (!token || !env || !env.OY_KV || !env.APPS_SCRIPT_EXEC) return proxy(env, raw);
  const gen = await generation(env);
  if (gen == null) return proxy(env, raw);
  const hash = await sha(token);
  const role = await cachedRole(hash);
  if (role) {
    const hit = await cachedAnswer(gen, role, body);
    if (hit) return dashRes(hit);
    const up = await proxy(env, raw);
    const text = await up.text();
    if (answerOk(text)) await storeAnswer(gen, role, body, text);
    return dashRes(text, up.status);
  }
  // No saved session check. Ask who this token is, and fetch the answer, at the same time.
  // The wall clock is one Apps Script start, not two. The answer is stored only if `me` names a role.
  const meBody = JSON.stringify({ action: 'me', session: token, device_id: body.device_id || '' });
  const pair = await Promise.all([proxy(env, meBody), proxy(env, raw)]);
  const meText = await pair[0].text();
  const text = await pair[1].text();
  const me = parseJson(meText);
  const got = me && me.ok && me.user && ROLES[me.user.role] ? String(me.user.role) : '';
  if (got) await storeRole(hash, got);
  if (got && answerOk(text)) await storeAnswer(gen, got, body, text);
  return dashRes(text, pair[1].status);
}

function answerOk(text) {
  if (!text || text.length > EDGE_MAX) return false;
  try { const j = JSON.parse(text); return !!(j && j.ok); } catch (e) { return false; }
}

function parseJson(text) { try { return JSON.parse(text); } catch (e) { return null; } }

function specOf(body) {
  if (body.action === 'dashboard') return 'dashboard/-/-';
  const what = String(body.what || '');
  if (what === 'jobs') return 'dashDrill/jobs/-';
  const jo = String(body.jo || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24);
  return 'dashDrill/job/' + jo;
}

function answerReq(gen, role, body) {
  return new Request('https://oyp.internal/dash/' + gen + '/' + role + '/' + specOf(body));
}
function roleReq(hash) { return new Request('https://oyp.internal/sess/' + hash); }

async function cachedRole(hash) {
  const hit = await caches.default.match(roleReq(hash));
  if (!hit) return '';
  const role = await hit.text();
  return ROLES[role] ? role : '';
}
async function storeRole(hash, role) {
  await caches.default.put(roleReq(hash), new Response(role, { headers: { 'cache-control': 'max-age=' + EDGE_TTL } }));
}
async function cachedAnswer(gen, role, body) {
  const hit = await caches.default.match(answerReq(gen, role, body));
  return hit ? hit.text() : '';
}
async function storeAnswer(gen, role, body, text) {
  await caches.default.put(answerReq(gen, role, body), new Response(text, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'max-age=' + EDGE_TTL }
  }));
}

async function generation(env) {
  try {
    const cur = await env.OY_KV.get('gen');
    return cur == null || cur === '' ? '0' : String(cur);
  } catch (e) { return null; }
}

async function purge(req, env) {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  const got = req.headers.get('X-Oyp-Purge') || '';
  const secret = env && env.OY_PURGE_SECRET || '';
  if (!secret || !same(got, secret)) return json({ ok: false, error: 'Forbidden' }, 403);
  if (!env.OY_KV) return json({ ok: false, error: 'No KV' }, 500);
  const cur = Number(await env.OY_KV.get('gen')) || 0;
  const next = String(cur + 1);
  await env.OY_KV.put('gen', next);
  return json({ ok: true });
}

function same(a, b) {
  const aa = String(a), bb = String(b);
  let diff = aa.length ^ bb.length, n = Math.max(aa.length, bb.length), i;
  for (i = 0; i < n; i++) diff |= (aa.charCodeAt(i) || 0) ^ (bb.charCodeAt(i) || 0);
  return diff === 0;
}

async function sha(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function proxy(env, raw) {
  if (!env || !env.APPS_SCRIPT_EXEC) return json({ ok: false, error: 'No upstream' }, 500);
  let url = env.APPS_SCRIPT_EXEC, res, i, loc;
  for (i = 0; i < 5; i++) {
    res = await fetch(url, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: raw });
    if (res.status !== 301 && res.status !== 302 && res.status !== 303 && res.status !== 307 && res.status !== 308) return res;
    loc = res.headers.get('location');
    if (!loc) return res;
    url = new URL(loc, url).toString();
  }
  return res;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
function cors(res) {
  const h = new Headers(res.headers);
  h.set('access-control-allow-origin', '*');
  h.set('access-control-allow-headers', 'content-type, x-oyp-purge');
  h.set('access-control-allow-methods', 'POST, OPTIONS');
  return new Response(res.body, { status: res.status, headers: h });
}
