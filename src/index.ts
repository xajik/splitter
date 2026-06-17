import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, Party, Snapshot } from './types';
import { calculateSettlements } from './settle';
import { getAppHTML } from './html';

const app = new Hono<{ Bindings: Env }>();

// ── Serve frontend ────────────────────────────────────────────────────────────

app.get('/', c => c.html(getAppHTML()));

// ── Party API ─────────────────────────────────────────────────────────────────

app.post('/api/parties', async c => {
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Name is required' }, 400);

  const party: Party = {
    id: nanoid(10),
    name: name.trim().slice(0, 80),
    people: [],
    expenses: [],
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

// Seal party
app.post('/api/parties/:id/seal', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'Party is already sealed' }, 400);

  party.sealed = true;
  party.sealedAt = Date.now();
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  return c.json(party);
});

// Add person
app.post('/api/parties/:id/people', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'This party is sealed and cannot be modified.' }, 403);

  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ error: 'Name is required' }, 400);

  party.people.push({ id: nanoid(8), name: name.trim().slice(0, 50) });
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  return c.json(party);
});

// Remove person
app.delete('/api/parties/:id/people/:personId', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'This party is sealed and cannot be modified.' }, 403);

  const personId = c.req.param('personId');
  party.people = party.people.filter(p => p.id !== personId);
  party.expenses = party.expenses.filter(e => e.paidBy !== personId);
  party.expenses = party.expenses.map(e => ({
    ...e,
    splitBetween: e.splitBetween.filter(id => id !== personId),
  }));
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  return c.json(party);
});

// Add expense
app.post('/api/parties/:id/expenses', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'This party is sealed and cannot be modified.' }, 403);

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
    paidBy,
    splitBetween: splitBetween ?? [],
    date: Date.now(),
  });
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  return c.json(party);
});

// Remove expense
app.delete('/api/parties/:id/expenses/:expenseId', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  if (party.sealed) return c.json({ error: 'This party is sealed and cannot be modified.' }, 403);

  party.expenses = party.expenses.filter(e => e.id !== c.req.param('expenseId'));
  party.updatedAt = Date.now();
  await saveParty(c.env, party);
  return c.json(party);
});

// Get settlements
app.get('/api/parties/:id/settlements', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);
  return c.json({ settlements: calculateSettlements(party) });
});

// Create snapshot (immutable share)
app.post('/api/parties/:id/share', async c => {
  const party = await getParty(c.env, c.req.param('id'));
  if (!party) return c.json({ error: 'Party not found' }, 404);

  const snapshot: Snapshot = {
    id: nanoid(12),
    partyId: party.id,
    party: structuredClone(party),
    createdAt: Date.now(),
  };

  await c.env.PARTIES.put(`snapshot:${snapshot.id}`, JSON.stringify(snapshot));
  return c.json({ id: snapshot.id });
});

// Get snapshot
app.get('/api/share/:id', async c => {
  const raw = await c.env.PARTIES.get(`snapshot:${c.req.param('id')}`);
  if (!raw) return c.json({ error: 'Snapshot not found' }, 404);
  const snapshot: Snapshot = JSON.parse(raw);
  const settlements = calculateSettlements(snapshot.party);
  return c.json({ ...snapshot, settlements });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getParty(env: Env, id: string): Promise<Party | null> {
  const raw = await env.PARTIES.get(`party:${id}`);
  return raw ? JSON.parse(raw) : null;
}

async function saveParty(env: Env, party: Party): Promise<void> {
  await env.PARTIES.put(`party:${party.id}`, JSON.stringify(party));
}

export default app;
