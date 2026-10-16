import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createBackend } from '../src/server/backend.ts';
import { AppError, publicError } from '../src/server/errors.ts';
import * as validation from '../src/server/validation.ts';
import { validateExplanation } from '../src/server/ai-contract.ts';
import { readJSON, sameOrigin } from '../src/server/http-input.ts';

const actorId = randomUUID(), essayId = randomUUID(), versionId = randomUUID();
const ai = { model: 'test-model', assertConfigured() {}, validateExplanation,
  async generate() { throw new Error('No provider call expected'); } };
const code = expected => error => error instanceof AppError && error.code === expected;
function backend(db = {}, authenticate = async () => ({ id: actorId })) {
  return createBackend({ authenticate, database: () => db, ai });
}
const validDocument = () => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A student idea.' }] }] });

for (const name of Object.keys(backend())) {
  test(`${name} authenticates before accessing the database`, async () => {
    let databaseAccessed = false;
    const app = createBackend({
      authenticate: async () => { throw new AppError('UNAUTHENTICATED', 'Sign in'); },
      database: () => { databaseAccessed = true; throw new Error('Unexpected database access'); }, ai,
    });
    await assert.rejects(app[name]({}), code('UNAUTHENTICATED'));
    assert.equal(databaseAccessed, false);
  });
}

test('a browser-supplied userId cannot establish identity', async () => {
  const app = backend({ $transaction() { throw new Error('No write should occur'); } });
  await assert.rejects(app.createEssay({ title: 'My essay', userId: randomUUID() }), code('VALIDATION_ERROR'));
});

const deniedWrites = {
  updateEssay: { essayId, title: 'Changed' }, trashEssay: { essayId }, restoreEssay: { essayId },
  saveDraft: { essayId, expectedLockVersion: 0, document: validDocument() },
  saveFormatting: { essayId, expectedLockVersion: 0, formatting: { fontSize: 14 } },
  saveSettings: { essayId, expectedLockVersion: 0, audience: 'Academic' },
  saveOutline: { essayId, expectedLockVersion: 0, nodes: [] },
  answerPlanning: { essayId, expectedLockVersion: 0, step: 'TOPIC', answer: 'Biology' },
  createSnapshot: { essayId, expectedLockVersion: 0 },
  restoreSnapshot: { essayId, expectedLockVersion: 0, snapshotId: randomUUID() },
  saveSource: { essayId, title: 'A reference', authors: [] }, deleteSource: { essayId, sourceId: randomUUID() },
  updateAnnotation: { essayId, expectedLockVersion: 0, annotationId: randomUUID(), role: 'EXAMPLE', reviewStatus: 'CONFIRMED' },
  annotatePassage: { essayId, expectedLockVersion: 0, blockId: randomUUID(), from: 0, to: 5, role: 'THESIS' },
  citeSource: { essayId, expectedLockVersion: 0, annotationId: randomUUID(), sourceId: randomUUID() },
  resolveProposal: { essayId, expectedLockVersion: 0, proposalId: randomUUID(), decision: 'accept' },
  requestAI: { essayId, expectedLockVersion: 0, operation: 'DRAFT', idempotencyKey: randomUUID() },
};
for (const [name, input] of Object.entries(deniedWrites)) {
  test(`${name} refuses a resource not owned by the session user`, async () => {
    const queries = [];
    const tx = { async $queryRaw(strings, ...values) { queries.push({ sql: strings.join('?'), values }); return []; } };
    const app = backend({ $transaction: operation => operation(tx) });
    await assert.rejects(app[name](input), code('NOT_FOUND'));
    const query = queries.find(q => q.sql.includes('FROM "Essay"'));
    assert.ok(query);
    assert.ok(query.sql.includes('"userId"'));
    assert.ok(query.values.includes(actorId));
    assert.ok(query.values.includes(essayId));
  });
}

test('essay reads filter using the authenticated database identity', async () => {
  let where;
  const app = backend({ essay: { async findFirst(input) { where = input.where; return null; } } });
  await assert.rejects(app.getEssay({ essayId }), code('NOT_FOUND'));
  assert.deepEqual(where, { id: essayId, userId: actorId, deletedAt: null });
});

for (const method of ['getVersion', 'exportData']) {
  test(`${method} enforces ownership through the parent essay`, async () => {
    let where;
    const app = backend({ essayVersion: { async findFirst(input) { where = input.where; return null; } } });
    await assert.rejects(app[method]({ essayId, versionId }), code('NOT_FOUND'));
    assert.equal(where.essayId, essayId);
    assert.deepEqual(where.essay, { userId: actorId, deletedAt: null });
  });
}

