import { randomUUID } from "node:crypto";
import { fail } from "./errors.ts";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export const roles = ["THESIS", "MAIN_IDEA", "REASON", "EVIDENCE", "EXAMPLE", "EXPLANATION", "TRANSITION", "INTRODUCTION", "CONCLUSION"] as const;
export type Role = typeof roles[number];
export const steps = ["TOPIC", "AUDIENCE", "PURPOSE", "THESIS", "REASONS", "SUPPORTING_DETAILS", "COMPLETE"] as const;
export type Step = typeof steps[number];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail("VALIDATION_ERROR", "Expected an object.");
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key))) fail("VALIDATION_ERROR", "Unexpected input field.");
  return result;
}

export function text(value: unknown, name: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.includes("\u0000")) fail("VALIDATION_ERROR", `${name} must be text.`);
  const result = value.trim();
  if ((!allowEmpty && !result) || result.length > max) fail("VALIDATION_ERROR", `${name} has an invalid length.`);
  return result;
}

export function uuid(value: unknown, name = "id"): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) fail("VALIDATION_ERROR", `${name} must be a UUID.`);
  return value.toLowerCase();
}

export function integer(value: unknown, name: string, min = 0, max = 2_147_483_646): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail("VALIDATION_ERROR", `${name} must be an integer between ${min} and ${max}.`);
  return value;
}

export function choice<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail("VALIDATION_ERROR", `${name} is invalid.`);
  return value as T;
}

export function optionalText(value: unknown, name: string, max: number): string | null {
  return value === null || value === undefined || value === "" ? null : text(value, name, max);
}

export type OutlineInput = { nodeKey: string; parentKey: string | null; position: number; role: Role; content: string };
export function outline(value: unknown): OutlineInput[] {
  if (!Array.isArray(value) || value.length > 500) fail("VALIDATION_ERROR", "An outline can contain at most 500 points.");
  const nodes = value.map(raw => {
    const item = object(raw, ["nodeKey", "parentKey", "position", "role", "content"]);
    return {
      nodeKey: uuid(item.nodeKey, "nodeKey"),
      parentKey: item.parentKey == null ? null : uuid(item.parentKey, "parentKey"),
      position: integer(item.position, "position", 0, 10_000),
      role: choice(item.role, roles, "role"),
      content: text(item.content, "content", 10_000),
    };
  });
  const byKey = new Map(nodes.map(n => [n.nodeKey, n]));
  if (nodes.reduce((total, node) => total + node.content.length, 0) > 200_000) fail("VALIDATION_ERROR", "Outline exceeds 200,000 characters.");
  if (byKey.size !== nodes.length) fail("VALIDATION_ERROR", "Outline keys must be unique.");
  const positions = new Set<string>();
  for (const node of nodes) {
    const path = new Set<string>([node.nodeKey]);
    let parent = node.parentKey;
    const slot = `${parent ?? "root"}:${node.position}`;
    if (positions.has(slot)) fail("VALIDATION_ERROR", "Sibling outline positions must be unique.");
    positions.add(slot);
    while (parent) {
      if (path.has(parent)) fail("VALIDATION_ERROR", "Outline points cannot form a cycle.");
      path.add(parent);
      const ancestor = byKey.get(parent);
      if (!ancestor) fail("VALIDATION_ERROR", "An outline parent is missing.");
      parent = ancestor.parentKey;
    }
  }
  return nodes;
}

export type DocumentNode = { type: string; text?: string; attrs?: Record<string, Json>; content?: DocumentNode[]; marks?: { type: string; attrs?: Record<string, Json> }[] };
const nodeTypes = ["doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote", "hardBreak", "horizontalRule"];
const markTypes = ["bold", "italic", "underline", "strike", "highlight", "textStyle", "link"];
const colors = /^#[0-9a-f]{6}$/i;
const fonts = ["Georgia", "Arial", "Times New Roman", "Verdana", "monospace", "serif", "sans-serif"];

