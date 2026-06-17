export interface Person {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string; // person id
  splitBetween: string[]; // person ids, empty = everyone
  date: number;
}

export interface Party {
  id: string;
  name: string;
  people: Person[];
  expenses: Expense[];
  createdAt: number;
  updatedAt: number;
  sealed: boolean;
  sealedAt?: number;
}

export interface Snapshot {
  id: string;
  partyId: string;
  party: Party;
  createdAt: number;
}

export interface Settlement {
  from: string; // person id
  to: string;   // person id
  amount: number;
}

export interface Env {
  PARTIES: KVNamespace;
}