test('subject deletion scopes lookup to the session user', async () => {
  let where;
  const tx = { subject: { async findFirst(input) { where = input.where; return null; } } };
  await assert.rejects(backend({ $transaction: fn => fn(tx) }).deleteSubject({ subjectId: randomUUID() }), code('NOT_FOUND'));
  assert.equal(where.userId, actorId);
});

test('stale draft saves stop before replacing writing', async () => {
  let updateWhere;
  const tx = {
    $queryRaw: async () => [{ id: essayId }],
    essayVersion: {
      findFirst: async () => ({ id: versionId, lockVersion: 5 }),
      async updateMany(input) { updateWhere = input.where; return { count: 0 }; },
      async update() { throw new Error('Writing must not be replaced'); },
    },
  };
  await assert.rejects(backend({ $transaction: fn => fn(tx) }).saveDraft({ essayId, expectedLockVersion: 4, document: validDocument() }), code('CONFLICT'));
  assert.equal(updateWhere.lockVersion, 4);
  assert.equal(updateWhere.kind, 'WORKING');
  assert.equal(updateWhere.sealedAt, null);
});

test('a valid save derives plain text and invalidates old interpretations', async () => {
  let data, annotations, proposals;
  const tx = {
    $queryRaw: async () => [{ id: essayId }],
    essayVersion: {
      findFirst: async () => ({ id: versionId, lockVersion: 3 }),
      updateMany: async () => ({ count: 1 }),
      async update(input) { data = input.data; },
    },
    essay: { update: async () => ({}) },
    annotation: { async updateMany(input) { annotations = input; } },
    aIProposal: { async updateMany(input) { proposals = input; } },
  };
  const result = await backend({ $transaction: fn => fn(tx) }).saveDraft({ essayId, expectedLockVersion: 3, document: validDocument() });
  assert.equal(result.lockVersion, 4);
  assert.equal(data.plainText, 'A student idea.');
  assert.equal(annotations.data.mappingStatus, 'STALE');
  assert.equal(proposals.data.status, 'STALE');
});

test('a student-created highlight derives its quotation from the owned document', async () => {
  const blockId = randomUUID(); let annotation;
  const tx = {
    $queryRaw: async () => [{ id: essayId }],
    essayVersion: { findFirst: async () => ({ id: versionId, documentJson: { type: 'doc', content: [{ type: 'paragraph', attrs: { id: blockId }, content: [{ type: 'text', text: 'A clear central idea.' }] }] } }), updateMany: async () => ({ count: 1 }) },
    aIProposal: { updateMany: async () => ({}) }, essay: { update: async () => ({}) },
    annotation: { create: async ({ data }) => { annotation = data; return { id: randomUUID() }; } },
  };
  const app = backend({ $transaction: fn => fn(tx) });
  const input = { essayId, expectedLockVersion: 2, blockId, from: 2, to: 7, role: 'THESIS' };
  assert.equal((await app.annotatePassage(input)).lockVersion, 3);
  assert.deepEqual(annotation.anchor, { blockId, from: 2, to: 7, quote: 'clear' });
  assert.equal(annotation.reviewStatus, 'CONFIRMED'); assert.equal(annotation.origin, 'STUDENT');
  annotation = null;
  await assert.rejects(app.annotatePassage({ ...input, to: 900 }), code('VALIDATION_ERROR'));
  await assert.rejects(app.annotatePassage({ ...input, blockId: randomUUID() }), code('VALIDATION_ERROR'));
  assert.equal(annotation, null);
});

test('snapshot copying remaps row identities and seals before setting history parent', async () => {
  const oldNode = randomUUID(), nodeKey = randomUUID(), oldAnnotation = randomUUID(), savedId = randomUUID();
  const source = {
    id: versionId, essayId, kind: 'WORKING', lockVersion: 2, parentVersionId: null,
    topic: 'Topic', audience: 'Academic', purpose: 'Inform', essayType: null,
    documentJson: validDocument(), plainText: 'A student idea.', formatting: {}, schemaVersion: 1, origin: 'STUDENT',
    outlineNodes: [{ id: oldNode, nodeKey, parentId: null, position: 0, role: 'THESIS', content: 'An idea', origin: 'STUDENT' }],
    annotations: [{ id: oldAnnotation, annotationKey: randomUUID(), outlineNodeId: oldNode, role: 'THESIS', anchor: {}, explanation: null, origin: 'STUDENT', reviewStatus: 'CONFIRMED', mappingStatus: 'CURRENT' }],
    relationships: [], evidenceLinks: [],
  };
  const original = structuredClone(source), order = [];
  let copiedNodes, copiedAnnotations;
  const tx = {
    $queryRaw: async () => [{ id: essayId }],
    essayVersion: {
      findFirst: async () => source, updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => source, create: async () => ({ id: savedId }),
      async update({ data }) { order.push(data.sealedAt ? 'seal' : 'parent'); },
    },
    essay: { update: async () => ({}) }, aIProposal: { updateMany: async () => ({ count: 0 }) },
    outlineNode: { async createMany({ data }) { copiedNodes = data; } },
    annotation: { async createMany({ data }) { copiedAnnotations = data; } },
  };
  const result = await backend({ $transaction: fn => fn(tx) }).createSnapshot({ essayId, expectedLockVersion: 1 });
  assert.equal(result.snapshotId, savedId);
  assert.notEqual(copiedNodes[0].id, oldNode);
  assert.equal(copiedNodes[0].nodeKey, nodeKey);
  assert.equal(copiedNodes[0].versionId, savedId);
  assert.equal(copiedAnnotations[0].outlineNodeId, copiedNodes[0].id);
  assert.notEqual(copiedAnnotations[0].id, oldAnnotation);
  assert.deepEqual(order, ['seal', 'parent']);
  assert.deepEqual(source, original);
});

