import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('YOUR_')) {
  throw new Error('Set a real development DATABASE_URL before running integration tests.');
}

// Every test runs inside a rolled-back transaction. No fixture records persist.
async function fixture(run) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    const userId = randomUUID(), essayId = randomUUID(), versionId = randomUUID();
    await client.query(
      `INSERT INTO "User" (id, "authProvider", "authSubject", email, "updatedAt")
       VALUES ($1::uuid, 'integration-test', $1::text, $2, now())`,
      [userId, `${userId}@example.invalid`]
    );
    await client.query(
      `INSERT INTO "Essay" (id, "userId", "updatedAt") VALUES ($1, $2, now())`,
      [essayId, userId]
    );
    await client.query(
      `INSERT INTO "EssayVersion" (id, "essayId", "documentJson", "updatedAt")
       VALUES ($1, $2, '{"type":"doc"}', now())`,
      [versionId, essayId]
    );
    await run({ client, userId, essayId, versionId });
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

async function rejectsSQL(client, sql, params, expectedCode) {
  await client.query('SAVEPOINT expected_rejection');
  try {
    await assert.rejects(client.query(sql, params), error => error.code === expectedCode);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_rejection');
    await client.query('RELEASE SAVEPOINT expected_rejection');
  }
}

async function node(client, versionId, parentId = null) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO "OutlineNode"
     (id, "versionId", "nodeKey", "parentId", position, role, content, "updatedAt")
     VALUES ($1, $2, $3, $4, 0, 'MAIN_IDEA', 'A supporting idea', now())`,
    [id, versionId, randomUUID(), parentId]
  );
  return id;
}

async function snapshot(client, essayId) {
  const versionId = randomUUID();
  await client.query(
    `INSERT INTO "EssayVersion" (id, "essayId", kind, "documentJson", "updatedAt")
     VALUES ($1, $2, 'SNAPSHOT', '{"type":"doc"}', now())`,
    [versionId, essayId]
  );
  const nodeId = await node(client, versionId);
  const annotationId = randomUUID();
  await client.query(
    `INSERT INTO "Annotation"
     (id, "versionId", "outlineNodeId", "annotationKey", role, anchor, "basedOnLockVersion")
     VALUES ($1, $2, $3, $4, 'MAIN_IDEA', '{}', 0)`,
    [annotationId, versionId, nodeId, randomUUID()]
  );
  await client.query('UPDATE "EssayVersion" SET "sealedAt" = now() WHERE id = $1', [versionId]);
  return { versionId, nodeId, annotationId };
}

test('an essay cannot use another student\'s subject', () => fixture(async ({ client, essayId }) => {
  const otherUser = randomUUID(), subjectId = randomUUID();
  await client.query(
    `INSERT INTO "User" (id, "authProvider", "authSubject", email, "updatedAt")
     VALUES ($1::uuid, 'integration-test', $1::text, $2, now())`,
    [otherUser, `${otherUser}@example.invalid`]
  );
  await client.query(
    `INSERT INTO "Subject" (id, "userId", name, "normalizedName", "updatedAt")
     VALUES ($1, $2, 'Biology', 'biology', now())`,
    [subjectId, otherUser]
  );
  await rejectsSQL(client, 'UPDATE "Essay" SET "subjectId" = $1 WHERE id = $2', [subjectId, essayId], '23503');
}));

test('each essay has at most one working version', () => fixture(async ({ client, essayId }) => {
  await rejectsSQL(client,
    `INSERT INTO "EssayVersion" (id, "essayId", "documentJson", "updatedAt")
     VALUES ($1, $2, '{}', now())`,
    [randomUUID(), essayId], '23505');
}));

test('an outline parent cannot belong to another version', () => fixture(async ({ client, essayId, versionId }) => {
  const saved = await snapshot(client, essayId);
  await rejectsSQL(client,
    `INSERT INTO "OutlineNode" (id, "versionId", "nodeKey", "parentId", position, role, content, "updatedAt")
     VALUES ($1, $2, $3, $4, 0, 'REASON', 'Invalid parent', now())`,
    [randomUUID(), versionId, randomUUID(), saved.nodeId], '23503');
}));

test('outline reparenting cannot create a cycle', () => fixture(async ({ client, versionId }) => {
  const parent = await node(client, versionId);
  const child = await node(client, versionId, parent);
  await rejectsSQL(client, 'UPDATE "OutlineNode" SET "parentId" = $1 WHERE id = $2', [child, parent], '23514');
}));

test('sealed snapshot documents and child records cannot change', () => fixture(async ({ client, essayId }) => {
  const saved = await snapshot(client, essayId);
  await rejectsSQL(client, 'UPDATE "EssayVersion" SET topic = $1 WHERE id = $2', ['Changed', saved.versionId], '23514');
  await rejectsSQL(client, 'UPDATE "OutlineNode" SET content = $1 WHERE id = $2', ['Changed', saved.nodeId], '23514');
  await rejectsSQL(client, 'DELETE FROM "Annotation" WHERE id = $1', [saved.annotationId], '23514');
  await rejectsSQL(client,
    `INSERT INTO "OutlineNode" (id, "versionId", "nodeKey", position, role, content, "updatedAt")
     VALUES ($1, $2, $3, 0, 'REASON', 'Late insertion', now())`,
    [randomUUID(), saved.versionId, randomUUID()], '23514');
}));

test('an unsealed snapshot cannot survive transaction completion', () => fixture(async ({ client, essayId }) => {
  await client.query('SET CONSTRAINTS "wwy_snapshot_must_be_sealed" IMMEDIATE');
  await rejectsSQL(client,
    `INSERT INTO "EssayVersion" (id, "essayId", kind, "documentJson", "updatedAt")
     VALUES ($1, $2, 'SNAPSHOT', '{}', now())`,
    [randomUUID(), essayId], '23514');
}));

test('a saved version cannot be deleted independently', () => fixture(async ({ client, essayId }) => {
  const saved = await snapshot(client, essayId);
  await rejectsSQL(client, 'DELETE FROM "EssayVersion" WHERE id = $1', [saved.versionId], '23514');
}));

test('permanent essay deletion can cascade through its saved history', () => fixture(async ({ client, essayId }) => {
  const saved = await snapshot(client, essayId);
  await client.query('DELETE FROM "Essay" WHERE id = $1', [essayId]);
  const { rows: [{ count }] } = await client.query(
    'SELECT count(*)::int AS count FROM "Annotation" WHERE "versionId" = $1',
    [saved.versionId]
  );
  assert.equal(count, 0);
}));

test('optimistic locking rejects a stale save', () => fixture(async ({ client, versionId }) => {
  const sql = `UPDATE "EssayVersion" SET "lockVersion" = "lockVersion" + 1
               WHERE id = $1 AND "lockVersion" = $2`;
  assert.equal((await client.query(sql, [versionId, 0])).rowCount, 1);
  assert.equal((await client.query(sql, [versionId, 0])).rowCount, 0);
}));

test('negative positions are rejected', () => fixture(async ({ client, versionId }) => {
  const id = await node(client, versionId);
  await rejectsSQL(client, 'UPDATE "OutlineNode" SET position = -1 WHERE id = $1', [id], '23514');
}));

test('working text is searchable without including saved copies', () => fixture(async ({ client, essayId, versionId }) => {
  await snapshot(client, essayId);
  await client.query('UPDATE "EssayVersion" SET "plainText" = $1 WHERE id = $2', ['Photosynthesis supplies energy', versionId]);
  const { rows } = await client.query(
    `SELECT id FROM "EssayVersion" WHERE "essayId" = $1 AND kind = 'WORKING'
     AND to_tsvector('simple', "plainText") @@ plainto_tsquery('simple', $2)`,
    [essayId, 'Photosynthesis']
  );
  assert.deepEqual(rows.map(r => r.id), [versionId]);
}));
