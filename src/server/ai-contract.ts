import { fail } from "./errors.ts";
import * as v from "./validation.ts";
import type { AIOutput, Explanation, Relationship } from "./ai-types.ts";

const relationships = ["SUPPORTS", "EXPLAINS", "EXEMPLIFIES", "CONTRASTS", "CONCLUDES"] as const;
export const responseSchema = {
  type: "object", additionalProperties: false,
  properties: {
    text: { type: "string" }, explanation: { type: "string" },
    annotations: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: { blockId: { type: "string" }, quote: { type: "string" }, role: { type: "string", enum: [...v.roles] }, explanation: { type: "string" } },
      required: ["blockId", "quote", "role", "explanation"],
    } },
    relationships: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: { fromIndex: { type: "integer" }, toIndex: { type: "integer" }, type: { type: "string", enum: [...relationships] }, explanation: { type: "string" } },
      required: ["fromIndex", "toIndex", "type", "explanation"],
    } },
  }, required: ["text", "explanation", "annotations", "relationships"],
};

export function blocks(raw: unknown) {
  const result: { blockId: string; text: string }[] = [];
  function visit(node: v.DocumentNode) {
    if (["paragraph", "heading"].includes(node.type) && typeof node.attrs?.id === "string") {
      result.push({ blockId: node.attrs.id, text: v.plainText(node).replace(/\n$/, "") });
    }
    node.content?.forEach(visit);
  }
  visit(v.document(raw));
  return result;
}

export function decodeOutput(raw: unknown): AIOutput {
  const input = v.object(raw, ["text", "explanation", "annotations", "relationships"]);
  const text = v.text(input.text, "AI text", 60_000);
  const explanation = v.text(input.explanation, "AI explanation", 10_000);
  if (!Array.isArray(input.annotations) || input.annotations.length > 100) fail("VALIDATION_ERROR", "Invalid AI annotation count.");
  const annotations = input.annotations.map(raw => {
    const item = v.object(raw, ["blockId", "quote", "role", "explanation"]);
    return { blockId: v.uuid(item.blockId, "blockId"), quote: v.text(item.quote, "quotation", 2000),
      role: v.choice(item.role, v.roles, "role"), explanation: v.text(item.explanation, "explanation", 2000) };
  });
  if (!Array.isArray(input.relationships) || input.relationships.length > 200) fail("VALIDATION_ERROR", "Invalid AI relationship count.");
  const keys = new Set<string>();
  const links = input.relationships.map(raw => {
    const item = v.object(raw, ["fromIndex", "toIndex", "type", "explanation"]);
    const fromIndex = v.integer(item.fromIndex, "fromIndex", 0, annotations.length - 1);
    const toIndex = v.integer(item.toIndex, "toIndex", 0, annotations.length - 1);
    const type = v.choice(item.type, relationships, "relationship");
    const key = `${fromIndex}:${toIndex}:${type}`;
    if (fromIndex === toIndex || keys.has(key)) fail("VALIDATION_ERROR", "AI relationship is duplicated or self-referencing.");
    keys.add(key);
    return { fromIndex, toIndex, type: type as Relationship, explanation: v.text(item.explanation, "explanation", 2000) };
  });
  return { text, explanation, annotations, relationships: links };
}

export function validateExplanation(raw: unknown, source: unknown): Explanation {
  const input = v.object(raw, ["kind", "text", "annotations", "relationships"]);
  if (input.kind !== "EXPLANATION") fail("VALIDATION_ERROR", "Invalid explanation format.");
  const decoded = decodeOutput({ text: input.text, explanation: "Essay structure", annotations: input.annotations, relationships: input.relationships });
  const byId = new Map(blocks(source).map(block => [block.blockId, block.text]));
  return { annotations: decoded.annotations.map(annotation => {
    const text = byId.get(annotation.blockId);
    const start = text?.indexOf(annotation.quote) ?? -1;
    if (text === undefined || start < 0) fail("VALIDATION_ERROR", "An AI explanation refers to a passage that does not exist.");
    return { role: annotation.role, explanation: annotation.explanation,
      anchor: { blockId: annotation.blockId, from: start, to: start + annotation.quote.length, quote: annotation.quote } };
  }), relationships: decoded.relationships };
}
