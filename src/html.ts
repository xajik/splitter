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
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca'
        }
      }
    }
  }
}
</script>
<style>
.fade-in { animation: fadeIn .18s ease; }
@keyframes fadeIn { from { opacity:0; transform:translateY(3px); } to { opacity:1; } }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.pulse-text { animation: pulseTxt 1.5s ease-in-out infinite; }
@keyframes pulseTxt { 0%,100% { opacity:.5; } 50% { opacity:1; } }
</style>
</head>
<body class="bg-gray-50 min-h-screen font-sans">

<nav class="bg-white border-b border-gray-200 sticky top-0 z-50">
  <div class="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
    <button onclick="goHome()" class="flex items-center gap-2 text-brand-600 font-bold text-lg hover:text-brand-700">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
      Splitter
    </button>
    <button onclick="showHistory()" id="historyBtn" class="hidden text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      History
    </button>
  </div>
</nav>

<main class="max-w-2xl mx-auto px-4 py-6 pb-12" id="app"></main>

<footer class="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-gray-100 z-40">
  <div class="max-w-2xl mx-auto px-4 h-8 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
    <span id="statBills" class="tabular-nums text-gray-500 font-medium">0</span>
    <span>bills</span>
    <span class="text-gray-200 mx-1">·</span>
    <span>total</span>
    <span id="statTotal" class="tabular-nums text-gray-500 font-medium">$0.00</span>
  </div>
</footer>

<script>
const API = '';
let currentPartyId = null;
let currentParty   = null;
let formPayer      = null;
let formSplitSet   = null;
let settlementOpen = true;
let _confirmCb     = null;

// Person chip colors — no green, no indigo (reserved for brand)
const COLORS = [
  { base: 'bg-sky-100 text-sky-700',       active: 'bg-sky-500 text-white'     },
  { base: 'bg-violet-100 text-violet-700', active: 'bg-violet-500 text-white'  },
  { base: 'bg-amber-100 text-amber-700',   active: 'bg-amber-600 text-white'   },
  { base: 'bg-rose-100 text-rose-700',     active: 'bg-rose-500 text-white'    },
  { base: 'bg-cyan-100 text-cyan-700',     active: 'bg-cyan-500 text-white'    },
  { base: 'bg-orange-100 text-orange-700', active: 'bg-orange-500 text-white'  },
  { base: 'bg-pink-100 text-pink-700',     active: 'bg-pink-500 text-white'    },
  { base: 'bg-teal-100 text-teal-700',     active: 'bg-teal-500 text-white'    },
];

