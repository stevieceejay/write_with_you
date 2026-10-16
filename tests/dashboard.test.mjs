import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDashboard } from '../src/server/dashboard-loader.ts';
import { AppError } from '../src/server/errors.ts';
import { dashboardDiagnostic, errorCodes } from '../src/server/error-diagnostics.ts';

const dependencies = overrides => ({ signedIn: async () => true, listEssays: async () => ({ items: [], total: 0 }), listSubjects: async () => [], ...overrides });
test('an anonymous dashboard does not query private essay data', async () => {
  let queried = false;
  const data = await loadDashboard({}, dependencies({ signedIn: async () => false, listEssays: async () => { queried = true; throw new Error('Private data queried'); } }));
  assert.equal(data.authenticated, false); assert.equal(queried, false); assert.deepEqual(data.initialEssays, []);
});
test('database failure preserves the authenticated session and reports a load error', async () => {
  let reported;
  const failure = Object.assign(new Error('Sensitive connection details must not reach the browser'), { code: 'P2021' });
  const data = await loadDashboard({}, dependencies({ listEssays: async () => { throw failure; }, reportError: error => { reported = error; } }));
  assert.equal(data.authenticated, true); assert.match(data.loadError, /You are signed in/); assert.deepEqual(data.initialEssays, []);
  assert.equal(reported, failure); assert.ok(!JSON.stringify(data).includes('Sensitive'));
});
test('temporary backend unavailability does not turn a signed-in student into a guest', async () => {
  const data = await loadDashboard({}, dependencies({ listSubjects: async () => { throw new AppError('UNAVAILABLE', 'Service unavailable'); } }));
  assert.equal(data.authenticated, true); assert.match(data.loadError, /couldn’t load your essays/);
});
test('verified session with an account restriction explains the restriction', async () => {
  const data = await loadDashboard({}, dependencies({ listEssays: async () => { throw new AppError('FORBIDDEN', 'Verify your email address before saving essays.'); } }));
  assert.equal(data.authenticated, true); assert.match(data.loadError, /Verify your email/);
});
test('a session that expires during loading returns no private records', async () => {
  const data = await loadDashboard({}, dependencies({ listEssays: async () => { throw new AppError('UNAUTHENTICATED', 'Sign in'); } }));
  assert.equal(data.authenticated, false); assert.match(data.loadError, /session ended/); assert.deepEqual(data.initialEssays, []);
});
test('identity verification failures do not grant signed-in access', async () => {
  const data = await loadDashboard({}, dependencies({ signedIn: async () => { throw new Error('Network failed'); } }));
  assert.equal(data.authenticated, false); assert.match(data.loadError, /check your sign-in session/);
});
test('successful loading returns saved data with serializable dates', async () => {
  const data = await loadDashboard({ query: 'Biology' }, dependencies({ listEssays: async input => { assert.equal(input.query, 'Biology'); return { items: [{ id: 'owned-essay', createdAt: new Date('2026-10-15T00:00:00Z') }], total: 1 }; } }));
  assert.equal(data.authenticated, true); assert.equal(data.initialEssays[0].createdAt, '2026-10-15T00:00:00.000Z'); assert.equal(data.total, 1); assert.equal(data.loadError, undefined);
});

test('dashboard diagnostics find nested database causes and reveal no connection details', () => {
  const failure = { code: 'P2021', message: 'postgresql://student:private-password@private-host/db', meta: { driverAdapterError: { cause: { code: '42P01', message: 'Sensitive query' } } } };
  assert.deepEqual(errorCodes(failure), ['P2021', '42P01']);
  const diagnostic = dashboardDiagnostic(failure, 'DATA');
  assert.match(diagnostic, /stage=DATA code=P2021,42P01/); assert.match(diagnostic, /migration status/);
  for (const secret of ['private-password', 'private-host', 'postgresql:', 'Sensitive query']) assert.ok(!diagnostic.includes(secret));
});
test('dashboard diagnostics handle connection aggregates, cycles, and unknown codes safely', () => {
  const failure = new AggregateError([Object.assign(new Error('private error'), { code: 'EACCES' })]);
  failure.cause = failure;
  assert.deepEqual(errorCodes(failure), ['EACCES']);
  assert.match(dashboardDiagnostic(failure, 'DATA'), /denied access/);
  assert.deepEqual(errorCodes({ code: 'sk_test_not-a-diagnostic' }), ['UNKNOWN']);
});
test('dashboard diagnostics distinguish session checks from data failures', async () => {
  let stage;
  await loadDashboard({}, dependencies({ signedIn: async () => { throw new Error('Failed'); }, reportError: (_, value) => { stage = value; } }));
  assert.equal(stage, 'SESSION');
  await loadDashboard({}, dependencies({ listEssays: async () => { throw new Error('Failed'); }, reportError: (_, value) => { stage = value; } }));
  assert.equal(stage, 'DATA');
});
