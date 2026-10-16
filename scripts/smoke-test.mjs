import assert from 'node:assert/strict';

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3100';
const health = await fetch(new URL('/api/health', base), { signal: AbortSignal.timeout(10_000) });
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { ok: true, service: 'write-with-you' });
console.log('PASS GET /api/health: 200');

const home = await fetch(base, { signal: AbortSignal.timeout(10_000) });
assert.equal(home.status, 200);
const homepage = await home.text();
assert.match(homepage, /Your words/);
for (const label of ['Plan', 'Draft', 'Revise', 'Review', 'Explain', 'Folder']) assert.ok(homepage.includes(label));
assert.match(homepage, /Search essay history/);
console.log('PASS GET /: 200');

for (const path of ['/essays?view=folders', '/essays?folder=trash', '/sign-in', '/sign-up']) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200); console.log(`PASS GET ${path}: 200`);
}

const privateResponse = await fetch(new URL('/api/essays', base), { signal: AbortSignal.timeout(10_000) });
// With auth configured this is 401; without credentials it must fail closed at 503.
assert.ok([401, 503].includes(privateResponse.status));
const body = await privateResponse.json();
assert.equal(body.ok, false);
assert.ok(['UNAUTHENTICATED', 'UNAVAILABLE'].includes(body.error.code));
assert.equal(body.data, undefined);
console.log(`PASS unauthenticated GET /api/essays: ${privateResponse.status}; no student data returned`);
