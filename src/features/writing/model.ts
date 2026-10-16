import type { Annotation, DocumentNode, Json, OutlineNode, Role, Selection } from "./types.ts";

export const modes = [
  { id: "plan", title: "Plan", icon: "outline", description: "Find your angle. Connect your ideas.", verb: "Start with an idea" },
  { id: "draft", title: "Draft", icon: "pen", description: "Give your outline a voice of its own.", verb: "Find your flow" },
  { id: "revise", title: "Revise", icon: "shuffle", description: "Try a new approach. Make it stronger.", verb: "Explore another way" },
  { id: "review", title: "Review", icon: "document", description: "Read it fresh. Add the finishing touches.", verb: "See the whole picture" },
  { id: "explain", title: "Explain", icon: "connections", description: "See how your argument comes together.", verb: "Understand your writing" },
] as const;
export const roleLabels: Record<Role, string> = {
  THESIS: "Central idea", MAIN_IDEA: "Supporting idea", REASON: "Reason", EVIDENCE: "Evidence",
  EXAMPLE: "Example", EXPLANATION: "Explanation", TRANSITION: "Transition", INTRODUCTION: "Introduction", CONCLUSION: "Conclusion",
};
export const roleColors: Record<Role, string> = {
  THESIS: "#825fba", MAIN_IDEA: "#4e7bac", REASON: "#4e7bac", EVIDENCE: "#438264", EXAMPLE: "#b28435",
  EXPLANATION: "#448c94", TRANSITION: "#81817b", INTRODUCTION: "#81817b", CONCLUSION: "#81817b",
};
export function nodeText(node: DocumentNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(nodeText).join(["doc", "bulletList", "orderedList", "blockquote", "listItem"].includes(node.type) ? "\n\n" : "");
}
export function documentText(doc: DocumentNode) { return (doc.content ?? []).map(nodeText).join("\n\n"); }
export function wordCount(doc: DocumentNode) {
  const text = documentText(doc);
  return Array.from(new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)).filter(part => part.isWordLike).length;
}
export function createParagraph(text = ""): DocumentNode {
  return { type: "paragraph", attrs: { id: globalThis.crypto.randomUUID() }, content: text ? [{ type: "text", text }] : [] };
}
export function getAnchor(annotation: Annotation): { blockId: string; from: number; to: number; quote: string } | null {
  const anchor = annotation.anchor;
  if (!anchor || typeof anchor !== "object") return null;
  const a = anchor as Record<string, unknown>;
  if (typeof a.blockId !== "string" || typeof a.quote !== "string" || !Number.isSafeInteger(a.from) || !Number.isSafeInteger(a.to)) return null;
  return { blockId: a.blockId, from: a.from as number, to: a.to as number, quote: a.quote };
}
export function activeAnnotations(annotations: Annotation[], doc: DocumentNode) {
  const blocks = new Map<string, string>();
  const visit = (node: DocumentNode) => { if (typeof node.attrs?.id === "string") blocks.set(node.attrs.id, nodeText(node)); node.content?.forEach(visit); };
  visit(doc);
  return annotations.filter(annotation => {
    const anchor = getAnchor(annotation), text = anchor ? blocks.get(anchor.blockId) : undefined;
    return annotation.mappingStatus === "CURRENT" && annotation.reviewStatus !== "DISMISSED" && anchor &&
      text !== undefined && anchor.from >= 0 && anchor.to > anchor.from && anchor.to <= text.length && text.slice(anchor.from, anchor.to) === anchor.quote;
  });
}
type Run = { type: "text"; text: string; marks?: DocumentNode["marks"] };
export function inlineRuns(node: DocumentNode): Run[] {
  if (node.type === "text") return [{ type: "text", text: node.text ?? "", ...(node.marks ? { marks: node.marks } : {}) }];
  if (node.type === "hardBreak") return [{ type: "text", text: "\n" }];
  return (node.content ?? []).flatMap(inlineRuns);
}
function sliceRuns(runs: Run[], from: number, to: number): Run[] {
  let offset = 0;
  return runs.flatMap(run => {
    const start = Math.max(from - offset, 0), end = Math.min(to - offset, run.text.length);
    offset += run.text.length;
    return end > start ? [{ ...run, text: run.text.slice(start, end) }] : [];
  });
}
function updateBlock(doc: DocumentNode, blockId: string, transform: (block: DocumentNode) => DocumentNode): DocumentNode {
  return { ...doc, content: doc.content?.map(block => block.attrs?.id === blockId ? transform(block) : block) };
}
export function editBlock(doc: DocumentNode, blockId: string, value: string): DocumentNode {
  return updateBlock(doc, blockId, block => {
    const old = nodeText(block), runs = inlineRuns(block);
    let prefix = 0, suffix = 0;
    while (prefix < old.length && prefix < value.length && old[prefix] === value[prefix]) prefix++;
    while (suffix < old.length - prefix && suffix < value.length - prefix && old[old.length - 1 - suffix] === value[value.length - 1 - suffix]) suffix++;
    const inserted = value.slice(prefix, value.length - suffix);
    const context = sliceRuns(runs, Math.max(0, prefix - 1), prefix)[0]?.marks;
    return { ...block, content: [...sliceRuns(runs, 0, prefix), ...(inserted ? [{ type: "text" as const, text: inserted, ...(context ? { marks: context } : {}) }] : []), ...sliceRuns(runs, old.length - suffix, old.length)] };
  });
}
export function applyMark(doc: DocumentNode, selection: Selection, type: string, attrs?: Record<string, Json>): DocumentNode {
  if (selection.to <= selection.from) return doc;
  return updateBlock(doc, selection.blockId, block => {
    const runs = inlineRuns(block), middle = sliceRuns(runs, selection.from, selection.to);
    const remove = middle.length > 0 && middle.every(run => run.marks?.some(mark => mark.type === type));
    return { ...block, content: [
      ...sliceRuns(runs, 0, selection.from),
      ...middle.map(run => ({ ...run, marks: [...(run.marks ?? []).filter(mark => mark.type !== type), ...(remove ? [] : [{ type, ...(attrs ? { attrs } : {}) }])] })),
      ...sliceRuns(runs, selection.to, nodeText(block).length),
    ] };
  });
}
export function splitBlock(doc: DocumentNode, selection: Selection): DocumentNode {
  return { ...doc, content: (doc.content ?? []).flatMap(block => {
    if (block.attrs?.id !== selection.blockId) return [block];
    const runs = inlineRuns(block);
    return [{ ...block, content: sliceRuns(runs, 0, selection.from) }, { ...createParagraph(), content: sliceRuns(runs, selection.to, nodeText(block).length) }];
  }) };
}
export function reorderBlock(doc: DocumentNode, index: number, direction: -1 | 1): DocumentNode {
  const content = [...doc.content ?? []], target = index + direction;
  if (index < 0 || target < 0 || index >= content.length || target >= content.length) return doc;
  [content[index], content[target]] = [content[target], content[index]];
  return { ...doc, content };
}
export function outlineRows(nodes: OutlineNode[]) {
  const children = new Map<string | null, OutlineNode[]>();
  for (const node of nodes) children.set(node.parentId, [...children.get(node.parentId) ?? [], node]);
  const rows: { node: OutlineNode; number: string; depth: number }[] = [];
  const seen = new Set<string>();
  function visit(parent: string | null, prefix = "", depth = 0) {
    (children.get(parent) ?? []).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).forEach((node, index) => {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      rows.push({ node, number, depth }); visit(node.id, number, depth + 1);
    });
  }
  visit(null);
  return rows;
}
export function outlinePayload(nodes: OutlineNode[]) {
  const keys = new Map(nodes.map(node => [node.id, node.nodeKey]));
  return nodes.map(node => ({ nodeKey: node.nodeKey, parentKey: node.parentId ? keys.get(node.parentId) ?? null : null, position: node.position, role: node.role, content: node.content }));
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
