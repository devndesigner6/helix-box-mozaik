import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { makeSandboxServer } from './server.mjs';
import { openSandbox } from './sandbox.mjs';

test('native HTTP client can review and recover one payment, while browser origins cannot debit', async () => {
  const sandbox = openSandbox(':memory:');
  const server = makeSandboxServer(sandbox).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (route, extra = {}) => fetch(base + route, { method: 'POST', headers: { 'x-helixbox-sandbox': '1', ...extra } });
    const quote = await (await post('/quote')).json();
    const review = await (await post(`/review/${quote.id}`)).json();
    assert.equal(review.decision, 'ready');
    assert.equal(review.agents.length, 2);
    assert.equal((await post(`/approve/${quote.id}`, { Origin: 'https://example.com' })).status, 403);
    const paid = await (await post(`/approve/${quote.id}`)).json();
    assert.equal(paid.remaining, 4900);
    const retry = await (await post(`/review/${quote.id}`)).json();
    assert.equal(retry.decision, 'already_paid');
    assert.deepEqual(await (await post(`/approve/${quote.id}`)).json(), paid);
  } finally {
    await new Promise(resolve => server.close(resolve));
    sandbox.close();
  }
});
