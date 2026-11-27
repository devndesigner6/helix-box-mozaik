import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSandbox } from './sandbox.mjs';

test('one approved request spends test credits once, even when submitted concurrently', async () => {
  const sandbox = openSandbox(':memory:');
  const quote = sandbox.quote();
  const review = await sandbox.review(quote.id);
  assert.equal(review.decision, 'ready');
  assert.ok(Math.max(...review.agents.map(agent => agent.startedAt)) < Math.min(...review.agents.map(agent => agent.endedAt)));
  assert.equal(review.agents.length, 2);
  const [first, second] = await Promise.all([sandbox.approve(quote.id), sandbox.approve(quote.id)]);
  assert.deepEqual(first.receipt, second.receipt);
  assert.equal(first.remaining, 4900);
  assert.equal(second.remaining, 4900);
  assert.equal((await sandbox.review(quote.id)).decision, 'already_paid');
  sandbox.close();
});

test('an unknown id cannot be reviewed or debited; an unreviewed quote cannot be approved', async () => {
  const sandbox = openSandbox(':memory:');
  await assert.rejects(sandbox.review('unknown'), /Unknown request/);
  await assert.rejects(sandbox.approve(sandbox.quote().id), /Review/);
  sandbox.close();
});

test('the same receipt survives restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'helixbox-mozaik-'));
  const path = join(directory, 'test.sqlite');
  let sandbox = openSandbox(path);
  try {
    const { id } = sandbox.quote();
    await sandbox.review(id);
    const original = await sandbox.approve(id);
    sandbox.close();
    sandbox = openSandbox(path);
    assert.deepEqual(await sandbox.approve(id), original);
  } finally {
    sandbox.close();
    await rm(directory, { recursive: true });
  }
});

test('a model failure does not spend test credits', async () => {
  const sandbox = openSandbox(':memory:', { fulfill: async () => { throw new Error('Model offline'); } });
  const { id } = sandbox.quote();
  await sandbox.review(id);
  await assert.rejects(sandbox.approve(id), /Model offline/);
  assert.equal(sandbox.quote().remaining, 5000);
  sandbox.close();
});

test('unavailable agent evidence holds approval', async () => {
  const sandbox = openSandbox(':memory:', { explain: async () => { throw new Error('Agent unavailable'); } });
  const { id } = sandbox.quote();
  assert.equal((await sandbox.review(id)).decision, 'hold');
  await assert.rejects(sandbox.approve(id), /Review/);
  sandbox.close();
});
