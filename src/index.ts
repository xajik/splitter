import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, Party, Receipt, Snapshot } from './types';
import { calculateSettlements } from './settle';
import { getAppHTML } from './html';

const app = new Hono<{ Bindings: Env }>();

// ── Frontend ──────────────────────────────────────────────────────────────────

app.get('/', c => c.html(getAppHTML()));

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
  party.expenses.push({
    id: nanoid(8),
    description: description.trim().slice(0, 100),
    amount: Math.round(amount * 100) / 100,
    paidBy, splitBetween: splitBetween ?? [], date: Date.now(),
  });
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
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

app.post('/api/parties/:id/receipts/:rid/extract', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'Party is sealed' }, 403);

  const rid = c.req.param('rid');
  const receipt = party.receipts.find(r => r.id === rid);
  if (!receipt) return c.json({ error: 'Receipt not found' }, 404);

  // Quota guard — 500 AI calls per month (free tier safety)
  const monthKey = `ai:count:${new Date().toISOString().slice(0, 7)}`;
  const used = parseInt((await c.env.PARTIES.get(monthKey)) ?? '0');
  if (used >= 500) {
    return c.json({ error: 'Monthly AI extraction limit reached (500). Resets next month.' }, 429);
  }

  // Get image from R2
  const obj = await c.env.RECEIPTS.get(`${party.id}/${rid}`);
  if (!obj) return c.json({ error: 'Receipt image not found in storage' }, 404);

  // Mark as processing immediately
  receipt.status = 'processing';
  await saveParty(c.env, party);

  try {
    const buffer = await obj.arrayBuffer();

    const result = await (c.env.AI as any).run('@cf/llava-1.5-7b-hf', {
      image: [...new Uint8Array(buffer)],
      prompt: 'This is a receipt or bill. Find the TOTAL amount charged. Reply with ONLY the number, e.g.: 47.50',
      max_tokens: 64,
    });

    const rawText: string = result?.description ?? result?.response ?? '';
    const amount = parseReceiptAmount(rawText);

    receipt.status = 'done';
    receipt.extractedAmount = amount ?? undefined;
    receipt.extractedText = rawText.slice(0, 300);

    // Increment monthly counter (TTL = 37 days)
    await c.env.PARTIES.put(monthKey, String(used + 1), { expirationTtl: 86400 * 37 });
  } catch {
    receipt.status = 'error';
  }

  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  return c.json(party);
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
