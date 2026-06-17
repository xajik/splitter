import type { Party, Settlement } from './types';

export function calculateSettlements(party: Party): Settlement[] {
  const balances: Record<string, number> = {};

  for (const person of party.people) {
    balances[person.id] = 0;
  }

  for (const expense of party.expenses) {
    const payers = party.people.filter(p => p.id === expense.paidBy);
    if (payers.length === 0) continue;

    const splitIds = expense.splitBetween.length > 0
      ? expense.splitBetween
      : party.people.map(p => p.id);

    const share = expense.amount / splitIds.length;

    balances[expense.paidBy] = (balances[expense.paidBy] ?? 0) + expense.amount;
    for (const pid of splitIds) {
      balances[pid] = (balances[pid] ?? 0) - share;
    }
  }

  // Greedy debt minimization
  const settlements: Settlement[] = [];
  const debtors = Object.entries(balances)
    .filter(([, b]) => b < -0.005)
    .map(([id, b]) => ({ id, amount: -b }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(balances)
    .filter(([, b]) => b > 0.005)
    .map(([id, b]) => ({ id, amount: b }))
    .sort((a, b) => b.amount - a.amount);

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const transfer = Math.min(debtors[i].amount, creditors[j].amount);
    settlements.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(transfer * 100) / 100 });
    debtors[i].amount -= transfer;
    creditors[j].amount -= transfer;
    if (debtors[i].amount < 0.005) i++;
    if (creditors[j].amount < 0.005) j++;
  }

  return settlements;
}