function clr(people, pid) {
  const i = people.findIndex(p => p.id === pid);
  return i >= 0 ? COLORS[i % COLORS.length] : { base: 'bg-gray-100 text-gray-500', active: 'bg-gray-400 text-white' };
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
    const on = pr.id === payer;
    const c = COLORS[i % COLORS.length];
    return \`<button onclick="selectPayer('\${pr.id}')" class="text-sm font-medium px-3 py-1 rounded-full transition-all \${on ? c.active + ' ring-2 ring-offset-1 ring-current/30' : c.base}">\${escHtml(pr.name)}</button>\`;
  }).join('');
}

function buildSplitChips() {
  const split = effectiveSplit();
  return currentParty.people.map((pr, i) => {
    const on = split.includes(pr.id);
    const c = COLORS[i % COLORS.length];
    return \`<button onclick="toggleSplitChip('\${pr.id}')" class="text-sm px-3 py-1 rounded-full transition-all \${on ? c.base : 'bg-gray-100 text-gray-300 line-through'}">\${escHtml(pr.name)}</button>\`;
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

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return new Date(ts).toLocaleDateString();
}

// ── Routing ────────────────────────────────────────────────────────────────────

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

// ── History ────────────────────────────────────────────────────────────────────

function getHistory() {
  const c = document.cookie.split(';').find(x => x.trim().startsWith('splitter_history='));
  if (!c) return [];
  try { return JSON.parse(decodeURIComponent(c.split('=')[1])); } catch { return []; }
}
function addToHistory(e) {
  const h = getHistory().filter(x => x.id !== e.id);
  h.unshift(e);
  document.cookie = 'splitter_history=' + encodeURIComponent(JSON.stringify(h.slice(0, 10))) + '; max-age=31536000; path=/; SameSite=Lax';
}
function loadHistoryBtn() {
  if (getHistory().length) document.getElementById('historyBtn').classList.remove('hidden');
}
function showHistory() {
  updateStats(null);
  document.getElementById('app').innerHTML = \`
    <div class="fade-in">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">Recent parties</h2>
      <div class="space-y-3">
        \${getHistory().map(e => \`
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

// ── Home ───────────────────────────────────────────────────────────────────────

function renderHome() {
  currentPartyId = null; currentParty = null;
  updateStats(null);
  document.getElementById('app').innerHTML = \`
    <div class="fade-in text-center py-12">
      <div class="w-16 h-16 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <svg class="w-8 h-8 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
      </div>
      <h1 class="text-3xl font-bold text-gray-900 mb-2">Split bills, not friendships</h1>
      <p class="text-gray-500 mb-10">Create a party, add expenses, settle up instantly.</p>
      <div class="bg-white rounded-2xl border border-gray-200 p-6 text-left max-w-sm mx-auto">
        <label class="block text-sm font-medium text-gray-700 mb-1">Party name</label>
        <input id="partyNameInput" type="text" placeholder="Weekend trip, Dinner…" maxlength="80"
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

// ── Party ──────────────────────────────────────────────────────────────────────

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
  const has2 = p.people.length >= 2;

  document.getElementById('app').innerHTML = \`
    <div class="fade-in space-y-3">

      <!-- Header -->
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-gray-900 leading-tight">\${escHtml(p.name)}</h2>
          <p class="text-xs text-gray-400">\${p.people.length} people · \${p.expenses.length} expenses</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="showInviteModal()" title="Invite" class="border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-600 p-2 rounded-lg transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
          </button>
          <button onclick="confirmSeal()" title="Seal" class="border border-amber-200 text-amber-500 hover:bg-amber-50 p-2 rounded-lg transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          </button>
        </div>
      </div>

      <!-- People row -->
      <div class="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-2 flex-wrap">
        \${p.people.map((pr, i) => \`
          <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            <span class="w-1.5 h-1.5 rounded-full \${COLORS[i%COLORS.length].active.split(' ')[0]} inline-block"></span>
            \${escHtml(pr.name)}
            <button onclick="removePerson('\${pr.id}')" class="opacity-30 hover:opacity-80 transition-opacity leading-none ml-0.5">✕</button>
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
        const payerClr = clr(p.people, e.paidBy);
        const payerName = p.people.find(pr => pr.id === e.paidBy)?.name || '?';
        const splitIds = e.splitBetween.length > 0 ? e.splitBetween : p.people.map(pr => pr.id);
        return \`<div class="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
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
        </div>\`;
      }).join('')}</div>\` : ''}

      <!-- Receipts section -->
      \${renderReceiptsSection(p, true)}

      <!-- Add expense form -->
      \${has2 ? \`
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
      \` : \`<div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-600">Add at least 2 people to start recording expenses.</div>\`}

      <!-- Settlement -->
      \${has2 && p.expenses.length > 0 ? \`
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button onclick="toggleSettlement()" class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
            <span class="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <span id="settlementArrow" class="text-gray-400 text-xs">\${settlementOpen?'▼':'▶'}</span>
              Settlement
            </span>
            <span id="settlementSummary" class="text-xs text-gray-400 italic">calculating…</span>
          </button>
          <div id="settlementDetails" class="\${settlementOpen?'':'hidden'} border-t border-gray-100 px-4 py-3">
            <div id="settlementBody" class="text-sm text-gray-500">calculating…</div>
          </div>
        </div>
      \` : ''}

    </div>
  \`;

  if (has2 && p.expenses.length > 0) loadSettlements();
}

// ── Receipt section HTML ───────────────────────────────────────────────────────

function renderReceiptsSection(p, editable) {
  const receipts = p.receipts || [];
  const canUpload = editable && receipts.length < 100;

  const rows = receipts.map(r => {
    const hasAmt = r.status === 'done' && r.extractedAmount != null;
    const imgUrl = '/receipt/' + p.id + '/' + r.id;
    return \`
      <div class="flex items-center gap-3 px-4 py-2.5 \${editable ? 'hover:bg-gray-50' : ''} transition-colors">
        <div class="w-9 h-9 shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-100 flex items-center justify-center">
          <img src="\${imgUrl}" loading="lazy" class="w-full h-full object-cover" onerror="this.style.display='none'">
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium text-gray-700 truncate">\${escHtml(r.filename)}</div>
          <div class="text-[10px] text-gray-400">\${timeAgo(r.uploadedAt)}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          \${r.status === 'processing' ? '<span class="text-[10px] text-gray-400 pulse-text">extracting…</span>' : ''}
          \${r.status === 'error'      ? '<span class="text-[10px] text-red-400">failed</span>' : ''}
          \${hasAmt ? \`
            <span class="text-sm font-semibold text-gray-900">$\${r.extractedAmount.toFixed(2)}</span>
            \${editable ? \`<button onclick="useReceiptAmount(\${r.extractedAmount})" class="text-[10px] font-medium bg-brand-100 text-brand-700 hover:bg-brand-200 px-2 py-1 rounded-lg transition-colors">Use</button>\` : ''}
          \` : ''}
          \${editable && (r.status === 'pending' || r.status === 'error') ? \`
            <button onclick="extractReceipt('\${r.id}')" class="text-[10px] font-medium text-brand-600 hover:text-brand-700 border border-brand-200 hover:border-brand-400 px-2 py-1 rounded-lg transition-colors">Extract →</button>
          \` : ''}
          \${editable ? \`
            <button onclick="deleteReceipt('\${r.id}')" class="text-gray-300 hover:text-red-400 transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          \` : ''}
        </div>
      </div>
    \`;
  }).join('');

  return \`
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 \${receipts.length > 0 ? 'border-b border-gray-100' : ''}">
        <span class="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.414 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
          Receipts
          \${receipts.length > 0 ? \`<span class="text-[10px] font-normal text-gray-400">\${receipts.length}/100</span>\` : ''}
        </span>
        \${canUpload ? \`
          <label class="cursor-pointer text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors flex items-center gap-1">
            Attach
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" class="hidden" onchange="uploadReceipt(this)">
          </label>
        \` : ''}
      </div>
      \${receipts.length > 0 ? \`<div class="divide-y divide-gray-100">\${rows}</div>\` : (
        editable ? \`
          <label class="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors">
            <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <span class="text-sm text-gray-400">Attach a receipt photo — AI will extract the total</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" class="hidden" onchange="uploadReceipt(this)">
          </label>
        \` : ''
      )}
    </div>
  \`;
}

// ── Sealed view ────────────────────────────────────────────────────────────────

function renderSealedParty(p) {
  const peopleMap = Object.fromEntries(p.people.map(pr => [pr.id, pr.name]));
  const receipts = p.receipts || [];
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
        Sealed\${p.sealedAt?' · '+new Date(p.sealedAt).toLocaleString():''} — no further changes.
      </div>
      <div class="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex flex-wrap gap-2">
        \${p.people.map((pr, i) => \`<span class="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600"><span class="w-1.5 h-1.5 rounded-full \${COLORS[i%COLORS.length].active.split(' ')[0]} inline-block mr-1"></span>\${escHtml(pr.name)}</span>\`).join('')}
      </div>
      \${p.expenses.length > 0 ? \`<div class="space-y-2">\${[...p.expenses].reverse().map(e => {
        const splitIds = e.splitBetween.length > 0 ? e.splitBetween : p.people.map(pr => pr.id);
        return \`<div class="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
          <div class="flex items-center gap-2 min-w-0">
            <span class="flex-1 font-medium text-gray-900 text-sm truncate">\${escHtml(e.description)}</span>
            <span class="text-xs font-medium px-2 py-0.5 rounded-full \${clr(p.people,e.paidBy).base} shrink-0">\${escHtml(peopleMap[e.paidBy]||'?')}</span>
            <span class="text-sm font-semibold text-gray-900 w-16 text-right">$\${e.amount.toFixed(2)}</span>
          </div>
          <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span class="text-[10px] text-gray-400 uppercase tracking-wide">split</span>
            \${p.people.map((pr,i) => { const on=splitIds.includes(pr.id); return \`<span class="text-[11px] px-2 py-0.5 rounded-full \${on?COLORS[i%COLORS.length].base:'bg-gray-100 text-gray-300 line-through'}">\${escHtml(pr.name)}</span>\`; }).join('')}
          </div>
        </div>\`;
      }).join('')}</div>\` : ''}
      \${receipts.length > 0 ? renderReceiptsSection(p, false) : ''}
      <div id="settlementCard" class="bg-white rounded-xl border border-gray-200 px-4 py-3">
        <div class="text-sm font-semibold text-gray-900 mb-2">Settlement</div>
        <div id="settlementBody" class="text-sm text-gray-500">Calculating…</div>
      </div>
    </div>
  \`;
  loadSettlements();
}

// ── People ─────────────────────────────────────────────────────────────────────

async function addPerson() {
  const input = document.getElementById('personInput');
  const name = input.value.trim();
  if (!name) return shake('personInput');
  input.value = '';
  const res = await api('POST', '/api/parties/' + currentPartyId + '/people', { name });
  if (res.error) return alert(res.error);
  currentParty = res; formSplitSet = null;
  renderParty();
  document.getElementById('personInput')?.focus();
}

async function removePerson(personId) {
  const person = currentParty.people.find(p => p.id === personId);
  showConfirm(
    \`Remove \${person ? escHtml(person.name) : 'this person'}?\`,
    'Their expenses will also be removed.',
    'Remove',
    async () => {
      const res = await api('DELETE', '/api/parties/' + currentPartyId + '/people/' + personId);
      if (res.error) return alert(res.error);
      if (formPayer === personId) formPayer = null;
      if (formSplitSet) formSplitSet.delete(personId);
      currentParty = res; renderParty();
    }
  );
}

// ── Expenses ───────────────────────────────────────────────────────────────────

async function addExpense() {
  const desc   = document.getElementById('expDesc').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const paidBy = effectivePayer();
  const splitArr = effectiveSplit();
  if (!desc) return shake('expDesc');
  if (!amount || amount <= 0) return shake('expAmount');
  if (splitArr.length === 0) return alert('Select at least one person to split with.');
  const allIds = currentParty.people.map(p => p.id);
  const isAll = splitArr.length === allIds.length && allIds.every(id => splitArr.includes(id));
  const res = await api('POST', '/api/parties/' + currentPartyId + '/expenses', {
    description: desc, amount, paidBy, splitBetween: isAll ? [] : splitArr
  });
  if (res.error) return alert(res.error);
  currentParty = res; formSplitSet = null; renderParty();
}

async function removeExpense(eid) {
  const res = await api('DELETE', '/api/parties/' + currentPartyId + '/expenses/' + eid);
  if (res.error) return alert(res.error);
  currentParty = res; renderParty();
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
    if (formSplitSet.has(pid)) formSplitSet.delete(pid); else formSplitSet.add(pid);
    if (formSplitSet.size === currentParty.people.length) formSplitSet = null;
  }
  const c = document.getElementById('splitChips');
  if (c) c.innerHTML = buildSplitChips();
}

function toggleAllSplit() {
  const all = currentParty.people.map(p => p.id);
  formSplitSet = effectiveSplit().length === all.length ? new Set([all[0]]) : null;
  const c = document.getElementById('splitChips');
  if (c) c.innerHTML = buildSplitChips();
}

// ── Receipts ───────────────────────────────────────────────────────────────────

async function uploadReceipt(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  if (file.size > 10 * 1024 * 1024) return alert('File too large (max 10 MB)');
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/parties/' + currentPartyId + '/receipts', { method: 'POST', body: fd })
    .then(r => r.json()).catch(e => ({ error: String(e) }));
  if (res.error) return alert(res.error);
  currentParty = res; renderParty();
}

async function extractReceipt(rid) {
  const r = (currentParty.receipts || []).find(x => x.id === rid);
  if (r) r.status = 'processing';
  renderParty();
  const res = await api('POST', '/api/parties/' + currentPartyId + '/receipts/' + rid + '/extract');
  if (res.error) {
    const r2 = (currentParty.receipts || []).find(x => x.id === rid);
    if (r2) r2.status = 'error';
    renderParty();
    alert(res.error);
    return;
  }
  currentParty = res; renderParty();
}

async function deleteReceipt(rid) {
  const res = await api('DELETE', '/api/parties/' + currentPartyId + '/receipts/' + rid);
  if (res.error) return alert(res.error);
  currentParty = res; renderParty();
}

function useReceiptAmount(amount) {
  const el = document.getElementById('expAmount');
  if (!el) return;
  el.value = amount.toFixed(2);
  el.dispatchEvent(new Event('input'));
  document.getElementById('expDesc')?.focus();
  document.getElementById('expDesc')?.closest('.border-dashed')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Settlement ─────────────────────────────────────────────────────────────────

function toggleSettlement() {
  settlementOpen = !settlementOpen;
  document.getElementById('settlementArrow')?.replaceChildren();
  const a = document.getElementById('settlementArrow');
  const d = document.getElementById('settlementDetails');
  if (a) a.textContent = settlementOpen ? '▼' : '▶';
  if (d) d.classList.toggle('hidden', !settlementOpen);
}

async function loadSettlements() {
  if (!currentPartyId) return;
  const res = await api('GET', '/api/parties/' + currentPartyId + '/settlements');
  if (!res || res.error) return;
  const people = currentParty.people;
  const pm = Object.fromEntries(people.map(pr => [pr.id, pr.name]));
  const summary = document.getElementById('settlementSummary');
  const body    = document.getElementById('settlementBody');
  if (res.settlements.length === 0) {
    if (summary) summary.textContent = 'All settled 🎉';
    if (body) body.innerHTML = \`<p class="text-center text-brand-600 font-medium py-1">All settled up! 🎉</p>\`;
    return;
  }
  const lines = res.settlements.map(s => \`\${pm[s.from]||'?'} → \${pm[s.to]||'?'} $\${s.amount.toFixed(2)}\`);
  if (summary) summary.textContent = lines.length > 1 ? lines[0] + \` +\${lines.length-1} more\` : lines[0];
  if (body) {
    body.innerHTML = \`<div class="space-y-2">\${res.settlements.map(s => {
      const fc = clr(people, s.from), tc = clr(people, s.to);
      return \`<div class="flex items-center justify-between gap-3 py-0.5">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-medium px-2 py-0.5 rounded-full \${fc.base}">\${escHtml(pm[s.from]||'?')}</span>
          <span class="text-gray-400 text-xs">→</span>
          <span class="text-xs font-medium px-2 py-0.5 rounded-full \${tc.base}">\${escHtml(pm[s.to]||'?')}</span>
        </div>
        <span class="font-semibold text-gray-900 tabular-nums text-sm">$\${s.amount.toFixed(2)}</span>
      </div>\`;
    }).join('')}</div>\`;
  }
}

// ── Invite / Seal ──────────────────────────────────────────────────────────────

function showInviteModal() {
  const url = location.origin + '/#/party/' + currentPartyId;
  showLinkModal('Invite friends', 'Anyone with this link can add themselves and record expenses. Seal the party when done.', url);
}

async function createShare() {
  const res = await api('POST', '/api/parties/' + currentPartyId + '/share');
  if (res.error) return alert(res.error);
  const url = location.origin + '/#/share/' + res.id;
  addToHistory({ id: res.id, name: currentParty.name + ' (snapshot)', date: Date.now(), type: 'share' });
  showLinkModal('Snapshot link', 'An immutable read-only snapshot of the current state.', url);
}

function showLinkModal(title, desc, url) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 fade-in';
  overlay.innerHTML = \`
    <div class="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
      <h3 class="text-base font-bold text-gray-900 mb-1">\${title}</h3>
      <p class="text-sm text-gray-500 mb-4">\${desc}</p>
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
  showConfirm('Seal this party?', 'No one can add or remove people, expenses, or receipts after this.', 'Seal', async () => {
    const res = await api('POST', '/api/parties/' + currentPartyId + '/seal');
    if (res.error) return alert(res.error);
    currentParty = res; renderParty();
  }, false);
}

async function copyUrl(url, btn) {
  await navigator.clipboard.writeText(url);
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = 'Copy', 2000);
}

// ── Snapshot ───────────────────────────────────────────────────────────────────

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
  const pm = Object.fromEntries(p.people.map(pr => [pr.id, pr.name]));
  const receipts = p.receipts || [];
  document.getElementById('app').innerHTML = \`
    <div class="fade-in space-y-3">
      <div><h2 class="text-xl font-bold text-gray-900">\${escHtml(p.name)}</h2><p class="text-xs text-gray-400">\${p.people.length} people · \${p.expenses.length} expenses</p></div>
      <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-700">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        Snapshot · \${new Date(snap.createdAt).toLocaleString()}
      </div>
      <div class="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex flex-wrap gap-2">
        \${p.people.map((pr,i) => \`<span class="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600"><span class="w-1.5 h-1.5 rounded-full \${COLORS[i%COLORS.length].active.split(' ')[0]} inline-block mr-1"></span>\${escHtml(pr.name)}</span>\`).join('')}
      </div>
      \${p.expenses.length > 0 ? \`<div class="space-y-2">\${[...p.expenses].reverse().map(e => {
        const splitIds = e.splitBetween.length > 0 ? e.splitBetween : p.people.map(pr => pr.id);
        return \`<div class="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
          <div class="flex items-center gap-2 min-w-0">
            <span class="flex-1 font-medium text-gray-900 text-sm truncate">\${escHtml(e.description)}</span>
            <span class="text-xs font-medium px-2 py-0.5 rounded-full \${clr(p.people,e.paidBy).base} shrink-0">\${escHtml(pm[e.paidBy]||'?')}</span>
            <span class="text-sm font-semibold text-gray-900 w-16 text-right">$\${e.amount.toFixed(2)}</span>
          </div>
          <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span class="text-[10px] text-gray-400 uppercase tracking-wide">split</span>
            \${p.people.map((pr,i) => { const on=splitIds.includes(pr.id); return \`<span class="text-[11px] px-2 py-0.5 rounded-full \${on?COLORS[i%COLORS.length].base:'bg-gray-100 text-gray-300 line-through'}">\${escHtml(pr.name)}</span>\`; }).join('')}
          </div>
        </div>\`;
      }).join('')}</div>\` : ''}
      \${receipts.length > 0 ? renderReceiptsSection(p, false) : ''}
      \${snap.settlements?.length > 0 ? \`
        <div class="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <div class="text-sm font-semibold text-gray-900 mb-2">Settlement</div>
          <div class="space-y-2">\${snap.settlements.map(s => {
            const fc=clr(p.people,s.from), tc=clr(p.people,s.to);
            return \`<div class="flex items-center justify-between gap-3 py-0.5">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium px-2 py-0.5 rounded-full \${fc.base}">\${escHtml(pm[s.from]||'?')}</span>
                <span class="text-gray-400 text-xs">→</span>
                <span class="text-xs font-medium px-2 py-0.5 rounded-full \${tc.base}">\${escHtml(pm[s.to]||'?')}</span>
              </div>
              <span class="font-semibold text-gray-900 tabular-nums text-sm">$\${s.amount.toFixed(2)}</span>
            </div>\`;
          }).join('')}</div>
        </div>
      \` : snap.settlements?.length === 0 ? '<div class="bg-brand-50 border border-brand-200 rounded-xl p-4 text-sm text-brand-700 font-medium text-center">All settled up! 🎉</div>' : ''}
    </div>
  \`;
}

// ── Custom dialog ──────────────────────────────────────────────────────────────

function showConfirm(title, message, label, onConfirm, amber = false) {
  _confirmCb = onConfirm;
  document.getElementById('confirmOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'confirmOverlay';
  overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 fade-in';
  const btnCls = amber ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white';
  overlay.innerHTML = \`
    <div class="bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl">
      <h3 class="text-base font-bold text-gray-900 mb-1">\${title}</h3>
      <p class="text-sm text-gray-500 mb-5">\${message}</p>
      <div class="flex gap-2">
        <button onclick="document.getElementById('confirmOverlay').remove()" class="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
        <button onclick="_doConfirm()" class="flex-1 \${btnCls} py-2 rounded-lg text-sm font-medium">\${label}</button>
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function showLoading() {
  document.getElementById('app').innerHTML = \`<div class="flex justify-center py-20"><div class="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full spin"></div></div>\`;
}
function showError(msg) {
  document.getElementById('app').innerHTML = \`
    <div class="text-center py-20">
      <p class="text-red-400 font-medium mb-2">Something went wrong</p>
      <p class="text-gray-400 text-sm">\${escHtml(msg)}</p>
      <button onclick="goHome()" class="mt-4 text-brand-600 hover:text-brand-700 text-sm">← Home</button>
    </div>\`;
}
function shake(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('ring-2','ring-red-400'); el.focus();
  setTimeout(() => el.classList.remove('ring-2','ring-red-400'), 800);
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
async function api(method, path, body) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return await fetch(API + path, opts).then(r => r.json());
  } catch (e) { return { error: String(e) }; }
}
</script>
</body>
</html>`;
}
