export function getAppHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Splitter — Split bills with friends</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: { extend: { colors: { brand: { 50:'#f0fdf4',100:'#dcfce7',500:'#22c55e',600:'#16a34a',700:'#15803d' } } } }
}
</script>
<style>
.fade-in { animation: fadeIn .18s ease; }
@keyframes fadeIn { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
</style>
</head>
<body class="bg-gray-50 min-h-screen font-sans">

<nav class="bg-white border-b border-gray-200 sticky top-0 z-50">
  <div class="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
    <button onclick="goHome()" class="flex items-center gap-2 text-brand-600 font-bold text-lg hover:text-brand-700">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
      Splitter
    </button>
    <button onclick="showHistory()" id="historyBtn" class="hidden text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      History
    </button>
  </div>
</nav>

<main class="max-w-2xl mx-auto px-4 py-6 pb-20" id="app"></main>

<footer class="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 z-40">
  <div class="max-w-2xl mx-auto px-4 h-12 flex items-center justify-center gap-10">
    <div class="text-center">
      <div class="text-[10px] uppercase tracking-wide text-gray-400 leading-none mb-0.5">Bills</div>
      <div class="text-sm font-bold text-gray-800 tabular-nums" id="statBills">0</div>
    </div>
    <div class="w-px h-6 bg-gray-200"></div>
    <div class="text-center">
      <div class="text-[10px] uppercase tracking-wide text-gray-400 leading-none mb-0.5">Money managed</div>
      <div class="text-sm font-bold text-gray-800 tabular-nums" id="statTotal">$0.00</div>
    </div>
  </div>
</footer>

<script>
const API = '';
let currentPartyId = null;
let currentParty   = null;
let formPayer      = null;   // person id | null → default to first
let formSplitSet   = null;   // Set of ids | null → all
let settlementOpen = false;
let _confirmCb     = null;

// Full Tailwind class strings so CDN picks them up
const COLORS = [
  { base: 'bg-emerald-100 text-emerald-700', active: 'bg-emerald-500 text-white' },
  { base: 'bg-sky-100 text-sky-700',         active: 'bg-sky-500 text-white'     },
  { base: 'bg-violet-100 text-violet-700',   active: 'bg-violet-500 text-white'  },
  { base: 'bg-amber-100 text-amber-700',     active: 'bg-amber-600 text-white'   },
  { base: 'bg-rose-100 text-rose-700',       active: 'bg-rose-500 text-white'    },
  { base: 'bg-cyan-100 text-cyan-700',       active: 'bg-cyan-500 text-white'    },
  { base: 'bg-orange-100 text-orange-700',   active: 'bg-orange-500 text-white'  },
  { base: 'bg-pink-100 text-pink-700',       active: 'bg-pink-500 text-white'    },
];

function clr(people, pid) {
  const i = people.findIndex(p => p.id === pid);
  return i >= 0 ? COLORS[i % COLORS.length] : { base: 'bg-gray-100 text-gray-500', active: 'bg-gray-500 text-white' };
}

function effectivePayer() {
  if (!currentParty?.people.length) return null;
  if (formPayer && currentParty.people.find(p => p.id === formPayer)) return formPayer;
  return currentParty.people[0].id;
}

function effectiveSplit() {
  if (!currentParty) return [];
  const all = currentParty.people.map(p => p.id);
  if (!formSplitSet) return all;
  return all.filter(id => formSplitSet.has(id));
}

function buildPayerChips() {
  const payer = effectivePayer();
  return currentParty.people.map((pr, i) => {
    const isActive = pr.id === payer;
    const c = COLORS[i % COLORS.length];
    return \`<button onclick="selectPayer('\${pr.id}')" class="text-sm font-medium px-3 py-1 rounded-full transition-all \${isActive ? c.active + ' ring-2 ring-offset-1 ring-current' : c.base} cursor-pointer">\${escHtml(pr.name)}</button>\`;
  }).join('');
}

function buildSplitChips() {
  const split = effectiveSplit();
  return currentParty.people.map((pr, i) => {
    const on = split.includes(pr.id);
    const c = COLORS[i % COLORS.length];
    return \`<button onclick="toggleSplitChip('\${pr.id}')" class="text-sm px-3 py-1 rounded-full transition-all cursor-pointer \${on ? c.base : 'bg-gray-100 text-gray-300 line-through'}">\${escHtml(pr.name)}</button>\`;
  }).join('');
}

function updateStats(party) {
  const bills = party ? party.expenses.length : 0;
  const total = party ? party.expenses.reduce((s, e) => s + e.amount, 0) : 0;
  const b = document.getElementById('statBills');
  const t = document.getElementById('statTotal');
  if (b) b.textContent = bills;
  if (t) t.textContent = '$' + total.toFixed(2);
}

// ── Routing ────────────────────────────────────────────────────────────────

function route() {
  const hash = location.hash.slice(1);
  if (!hash || hash === '/') return renderHome();
  if (hash.startsWith('/party/')) return loadParty(hash.slice(7));
  if (hash.startsWith('/share/')) return loadSnapshot(hash.slice(7));
  renderHome();
}
window.addEventListener('hashchange', route);
window.addEventListener('load', () => { loadHistoryBtn(); route(); });
function goHome() { location.hash = '/'; }

// ── History ────────────────────────────────────────────────────────────────

function getHistory() {
  const c = document.cookie.split(';').find(x => x.trim().startsWith('splitter_history='));
  if (!c) return [];
  try { return JSON.parse(decodeURIComponent(c.split('=')[1])); } catch { return []; }
}
function addToHistory(entry) {
  const h = getHistory().filter(e => e.id !== entry.id);
  h.unshift(entry);
  document.cookie = 'splitter_history=' + encodeURIComponent(JSON.stringify(h.slice(0,10))) + '; max-age=31536000; path=/; SameSite=Lax';
}
function loadHistoryBtn() {
  if (getHistory().length) document.getElementById('historyBtn').classList.remove('hidden');
}
function showHistory() {
  const hist = getHistory();
  updateStats(null);
  document.getElementById('app').innerHTML = \`
    <div class="fade-in">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">Recent parties</h2>
      <div class="space-y-3">
        \${hist.map(e => \`
          <div class="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-brand-300 cursor-pointer transition-colors" onclick="location.hash='/\${e.type==='share'?'share':'party'}/\${e.id}'">
            <div>
              <div class="font-medium text-gray-900">\${escHtml(e.name)}</div>
              <div class="text-sm text-gray-400">\${e.type==='share'?'Snapshot':'Party'} · \${new Date(e.date).toLocaleDateString()}</div>
            </div>
            <svg class="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div>
        \`).join('')}
      </div>
      <button onclick="goHome()" class="mt-6 text-sm text-brand-600 hover:text-brand-700">← Back</button>
    </div>
  \`;
}

// ── Home ────────────────────────────────────────────────────────────────────

function renderHome() {
  currentPartyId = null; currentParty = null;
  updateStats(null);
  document.getElementById('app').innerHTML = \`
    <div class="fade-in text-center py-12">
      <div class="w-16 h-16 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <svg class="w-8 h-8 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
      </div>
      <h1 class="text-3xl font-bold text-gray-900 mb-2">Split bills, not friendships</h1>
      <p class="text-gray-500 mb-10">Create a party, add expenses, and settle up instantly.</p>
      <div class="bg-white rounded-2xl border border-gray-200 p-6 text-left max-w-sm mx-auto">
        <label class="block text-sm font-medium text-gray-700 mb-1">Party name</label>
        <input id="partyNameInput" type="text" placeholder="Weekend trip, Dinner, etc." maxlength="80"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 mb-4"
          onkeydown="if(event.key==='Enter') createParty()">
        <button onclick="createParty()" id="createBtn" class="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition-colors">
          Create party
        </button>
      </div>
    </div>
  \`;
  document.getElementById('partyNameInput').focus();
}

async function createParty() {
  const name = document.getElementById('partyNameInput').value.trim();
  if (!name) return shake('partyNameInput');
  const btn = document.getElementById('createBtn');
  btn.disabled = true; btn.textContent = 'Creating…';
  const res = await api('POST', '/api/parties', { name });
  if (res.error) { btn.disabled = false; btn.textContent = 'Create party'; return alert(res.error); }
  addToHistory({ id: res.id, name: res.name, date: Date.now(), type: 'party' });
  loadHistoryBtn();
  location.hash = '/party/' + res.id;
}

// ── Party ────────────────────────────────────────────────────────────────────

async function loadParty(id) {
  currentPartyId = id;
  showLoading();
  const res = await api('GET', '/api/parties/' + id);
  if (res.error) return showError(res.error);
  currentParty = res;
  formPayer = null; formSplitSet = null;
  addToHistory({ id: res.id, name: res.name, date: Date.now(), type: 'party' });
  renderParty();
}

function renderParty() {
  const p = currentParty;
  updateStats(p);
  if (p.sealed) { renderSealedParty(p); return; }

  const hasPeople = p.people.length >= 2;

  document.getElementById('app').innerHTML = \`
    <div class="fade-in space-y-3">

      <!-- Header -->
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-gray-900 leading-tight">\${escHtml(p.name)}</h2>
          <p class="text-xs text-gray-400">\${p.people.length} people · \${p.expenses.length} expenses</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="showInviteModal()" title="Invite friends" class="border border-gray-200 text-gray-600 hover:border-brand-400 hover:text-brand-600 p-2 rounded-lg transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
          </button>
          <button onclick="confirmSeal()" title="Seal party" class="border border-amber-300 text-amber-600 hover:bg-amber-50 p-2 rounded-lg transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          </button>
        </div>
      </div>

      <!-- People row -->
      <div class="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-2 flex-wrap">
        \${p.people.map((pr, i) => \`
          <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full \${COLORS[i % COLORS.length].base}">
            \${escHtml(pr.name)}
            <button onclick="removePerson('\${pr.id}')" class="opacity-40 hover:opacity-100 transition-opacity leading-none ml-0.5">✕</button>
          </span>
        \`).join('')}
        <div class="flex items-center gap-1 ml-auto">
          <input id="personInput" type="text" placeholder="Add person…" maxlength="50"
            class="border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-900 w-24 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:w-32 transition-all"
            onkeydown="if(event.key==='Enter') addPerson()">
          <button onclick="addPerson()" class="bg-brand-600 hover:bg-brand-700 text-white text-xs px-2.5 py-1 rounded-lg transition-colors">Add</button>
        </div>
      </div>

      <!-- Expense cards -->
      \${p.expenses.length > 0 ? \`<div class="space-y-2">\${[...p.expenses].reverse().map(e => {
        const payerName = p.people.find(pr => pr.id === e.paidBy)?.name || '?';
        const payerClr = clr(p.people, e.paidBy);
        const splitIds = e.splitBetween.length > 0 ? e.splitBetween : p.people.map(pr => pr.id);
        return \`
          <div class="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
            <div class="flex items-center gap-2 min-w-0">
              <span class="flex-1 font-medium text-gray-900 text-sm truncate">\${escHtml(e.description)}</span>
              <span class="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 \${payerClr.base}">\${escHtml(payerName)}</span>
              <span class="text-sm font-semibold text-gray-900 w-16 text-right shrink-0">$\${e.amount.toFixed(2)}</span>
              <button onclick="removeExpense('\${e.id}')" class="text-gray-300 hover:text-red-400 transition-colors shrink-0">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span class="text-[10px] text-gray-400 uppercase tracking-wide">split</span>
              \${p.people.map((pr, i) => {
                const on = splitIds.includes(pr.id);
                return \`<span class="text-[11px] px-2 py-0.5 rounded-full \${on ? COLORS[i%COLORS.length].base : 'bg-gray-100 text-gray-300 line-through'}">\${escHtml(pr.name)}</span>\`;
              }).join('')}
            </div>
          </div>
        \`;
      }).join('')}</div>\` : ''}

      <!-- Add expense form (always shown when ≥2 people) -->
      \${hasPeople ? \`
        <div class="bg-white rounded-xl border-2 border-dashed border-gray-200 p-4 space-y-3">
          <div class="flex gap-2">
            <input id="expDesc" type="text" placeholder="What for?" maxlength="100"
              class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-300"
              onkeydown="if(event.key==='Enter') document.getElementById('expAmount').focus()">
            <div class="relative w-28">
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 text-sm pointer-events-none">$</span>
              <input id="expAmount" type="number" placeholder="0.00" min="0.01" step="0.01"
                class="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                onkeydown="if(event.key==='Enter') addExpense()">
            </div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">Paid by</div>
            <div id="payerChips" class="flex flex-wrap gap-1.5">\${buildPayerChips()}</div>
          </div>
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-[10px] uppercase tracking-wide text-gray-400">Split between</span>
              <button onclick="toggleAllSplit()" class="text-xs text-brand-600 hover:text-brand-700">Toggle all</button>
            </div>
            <div id="splitChips" class="flex flex-wrap gap-1.5">\${buildSplitChips()}</div>
          </div>
          <button onclick="addExpense()" class="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 rounded-lg text-sm transition-colors">
            Add expense
          </button>
        </div>
      \` : \`
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-600">
          Add at least 2 people to start recording expenses.
        </div>
      \`}

      <!-- Settlement accordion -->
      \${hasPeople && p.expenses.length > 0 ? \`
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button onclick="toggleSettlement()" class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
            <span class="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <span id="settlementArrow" class="text-gray-400 text-xs">\${settlementOpen ? '▼' : '▶'}</span>
              Settlement
            </span>
            <span id="settlementSummary" class="text-xs text-gray-400 italic">calculating…</span>
          </button>
          <div id="settlementDetails" class="\${settlementOpen ? '' : 'hidden'} border-t border-gray-100 px-4 py-3">
            <div id="settlementBody" class="text-sm text-gray-500">calculating…</div>
          </div>
        </div>
      \` : ''}

    </div>
  \`;

  if (hasPeople && p.expenses.length > 0) loadSettlements();
}

function renderSealedParty(p) {
  const peopleMap = Object.fromEntries(p.people.map(pr => [pr.id, pr.name]));
  document.getElementById('app').innerHTML = \`
    <div class="fade-in space-y-3">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-xl font-bold text-gray-900">\${escHtml(p.name)}</h2>
          <p class="text-xs text-gray-400">\${p.people.length} people · \${p.expenses.length} expenses</p>
        </div>
      </div>
      <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-700">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        Sealed\${p.sealedAt ? ' · ' + new Date(p.sealedAt).toLocaleString() : ''} — locked, no further changes.
      </div>
      <div class="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex flex-wrap gap-2">
        \${p.people.map((pr, i) => \`<span class="text-xs font-medium px-2.5 py-1 rounded-full \${COLORS[i%COLORS.length].base}">\${escHtml(pr.name)}</span>\`).join('')}
      </div>
      \${p.expenses.length > 0 ? \`
        <div class="space-y-2">
          \${[...p.expenses].reverse().map(e => {
            const splitIds = e.splitBetween.length > 0 ? e.splitBetween : p.people.map(pr => pr.id);
            return \`
              <div class="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="flex-1 font-medium text-gray-900 text-sm truncate">\${escHtml(e.description)}</span>
                  <span class="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 \${clr(p.people, e.paidBy).base}">\${escHtml(peopleMap[e.paidBy] || '?')}</span>
                  <span class="text-sm font-semibold text-gray-900 w-16 text-right">$\${e.amount.toFixed(2)}</span>
                </div>
                <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span class="text-[10px] text-gray-400 uppercase tracking-wide">split</span>
                  \${p.people.map((pr, i) => {
                    const on = splitIds.includes(pr.id);
                    return \`<span class="text-[11px] px-2 py-0.5 rounded-full \${on ? COLORS[i%COLORS.length].base : 'bg-gray-100 text-gray-300 line-through'}">\${escHtml(pr.name)}</span>\`;
                  }).join('')}
                </div>
              </div>
            \`;
          }).join('')}
        </div>
      \` : ''}
      <div id="settlementCard" class="bg-white rounded-xl border border-gray-200 px-4 py-3">
        <div class="text-sm font-semibold text-gray-900 mb-2">Settlement</div>
        <div id="settlementBody" class="text-sm text-gray-500">Calculating…</div>
      </div>
    </div>
  \`;
  loadSettlements();
}

// ── People actions ────────────────────────────────────────────────────────────

async function addPerson() {
  const input = document.getElementById('personInput');
  const name = input.value.trim();
  if (!name) return shake('personInput');
  input.value = '';
  const res = await api('POST', '/api/parties/' + currentPartyId + '/people', { name });
  if (res.error) return alert(res.error);
  currentParty = res;
  formSplitSet = null; // include everyone by default
  renderParty();
  document.getElementById('personInput')?.focus();
}

async function removePerson(personId) {
  const person = currentParty.people.find(p => p.id === personId);
  const name = person ? escHtml(person.name) : 'this person';
  showConfirm(
    \`Remove \${name}?\`,
    'Their expenses will also be removed from the party.',
    'Remove',
    async () => {
      const res = await api('DELETE', '/api/parties/' + currentPartyId + '/people/' + personId);
      if (res.error) return alert(res.error);
      if (formPayer === personId) formPayer = null;
      if (formSplitSet) formSplitSet.delete(personId);
      currentParty = res;
      renderParty();
    }
  );
}

// ── Expense actions ───────────────────────────────────────────────────────────

async function addExpense() {
  const desc   = document.getElementById('expDesc').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const paidBy = effectivePayer();
  const splitArr = effectiveSplit();

  if (!desc) return shake('expDesc');
  if (!amount || amount <= 0) return shake('expAmount');
  if (splitArr.length === 0) return alert('Select at least one person to split with.');

  const allIds = currentParty.people.map(p => p.id);
  const isSplitAll = splitArr.length === allIds.length && allIds.every(id => splitArr.includes(id));

  const res = await api('POST', '/api/parties/' + currentPartyId + '/expenses', {
    description: desc, amount, paidBy, splitBetween: isSplitAll ? [] : splitArr
  });
  if (res.error) return alert(res.error);
  currentParty = res;
  formSplitSet = null; // reset to all for next expense
  renderParty();
}

async function removeExpense(expenseId) {
  const res = await api('DELETE', '/api/parties/' + currentPartyId + '/expenses/' + expenseId);
  if (res.error) return alert(res.error);
  currentParty = res;
  renderParty();
}

function selectPayer(pid) {
  formPayer = pid;
  const c = document.getElementById('payerChips');
  if (c) c.innerHTML = buildPayerChips();
}

function toggleSplitChip(pid) {
  if (!formSplitSet) {
    formSplitSet = new Set(currentParty.people.map(p => p.id));
    formSplitSet.delete(pid);
  } else {
    if (formSplitSet.has(pid)) formSplitSet.delete(pid);
    else formSplitSet.add(pid);
    if (formSplitSet.size === currentParty.people.length) formSplitSet = null;
  }
  const c = document.getElementById('splitChips');
  if (c) c.innerHTML = buildSplitChips();
}

function toggleAllSplit() {
  const all = currentParty.people.map(p => p.id);
  const curr = effectiveSplit();
  if (curr.length === all.length) {
    formSplitSet = new Set([all[0]]); // keep just first
  } else {
    formSplitSet = null; // all
  }
  const c = document.getElementById('splitChips');
  if (c) c.innerHTML = buildSplitChips();
}

// ── Settlement ────────────────────────────────────────────────────────────────

function toggleSettlement() {
  settlementOpen = !settlementOpen;
  const arrow   = document.getElementById('settlementArrow');
  const details = document.getElementById('settlementDetails');
  if (arrow)   arrow.textContent = settlementOpen ? '▼' : '▶';
  if (details) details.classList.toggle('hidden', !settlementOpen);
}

async function loadSettlements() {
  if (!currentPartyId) return;
  const res = await api('GET', '/api/parties/' + currentPartyId + '/settlements');
  if (!res || res.error) return;

  const peopleMap = Object.fromEntries(currentParty.people.map(pr => [pr.id, pr.name]));
  const summary = document.getElementById('settlementSummary');
  const body    = document.getElementById('settlementBody');

  if (res.settlements.length === 0) {
    if (summary) summary.textContent = 'All settled up 🎉';
    if (body) body.innerHTML = \`<p class="text-center text-brand-600 font-medium py-1">All settled up! 🎉</p>\`;
    return;
  }

  const lines = res.settlements.map(s =>
    \`\${peopleMap[s.from]||'?'} → \${peopleMap[s.to]||'?'} $\${s.amount.toFixed(2)}\`
  );
  if (summary) {
    summary.textContent = lines.length > 1 ? lines[0] + \` +\${lines.length-1} more\` : lines[0];
  }
  if (body) {
    body.innerHTML = \`<div class="space-y-2">\${res.settlements.map(s => \`
      <div class="flex items-center justify-between">
        <span class="text-gray-700">\${escHtml(peopleMap[s.from]||'?')} owes \${escHtml(peopleMap[s.to]||'?')}</span>
        <span class="font-semibold text-gray-900">$\${s.amount.toFixed(2)}</span>
      </div>
    \`).join('')}</div>\`;
  }
}

// ── Invite / Seal ─────────────────────────────────────────────────────────────

function showInviteModal() {
  const url = location.origin + '/#/party/' + currentPartyId;
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 fade-in';
  overlay.innerHTML = \`
    <div class="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
      <h3 class="text-lg font-bold text-gray-900 mb-1">Invite friends</h3>
      <p class="text-sm text-gray-500 mb-4">Anyone with this link can add themselves and record expenses. Hit <strong>Seal</strong> when done.</p>
      <div class="flex gap-2">
        <input value="\${url}" readonly class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50 focus:outline-none">
        <button onclick="copyUrl('\${url}', this)" class="bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-2 rounded-lg shrink-0">Copy</button>
      </div>
      <button onclick="this.closest('.fixed').remove()" class="mt-4 w-full text-sm text-gray-400 hover:text-gray-600">Close</button>
    </div>
  \`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function confirmSeal() {
  showConfirm(
    'Seal this party?',
    'No one will be able to add or remove people or expenses after this.',
    'Seal',
    async () => {
      const res = await api('POST', '/api/parties/' + currentPartyId + '/seal');
      if (res.error) return alert(res.error);
      currentParty = res;
      renderParty();
    },
    false // not destructive (amber, not red)
  );
}

async function createShare() {
  const res = await api('POST', '/api/parties/' + currentPartyId + '/share');
  if (res.error) return alert(res.error);
  const url = location.origin + '/#/share/' + res.id;
  addToHistory({ id: res.id, name: currentParty.name + ' (snapshot)', date: Date.now(), type: 'share' });
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 fade-in';
  overlay.innerHTML = \`
    <div class="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
      <h3 class="text-lg font-bold text-gray-900 mb-1">Snapshot link</h3>
      <p class="text-sm text-gray-500 mb-4">Immutable snapshot of the current state.</p>
      <div class="flex gap-2">
        <input value="\${url}" readonly class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50 focus:outline-none">
        <button onclick="copyUrl('\${url}', this)" class="bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-2 rounded-lg shrink-0">Copy</button>
      </div>
      <button onclick="this.closest('.fixed').remove()" class="mt-4 w-full text-sm text-gray-400 hover:text-gray-600">Close</button>
    </div>
  \`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function copyUrl(url, btn) {
  await navigator.clipboard.writeText(url);
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = 'Copy', 2000);
}

// ── Snapshot view ─────────────────────────────────────────────────────────────

async function loadSnapshot(id) {
  showLoading();
  const res = await api('GET', '/api/share/' + id);
  if (res.error) return showError(res.error);
  addToHistory({ id, name: res.party.name + ' (snapshot)', date: Date.now(), type: 'share' });
  loadHistoryBtn();
  renderSnapshot(res);
}

function renderSnapshot(snap) {
  const p = snap.party;
  updateStats(p);
  const peopleMap = Object.fromEntries(p.people.map(pr => [pr.id, pr.name]));
  document.getElementById('app').innerHTML = \`
    <div class="fade-in space-y-3">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-xl font-bold text-gray-900">\${escHtml(p.name)}</h2>
          <p class="text-xs text-gray-400">\${p.people.length} people · \${p.expenses.length} expenses</p>
        </div>
      </div>
      <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-700">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        Immutable snapshot · \${new Date(snap.createdAt).toLocaleString()}
      </div>
      <div class="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex flex-wrap gap-2">
        \${p.people.map((pr, i) => \`<span class="text-xs font-medium px-2.5 py-1 rounded-full \${COLORS[i%COLORS.length].base}">\${escHtml(pr.name)}</span>\`).join('')}
      </div>
      \${p.expenses.length > 0 ? \`
        <div class="space-y-2">
          \${[...p.expenses].reverse().map(e => {
            const splitIds = e.splitBetween.length > 0 ? e.splitBetween : p.people.map(pr => pr.id);
            return \`
              <div class="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="flex-1 font-medium text-gray-900 text-sm truncate">\${escHtml(e.description)}</span>
                  <span class="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 \${clr(p.people, e.paidBy).base}">\${escHtml(peopleMap[e.paidBy]||'?')}</span>
                  <span class="text-sm font-semibold text-gray-900 w-16 text-right">$\${e.amount.toFixed(2)}</span>
                </div>
                <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span class="text-[10px] text-gray-400 uppercase tracking-wide">split</span>
                  \${p.people.map((pr, i) => {
                    const on = splitIds.includes(pr.id);
                    return \`<span class="text-[11px] px-2 py-0.5 rounded-full \${on ? COLORS[i%COLORS.length].base : 'bg-gray-100 text-gray-300 line-through'}">\${escHtml(pr.name)}</span>\`;
                  }).join('')}
                </div>
              </div>
            \`;
          }).join('')}
        </div>
      \` : ''}
      \${snap.settlements?.length > 0 ? \`
        <div class="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <div class="text-sm font-semibold text-gray-900 mb-2">Settlement</div>
          <div class="space-y-2">
            \${snap.settlements.map(s => \`
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-700">\${escHtml(peopleMap[s.from]||'?')} owes \${escHtml(peopleMap[s.to]||'?')}</span>
                <span class="font-semibold text-gray-900">$\${s.amount.toFixed(2)}</span>
              </div>
            \`).join('')}
          </div>
        </div>
      \` : snap.settlements?.length === 0 ? \`
        <div class="bg-brand-50 border border-brand-200 rounded-xl p-4 text-sm text-brand-700 font-medium text-center">All settled up! 🎉</div>
      \` : ''}
    </div>
  \`;
}

// ── Custom confirm dialog ─────────────────────────────────────────────────────

function showConfirm(title, message, confirmLabel, onConfirm, amber = false) {
  _confirmCb = onConfirm;
  document.getElementById('confirmOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'confirmOverlay';
  overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 fade-in';
  const btnCls = amber
    ? 'bg-amber-500 hover:bg-amber-600 text-white'
    : 'bg-red-500 hover:bg-red-600 text-white';
  overlay.innerHTML = \`
    <div class="bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl">
      <h3 class="text-base font-bold text-gray-900 mb-1">\${title}</h3>
      <p class="text-sm text-gray-500 mb-5">\${message}</p>
      <div class="flex gap-2">
        <button onclick="document.getElementById('confirmOverlay').remove()" class="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
        <button onclick="_doConfirm()" class="flex-1 \${btnCls} py-2 rounded-lg text-sm font-medium">\${confirmLabel}</button>
      </div>
    </div>
  \`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function _doConfirm() {
  document.getElementById('confirmOverlay')?.remove();
  if (_confirmCb) { const cb = _confirmCb; _confirmCb = null; await cb(); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showLoading() {
  document.getElementById('app').innerHTML = \`<div class="flex justify-center py-20"><div class="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full spin"></div></div>\`;
}

function showError(msg) {
  document.getElementById('app').innerHTML = \`
    <div class="text-center py-20">
      <p class="text-red-500 font-medium mb-2">Something went wrong</p>
      <p class="text-gray-400 text-sm">\${escHtml(msg)}</p>
      <button onclick="goHome()" class="mt-4 text-brand-600 hover:text-brand-700 text-sm">← Home</button>
    </div>\`;
}

function shake(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('ring-2','ring-red-400');
  el.focus();
  setTimeout(() => el.classList.remove('ring-2','ring-red-400'), 800);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function api(method, path, body) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    return res.json();
  } catch (e) {
    return { error: String(e) };
  }
}
</script>
</body>
</html>`;
}
