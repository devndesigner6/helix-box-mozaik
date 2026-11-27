import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { runReview } from './review.mjs';

const BUDGET = 5000;
const COST = 100;

export function openSandbox(path, { fulfill, explain } = {}) {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, reviewed INTEGER NOT NULL DEFAULT 0, receipt TEXT, result TEXT
  )`);
  const inflight = new Map();
  const balance = () => BUDGET - COST * db.prepare('SELECT count(*) AS count FROM purchases WHERE receipt IS NOT NULL').get().count;
  const get = id => {
    const row = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
    if (!row) throw new Error('Unknown request. Create a test quote first.');
    return row;
  };
  const paid = row => ({ receipt: row.receipt, result: row.result, remaining: balance(), cost: COST });
  return {
    quote() {
      const id = randomUUID();
      const expiresAt = Date.now() + 5 * 60_000;
      db.prepare('INSERT INTO purchases(id, expires_at) VALUES (?, ?)').run(id, expiresAt);
      return { id, expiresAt, cost: COST, remaining: balance(), budget: BUDGET, asset: 'test credits',
        service: fulfill ? 'Model call' : 'Spend report', source: 'Local sandbox tariff and ledger' };
    },
    async review(id) {
      get(id);
      const agents = await runReview(
        () => {
          const remaining = balance();
          const valid = remaining >= COST && get(id).expires_at > Date.now();
          return { status: valid ? 'clear' : 'hold', source: 'Sandbox tariff, quote expiry and available budget',
            detail: `Quote: ${(COST / 100).toFixed(2)} test credits. Available: ${(remaining / 100).toFixed(2)}.` };
        },
        () => {
          const { receipt } = get(id);
          return receipt ? { status: 'already_paid', source: 'Local sandbox settlement ledger', detail: `Existing receipt ${receipt}.` }
            : { status: 'clear', source: 'Local sandbox settlement ledger', detail: 'No debit for this request.' };
        }, explain,
      );
      const decision = get(id).receipt ? 'already_paid' : agents.every(agent => agent.status === 'clear') ? 'ready' : 'hold';
      db.prepare('UPDATE purchases SET reviewed = ? WHERE id = ?').run(Number(decision === 'ready'), id);
      return { id, decision, agents, remaining: balance() };
    },
    async approve(id) {
      const row = get(id);
      if (row.receipt) return paid(row);
      if (!row.reviewed) throw new Error('Review the quote before approving it.');
      if (inflight.has(id)) return inflight.get(id);
      if (row.expires_at <= Date.now() || balance() < COST) throw new Error('Quote expired or test budget exhausted.');
      const job = (async () => {
        const modelOutput = fulfill ? await fulfill() : null;
        db.exec('BEGIN IMMEDIATE');
        try {
          const current = get(id);
          const remaining = balance();
          if (current.receipt) {
            const response = paid(current);
            db.exec('COMMIT');
            return response;
          }
          if (!current.reviewed || current.expires_at <= Date.now() || remaining < COST) throw new Error('Review expired or test budget exhausted. No debit was made.');
          const result = modelOutput ?? `Spend report: ${(COST / 100).toFixed(2)} spent; ${((remaining - COST) / 100).toFixed(2)} test credits left.`;
          db.prepare('UPDATE purchases SET receipt = ?, result = ? WHERE id = ?').run(`sandbox:${id}`, result, id);
          const response = paid(get(id));
          db.exec('COMMIT');
          return response;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      })();
      inflight.set(id, job);
      try { return await job; }
      finally { inflight.delete(id); }
    },
    close() { db.close(); },
  };
}
