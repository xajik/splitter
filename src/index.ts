import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, Party, Receipt, Snapshot } from './types';
import { calculateSettlements } from './settle';
import { getAppHTML } from './html';
import { OG_PNG_B64 } from './og';

const app = new Hono<{ Bindings: Env }>();

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
}

// ── Security headers (all responses) ──────────────────────────────────────────
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
});

// ── API gate (static key) ──────────────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  // Static-key gate: enforced only when APP_KEY is configured (so local dev works).
  // The key is injected into the served page at runtime — a deterrent against
  // direct/scripted API abuse, paired with the per-IP caps below on costly actions.
  if (c.env.APP_KEY && c.req.header('X-App-Key') !== c.env.APP_KEY) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return next();
});

// Per-IP daily cap for an action (KV). Writes are bounded by `limit` (rejections
// don't write), so this stays within the KV free-tier write quota. Approximate
// (KV is eventually consistent) — fine as an abuse/cost backstop. Returns true if allowed.
async function allowDaily(env: Env, ip: string, action: string, limit: number): Promise<boolean> {
  const key = `rl:${action}:${new Date().toISOString().slice(0, 10)}:${ip}`;
  const used = parseInt((await env.PARTIES.get(key)) ?? '0');
  if (used >= limit) return false;
  await env.PARTIES.put(key, String(used + 1), { expirationTtl: 86400 * 2 });
  return true;
}

// ── Frontend ──────────────────────────────────────────────────────────────────

app.get('/', c => {
  c.header('Cache-Control', 'public, max-age=300');
  return c.html(getAppHTML(c.env.APP_KEY ?? ''));
});

// ── SEO / discoverability ─────────────────────────────────────────────────────

const SITE_URL = 'https://splitter.xajik0.workers.dev';

app.get('/robots.txt', c =>
  c.text(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /receipt/',
      '',
      'Sitemap: ' + SITE_URL + '/sitemap.xml',
      '',
    ].join('\n'),
    200,
    { 'Cache-Control': 'public, max-age=86400' }
  )
);

app.get('/sitemap.xml', c => {
  const today = new Date().toISOString().slice(0, 10);
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <url>\n' +
    '    <loc>' + SITE_URL + '/</loc>\n' +
    '    <lastmod>' + today + '</lastmod>\n' +
    '    <changefreq>weekly</changefreq>\n' +
    '    <priority>1.0</priority>\n' +
    '  </url>\n' +
    '</urlset>\n';
  return c.body(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
});

app.get('/manifest.webmanifest', c => {
  const manifest = {
    name: 'Splitter — Bill & Expense Splitter',
    short_name: 'Splitter',
    description: 'Split bills and shared expenses with friends. See who owes whom instantly. Free, no sign-up.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f4f5',
    theme_color: '#1c1c1e',
    icons: [{ src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any maskable' }],
  };
  return c.body(JSON.stringify(manifest), 200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
});

app.get('/favicon.svg', c => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="8" fill="#1c1c1e"/>' +
    '<g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round">' +
    '<path d="M9 11h14"/><path d="M9 16h8"/><path d="M9 21h14"/></g></svg>';
  return c.body(svg, 200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=604800' });
});

app.get('/og.svg', c => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">' +
    '<rect width="1200" height="630" fill="#f4f4f5"/>' +
    '<rect x="90" y="90" width="96" height="96" rx="24" fill="#1c1c1e"/>' +
    '<g fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round">' +
    '<path d="M114 124h48"/><path d="M114 138h28"/><path d="M114 152h48"/></g>' +
    '<text x="210" y="162" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="64" font-weight="700" fill="#18181b">Splitter</text>' +
    '<text x="92" y="300" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="72" font-weight="800" fill="#18181b">Split bills with friends.</text>' +
    '<text x="92" y="392" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="72" font-weight="800" fill="#18181b">See who owes whom — instantly.</text>' +
    '<text x="92" y="478" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="40" font-weight="500" fill="#71717a">Free online group expense calculator · no sign-up</text>' +
    '<g transform="translate(92,520)">' +
    '<rect width="150" height="56" rx="28" fill="#e0f2fe"/><text x="34" y="37" font-family="-apple-system,Segoe UI,Arial" font-size="30" font-weight="600" fill="#0369a1">Alice</text>' +
    '<rect x="170" width="140" height="56" rx="28" fill="#f3e8ff"/><text x="204" y="37" font-family="-apple-system,Segoe UI,Arial" font-size="30" font-weight="600" fill="#7e22ce">Ben</text>' +
    '<rect x="330" width="160" height="56" rx="28" fill="#fff7ed"/><text x="364" y="37" font-family="-apple-system,Segoe UI,Arial" font-size="30" font-weight="600" fill="#c2410c">Cleo</text>' +
    '</g></svg>';
  return c.body(svg, 200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=604800' });
});

app.get('/og.png', c => {
  const bin = atob(OG_PNG_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return c.body(bytes.buffer, 200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800, immutable' });
});

// ── Receipt image serving ─────────────────────────────────────────────────────

app.get('/receipt/:partyId/:rid', async c => {
  const { partyId, rid } = c.req.param();
  const obj = await c.env.RECEIPTS.get(`${partyId}/${rid}`);
  if (!obj) return c.json({ error: 'Not found' }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

// ── Party API ─────────────────────────────────────────────────────────────────

app.post('/api/parties', async c => {
  if (!await allowDaily(c.env, clientIp(c), 'create', 60)) {
    return c.json({ error: 'Daily limit reached for creating parties. Try again tomorrow.' }, 429);
  }
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Name is required' }, 400);

  const party: Party = {
    id: nanoid(10),
    name: name.trim().slice(0, 80),
    people: [],
    expenses: [],
    receipts: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sealed: false,
  };

  await c.env.PARTIES.put(`party:${party.id}`, JSON.stringify(party));
  return c.json(party);
});

app.get('/api/parties/:id', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  return c.json(party);
});

app.post('/api/parties/:id/seal', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'Already sealed' }, 400);
  party.sealed = true;
  party.sealedAt = Date.now();
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  return c.json(party);
});

// People
app.post('/api/parties/:id/people', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'Party is sealed' }, 403);
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Name is required' }, 400);
  party.people.push({ id: nanoid(8), name: name.trim().slice(0, 50) });
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  return c.json(party);
});

app.delete('/api/parties/:id/people/:personId', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'Party is sealed' }, 403);
  const pid = c.req.param('personId');
  party.people = party.people.filter(p => p.id !== pid);
  party.expenses = party.expenses.filter(e => e.paidBy !== pid).map(e => ({
    ...e, splitBetween: e.splitBetween.filter(id => id !== pid),
  }));
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  return c.json(party);
});

