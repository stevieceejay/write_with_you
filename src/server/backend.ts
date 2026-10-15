import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { fail } from "./errors.ts";
import * as v from "./validation.ts";
import { contentInclude, copyContent, clearContent, json } from "./content.ts";
import type { AIAdapter, AIOperation } from "./ai-types.ts";

export type Actor = { id: string };
type Dependencies = { authenticate: () => Promise<Actor>; database: () => PrismaClient; ai: AIAdapter };
type Tx = Prisma.TransactionClient;
const prompts: Record<v.Step, string> = {
  TOPIC: "What topic would you like to write about?",
  AUDIENCE: "Who will read your essay?",
  PURPOSE: "What do you want this essay to accomplish?",
  THESIS: "In one sentence, what view or central idea do you want to express?",
  REASONS: "What reason or main point supports your central idea?",
  SUPPORTING_DETAILS: "What fact, example, or explanation supports this point? You can add more detail, add another reason, or finish.",
  COMPLETE: "Your outline is ready. You can keep editing it or move to Draft.",
};

export function createBackend({ authenticate, database, ai }: Dependencies) {
  async function context() {
    const actor = await authenticate();
    if (!actor?.id) fail("UNAUTHENTICATED", "Sign in to continue.");
    return { actor, db: database() };
  }
  // Parent locks serialize saves with trash, subject moves, snapshots, and sources.
  async function lockEssay(tx: Tx, actor: Actor, essayId: string, trashed = false) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Essay" WHERE "id" = ${essayId}::uuid
      AND "userId" = ${actor.id}::uuid
      AND ((${trashed} = true AND "deletedAt" IS NOT NULL)
        OR (${trashed} = false AND "deletedAt" IS NULL)) FOR UPDATE`;
    if (!rows.length) fail("NOT_FOUND", "Essay not found.");
  }
  async function work(tx: Tx, essayId: string) {
    const result = await tx.essayVersion.findFirst({ where: { essayId, kind: "WORKING" } });
    if (!result) fail("NOT_FOUND", "Working version not found.");
    return result;
  }
  async function claim(tx: Tx, essayId: string, expected: number) {
    const current = await work(tx, essayId);
    const result = await tx.essayVersion.updateMany({
      where: { id: current.id, kind: "WORKING", sealedAt: null, lockVersion: expected },
      data: { lockVersion: { increment: 1 } },
    });
    if (result.count !== 1) fail("CONFLICT", "This essay changed in another session. Reload before saving.");
    await tx.aIProposal.updateMany({ where: { targetVersionId: current.id, status: "PENDING" }, data: { status: "STALE" } });
    await tx.essay.update({ where: { id: essayId }, data: { updatedAt: new Date() } });
    return { ...current, lockVersion: expected + 1 };
  }
  async function subjectOwned(tx: Tx | PrismaClient, actor: Actor, subjectId: string | null) {
    if (subjectId && !await tx.subject.findFirst({ where: { id: subjectId, userId: actor.id }, select: { id: true } })) {
      fail("NOT_FOUND", "Subject not found.");
    }
  }
  const coordinates = (raw: unknown, extra: string[] = []) => {
    const input = v.object(raw, ["essayId", "expectedLockVersion", ...extra]);
    return { input, essayId: v.uuid(input.essayId, "essayId"), expected: v.integer(input.expectedLockVersion, "expectedLockVersion") };
  };

  async function createEssay(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["title", "subjectId"]);
    const title = input.title === undefined ? "Untitled essay" : v.text(input.title, "title", 300);
    const subjectId = input.subjectId == null ? null : v.uuid(input.subjectId, "subjectId");
    return db.$transaction(async tx => {
      await subjectOwned(tx, actor, subjectId);
      return tx.essay.create({ data: {
        userId: actor.id, title, subjectId,
        versions: { create: {
          kind: "WORKING", documentJson: json(v.document({ type: "doc", content: [{ type: "paragraph" }] })),
          planningSession: { create: { step: "TOPIC", messages: { create: { role: "ASSISTANT", step: "TOPIC", content: prompts.TOPIC } } } },
        } },
      }, include: { versions: true } });
    });
  }

  async function listEssays(raw: unknown = {}) {
    const { actor, db } = await context();
    const input = v.object(raw, ["query", "folder", "subjectId", "page", "limit"]);
    const query = input.query === undefined ? "" : v.text(input.query, "query", 200, true);
    const folder = v.choice(input.folder ?? "all", ["all", "organized", "miscellaneous", "trash"], "folder");
    const page = v.integer(input.page ?? 0, "page", 0, 10_000);
    const limit = v.integer(input.limit ?? 20, "limit", 1, 50);
    const subjectId = input.subjectId == null ? undefined : v.uuid(input.subjectId, "subjectId");
    const where: Prisma.EssayWhereInput = {
      userId: actor.id, deletedAt: folder === "trash" ? { not: null } : null,
      ...(folder === "organized" ? { subjectId: { not: null } } : {}),
      ...(folder === "miscellaneous" ? { subjectId: null } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(query ? { OR: [
        { title: { contains: query, mode: "insensitive" } },
        { subject: { name: { contains: query, mode: "insensitive" } } },
        { versions: { some: { kind: "WORKING", OR: [
          { plainText: { contains: query, mode: "insensitive" } },
          { topic: { contains: query, mode: "insensitive" } },
        ] } } },
      ] } : {}),
    };
    return db.$transaction(async tx => ({
      items: await tx.essay.findMany({ where, skip: page * limit, take: limit,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: { subject: true } }),
      total: await tx.essay.count({ where }), page, limit,
    }));
  }

  async function getEssay(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId"]);
    const essayId = v.uuid(input.essayId, "essayId");
    const essay = await db.essay.findFirst({ where: { id: essayId, userId: actor.id, deletedAt: null },
      include: { subject: true, sources: true, versions: { where: { kind: "WORKING" }, include: contentInclude } } });
    if (!essay) fail("NOT_FOUND", "Essay not found.");
    return essay;
  }

  async function updateEssay(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId", "title", "subjectId", "workflowStage"]);
    const essayId = v.uuid(input.essayId, "essayId");
    const data: Prisma.EssayUncheckedUpdateManyInput = {};
    if (input.title !== undefined) data.title = v.text(input.title, "title", 300);
    if (input.subjectId !== undefined) data.subjectId = input.subjectId === null ? null : v.uuid(input.subjectId, "subjectId");
    if (input.workflowStage !== undefined) data.workflowStage = v.choice(input.workflowStage, ["PLAN", "DRAFT", "REVISE", "REVIEW"] as const, "workflowStage");
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      await subjectOwned(tx, actor, typeof data.subjectId === "string" ? data.subjectId : null);
      await tx.essay.updateMany({ where: { id: essayId, userId: actor.id }, data });
      return { essayId };
    });
  }

  async function trashEssay(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId"]), essayId = v.uuid(input.essayId, "essayId");
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      await tx.essay.update({ where: { id: essayId }, data: { deletedAt: new Date() } });
      return { essayId };
    });
  }

  async function restoreEssay(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId"]), essayId = v.uuid(input.essayId, "essayId");
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId, true);
      await tx.essay.update({ where: { id: essayId }, data: { deletedAt: null } });
      return { essayId };
    });
  }

  async function saveDraft(raw: unknown) {
    const { actor, db } = await context();
    const { input, essayId, expected } = coordinates(raw, ["document", "formatting"]);
    const document = v.document(input.document);
    const appearance = input.formatting === undefined ? undefined : v.formatting(input.formatting);
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      const current = await claim(tx, essayId, expected);
      await tx.essayVersion.update({ where: { id: current.id }, data: {
        documentJson: json(document), plainText: v.plainText(document).trim(),
        ...(appearance ? { formatting: json(appearance) } : {}), origin: current.origin === "STUDENT" ? "STUDENT" : "MIXED",
      } });
      await tx.annotation.updateMany({ where: { versionId: current.id }, data: { mappingStatus: "STALE" } });
      return { versionId: current.id, lockVersion: current.lockVersion, document };
    });
  }

  async function saveFormatting(raw: unknown) {
    const { actor, db } = await context();
    const { input, essayId, expected } = coordinates(raw, ["formatting"]);
    const appearance = v.formatting(input.formatting);
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      const current = await claim(tx, essayId, expected);
      await tx.essayVersion.update({ where: { id: current.id }, data: { formatting: json(appearance) } });
      return { versionId: current.id, lockVersion: current.lockVersion };
    });
  }

  async function saveSettings(raw: unknown) {
    const { actor, db } = await context();
    const { input, essayId, expected } = coordinates(raw, ["topic", "audience", "purpose", "essayType"]);
    const data = {
      ...(input.topic !== undefined ? { topic: v.optionalText(input.topic, "topic", 1000) } : {}),
      ...(input.audience !== undefined ? { audience: v.optionalText(input.audience, "audience", 200) } : {}),
      ...(input.purpose !== undefined ? { purpose: v.optionalText(input.purpose, "purpose", 200) } : {}),
      ...(input.essayType !== undefined ? { essayType: v.optionalText(input.essayType, "essayType", 80) } : {}),
    };
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      const current = await claim(tx, essayId, expected);
      await tx.essayVersion.update({ where: { id: current.id }, data });
      return { versionId: current.id, lockVersion: current.lockVersion };
    });
  }

  async function saveOutline(raw: unknown) {
    const { actor, db } = await context();
    const { input, essayId, expected } = coordinates(raw, ["nodes"]);
    const nodes = v.outline(input.nodes), ids = new Map(nodes.map(node => [node.nodeKey, randomUUID()]));
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      const current = await claim(tx, essayId, expected);
      await tx.annotation.updateMany({ where: { versionId: current.id }, data: { outlineNodeId: null, mappingStatus: "STALE" } });
      await tx.outlineNode.deleteMany({ where: { versionId: current.id } });
      if (nodes.length) await tx.outlineNode.createMany({ data: nodes.map(node => ({
        id: ids.get(node.nodeKey)!, versionId: current.id, nodeKey: node.nodeKey,
        parentId: node.parentKey ? ids.get(node.parentKey)! : null,
        position: node.position, role: node.role, content: node.content, origin: "STUDENT",
      })) });
      return { versionId: current.id, lockVersion: current.lockVersion };
    });
  }

  async function getPlanning(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId"]), essayId = v.uuid(input.essayId, "essayId");
    const result = await db.planningSession.findFirst({
      where: { version: { essayId, kind: "WORKING", essay: { userId: actor.id, deletedAt: null } } },
      include: { messages: { take: 100, orderBy: [{ createdAt: "desc" }, { id: "desc" }] } },
    });
    if (!result) fail("NOT_FOUND", "Planning session not found.");
    return { ...result, prompt: prompts[result.step], messages: result.messages.reverse() };
  }

  async function answerPlanning(raw: unknown) {
    const { actor, db } = await context();
    const { input, essayId, expected } = coordinates(raw, ["step", "answer", "intent", "parentNodeKey", "role"]);
    const step = v.choice(input.step, v.steps, "step");
    const intent = v.choice(input.intent ?? "answer", ["answer", "add_reason", "finish"], "intent");
    const answer = intent === "answer" ? v.text(input.answer, "answer", step === "AUDIENCE" || step === "PURPOSE" ? 200 : step === "THESIS" ? 500 : step === "TOPIC" ? 1000 : 10_000) : null;
    const parentKey = input.parentNodeKey == null ? null : v.uuid(input.parentNodeKey, "parentNodeKey");
    const role = v.choice(input.role ?? "EXPLANATION", ["EVIDENCE", "EXAMPLE", "EXPLANATION"], "role");
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      const current = await claim(tx, essayId, expected);
      const session = await tx.planningSession.findUnique({ where: { versionId: current.id } });
      if (!session || session.step !== step) fail("CONFLICT", "Planning has moved to a different question. Reload the outline.");
      let next: v.Step;
      let nodeKey: string | null = null;
      if (intent !== "answer") {
        if (!["REASONS", "SUPPORTING_DETAILS", "COMPLETE"].includes(step)) fail("VALIDATION_ERROR", "Finish the essay settings and central idea first.");
        if (intent === "finish") {
          const thesis = await tx.outlineNode.count({ where: { versionId: current.id, role: "THESIS" } });
          const reasons = await tx.outlineNode.count({ where: { versionId: current.id, role: { in: ["REASON", "MAIN_IDEA"] } } });
          if (!thesis || !reasons) fail("VALIDATION_ERROR", "Add a central idea and at least one supporting point first.");
        }
        next = intent === "finish" ? "COMPLETE" : "REASONS";
      } else if (["TOPIC", "AUDIENCE", "PURPOSE"].includes(step)) {
        const field = { TOPIC: "topic", AUDIENCE: "audience", PURPOSE: "purpose" }[step as "TOPIC" | "AUDIENCE" | "PURPOSE"];
        await tx.essayVersion.update({ where: { id: current.id }, data: { [field]: answer } });
        next = { TOPIC: "AUDIENCE", AUDIENCE: "PURPOSE", PURPOSE: "THESIS" }[step as "TOPIC" | "AUDIENCE" | "PURPOSE"] as v.Step;
      } else {
        if (step === "COMPLETE") fail("VALIDATION_ERROR", "Choose add_reason to continue the outline.");
        const nodeRole = step === "THESIS" ? "THESIS" : step === "REASONS" ? "REASON" : role;
        let parentId: string | null = null;
        if (step === "SUPPORTING_DETAILS") {
          if (!parentKey) fail("VALIDATION_ERROR", "Choose the outline point this detail supports.");
          const parent = await tx.outlineNode.findUnique({ where: { versionId_nodeKey: { versionId: current.id, nodeKey: parentKey } } });
          if (!parent) fail("NOT_FOUND", "Outline point not found.");
          parentId = parent.id;
        }
        const last = await tx.outlineNode.aggregate({ where: { versionId: current.id, parentId }, _max: { position: true } });
        nodeKey = randomUUID();
        await tx.outlineNode.create({ data: { versionId: current.id, nodeKey, parentId, position: (last._max.position ?? -1) + 1, role: nodeRole, content: answer! } });
        next = step === "THESIS" ? "REASONS" : "SUPPORTING_DETAILS";
      }
      await tx.planningSession.update({ where: { id: session.id }, data: { step: next } });
      const lastMessage = await tx.planningMessage.findFirst({ where: { sessionId: session.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      const messageTime = Math.max(Date.now(), (lastMessage?.createdAt.getTime() ?? 0) + 1);
      await tx.planningMessage.createMany({ data: [
        { sessionId: session.id, role: "STUDENT", step, createdAt: new Date(messageTime), content: answer ?? (intent === "finish" ? "Finish outline" : "Add another reason") },
        { sessionId: session.id, role: "ASSISTANT", step: next, createdAt: new Date(messageTime + 1), content: prompts[next] },
      ] });
      return { versionId: current.id, lockVersion: current.lockVersion, step: next, prompt: prompts[next], nodeKey };
    });
  }

  async function listVersions(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId"]), essayId = v.uuid(input.essayId, "essayId");
    if (!await db.essay.findFirst({ where: { id: essayId, userId: actor.id, deletedAt: null }, select: { id: true } })) fail("NOT_FOUND", "Essay not found.");
    return db.essayVersion.findMany({ where: { essayId, OR: [{ kind: "WORKING" }, { sealedAt: { not: null } }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200,
      select: { id: true, kind: true, label: true, parentVersionId: true, lockVersion: true, createdAt: true, sealedAt: true } });
  }

  async function getVersion(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId", "versionId"]);
    const essayId = v.uuid(input.essayId, "essayId"), versionId = v.uuid(input.versionId, "versionId");
    const result = await db.essayVersion.findFirst({ where: { id: versionId, essayId,
      essay: { userId: actor.id, deletedAt: null }, OR: [{ kind: "WORKING" }, { sealedAt: { not: null } }] }, include: contentInclude });
    if (!result) fail("NOT_FOUND", "Version not found.");
    return result;
  }

  async function createSnapshot(raw: unknown) {
    const { actor, db } = await context();
    const { input, essayId, expected } = coordinates(raw, ["label"]);
    const label = v.text(input.label ?? "Saved draft", "label", 160);
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      const current = await claim(tx, essayId, expected);
      const source = await tx.essayVersion.findUniqueOrThrow({ where: { id: current.id }, include: contentInclude });
      const saved = await tx.essayVersion.create({ data: {
        essayId, kind: "SNAPSHOT", label, parentVersionId: source.parentVersionId,
        topic: source.topic, audience: source.audience, purpose: source.purpose, essayType: source.essayType,
        documentJson: json(source.documentJson), plainText: source.plainText, formatting: json(source.formatting),
        schemaVersion: source.schemaVersion, lockVersion: source.lockVersion, origin: source.origin,
      } });
      await copyContent(tx, source, saved.id, source.lockVersion);
      await tx.essayVersion.update({ where: { id: saved.id }, data: { sealedAt: new Date() } });
      await tx.essayVersion.update({ where: { id: current.id }, data: { parentVersionId: saved.id } });
      return { snapshotId: saved.id, lockVersion: current.lockVersion };
    }, { timeout: 15_000 });
  }

  async function restoreSnapshot(raw: unknown) {
    const { actor, db } = await context();
    const { input, essayId, expected } = coordinates(raw, ["snapshotId"]);
    const snapshotId = v.uuid(input.snapshotId, "snapshotId");
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      const current = await claim(tx, essayId, expected);
      const source = await tx.essayVersion.findFirst({ where: { id: snapshotId, essayId, kind: "SNAPSHOT", sealedAt: { not: null } }, include: contentInclude });
      if (!source) fail("NOT_FOUND", "Saved version not found.");
      await clearContent(tx, current.id);
      await tx.essayVersion.update({ where: { id: current.id }, data: {
        parentVersionId: source.id, topic: source.topic, audience: source.audience, purpose: source.purpose,
        essayType: source.essayType, documentJson: json(source.documentJson), plainText: source.plainText,
        formatting: json(source.formatting), schemaVersion: source.schemaVersion, origin: source.origin,
      } });
      await copyContent(tx, source, current.id, current.lockVersion);
      await tx.planningSession.updateMany({ where: { versionId: current.id }, data: { step: "COMPLETE" } });
      return { versionId: current.id, lockVersion: current.lockVersion };
    }, { timeout: 15_000 });
  }

  async function listSubjects() {
    const { actor, db } = await context();
    return db.subject.findMany({ where: { userId: actor.id }, orderBy: { name: "asc" }, take: 500 });
  }
  async function createSubject(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["name"]), name = v.text(input.name, "name", 120);
    return db.subject.create({ data: { userId: actor.id, name, normalizedName: name.toLowerCase() } });
  }
  async function deleteSubject(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["subjectId"]), subjectId = v.uuid(input.subjectId, "subjectId");
    return db.$transaction(async tx => {
      if (!await tx.subject.findFirst({ where: { id: subjectId, userId: actor.id }, select: { id: true } })) fail("NOT_FOUND", "Subject not found.");
      await tx.essay.updateMany({ where: { userId: actor.id, subjectId }, data: { subjectId: null } });
      const result = await tx.subject.deleteMany({ where: { id: subjectId, userId: actor.id } });
      if (!result.count) fail("NOT_FOUND", "Subject not found.");
      return { subjectId };
    });
  }

  async function saveSource(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId", "sourceId", "title", "authors", "url", "publicationDate"]);
    const essayId = v.uuid(input.essayId, "essayId"), sourceId = input.sourceId == null ? null : v.uuid(input.sourceId, "sourceId");
    const title = v.text(input.title, "title", 1000), url = v.optionalText(input.url, "url", 2000);
    if (url) {
      let parsed: URL;
      try { parsed = new URL(url); } catch { fail("VALIDATION_ERROR", "Invalid source URL."); }
      if (!["https:", "http:"].includes(parsed.protocol)) fail("VALIDATION_ERROR", "Source URLs must use HTTP or HTTPS.");
    }
    if (!Array.isArray(input.authors) || input.authors.length > 50) fail("VALIDATION_ERROR", "authors must be a list of up to 50 names.");
    const data = { title, url, authors: input.authors.map(a => v.text(a, "author", 200)), publicationDate: v.optionalText(input.publicationDate, "publicationDate", 40), accessedAt: url ? new Date() : null };
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      if (!sourceId) return tx.source.create({ data: { essayId, ...data } });
      if (!await tx.source.findFirst({ where: { id: sourceId, essayId }, select: { id: true } })) fail("NOT_FOUND", "Source not found.");
      return tx.source.update({ where: { id: sourceId }, data });
    });
  }
  async function deleteSource(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId", "sourceId"]);
    const essayId = v.uuid(input.essayId, "essayId"), sourceId = v.uuid(input.sourceId, "sourceId");
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      if (!await tx.source.findFirst({ where: { id: sourceId, essayId }, select: { id: true } })) fail("NOT_FOUND", "Source not found.");
      if (await tx.evidenceLink.count({ where: { sourceId, essayId } })) fail("CONFLICT", "This source is cited in a working or saved version.");
      await tx.source.delete({ where: { id: sourceId } });
      return { sourceId };
    });
  }

  async function updateAnnotation(raw: unknown) {
    const { actor, db } = await context();
    const { input, essayId, expected } = coordinates(raw, ["annotationId", "role", "reviewStatus"]);
    const annotationId = v.uuid(input.annotationId, "annotationId"), role = v.choice(input.role, v.roles, "role");
    const reviewStatus = v.choice(input.reviewStatus, ["SUGGESTED", "CONFIRMED", "DISMISSED"], "reviewStatus");
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      const current = await claim(tx, essayId, expected);
      const annotation = await tx.annotation.findFirst({ where: { id: annotationId, versionId: current.id } });
      if (!annotation) fail("NOT_FOUND", "Annotation not found.");
      if (annotation.mappingStatus === "STALE" && reviewStatus === "CONFIRMED") fail("CONFLICT", "Regenerate passage locations before confirming this annotation.");
      await tx.annotation.update({ where: { id: annotationId }, data: { role, reviewStatus, origin: "MIXED" } });
      return { annotationId, lockVersion: current.lockVersion };
    });
  }

  async function citeSource(raw: unknown) {
    const { actor, db } = await context();
    const { input, essayId, expected } = coordinates(raw, ["annotationId", "sourceId", "quotation", "locator"]);
    const annotationId = v.uuid(input.annotationId, "annotationId"), sourceId = v.uuid(input.sourceId, "sourceId");
    const quotation = v.optionalText(input.quotation, "quotation", 10_000), locator = v.optionalText(input.locator, "locator", 200);
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      const current = await claim(tx, essayId, expected);
      const annotation = await tx.annotation.findFirst({ where: { id: annotationId, versionId: current.id, mappingStatus: "CURRENT" } });
      const source = await tx.source.findFirst({ where: { id: sourceId, essayId } });
      if (!annotation || !source) fail("NOT_FOUND", "Passage or source not found.");
      const link = await tx.evidenceLink.create({ data: { essayId, versionId: current.id, annotationId, sourceId, quotation, locator,
        citationSnapshot: json({ title: source.title, authors: source.authors, url: source.url, publicationDate: source.publicationDate }), verificationStatus: "UNVERIFIED" } });
      return { evidenceLinkId: link.id, lockVersion: current.lockVersion };
    });
  }

  async function exportData(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId", "versionId"]), essayId = v.uuid(input.essayId, "essayId");
    const versionId = input.versionId == null ? null : v.uuid(input.versionId, "versionId");
    const version = await db.essayVersion.findFirst({ where: {
      essayId, ...(versionId ? { id: versionId } : { kind: "WORKING" }),
      OR: [{ kind: "WORKING" }, { sealedAt: { not: null } }], essay: { userId: actor.id, deletedAt: null },
    }, include: { essay: { select: { title: true } } } });
    if (!version) fail("NOT_FOUND", "Version not found.");
    return { ownerId: actor.id, essayId, versionId: version.id, lockVersion: version.lockVersion, title: version.essay.title, text: version.plainText };
  }

  async function requestAI(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId", "expectedLockVersion", "operation", "instruction", "idempotencyKey"]);
    const essayId = v.uuid(input.essayId, "essayId"), expected = v.integer(input.expectedLockVersion, "expectedLockVersion");
    const operation = v.choice(input.operation, ["DRAFT", "REVISE", "EXPLAIN"], "operation") as AIOperation;
    const instruction = v.optionalText(input.instruction, "instruction", 2000) ?? "";
    const idempotencyKey = v.uuid(input.idempotencyKey, "idempotencyKey");
    ai.assertConfigured();
    const reservation = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.id}::uuid FOR UPDATE`;
      await lockEssay(tx, actor, essayId);
      const existing = await tx.aIRequest.findUnique({ where: { essayId_idempotencyKey: { essayId, idempotencyKey } }, include: { proposals: true } });
      if (existing) return { existing };
      const version = await tx.essayVersion.findFirstOrThrow({ where: { essayId, kind: "WORKING" }, include: { outlineNodes: true } });
      if (version.lockVersion !== expected) fail("CONFLICT", "Reload the essay before requesting suggestions.");
      if (!version.audience || !version.purpose || !version.topic) fail("VALIDATION_ERROR", "Set the topic, audience, and purpose before requesting AI help.");
      if (operation === "DRAFT" && !version.outlineNodes.length) fail("VALIDATION_ERROR", "Add an outline before generating a draft.");
      if (operation !== "DRAFT" && !version.plainText.trim()) fail("VALIDATION_ERROR", "Write a draft before requesting revision or explanation.");
      const scope = { essay: { userId: actor.id } };
      const recent = await tx.aIRequest.count({ where: { ...scope, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
      const active = await tx.aIRequest.count({ where: { ...scope, status: { in: ["QUEUED", "RUNNING"] }, createdAt: { gte: new Date(Date.now() - 120_000) } } });
      if (recent >= 20 || active >= 2) fail("RATE_LIMITED", "AI usage limit reached. Please try again later.");
      const request = await tx.aIRequest.create({ data: { essayId, versionId: version.id, basedOnLockVersion: expected, operation,
        model: ai.model, promptVersion: "essay-coach-v1", idempotencyKey, status: "RUNNING" } });
      return { request, version };
    });
    if ("existing" in reservation && reservation.existing) return { requestId: reservation.existing.id, status: reservation.existing.status, proposals: reservation.existing.proposals };
    if (!("request" in reservation) || !reservation.request || !reservation.version) fail("INTERNAL_ERROR", "Could not start AI request.");
    const { request, version } = reservation;
    try {
      const result = await ai.generate({ operation, instruction, version, requestId: request.id });
      return await db.$transaction(async tx => {
        await lockEssay(tx, actor, essayId);
        const current = await work(tx, essayId);
        const state = await tx.aIRequest.findUniqueOrThrow({ where: { id: request.id } });
        if (state.status === "CANCELLED") return { requestId: request.id, status: "CANCELLED" as const };
        const proposal = await tx.aIProposal.create({ data: { essayId, targetVersionId: version.id, requestId: request.id,
          basedOnLockVersion: expected, operation, changes: json(result.changes), rationale: result.explanation,
          status: current.lockVersion === expected ? "PENDING" : "STALE" } });
        await tx.aIRequest.update({ where: { id: request.id }, data: { status: "COMPLETED", completedAt: new Date(), inputTokens: result.inputTokens, outputTokens: result.outputTokens } });
        return { requestId: request.id, status: "COMPLETED" as const, proposal };
      });
    } catch (error) {
      await db.aIRequest.updateMany({ where: { id: request.id, essayId, status: "RUNNING" }, data: { status: "FAILED", errorCode: "GENERATION_FAILED", completedAt: new Date() } }).catch(() => {});
      throw error;
    }
  }

  async function listAI(raw: unknown) {
    const { actor, db } = await context();
    const input = v.object(raw, ["essayId"]), essayId = v.uuid(input.essayId, "essayId");
    if (!await db.essay.findFirst({ where: { id: essayId, userId: actor.id, deletedAt: null }, select: { id: true } })) fail("NOT_FOUND", "Essay not found.");
    return db.aIRequest.findMany({ where: { essayId }, take: 50, orderBy: { createdAt: "desc" }, include: { proposals: true } });
  }

  async function resolveProposal(raw: unknown) {
    const { actor, db } = await context();
    const { input, essayId, expected } = coordinates(raw, ["proposalId", "decision"]);
    const proposalId = v.uuid(input.proposalId, "proposalId"), decision = v.choice(input.decision, ["accept", "reject"], "decision");
    return db.$transaction(async tx => {
      await lockEssay(tx, actor, essayId);
      const proposal = await tx.aIProposal.findFirst({ where: { id: proposalId, essayId } });
      if (!proposal) fail("NOT_FOUND", "Suggestion not found.");
      if (proposal.status !== "PENDING") fail("CONFLICT", "This suggestion is no longer pending.");
      if (decision === "reject") {
        await tx.aIProposal.update({ where: { id: proposalId }, data: { status: "REJECTED", resolvedAt: new Date() } });
        return { proposalId, status: "REJECTED" as const };
      }
      if (proposal.basedOnLockVersion !== expected) fail("CONFLICT", "The suggestion refers to an older draft.");
      const current = await claim(tx, essayId, expected);
      if (proposal.targetVersionId !== current.id) fail("CONFLICT", "Suggestion targets another version.");
      const changes = v.object(proposal.changes, ["kind", "document", "text", "annotations", "relationships"]);
      if (changes.kind === "DOCUMENT") {
        const doc = v.document(changes.document);
        await tx.essayVersion.update({ where: { id: current.id }, data: { documentJson: json(doc), plainText: v.plainText(doc).trim(), origin: "MIXED" } });
        await tx.annotation.updateMany({ where: { versionId: current.id }, data: { mappingStatus: "STALE" } });
      } else if (changes.kind === "EXPLANATION") {
        const decoded = ai.validateExplanation(changes, current.documentJson);
        const ids = decoded.annotations.map(() => randomUUID());
        if (ids.length) await tx.annotation.createMany({ data: decoded.annotations.map((annotation, i) => ({
          id: ids[i], versionId: current.id, role: annotation.role, anchor: json(annotation.anchor),
          explanation: annotation.explanation, basedOnLockVersion: current.lockVersion, origin: "AI", reviewStatus: "SUGGESTED", mappingStatus: "CURRENT",
        })) });
        if (decoded.relationships.length) await tx.ideaRelationship.createMany({ data: decoded.relationships.map(link => ({
          versionId: current.id, fromAnnotationId: ids[link.fromIndex], toAnnotationId: ids[link.toIndex], type: link.type, explanation: link.explanation, origin: "AI",
        })) });
      } else fail("VALIDATION_ERROR", "Unsupported suggestion format.");
      await tx.aIProposal.update({ where: { id: proposalId }, data: { status: "ACCEPTED", resolvedAt: new Date() } });
      return { proposalId, status: "ACCEPTED" as const, lockVersion: current.lockVersion };
    });
  }

  return { createEssay, listEssays, getEssay, updateEssay, trashEssay, restoreEssay,
    saveDraft, saveFormatting, saveSettings, saveOutline, getPlanning, answerPlanning,
    listVersions, getVersion, createSnapshot, restoreSnapshot, listSubjects, createSubject,
    deleteSubject, saveSource, deleteSource, updateAnnotation, citeSource, exportData,
    requestAI, listAI, resolveProposal };
}
