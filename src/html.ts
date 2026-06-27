export function getAppHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Splitter — Split bills with friends</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
body { background: #f4f4f5; }
.fade-in { animation: fadeIn .2s ease; }
@keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; } }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.pulse-text { animation: pulseTxt 1.5s ease-in-out infinite; }
@keyframes pulseTxt { 0%,100% { opacity:.5; } 50% { opacity:1; } }
.card { background:#fff; border-radius:1rem; box-shadow:0 1px 2px rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.03); }
</style>
</head>
<body class="min-h-screen font-sans text-gray-900 antialiased">

<header class="max-w-2xl mx-auto px-5 pt-5 pb-2">
  <button onclick="goHome()" class="flex items-center gap-2 font-bold text-lg tracking-tight text-gray-900 hover:opacity-70 transition-opacity">
    <span class="w-6 h-6 bg-black rounded-lg flex items-center justify-center">
      <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M7 8h10M7 12h6m-6 4h10"/></svg>
    </span>
    Splitter
  </button>
</header>

<main class="max-w-2xl mx-auto px-5 py-4 pb-10" id="app"></main>

<script>
const API = '';
let currentPartyId = null;
let currentParty   = null;
let formPayer      = null;
let formSplitSet   = null;
let settlementOpen = true;
let _confirmCb     = null;
let aiQuota        = null;

// Person chip colors — functional distinction, muted to fit the monochrome shell
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

// Unified person chip — one visual language everywhere.
// state: 'on' (colored), 'active' (payer-selected, solid), 'off' (muted, deselected)
function personChip(people, pid, name, state) {
  const c = clr(people, pid);
  const cls = state === 'active' ? c.active
    : state === 'off' ? 'bg-gray-100 text-gray-400'
    : c.base;
  return '<span class="text-xs font-medium px-2.5 py-1 rounded-full ' + cls + '">' + escHtml(name) + '</span>';
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmt(n) {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtCompact(n) {
  n = n || 0;
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\\.0$/, '') + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1).replace(/\\.0$/, '') + 'K';
  return '$' + n.toFixed(2);
}
function fmtNum(n) { return (n || 0).toLocaleString('en-US'); }
function fmtDate(ts) { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return new Date(ts).toLocaleDateString();
}

// Pick a contextual icon (stroke outline path) from the party name
function partyIcon(name) {
  const n = (name || '').toLowerCase();
  const FOOD = 'M16 8h2a2 2 0 010 4h-2m-13-4h13v6a3 3 0 01-3 3H6a3 3 0 01-3-3V8zM7 3v2m4-2v2';
  const HOME = 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6';
  const TRAVEL = 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z';
  const SHOP = 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z';
  const GROUP = 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z';
  if (/dinner|lunch|breakfast|brunch|food|restaurant|eat|meal|cafe|coffee|drink|bar|pizza|sushi|bbq|tapas|ramen/.test(n)) return FOOD;
  if (/rent|apartment|house|home|flat|utilit|mortgage|bills?|electric|wifi|internet/.test(n)) return HOME;
  if (/trip|travel|vacation|flight|hotel|airbnb|weekend|holiday|tour|beach|ski|road|camp/.test(n)) return TRAVEL;
  if (/shop|grocer|store|market|mall|gift|amazon/.test(n)) return SHOP;
  return GROUP;
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
window.addEventListener('load', route);
function goHome() { location.hash = '/'; }

// ── History (cookies) ────────────────────────────────────────────────────────

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

// ── Home ───────────────────────────────────────────────────────────────────────

function renderHome() {
  currentPartyId = null; currentParty = null;
  document.getElementById('app').innerHTML = \`
    <div class="fade-in space-y-8">

      <!-- Create -->
      <div class="card p-3 flex items-center gap-2">
        <input id="partyNameInput" type="text" placeholder="Enter Party Name" maxlength="80"
          class="flex-1 px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
          onkeydown="if(event.key==='Enter') createParty()">
        <button onclick="createParty()" id="createBtn"
          class="flex items-center gap-1.5 bg-black hover:bg-gray-800 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors shrink-0">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
          Create
        </button>
      </div>

      <!-- Recent Parties -->
      <section>
        <div class="flex items-end justify-between mb-3">
          <h2 class="text-xl font-bold tracking-tight">Recent Parties</h2>
          <button id="recentMore" onclick="goHome()" class="hidden text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
            See More <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div id="recentList" class="space-y-2.5">
          <div class="card p-4 text-sm text-gray-400">Loading…</div>
        </div>
      </section>

      <!-- Statistics -->
      <section>
        <h2 class="text-xl font-bold tracking-tight mb-3">Statistics</h2>
        <div id="statsCard"></div>
      </section>

      <!-- Global totals -->
      <div class="border-t border-gray-200 pt-5">
        <div class="text-[11px] uppercase tracking-wider text-gray-400 mb-3 text-center">Splitter community, all time</div>
        <div id="globalStats" class="flex items-center justify-between"></div>
      </div>

    </div>
  \`;
  document.getElementById('partyNameInput').focus();
  loadHomeData();
}

async function loadHomeData() {
  const hist = getHistory();

  const [sumRes, stats] = await Promise.all([
    hist.length
      ? api('POST', '/api/summaries', { items: hist.map(h => ({ id: h.id, type: h.type })) })
      : Promise.resolve({ summaries: [] }),
    api('GET', '/api/stats'),
  ]);

  const summaries = (sumRes && sumRes.summaries) || [];
  renderRecentList(summaries);
  renderStatsCard(summaries);
  renderGlobalStats(stats || {});
}

function renderRecentList(summaries) {
  const list = document.getElementById('recentList');
  const more = document.getElementById('recentMore');
  if (!list) return;

  if (summaries.length === 0) {
    list.innerHTML = \`
      <div class="card p-6 text-center">
        <p class="text-sm text-gray-400">No parties yet. Create one above to get started.</p>
      </div>\`;
    return;
  }

  if (more && summaries.length > 3) more.classList.remove('hidden');
  const shown = summaries.slice(0, 4);

  list.innerHTML = shown.map(s => {
    const settled = s.settled;
    const iconWrap = settled
      ? 'bg-gray-100 text-gray-500'
      : 'bg-black text-white';
    const statusCls = settled ? 'text-blue-600' : 'text-red-500';
    const statusTxt = settled ? 'Settled' : 'Pending';
    const href = "location.hash='/" + (s.type === 'share' ? 'share' : 'party') + "/" + s.id + "'";
    return \`
      <div onclick="\${href}" class="card p-3.5 flex items-center gap-3.5 cursor-pointer hover:shadow-md transition-shadow">
        <div class="w-11 h-11 rounded-full \${iconWrap} flex items-center justify-center shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="\${partyIcon(s.name)}"/></svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-gray-900 truncate">\${escHtml(s.name)}</div>
          <div class="text-sm text-gray-400">\${fmtDate(s.date)} · \${s.people} \${s.people === 1 ? 'person' : 'people'}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="font-semibold text-gray-900 tabular-nums">\${fmt(s.total)}</div>
          <div class="text-xs font-medium \${statusCls}">\${statusTxt}</div>
        </div>
      </div>\`;
  }).join('');
}

function renderStatsCard(summaries) {
  const card = document.getElementById('statsCard');
  if (!card) return;

  const pendingTotal = summaries.filter(s => !s.settled).reduce((a, s) => a + s.total, 0);
  const settledTotal = summaries.filter(s => s.settled).reduce((a, s) => a + s.total, 0);
  const grand = pendingTotal + settledTotal;
  const people = summaries.reduce((a, s) => a + s.people, 0);
  const groups = summaries.length;

  const pendingPct = grand > 0 ? Math.round((pendingTotal / grand) * 100) : 0;

  card.innerHTML = \`
    <div class="rounded-2xl p-6" style="background:#1c1c1e;">
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-5">
        <div>
          <div class="text-[11px] uppercase tracking-wider text-gray-400 mb-1.5">Total Active Balance</div>
          <div class="text-4xl font-bold tracking-tight text-white mb-1.5 tabular-nums">\${fmt(grand)}</div>
          <div class="text-sm text-gray-400">Tracking \${groups} \${groups === 1 ? 'party' : 'parties'} across \${people} \${people === 1 ? 'person' : 'people'}.</div>
        </div>
        <div class="flex gap-5">
          <div class="border-l border-gray-700 pl-4">
            <div class="flex items-center gap-1.5 mb-0.5"><span class="w-2 h-2 rounded-full bg-rose-400"></span><span class="text-[10px] uppercase tracking-wider text-gray-400">Pending</span></div>
            <div class="text-lg font-semibold text-white tabular-nums">\${fmt(pendingTotal)}</div>
          </div>
          <div class="border-l border-gray-700 pl-4">
            <div class="flex items-center gap-1.5 mb-0.5"><span class="w-2 h-2 rounded-full bg-sky-400"></span><span class="text-[10px] uppercase tracking-wider text-gray-400">Settled</span></div>
            <div class="text-lg font-semibold text-white tabular-nums">\${fmt(settledTotal)}</div>
          </div>
        </div>
      </div>
      <!-- honest pending/settled proportion bar -->
      <div class="h-2 rounded-full overflow-hidden flex bg-gray-700">
        \${grand > 0 ? \`
          <div class="bg-rose-400 h-full" style="width:\${pendingPct}%"></div>
          <div class="bg-sky-400 h-full" style="width:\${100 - pendingPct}%"></div>
        \` : ''}
      </div>
    </div>\`;
}

function renderGlobalStats(stats) {
  const el = document.getElementById('globalStats');
  if (!el) return;
  el.innerHTML = \`
    <div class="flex items-center gap-2">
      <span class="text-2xl font-bold tracking-tight text-gray-900 tabular-nums">\${fmtNum(stats.billsSettled || 0)}</span>
      <span class="text-xs text-gray-400 leading-tight">bills<br>settled</span>
    </div>
    <div class="flex items-center gap-2 text-right">
      <span class="text-xs text-gray-400 leading-tight">total<br>money split</span>
      <span class="text-2xl font-bold tracking-tight text-gray-900 tabular-nums">\${fmtCompact(stats.moneySplit || 0)}</span>
    </div>\`;
}

async function createParty() {
  const name = document.getElementById('partyNameInput').value.trim();
  if (!name) return shake('partyNameInput');
  const btn = document.getElementById('createBtn');
  btn.disabled = true; btn.innerHTML = 'Creating…';
  const res = await api('POST', '/api/parties', { name });
  if (res.error) { btn.disabled = false; btn.textContent = 'Create'; return alert(res.error); }
  addToHistory({ id: res.id, name: res.name, date: Date.now(), type: 'party' });
  location.hash = '/party/' + res.id;
}

// ── Party ──────────────────────────────────────────────────────────────────────

async function loadParty(id) {
  currentPartyId = id;
  showLoading();
  const [res, quota] = await Promise.all([
    api('GET', '/api/parties/' + id),
    api('GET', '/api/ai/quota'),
  ]);
  if (res.error) return showError(res.error);
  currentParty = res;
  aiQuota = quota.error ? null : quota;
  formPayer = null; formSplitSet = null;
  addToHistory({ id: res.id, name: res.name, date: Date.now(), type: 'party' });
  renderParty();
}

function effectivePayer() {
  if (!currentParty || !currentParty.people.length) return null;
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
    return \`<button onclick="selectPayer('\${pr.id}')" class="text-sm font-medium px-3 py-1.5 rounded-full transition-all \${on ? c.active : c.base + ' opacity-60 hover:opacity-100'}">\${escHtml(pr.name)}</button>\`;
  }).join('');
}
function buildSplitChips() {
  const split = effectiveSplit();
  return currentParty.people.map((pr, i) => {
    const on = split.includes(pr.id);
    const c = COLORS[i % COLORS.length];
    return \`<button onclick="toggleSplitChip('\${pr.id}')" class="text-sm font-medium px-3 py-1.5 rounded-full transition-all \${on ? c.base : 'bg-gray-100 text-gray-400'}">\${escHtml(pr.name)}</button>\`;
  }).join('');
}

function renderParty() {
  const p = currentParty;
  if (p.sealed) { renderSealedParty(p); return; }
  const has2 = p.people.length >= 2;
  const total = p.expenses.reduce((s, e) => s + e.amount, 0);

  const hasExp = p.expenses.length > 0;

  document.getElementById('app').innerHTML = \`
    <div class="fade-in space-y-3">

      <!-- Header -->
      <div class="flex items-end justify-between gap-3 mb-1">
        <div class="min-w-0">
          <h2 class="text-2xl font-bold tracking-tight truncate">\${escHtml(p.name)}</h2>
          <p class="text-sm text-gray-400">\${p.people.length} \${p.people.length === 1 ? 'person' : 'people'} · \${p.expenses.length} \${p.expenses.length === 1 ? 'expense' : 'expenses'} · \${fmt(total)}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="showInviteModal()" class="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 hover:border-gray-400 hover:text-gray-900 text-sm font-medium px-3 py-2 rounded-xl transition-colors shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
            Share
          </button>
          <button onclick="confirmSeal()" class="flex items-center gap-1.5 bg-black hover:bg-gray-800 text-white text-sm font-medium px-3 py-2 rounded-xl transition-colors shadow-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            Seal
          </button>
        </div>
      </div>

      <!-- Settlement (result first) -->
      <div class="card overflow-hidden">
        <button onclick="toggleSettlement()" class="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
          <span class="flex items-center gap-2 text-base font-semibold text-gray-900">
            <span id="settlementArrow" class="text-gray-400 text-xs">\${settlementOpen?'▼':'▶'}</span>
            Who owes whom
          </span>
          <span id="settlementSummary" class="text-xs text-gray-400">\${hasExp ? 'calculating…' : ''}</span>
        </button>
        <div id="settlementDetails" class="\${settlementOpen?'':'hidden'} border-t border-gray-100 px-4 py-3">
          <div id="settlementBody" class="text-sm text-gray-500">\${has2 && hasExp ? 'calculating…' : 'Add at least 2 people and an expense to see who owes whom.'}</div>
        </div>
      </div>

      <!-- People -->
      <div class="card px-3.5 py-3 flex items-center gap-2 flex-wrap">
        \${p.people.map((pr, i) => \`
          <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full \${COLORS[i%COLORS.length].base}">
            \${escHtml(pr.name)}
            <button onclick="removePerson('\${pr.id}')" class="opacity-40 hover:opacity-100 transition-opacity leading-none ml-0.5">✕</button>
          </span>
        \`).join('')}
        <div class="flex items-center gap-1.5 ml-auto">
          <input id="personInput" type="text" placeholder="Add person…" maxlength="50"
            class="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 w-28 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:w-36 transition-all"
            onkeydown="if(event.key==='Enter') addPerson()">
          <button onclick="addPerson()" class="bg-black hover:bg-gray-800 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">Add</button>
        </div>
      </div>

      <!-- Expenses -->
      \${hasExp ? \`<div class="space-y-2">\${[...p.expenses].reverse().map(e => {
        const payerName = p.people.find(pr => pr.id === e.paidBy)?.name || '?';
        const splitIds = e.splitBetween.length > 0 ? e.splitBetween : p.people.map(pr => pr.id);
        return \`<div class="card px-4 py-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="flex-1 font-medium text-gray-900 text-sm truncate">\${escHtml(e.description)}</span>
            \${personChip(p.people, e.paidBy, payerName, 'on')}
            <span class="text-sm font-semibold text-gray-900 w-16 text-right shrink-0 tabular-nums">\${fmt(e.amount)}</span>
            <button onclick="removeExpense('\${e.id}')" class="text-gray-300 hover:text-red-400 transition-colors shrink-0">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="flex items-center gap-1.5 mt-2 flex-wrap">
            <span class="text-xs text-gray-400 mr-0.5">Split</span>
            \${p.people.map(pr => personChip(p.people, pr.id, pr.name, splitIds.includes(pr.id) ? 'on' : 'off')).join('')}
          </div>
        </div>\`;
      }).join('')}</div>\` : ''}

      <!-- Receipts -->
      \${renderReceiptsSection(p, true)}

      <!-- Add expense -->
      \${has2 ? \`
        <div class="card p-4 space-y-4">
          <div class="text-sm font-semibold text-gray-900">Add an expense</div>
          <div class="flex gap-2">
            <input id="expDesc" type="text" placeholder="What for?" maxlength="100"
              class="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 placeholder-gray-400"
              onkeydown="if(event.key==='Enter') document.getElementById('expAmount').focus()">
            <div class="relative w-28">
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
              <input id="expAmount" type="number" placeholder="0.00" min="0.01" step="0.01"
                class="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                onkeydown="if(event.key==='Enter') addExpense()">
            </div>
          </div>
          <div>
            <div class="text-xs font-medium text-gray-500 mb-2">Paid by</div>
            <div id="payerChips" class="flex flex-wrap gap-1.5">\${buildPayerChips()}</div>
          </div>
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium text-gray-500">Split between</span>
              <button onclick="toggleAllSplit()" class="text-xs font-medium text-blue-600 hover:text-blue-700">Toggle all</button>
            </div>
            <div id="splitChips" class="flex flex-wrap gap-1.5">\${buildSplitChips()}</div>
          </div>
          <button onclick="addExpense()" class="w-full bg-black hover:bg-gray-800 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
            Add expense
          </button>
        </div>
      \` : \`<div class="card p-4 text-sm text-gray-600">Add at least 2 people to start recording expenses.</div>\`}

    </div>
  \`;

  if (has2 && hasExp) loadSettlements();
}

// ── Receipts ───────────────────────────────────────────────────────────────────

function renderReceiptsSection(p, editable) {
  const receipts = p.receipts || [];
  const canUpload = editable && receipts.length < 100;
  const quota = aiQuota;
  const canExtract = !quota || quota.canExtract;

  const rows = receipts.map(r => {
    const hasAmt = r.status === 'done' && r.extractedAmount != null;
    const imgUrl = '/receipt/' + p.id + '/' + r.id;
    const canExtractThis = editable && (r.status === 'pending' || r.status === 'error');
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
            <span class="text-sm font-semibold text-gray-900 tabular-nums">\${fmt(r.extractedAmount)}</span>
            \${editable ? \`<button onclick="useReceiptAmount(\${r.extractedAmount})" class="text-xs font-semibold bg-black text-white hover:bg-gray-800 px-2.5 py-1 rounded-lg transition-colors">Add as expense</button>\` : ''}
          \` : ''}
          \${canExtractThis ? (canExtract
            ? \`<button onclick="extractReceipt('\${r.id}')" class="text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-2.5 py-1 rounded-lg transition-colors">Scan total</button>\`
            : \`<span class="text-xs text-gray-400" title="Daily scan limit reached — resets at midnight UTC">Limit reached</span>\`
          ) : ''}
          \${editable ? \`
            <button onclick="deleteReceipt('\${r.id}')" class="text-gray-300 hover:text-red-400 transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          \` : ''}
        </div>
      </div>\`;
  }).join('');

  return \`
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 \${receipts.length > 0 ? 'border-b border-gray-100' : ''}">
        <span class="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.414 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
          Receipts
          \${receipts.length > 0 ? \`<span class="text-xs font-normal text-gray-400">\${receipts.length}/100</span>\` : ''}
        </span>
        <div class="flex items-center gap-3">
          \${canUpload ? \`
            <label class="cursor-pointer text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              Attach
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" class="hidden" onchange="uploadReceipt(this)">
            </label>
          \` : ''}
        </div>
      </div>
      \${receipts.length > 0 ? \`<div class="divide-y divide-gray-100">\${rows}</div>\` : (
        editable ? \`
          <label class="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors">
            <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <span class="text-sm text-gray-400">Attach a receipt photo — AI extracts the total</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" class="hidden" onchange="uploadReceipt(this)">
          </label>
        \` : ''
      )}
    </div>\`;
}

// ── Sealed view ────────────────────────────────────────────────────────────────

function renderSealedParty(p) {
  const peopleMap = Object.fromEntries(p.people.map(pr => [pr.id, pr.name]));
  const receipts = p.receipts || [];
  const total = p.expenses.reduce((s, e) => s + e.amount, 0);
  document.getElementById('app').innerHTML = \`
    <div class="fade-in space-y-3">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">\${escHtml(p.name)}</h2>
        <p class="text-sm text-gray-400">\${p.people.length} people · \${p.expenses.length} expenses · \${fmt(total)}</p>
      </div>
      <div class="rounded-xl px-4 py-3 flex items-center gap-2 text-sm" style="background:#1c1c1e;color:#d4d4d8;">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        Sealed\${p.sealedAt?' · '+new Date(p.sealedAt).toLocaleString():''} — locked, no further changes.
      </div>
      <div class="card px-3.5 py-3 flex flex-wrap gap-2">
        \${p.people.map(pr => personChip(p.people, pr.id, pr.name, 'on')).join('')}
      </div>
      \${p.expenses.length > 0 ? \`<div class="space-y-2">\${[...p.expenses].reverse().map(e => {
        const splitIds = e.splitBetween.length > 0 ? e.splitBetween : p.people.map(pr => pr.id);
        return \`<div class="card px-4 py-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="flex-1 font-medium text-gray-900 text-sm truncate">\${escHtml(e.description)}</span>
            <span class="text-xs font-medium px-2 py-0.5 rounded-full \${clr(p.people,e.paidBy).base} shrink-0">\${escHtml(peopleMap[e.paidBy]||'?')}</span>
            <span class="text-sm font-semibold text-gray-900 w-16 text-right tabular-nums">\${fmt(e.amount)}</span>
          </div>
          <div class="flex items-center gap-1.5 mt-2 flex-wrap">
            <span class="text-xs text-gray-400 mr-0.5">Split</span>
            \${p.people.map(pr => personChip(p.people, pr.id, pr.name, splitIds.includes(pr.id) ? 'on' : 'off')).join('')}
          </div>
        </div>\`;
      }).join('')}</div>\` : ''}
      \${receipts.length > 0 ? renderReceiptsSection(p, false) : ''}
      <div id="settlementCard" class="card px-4 py-3.5">
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

// ── Receipt actions ─────────────────────────────────────────────────────────────

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
    const q = await api('GET', '/api/ai/quota');
    if (!q.error) aiQuota = q;
    renderParty();
    alert(res.error);
    return;
  }
  if (res.aiQuota) aiQuota = res.aiQuota;
  const { aiQuota: _q, ...party } = res;
  currentParty = party;
  renderParty();
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
  document.getElementById('expDesc')?.focus();
  el.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Settlement ─────────────────────────────────────────────────────────────────

function toggleSettlement() {
  settlementOpen = !settlementOpen;
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
    if (body) body.innerHTML = \`<p class="text-center text-gray-900 font-medium py-1">All settled up! 🎉</p>\`;
    return;
  }
  const lines = res.settlements.map(s => \`\${pm[s.from]||'?'} → \${pm[s.to]||'?'} \${fmt(s.amount)}\`);
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
        <span class="font-semibold text-gray-900 tabular-nums text-sm">\${fmt(s.amount)}</span>
      </div>\`;
    }).join('')}</div>\`;
  }
}

// ── Invite / Seal / Share ────────────────────────────────────────────────────────

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
        <button onclick="copyUrl('\${url}', this)" class="bg-black hover:bg-gray-800 text-white text-sm px-3 py-2 rounded-lg shrink-0">Copy</button>
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
  });
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
  renderSnapshot(res);
}

function renderSnapshot(snap) {
  const p = snap.party;
  const pm = Object.fromEntries(p.people.map(pr => [pr.id, pr.name]));
  const receipts = p.receipts || [];
  const total = p.expenses.reduce((s, e) => s + e.amount, 0);
  document.getElementById('app').innerHTML = \`
    <div class="fade-in space-y-3">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">\${escHtml(p.name)}</h2>
        <p class="text-sm text-gray-400">\${p.people.length} people · \${p.expenses.length} expenses · \${fmt(total)}</p>
      </div>
      <div class="rounded-xl px-4 py-3 flex items-center gap-2 text-sm" style="background:#1c1c1e;color:#d4d4d8;">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        Immutable snapshot · \${new Date(snap.createdAt).toLocaleString()}
      </div>
      <div class="card px-3.5 py-3 flex flex-wrap gap-2">
        \${p.people.map(pr => personChip(p.people, pr.id, pr.name, 'on')).join('')}
      </div>
      \${p.expenses.length > 0 ? \`<div class="space-y-2">\${[...p.expenses].reverse().map(e => {
        const splitIds = e.splitBetween.length > 0 ? e.splitBetween : p.people.map(pr => pr.id);
        return \`<div class="card px-4 py-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="flex-1 font-medium text-gray-900 text-sm truncate">\${escHtml(e.description)}</span>
            <span class="text-xs font-medium px-2 py-0.5 rounded-full \${clr(p.people,e.paidBy).base} shrink-0">\${escHtml(pm[e.paidBy]||'?')}</span>
            <span class="text-sm font-semibold text-gray-900 w-16 text-right tabular-nums">\${fmt(e.amount)}</span>
          </div>
          <div class="flex items-center gap-1.5 mt-2 flex-wrap">
            <span class="text-xs text-gray-400 mr-0.5">Split</span>
            \${p.people.map(pr => personChip(p.people, pr.id, pr.name, splitIds.includes(pr.id) ? 'on' : 'off')).join('')}
          </div>
        </div>\`;
      }).join('')}</div>\` : ''}
      \${receipts.length > 0 ? renderReceiptsSection(p, false) : ''}
      \${snap.settlements?.length > 0 ? \`
        <div class="card px-4 py-3.5">
          <div class="text-sm font-semibold text-gray-900 mb-2">Settlement</div>
          <div class="space-y-2">\${snap.settlements.map(s => {
            const fc=clr(p.people,s.from), tc=clr(p.people,s.to);
            return \`<div class="flex items-center justify-between gap-3 py-0.5">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium px-2 py-0.5 rounded-full \${fc.base}">\${escHtml(pm[s.from]||'?')}</span>
                <span class="text-gray-400 text-xs">→</span>
                <span class="text-xs font-medium px-2 py-0.5 rounded-full \${tc.base}">\${escHtml(pm[s.to]||'?')}</span>
              </div>
              <span class="font-semibold text-gray-900 tabular-nums text-sm">\${fmt(s.amount)}</span>
            </div>\`;
          }).join('')}</div>
        </div>
      \` : snap.settlements?.length === 0 ? '<div class="card p-4 text-sm text-gray-900 font-medium text-center">All settled up! 🎉</div>' : ''}
    </div>
  \`;
}

// ── Custom dialog ──────────────────────────────────────────────────────────────

function showConfirm(title, message, label, onConfirm) {
  _confirmCb = onConfirm;
  document.getElementById('confirmOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'confirmOverlay';
  overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 fade-in';
  overlay.innerHTML = \`
    <div class="bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl">
      <h3 class="text-base font-bold text-gray-900 mb-1">\${title}</h3>
      <p class="text-sm text-gray-500 mb-5">\${message}</p>
      <div class="flex gap-2">
        <button onclick="document.getElementById('confirmOverlay').remove()" class="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
        <button onclick="_doConfirm()" class="flex-1 bg-black hover:bg-gray-800 text-white py-2 rounded-lg text-sm font-medium">\${label}</button>
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
  document.getElementById('app').innerHTML = \`<div class="flex justify-center py-20"><div class="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full spin"></div></div>\`;
}
function showError(msg) {
  document.getElementById('app').innerHTML = \`
    <div class="text-center py-20">
      <p class="text-red-400 font-medium mb-2">Something went wrong</p>
      <p class="text-gray-400 text-sm">\${escHtml(msg)}</p>
      <button onclick="goHome()" class="mt-4 text-blue-600 hover:text-blue-700 text-sm">← Home</button>
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