// Expenses
app.post('/api/parties/:id/expenses', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'Party is sealed' }, 403);
  const { description, amount, paidBy, splitBetween } = await c.req.json<{
    description: string; amount: number; paidBy: string; splitBetween: string[];
  }>();
  if (!description?.trim()) return c.json({ error: 'Description required' }, 400);
  if (!amount || amount <= 0) return c.json({ error: 'Amount must be positive' }, 400);
  if (!party.people.find(p => p.id === paidBy)) return c.json({ error: 'Payer not found' }, 400);
  const cleanAmount = Math.round(amount * 100) / 100;
  party.expenses.push({
    id: nanoid(8),
    description: description.trim().slice(0, 100),
    amount: cleanAmount,
    paidBy, splitBetween: splitBetween ?? [], date: Date.now(),
  });
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  await bumpGlobalStats(c.env, cleanAmount);
  return c.json(party);
});

app.delete('/api/parties/:id/expenses/:eid', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'Party is sealed' }, 403);
  party.expenses = party.expenses.filter(e => e.id !== c.req.param('eid'));
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  return c.json(party);
});

app.get('/api/parties/:id/settlements', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  return c.json({ settlements: calculateSettlements(party) });
});

// ── Receipts ──────────────────────────────────────────────────────────────────

app.post('/api/parties/:id/receipts', async c => {
  if (!await allowDaily(c.env, clientIp(c), 'upload', 100)) {
    return c.json({ error: 'Daily upload limit reached. Try again tomorrow.' }, 429);
  }
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'Party is sealed' }, 403);
  if (party.receipts.length >= 100) return c.json({ error: 'Maximum 100 receipts per party' }, 400);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file || typeof file === 'string') return c.json({ error: 'No file provided' }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: 'File too large (max 10 MB)' }, 400);

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  if (!allowed.includes(file.type) && !file.name.match(/\.(jpe?g|png|webp|heic)$/i)) {
    return c.json({ error: 'Supported formats: JPEG, PNG, WebP, HEIC' }, 400);
  }

  const id = nanoid(10);
  const buffer = await file.arrayBuffer();

  await c.env.RECEIPTS.put(`${party.id}/${id}`, buffer, {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  });

  const receipt: Receipt = {
    id,
    filename: file.name.slice(0, 120),
    mimeType: file.type || 'image/jpeg',
    size: file.size,
    uploadedAt: Date.now(),
    status: 'pending',
  };

  party.receipts.push(receipt);
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  return c.json(party);
});

