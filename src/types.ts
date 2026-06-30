export interface Person {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  splitBetween: string[];
  date: number;
}

export type ReceiptStatus = 'pending' | 'processing' | 'done' | 'error';

export interface Receipt {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  status: ReceiptStatus;
  extractedAmount?: number;
  extractedText?: string;
}

export interface Party {
  id: string;
  name: string;
  people: Person[];
  expenses: Expense[];
  receipts: Receipt[];
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
  from: string;
  to: string;
  amount: number;
}

export interface Env {
  PARTIES: KVNamespace;
  RECEIPTS: R2Bucket;
  AI: Ai;
  // Static API key (set via `wrangler secret put APP_KEY`); injected into the
  // served page at runtime so the SPA can send it — never committed to the repo.
  APP_KEY?: string;
}