export function document(value: unknown): DocumentNode {
  let count = 0, characters = 0;
  const ids = new Set<string>();
  function walk(raw: unknown, depth: number): DocumentNode {
    if (++count > 5000 || depth > 20) fail("VALIDATION_ERROR", "Document is too complex.");
    const input = object(raw, ["type", "text", "attrs", "content", "marks"]);
    const type = choice(input.type, nodeTypes, "document node");
    if (depth === 0 ? type !== "doc" : type === "doc") fail("VALIDATION_ERROR", "Document root is invalid.");
    const result: DocumentNode = { type };
    if (type === "text") {
      if (typeof input.text !== "string" || input.text.includes("\u0000")) fail("VALIDATION_ERROR", "Text node is invalid.");
      characters += input.text.length;
      if (characters > 200_000) fail("VALIDATION_ERROR", "Essay exceeds 200,000 characters.");
      result.text = input.text;
    } else if (input.text !== undefined) fail("VALIDATION_ERROR", "Only text nodes can contain text.");
    if (input.attrs !== undefined) {
      const attrs = object(input.attrs, ["id", "level", "start", "textAlign"]);
      result.attrs = {};
      if (attrs.id !== undefined) {
        const id = uuid(attrs.id, "block id");
        if (ids.has(id)) fail("VALIDATION_ERROR", "Document block IDs must be unique.");
        ids.add(id); result.attrs.id = id;
      }
      if (attrs.level !== undefined) result.attrs.level = integer(attrs.level, "heading level", 1, 6);
      if (attrs.start !== undefined) result.attrs.start = integer(attrs.start, "list start", 1, 10_000);
      if (attrs.textAlign !== undefined) result.attrs.textAlign = choice(attrs.textAlign, ["left", "right", "center", "justify"], "text alignment");
    }
    if (["paragraph", "heading"].includes(type) && !result.attrs?.id) {
      const id = randomUUID(); ids.add(id); result.attrs = { ...result.attrs, id };
    }
    if (input.content !== undefined) {
      if (!Array.isArray(input.content) || ["text", "hardBreak", "horizontalRule"].includes(type)) fail("VALIDATION_ERROR", "Invalid document content.");
      result.content = input.content.map(child => walk(child, depth + 1));
      const allowedChildren: Record<string, string[]> = {
        doc: ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "horizontalRule"],
        paragraph: ["text", "hardBreak"], heading: ["text", "hardBreak"],
        bulletList: ["listItem"], orderedList: ["listItem"],
        listItem: ["paragraph", "heading", "bulletList", "orderedList", "blockquote"],
        blockquote: ["paragraph", "heading", "bulletList", "orderedList", "blockquote"],
      };
      if (result.content.some(child => !allowedChildren[type]?.includes(child.type))) fail("VALIDATION_ERROR", "Invalid document nesting.");
    }
    if (input.marks !== undefined) {
      if (type !== "text" || !Array.isArray(input.marks) || input.marks.length > 10) fail("VALIDATION_ERROR", "Invalid text marks.");
      result.marks = input.marks.map(rawMark => {
        const mark = object(rawMark, ["type", "attrs"]);
        const markType = choice(mark.type, markTypes, "mark");
        const attrs = mark.attrs === undefined ? {} : object(mark.attrs, ["color", "fontFamily", "fontSize", "href", "target", "rel"]);
        const clean: Record<string, Json> = {};
        if (attrs.color !== undefined) {
          if (typeof attrs.color !== "string" || !colors.test(attrs.color)) fail("VALIDATION_ERROR", "Invalid text color.");
          clean.color = attrs.color;
        }
        if (attrs.fontFamily !== undefined) clean.fontFamily = choice(attrs.fontFamily, fonts, "font");
        if (attrs.fontSize !== undefined) clean.fontSize = integer(attrs.fontSize, "font size", 8, 48);
        if (attrs.href !== undefined) {
          const href = text(attrs.href, "link", 2000);
          let url: URL;
          try { url = new URL(href); } catch { fail("VALIDATION_ERROR", "Invalid link."); }
          if (!["http:", "https:", "mailto:"].includes(url.protocol)) fail("VALIDATION_ERROR", "Unsafe link protocol.");
          clean.href = url.href; clean.rel = "noopener noreferrer";
        }
        return { type: markType, ...(Object.keys(clean).length ? { attrs: clean } : {}) };
      });
    }
    return result;
  }
  return walk(value, 0);
}

export function plainText(node: DocumentNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const content = (node.content ?? []).map(plainText).join("");
  return ["paragraph", "heading", "listItem", "blockquote"].includes(node.type) ? content + "\n" : content;
}

export function textDocument(value: string): DocumentNode {
  return document({ type: "doc", content: value.replaceAll("\r\n", "\n").split(/\n\s*\n/u).map(text => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] })) });
}

export function formatting(value: unknown): Record<string, Json> {
  const input = object(value, ["fontFamily", "fontSize", "lineHeight", "paperSize", "paperColor", "textColor", "pageWidthMm", "pageHeightMm", "marginMm"]);
  const result: Record<string, Json> = {};
  if (input.fontFamily !== undefined) result.fontFamily = choice(input.fontFamily, fonts, "font");
  if (input.fontSize !== undefined) result.fontSize = integer(input.fontSize, "font size", 8, 48);
  if (input.lineHeight !== undefined) {
    if (typeof input.lineHeight !== "number" || !Number.isFinite(input.lineHeight) || input.lineHeight < 1 || input.lineHeight > 3) fail("VALIDATION_ERROR", "Invalid line spacing.");
    result.lineHeight = input.lineHeight;
  }
  if (input.paperSize !== undefined) result.paperSize = choice(input.paperSize, ["A4", "LETTER", "CUSTOM"], "paper size");
  for (const key of ["paperColor", "textColor"] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "string" || !colors.test(input[key])) fail("VALIDATION_ERROR", "Invalid paper/text color.");
      result[key] = input[key];
    }
  }
  for (const key of ["pageWidthMm", "pageHeightMm", "marginMm"] as const) {
    if (input[key] !== undefined) result[key] = integer(input[key], key, key === "marginMm" ? 5 : 100, key === "marginMm" ? 50 : 500);
  }
  return result;
}
