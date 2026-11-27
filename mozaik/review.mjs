import { createAgent, createHuman, defineRuntime, RuntimeState, SituationSpecification } from '@mozaik-ai/core';
import { setImmediate } from 'node:timers/promises';

// https://github.com/jigjoy-ai/mozaik#situation-handlers
export async function runReview(quoteCheck, settlementCheck, explain) {
  class ReviewState extends RuntimeState {
    findings = new Map();
  }
  const state = new ReviewState();
  const { initializeRuntime, join, leave, sendMessage } = defineRuntime();
  initializeRuntime({ state });
  const requester = createHuman({ name: 'HelixBox', capabilities: [], handlers: [] });
  class ReviewRequested extends SituationSpecification {
    isSatisfiedBy({ event }) {
      return event.type === 'message.sent' && event.producerId === requester.getId();
    }
  }
  const reviewers = [['Quote and budget', quoteCheck], ['Solana settlement', settlementCheck]].map(([name, check]) => {
    let ready;
    const done = new Promise(resolve => { ready = resolve; });
    const agent = createAgent({
      name, instruction: 'Run one read-only evidence check. Never sign or send a payment.',
      capabilities: ['payment-review'], tools: [],
      handlers: [{
        specification: new ReviewRequested(),
        processor: { async apply() {
          const startedAt = performance.now();
          // Let both participants handle the same event before reading their separate evidence.
          await setImmediate();
          let finding;
          try {
            finding = await check();
            if (explain) finding.note = await explain(name, finding);
          }
          catch { finding = { status: 'hold', source: name, detail: 'Evidence unavailable; do not retry.' }; }
          const result = { name, ...finding, startedAt, endedAt: performance.now() };
          state.findings.set(name, result);
          ready(result);
        } },
      }],
    });
    return { agent, done };
  });
  join(requester);
  for (const { agent } of reviewers) join(agent);
  let timeout;
  try {
    sendMessage('Review this sandbox purchase.', requester.getId());
    await Promise.race([
      Promise.all(reviewers.map(({ done }) => done)),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Review timed out. No debit was made.')), 20_000); }),
    ]);
    return [...state.findings.values()];
  } finally {
    clearTimeout(timeout);
    for (const { agent } of reviewers) leave(agent);
    leave(requester);
  }
}