app.delete('/api/parties/:id/receipts/:rid', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'Party is sealed' }, 403);
  const rid = c.req.param('rid');
  party.receipts = party.receipts.filter(r => r.id !== rid);
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  // Fire and forget — don't await so response is fast
  c.env.RECEIPTS.delete(`${party.id}/${rid}`);
  return c.json(party);
});

// Neuron budget: 10,000/day free tier. We use ~2000 per vision call (safe estimate).
// Actual neurons = total_tokens × ~3 for an 11B model; image adds ~512 tokens.
const DAILY_NEURON_LIMIT = 10_000;
const NEURON_COST_PER_TOKEN = 3;       // conservative rate for 11B vision model
const NEURON_COST_ESTIMATE = 2_000;    // fallback if usage not returned
const NEURON_BUFFER = 500;             // don't go below this before blocking
const PER_IP_DAILY_NEURONS = 6_000;    // one IP can't hog the shared daily budget (~3 scans)

function todayKey() {
  return `ai:neurons:${new Date().toISOString().slice(0, 10)}`; // YYYY-MM-DD UTC
}
function todayIpKey(ip: string) {
  return `ai:neurons:${new Date().toISOString().slice(0, 10)}:ip:${ip}`;
}

app.get('/api/ai/quota', async c => {
  const used = parseInt((await c.env.PARTIES.get(todayKey())) ?? '0');
  return c.json({
    used,
    limit: DAILY_NEURON_LIMIT,
    remaining: Math.max(0, DAILY_NEURON_LIMIT - used),
    canExtract: used + NEURON_COST_ESTIMATE <= DAILY_NEURON_LIMIT - NEURON_BUFFER,
  });
});

