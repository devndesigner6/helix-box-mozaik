import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { openSandbox } from './sandbox.mjs';

const key = process.env.MOZAIK_OPENAI_API_KEY;
async function infer(prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ model: 'gpt-4.1-mini', max_completion_tokens: 150,
        messages: [{ role: 'user', content: prompt }] }),
    });
    if (!response.ok) throw new Error('Model provider unavailable. No test credits spent.');
    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim();
    if (!result) throw new Error('Model returned no text. No test credits spent.');
    return result;
}
export function makeSandboxServer(sandbox, modelEnabled = false) {
  const server = createServer(async (req, res) => {
  const reply = (status, body) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
  if (req.headers.host !== `127.0.0.1:${server.address()?.port}` || req.headers.origin) return reply(403, { error: 'Local native client only.' });
  if (req.method === 'GET' && req.url === '/health') return reply(200, { mode: 'test-credits', modelEnabled });
  if (req.method !== 'POST' || req.headers['x-helixbox-sandbox'] !== '1') return reply(404, { error: 'Unknown sandbox route.' });
  try {
    if (req.url === '/quote') return reply(201, sandbox.quote());
    const match = req.url?.match(/^\/(review|approve)\/([0-9a-f-]{36})$/);
    if (!match) return reply(404, { error: 'Unknown sandbox route.' });
    return reply(200, await sandbox[match[1]](match[2]));
  } catch (error) {
    const message = error instanceof Error && /^(Unknown request|Review|Quote expired|Model |Test budget)/.test(error.message)
      ? error.message : 'Sandbox request failed. Reopen this request to check its receipt.';
    return reply(409, { error: message });
  }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sandbox = openSandbox(process.env.MOZAIK_SANDBOX_DB || 'review.sqlite', {
    fulfill: key ? () => infer('In two short sentences, explain why a checkout timeout should not automatically trigger a second payment.') : undefined,
    explain: key ? (name, finding) => infer(`You are the ${name} reviewer. Explain the next step in one short sentence, using only this finding: ${finding.status}. ${finding.detail} Do not repeat or invent amounts or identifiers.`) : undefined,
  });
  makeSandboxServer(sandbox, Boolean(key)).listen(4197, '127.0.0.1', () => console.log('Mozaik sandbox listening on http://127.0.0.1:4197; no mainnet access.'));
}