test('search results remain scoped to the session user', async () => {
  let where;
  const tx = { essay: { async findMany(input) { where = input.where; return []; }, count: async () => 0 } };
  await backend({ $transaction: fn => fn(tx) }).listEssays({ query: 'biology', folder: 'miscellaneous' });
  assert.equal(where.userId, actorId);
  assert.equal(where.subjectId, null);
  assert.equal(where.deletedAt, null);
});

test('outline cycles and missing parents are rejected', () => {
  const a = randomUUID(), b = randomUUID();
  const item = (key, parentKey) => ({ nodeKey: key, parentKey, position: 0, role: 'REASON', content: 'A reason' });
  assert.throws(() => validation.outline([item(a, b), item(b, a)]), code('VALIDATION_ERROR'));
  assert.throws(() => validation.outline([item(a, b)]), code('VALIDATION_ERROR'));
});

test('outline sibling positions cannot silently collide', () => {
  const item = () => ({ nodeKey: randomUUID(), parentKey: null, position: 0, role: 'REASON', content: 'A reason' });
  assert.throws(() => validation.outline([item(), item()]), code('VALIDATION_ERROR'));
});

test('rich text rejects executable URLs, HTML nodes, and arbitrary styles', () => {
  assert.throws(() => validation.document({ type: 'doc', content: [{ type: 'html', text: '<script />' }] }), code('VALIDATION_ERROR'));
  const raw = validDocument();
  raw.content[0].content[0].marks = [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }];
  assert.throws(() => validation.document(raw), code('VALIDATION_ERROR'));
  assert.throws(() => validation.formatting({ fontFamily: 'url(https://attacker.invalid)' }), code('VALIDATION_ERROR'));
});

test('document IDs are added and existing stable IDs survive saves', () => {
  const once = validation.document(validDocument()), twice = validation.document(once);
  assert.equal(twice.content[0].attrs.id, once.content[0].attrs.id);
  assert.equal(validation.plainText(twice).trim(), 'A student idea.');
});

test('rich text rejects blocks nested inside a paragraph', () => {
  assert.throws(() => validation.document({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'heading' }] }] }), code('VALIDATION_ERROR'));
});

test('AI explanations must quote an existing passage in the selected version', () => {
  const doc = validation.document(validDocument()), blockId = doc.content[0].attrs.id;
  const changes = { kind: 'EXPLANATION', text: 'An explanation', annotations: [
    { blockId, quote: 'student idea', role: 'MAIN_IDEA', explanation: 'This is the central point.' },
  ], relationships: [] };
  assert.equal(validateExplanation(changes, doc).annotations[0].anchor.from, 2);
  changes.annotations[0].quote = 'A made-up quotation';
  assert.throws(() => validateExplanation(changes, doc), code('VALIDATION_ERROR'));
});

test('database error details and credentials are never returned', () => {
  const error = new Error('postgresql://user:secret@example.invalid/private');
  assert.equal(JSON.stringify(publicError(error)).includes('secret'), false);
  assert.equal(publicError({ code: 'P2002', meta: { target: ['private-email'] } }).code, 'CONFLICT');
});

test('JSON body limits are measured in bytes', async () => {
  const request = new Request('https://app.example/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '😀'.repeat(10) }) });
  await assert.rejects(readJSON(request, 30), code('VALIDATION_ERROR'));
});

test('malformed JSON and cross-site writes are rejected', async () => {
  const request = new Request('https://app.example/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  await assert.rejects(readJSON(request), code('VALIDATION_ERROR'));
  assert.throws(() => sameOrigin(new Request('https://app.example/api', { headers: { origin: 'https://other.example' } })), code('FORBIDDEN'));
});