app.post('/api/parties/:id/receipts/:rid/extract', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'Party is sealed' }, 403);

  const rid = c.req.param('rid');
  const receipt = party.receipts.find(r => r.id === rid);
  if (!receipt) return c.json({ error: 'Receipt not found' }, 404);

  // Daily neuron quota check (2,000 neurons per vision call, conservative)
  const dayKey = todayKey();
  const neuronsUsed = parseInt((await c.env.PARTIES.get(dayKey)) ?? '0');
  if (neuronsUsed + NEURON_COST_ESTIMATE > DAILY_NEURON_LIMIT - NEURON_BUFFER) {
    return c.json({
      error: `Daily AI quota reached (${neuronsUsed.toLocaleString()} / ${DAILY_NEURON_LIMIT.toLocaleString()} neurons). Resets at midnight UTC.`,
    }, 429);
  }

  // Per-IP daily cap so one client can't drain the shared budget
  const ip = clientIp(c);
  const ipKey = todayIpKey(ip);
  const ipUsed = parseInt((await c.env.PARTIES.get(ipKey)) ?? '0');
  if (ipUsed + NEURON_COST_ESTIMATE > PER_IP_DAILY_NEURONS) {
    return c.json({ error: "You've reached your daily receipt-scan limit. Try again tomorrow." }, 429);
  }

  // Commit budget BEFORE calling AI — ensures we never go over even on failure
  const neuronsAfter = neuronsUsed + NEURON_COST_ESTIMATE;
  await c.env.PARTIES.put(dayKey, String(neuronsAfter), { expirationTtl: 86400 * 2 });
  await c.env.PARTIES.put(ipKey, String(ipUsed + NEURON_COST_ESTIMATE), { expirationTtl: 86400 * 2 });

  // Get image from R2
  const obj = await c.env.RECEIPTS.get(`${party.id}/${rid}`);
  if (!obj) return c.json({ error: 'Receipt image not found in storage' }, 404);

  // Mark as processing
  receipt.status = 'processing';
  await saveParty(c.env, party);

  try {
    const buffer = await obj.arrayBuffer();

    const uint8 = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    const b64 = btoa(binary);

    const result = await (c.env.AI as any).run('@cf/meta/llama-3.2-11b-vision-instruct', {
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${receipt.mimeType};base64,${b64}` } },
          { type: 'text', text: 'This is a receipt or bill. What is the final TOTAL amount to pay? Reply with ONLY the number, e.g.: 47.50. No currency symbol, no text, just the number.' },
        ],
      }],
      max_tokens: 64,
    });

    const rawText: string = result?.response ?? result?.description ?? '';
    const amount = parseReceiptAmount(rawText);

    receipt.status = 'done';
    receipt.extractedAmount = amount ?? undefined;
    receipt.extractedText = rawText.slice(0, 300);
  } catch (err) {
    receipt.status = 'error';
    receipt.extractedText = String(err).slice(0, 300);
  }

  party.updatedAt = Date.now();
  await saveParty(c.env, party);

  // Return party + updated quota so UI can refresh without a second round-trip
  const canExtract = neuronsAfter + NEURON_COST_ESTIMATE <= DAILY_NEURON_LIMIT - NEURON_BUFFER;
  return c.json({
    ...party,
    aiQuota: {
      used: neuronsAfter,
      limit: DAILY_NEURON_LIMIT,
      remaining: Math.max(0, DAILY_NEURON_LIMIT - neuronsAfter),
      canExtract,
    },
  });
});

// ── Share / Snapshot ──────────────────────────────────────────────────────────

app.post('/api/parties/:id/share', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  const snapshot: Snapshot = {
    id: nanoid(12), partyId: party.id, party: structuredClone(party), createdAt: Date.now(),
  };
  await c.env.PARTIES.put(`snapshot:${snapshot.id}`, JSON.stringify(snapshot));
  return c.json({ id: snapshot.id });
});

app.get('/api/share/:id', async c => {
  const raw = await c.env.PARTIES.get(`snapshot:${c.req.param('id')}`);
  if (!raw) return c.json({ error: 'Snapshot not found' }, 404);
  const snapshot: Snapshot = JSON.parse(raw);
  return c.json({ ...snapshot, settlements: calculateSettlements(snapshot.party) });
});

// ── Stats & batch summaries (for home dashboard) ──────────────────────────────

app.get('/api/stats', async c => {
  const [bills, money] = await Promise.all([
    c.env.PARTIES.get('stats:bills'),
    c.env.PARTIES.get('stats:money'),
  ]);
  return c.json({
    billsSettled: parseInt(bills ?? '0'),
    moneySplit: parseFloat(money ?? '0'),
  });
});

// Fetch lightweight summaries for a list of party/snapshot ids (home recent list)
app.post('/api/summaries', async c => {
  const { items } = await c.req.json<{ items: { id: string; type: string }[] }>();
  if (!Array.isArray(items)) return c.json({ summaries: [] });

  const summaries = await Promise.all(items.slice(0, 20).map(async ({ id, type }) => {
    try {
      if (type === 'share') {
        const raw = await c.env.PARTIES.get(`snapshot:${id}`);
        if (!raw) return null;
        const snap: Snapshot = JSON.parse(raw);
        const p = snap.party;
        return {
          id, type, name: p.name,
          people: p.people.length,
          total: p.expenses.reduce((s, e) => s + e.amount, 0),
          sealed: true,
          settled: calculateSettlements(p).length === 0,
          date: snap.createdAt,
        };
      }
      const p = await getParty(c.env, id);
      if (!p) return null;
      return {
        id, type: 'party', name: p.name,
        people: p.people.length,
        total: p.expenses.reduce((s, e) => s + e.amount, 0),
        sealed: p.sealed,
        settled: p.sealed || calculateSettlements(p).length === 0,
        date: p.updatedAt,
      };
    } catch {
      return null;
    }
  }));

  return c.json({ summaries: summaries.filter(Boolean) });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function bumpGlobalStats(env: Env, amount: number): Promise<void> {
  const [bills, money] = await Promise.all([
    env.PARTIES.get('stats:bills'),
    env.PARTIES.get('stats:money'),
  ]);
  await Promise.all([
    env.PARTIES.put('stats:bills', String(parseInt(bills ?? '0') + 1)),
    env.PARTIES.put('stats:money', String(Math.round((parseFloat(money ?? '0') + amount) * 100) / 100)),
  ]);
}

async function getParty(env: Env, id: string): Promise<Party | null> {
  const raw = await env.PARTIES.get(`party:${id}`);
  if (!raw) return null;
  const p = JSON.parse(raw) as Party;
  p.receipts = p.receipts ?? []; // backward compat
  return p;
}

async function saveParty(env: Env, party: Party): Promise<void> {
  await env.PARTIES.put(`party:${party.id}`, JSON.stringify(party));
}

function parseReceiptAmount(text: string): number | null {
  const t = text.trim();
  // Pure number
  if (/^[0-9]+\.?[0-9]*$/.test(t)) return parseFloat(t);
  // Find all dollar amounts; last one is usually the total
  const matches = [...t.matchAll(/\$?\s*([0-9]{1,6}(?:[.,][0-9]{2}))/g)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1][1].replace(',', '.');
    return parseFloat(last);
  }
  // Any number
  const num = t.match(/([0-9]+\.?[0-9]*)/);
  if (num) return parseFloat(num[1]);
  return null;
}

export default app;
