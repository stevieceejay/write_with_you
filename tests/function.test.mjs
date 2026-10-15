import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import hello from '../hello.ts';
import { authorized } from '../src/shared/bearer.ts';

const key = randomBytes(32).toString('base64url');
process.env.FUNCTION_API_KEY = key;
function request(body, token = key) {
  return new Request('https://function.example/', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
}
test('the function rejects missing or incorrect credentials before parsing input', async () => {
  assert.equal((await hello(request({ text: 'Hello' }, 'wrong'))).status, 401);
  assert.equal((await hello(new Request('https://function.example/'))).status, 401);
  assert.equal(authorized(`Bearer ${key}`, undefined), false);
  assert.equal(authorized('Bearer undefined', undefined), false);
});
test('the function measures submitted text without external services', async () => {
  const response = await hello(request({ text: 'Clear ideas matter.\n\nExamples help.' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { wordCount: 5, characterCount: 35, paragraphCount: 2 });
});
test('empty writing has zero words and paragraphs', async () => {
  const response = await hello(request({ text: '' }));
  assert.deepEqual(await response.json(), { wordCount: 0, characterCount: 0, paragraphCount: 0 });
});
test('the function rejects unexpected ownership fields', async () => {
  assert.equal((await hello(request({ text: 'Hello', userId: 'forged' }))).status, 400);
});
test('only POST is accepted for authenticated calls', async () => {
  const response = await hello(new Request('https://function.example/', { headers: { authorization: `Bearer ${key}` } }));
  assert.equal(response.status, 405);
});
