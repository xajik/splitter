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
        brand: { 50:'#f0fdf4',100:'#dcfce7',500:'#22c55e',600:'#16a34a',700:'#15803d' }
      }
    }
  }
}
</script>
<style>
  .fade-in { animation: fadeIn .2s ease; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
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

<main class="max-w-2xl mx-auto px-4 py-8" id="app">
  <!-- Content injected by JS -->
</main>

<script>
const API = '';
let currentPartyId = null;
let currentParty = null;

// ── Routing ──────────────────────────────────────────────────────────────────

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

// ── History (cookies) ────────────────────────────────────────────────────────

function getHistory() {
  const c = document.cookie.split(';').find(x => x.trim().startsWith('splitter_history='));
  if (!c) return [];
  try { return JSON.parse(decodeURIComponent(c.split('=')[1])); } catch { return []; }
}

function addToHistory(entry) {
  const hist = getHistory().filter(e => e.id !== entry.id);
  hist.unshift(entry);
  const trimmed = hist.slice(0, 10);
  document.cookie = 'splitter_history=' + encodeURIComponent(JSON.stringify(trimmed)) + '; max-age=31536000; path=/; SameSite=Lax';
}

function loadHistoryBtn() {
  const hist = getHistory();
  const btn = document.getElementById('historyBtn');
  if (hist.length > 0) btn.classList.remove('hidden');
}

function showHistory() {
  const hist = getHistory();
  if (!hist.length) return;
  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="fade-in">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">Recent parties</h2>
      <div class="space-y-3">
        \${hist.map(e => \`
          <div class="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:border-brand-300 cursor-pointer" onclick="location.hash='/\${e.type === 'share' ? 'share' : 'party'}/\${e.id}'">
            <div>
              <div class="font-medium text-gray-900">\${escHtml(e.name)}</div>
              <div class="text-sm text-gray-500">\${e.type === 'share' ? 'Shared snapshot' : 'Party'} · \${new Date(e.date).toLocaleDateString()}</div>
            </div>
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div>
        \`).join('')}
      </div>
      <button onclick="goHome()" class="mt-6 text-sm text-brand-600 hover:text-brand-700">← Back</button>
    </div>
  \`;
}

// ── Home ─────────────────────────────────────────────────────────────────────

function renderHome() {
  currentPartyId = null;
  currentParty = null;
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
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent mb-4"
          onkeydown="if(event.key==='Enter') createParty()">
        <button onclick="createParty()" id="createBtn"
          class="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition-colors">
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

// ── Party ─────────────────────────────────────────────────────────────────────

async function loadParty(id) {
  currentPartyId = id;
  showLoading();
  const res = await api('GET', '/api/parties/' + id);
  if (res.error) return showError(res.error);
  currentParty = res;
  addToHistory({ id: res.id, name: res.name, date: Date.now(), type: 'party' });
  renderParty();
}

function renderParty() {
  const p = currentParty;
  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="fade-in space-y-6">
      <!-- Header -->
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">\${escHtml(p.name)}</h2>
          <p class="text-sm text-gray-500 mt-0.5">\${p.people.length} people · \${p.expenses.length} expenses</p>
        </div>
        <button onclick="createShare()" class="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
          Share
        </button>
      </div>

      <!-- People -->
      <div class="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 class="font-semibold text-gray-900 mb-3">People</h3>
        <div id="peopleList" class="flex flex-wrap gap-2 mb-3">
          \${p.people.map(person => \`
            <span class="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full">
              \${escHtml(person.name)}
              <button onclick="removePerson('\${person.id}')" class="ml-1 text-gray-400 hover:text-red-500 transition-colors text-xs leading-none">✕</button>
            </span>
          \`).join('')}
        </div>
        <div class="flex gap-2">
          <input id="personInput" type="text" placeholder="Name…" maxlength="50"
            class="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            onkeydown="if(event.key==='Enter') addPerson()">
          <button onclick="addPerson()" class="bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">Add</button>
        </div>
      </div>

      <!-- Add Expense -->
      \${p.people.length >= 2 ? renderExpenseForm(p) : \`
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
          Add at least 2 people to start recording expenses.
        </div>
      \`}

      <!-- Expenses list -->
      \${p.expenses.length > 0 ? renderExpenseList(p) : ''}

      <!-- Settlements -->
      \${p.people.length >= 2 && p.expenses.length > 0 ? renderSettlements(p) : ''}
    </div>
  \`;
}

function renderExpenseForm(p) {
  const opts = p.people.map(pr => \`<option value="\${pr.id}">\${escHtml(pr.name)}</option>\`).join('');
  const checks = p.people.map(pr => \`
    <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" value="\${pr.id}" class="split-cb rounded accent-brand-600" checked>
      \${escHtml(pr.name)}
    </label>
  \`).join('');
  return \`
    <div class="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 class="font-semibold text-gray-900 mb-3">Add expense</h3>
      <div class="space-y-3">
        <div class="flex gap-2">
          <input id="expDesc" type="text" placeholder="What for?" maxlength="100"
            class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            onkeydown="if(event.key==='Enter') document.getElementById('expAmount').focus()">
          <div class="relative w-28">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input id="expAmount" type="number" placeholder="0.00" min="0.01" step="0.01"
              class="w-full border border-gray-300 rounded-lg pl-6 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              onkeydown="if(event.key==='Enter') addExpense()">
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600 shrink-0">Paid by</span>
          <select id="expPayer" class="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">\${opts}</select>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-sm text-gray-600">Split between</span>
            <button onclick="toggleAllSplit()" class="text-xs text-brand-600 hover:text-brand-700">Toggle all</button>
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1">\${checks}</div>
        </div>
        <button onclick="addExpense()" class="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 rounded-lg text-sm transition-colors">
          Add expense
        </button>
      </div>
    </div>
  \`;
}

function renderExpenseList(p) {
  const peopleMap = Object.fromEntries(p.people.map(pr => [pr.id, pr.name]));
  return \`
    <div class="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 class="font-semibold text-gray-900 mb-3">Expenses</h3>
      <div class="space-y-2">
        \${[...p.expenses].reverse().map(e => {
          const splits = e.splitBetween.length > 0
            ? e.splitBetween.map(id => peopleMap[id] || '?').join(', ')
            : 'everyone';
          return \`
            <div class="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-900 text-sm truncate">\${escHtml(e.description)}</div>
                <div class="text-xs text-gray-500">Paid by \${escHtml(peopleMap[e.paidBy] || '?')} · Split: \${escHtml(splits)}</div>
              </div>
              <div class="flex items-center gap-2 ml-3">
                <span class="font-semibold text-gray-900">$\${e.amount.toFixed(2)}</span>
                <button onclick="removeExpense('\${e.id}')" class="text-gray-300 hover:text-red-400 transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          \`;
        }).join('')}
      </div>
      <div class="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm font-semibold text-gray-900">
        <span>Total</span>
        <span>$\${p.expenses.reduce((s,e) => s + e.amount, 0).toFixed(2)}</span>
      </div>
    </div>
  \`;
}

function renderSettlements(p) {
  // Fetch settlements from API
  return \`<div id="settlementCard" class="bg-white rounded-2xl border border-gray-200 p-5">
    <h3 class="font-semibold text-gray-900 mb-1">Settlement</h3>
    <div id="settlementBody" class="text-sm text-gray-500">Calculating…</div>
  </div>\`;
}

async function loadSettlements() {
  if (!currentPartyId) return;
  const card = document.getElementById('settlementCard');
  if (!card) return;
  const res = await api('GET', '/api/parties/' + currentPartyId + '/settlements');
  const body = document.getElementById('settlementBody');
  if (!body) return;
  if (res.error) { body.textContent = res.error; return; }
  if (res.settlements.length === 0) {
    body.innerHTML = '<span class="text-brand-600 font-medium">All settled up! 🎉</span>';
    return;
  }
  const peopleMap = Object.fromEntries(currentParty.people.map(pr => [pr.id, pr.name]));
  body.innerHTML = \`<div class="space-y-2 mt-2">\${res.settlements.map(s => \`
    <div class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
      <span>\${escHtml(peopleMap[s.from] || '?')} owes \${escHtml(peopleMap[s.to] || '?')}</span>
      <span class="font-semibold text-gray-900">$\${s.amount.toFixed(2)}</span>
    </div>
  \`).join('')}</div>\`;
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
  renderParty();
  document.getElementById('personInput')?.focus();
  if (currentParty.expenses.length > 0) loadSettlements();
}

async function removePerson(personId) {
  if (!confirm('Remove this person? Their expenses will also be removed.')) return;
  const res = await api('DELETE', '/api/parties/' + currentPartyId + '/people/' + personId);
  if (res.error) return alert(res.error);
  currentParty = res;
  renderParty();
  if (currentParty.expenses.length > 0) loadSettlements();
}

// ── Expense actions ───────────────────────────────────────────────────────────

async function addExpense() {
  const desc = document.getElementById('expDesc').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const paidBy = document.getElementById('expPayer').value;
  const splitBetween = [...document.querySelectorAll('.split-cb:checked')].map(c => c.value);

  if (!desc) return shake('expDesc');
  if (!amount || amount <= 0) return shake('expAmount');
  if (splitBetween.length === 0) return alert('Select at least one person to split with.');

  const allIds = currentParty.people.map(p => p.id);
  const isSplitAll = splitBetween.length === allIds.length && allIds.every(id => splitBetween.includes(id));

  const res = await api('POST', '/api/parties/' + currentPartyId + '/expenses', {
    description: desc, amount, paidBy, splitBetween: isSplitAll ? [] : splitBetween
  });
  if (res.error) return alert(res.error);
  currentParty = res;
  renderParty();
  loadSettlements();
}

async function removeExpense(expenseId) {
  const res = await api('DELETE', '/api/parties/' + currentPartyId + '/expenses/' + expenseId);
  if (res.error) return alert(res.error);
  currentParty = res;
  renderParty();
  if (currentParty.expenses.length > 0) loadSettlements();
}

function toggleAllSplit() {
  const cbs = document.querySelectorAll('.split-cb');
  const allChecked = [...cbs].every(c => c.checked);
  cbs.forEach(c => c.checked = !allChecked);
}

// ── Share ─────────────────────────────────────────────────────────────────────

async function createShare() {
  const res = await api('POST', '/api/parties/' + currentPartyId + '/share');
  if (res.error) return alert(res.error);
  const url = location.origin + '/#/share/' + res.id;
  addToHistory({ id: res.id, name: currentParty.name + ' (snapshot)', date: Date.now(), type: 'share' });
  showShareModal(url);
}

function showShareModal(url) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 fade-in';
  overlay.innerHTML = \`
    <div class="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
      <h3 class="text-lg font-bold text-gray-900 mb-2">Share link created</h3>
      <p class="text-sm text-gray-500 mb-4">This is an immutable snapshot of the current state.</p>
      <div class="flex gap-2">
        <input value="\${url}" readonly class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50 focus:outline-none">
        <button onclick="copyUrl('\${url}', this)" class="bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-2 rounded-lg transition-colors shrink-0">Copy</button>
      </div>
      <button onclick="this.closest('.fixed').remove()" class="mt-4 w-full text-sm text-gray-500 hover:text-gray-700">Close</button>
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
  addToHistory({ id: id, name: res.party.name + ' (snapshot)', date: Date.now(), type: 'share' });
  loadHistoryBtn();
  renderSnapshot(res);
}

function renderSnapshot(snap) {
  const p = snap.party;
  const peopleMap = Object.fromEntries(p.people.map(pr => [pr.id, pr.name]));
  const app = document.getElementById('app');
  app.innerHTML = \`
    <div class="fade-in space-y-6">
      <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-700">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        Immutable snapshot · Created \${new Date(snap.createdAt).toLocaleString()}
      </div>
      <div>
        <h2 class="text-2xl font-bold text-gray-900">\${escHtml(p.name)}</h2>
        <p class="text-sm text-gray-500 mt-0.5">\${p.people.length} people · \${p.expenses.length} expenses</p>
      </div>
      <div class="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 class="font-semibold text-gray-900 mb-2">People</h3>
        <div class="flex flex-wrap gap-2">
          \${p.people.map(pr => \`<span class="bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full">\${escHtml(pr.name)}</span>\`).join('')}
        </div>
      </div>
      \${p.expenses.length > 0 ? \`
        <div class="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 class="font-semibold text-gray-900 mb-3">Expenses</h3>
          <div class="space-y-2">
            \${[...p.expenses].reverse().map(e => \`
              <div class="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-gray-900 text-sm truncate">\${escHtml(e.description)}</div>
                  <div class="text-xs text-gray-500">Paid by \${escHtml(peopleMap[e.paidBy] || '?')} · Split: \${e.splitBetween.length > 0 ? e.splitBetween.map(id => escHtml(peopleMap[id] || '?')).join(', ') : 'everyone'}</div>
                </div>
                <span class="font-semibold text-gray-900 ml-3">$\${e.amount.toFixed(2)}</span>
              </div>
            \`).join('')}
          </div>
          <div class="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm font-semibold text-gray-900">
            <span>Total</span>
            <span>$\${p.expenses.reduce((s,e) => s + e.amount, 0).toFixed(2)}</span>
          </div>
        </div>
      \` : ''}
      \${snap.settlements && snap.settlements.length > 0 ? \`
        <div class="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 class="font-semibold text-gray-900 mb-3">Settlement</h3>
          <div class="space-y-2">
            \${snap.settlements.map(s => \`
              <div class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <span>\${escHtml(peopleMap[s.from] || '?')} owes \${escHtml(peopleMap[s.to] || '?')}</span>
                <span class="font-semibold text-gray-900">$\${s.amount.toFixed(2)}</span>
              </div>
            \`).join('')}
          </div>
        </div>
      \` : snap.settlements && snap.settlements.length === 0 ? \`
        <div class="bg-brand-50 border border-brand-200 rounded-xl p-4 text-sm text-brand-700 font-medium text-center">All settled up! 🎉</div>
      \` : ''}
    </div>
  \`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showLoading() {
  document.getElementById('app').innerHTML = \`
    <div class="flex justify-center py-20">
      <div class="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full spin"></div>
    </div>\`;
}

function showError(msg) {
  document.getElementById('app').innerHTML = \`
    <div class="text-center py-20">
      <p class="text-red-500 font-medium mb-2">Error</p>
      <p class="text-gray-500 text-sm">\${escHtml(msg)}</p>
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

// After renderParty, load settlements
const origRenderParty = renderParty;
function renderParty() {
  origRenderParty();
  if (currentParty && currentParty.expenses.length > 0 && currentParty.people.length >= 2) {
    loadSettlements();
  }
}
</script>
</body>
</html>`;
}
