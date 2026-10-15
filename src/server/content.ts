import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.ts";

export const contentInclude = {
  outlineNodes: true, annotations: true, relationships: true, evidenceLinks: true,
} as const;
export type VersionContent = Prisma.EssayVersionGetPayload<{ include: typeof contentInclude }>;
export const json = (value: unknown) => value as Prisma.InputJsonValue;

export async function copyContent(tx: Prisma.TransactionClient, source: VersionContent, versionId: string, lockVersion: number) {
  const nodes = new Map(source.outlineNodes.map(node => [node.id, randomUUID()]));
  const annotations = new Map(source.annotations.map(annotation => [annotation.id, randomUUID()]));
  if (nodes.size) await tx.outlineNode.createMany({ data: source.outlineNodes.map(node => ({
    id: nodes.get(node.id)!, versionId, nodeKey: node.nodeKey,
    parentId: node.parentId ? nodes.get(node.parentId)! : null,
    position: node.position, role: node.role, content: node.content, origin: node.origin,
  })) });
  if (annotations.size) await tx.annotation.createMany({ data: source.annotations.map(annotation => ({
    id: annotations.get(annotation.id)!, versionId, annotationKey: annotation.annotationKey,
    outlineNodeId: annotation.outlineNodeId ? nodes.get(annotation.outlineNodeId)! : null,
    role: annotation.role, anchor: json(annotation.anchor), explanation: annotation.explanation,
    basedOnLockVersion: lockVersion, origin: annotation.origin,
    reviewStatus: annotation.reviewStatus, mappingStatus: annotation.mappingStatus,
  })) });
  if (source.relationships.length) await tx.ideaRelationship.createMany({ data: source.relationships.map(link => ({
    versionId, fromAnnotationId: annotations.get(link.fromAnnotationId)!,
    toAnnotationId: annotations.get(link.toAnnotationId)!, type: link.type,
    explanation: link.explanation, origin: link.origin,
  })) });
  if (source.evidenceLinks.length) await tx.evidenceLink.createMany({ data: source.evidenceLinks.map(link => ({
    essayId: source.essayId, versionId, annotationId: annotations.get(link.annotationId)!,
    sourceId: link.sourceId, quotation: link.quotation, locator: link.locator,
    citationSnapshot: json(link.citationSnapshot), verificationStatus: link.verificationStatus,
  })) });
}

export async function clearContent(tx: Prisma.TransactionClient, versionId: string) {
  await tx.evidenceLink.deleteMany({ where: { versionId } });
  await tx.ideaRelationship.deleteMany({ where: { versionId } });
  await tx.annotation.deleteMany({ where: { versionId } });
  // One statement removes the whole tree; NO ACTION FKs are checked after it.
  await tx.outlineNode.deleteMany({ where: { versionId } });
}
