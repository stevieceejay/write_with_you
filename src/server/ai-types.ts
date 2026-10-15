import type { DocumentNode, Json, Role } from "./validation.ts";

export type AIOperation = "DRAFT" | "REVISE" | "EXPLAIN";
export type Relationship = "SUPPORTS" | "EXPLAINS" | "EXEMPLIFIES" | "CONTRASTS" | "CONCLUDES";
export type Explanation = {
  annotations: { role: Role; anchor: Record<string, Json>; explanation: string }[];
  relationships: { fromIndex: number; toIndex: number; type: Relationship; explanation: string }[];
};
export type AIContext = {
  operation: AIOperation; instruction: string; requestId: string;
  version: {
    topic: string | null; audience: string | null; purpose: string | null; essayType: string | null;
    documentJson: unknown; plainText: string;
    outlineNodes: { id: string; parentId: string | null; position: number; role: string; content: string }[];
  };
};
export type AIAdapter = {
  readonly model: string;
  assertConfigured(): void;
  generate(context: AIContext): Promise<{ changes: Record<string, unknown>; explanation: string; inputTokens?: number; outputTokens?: number }>;
  validateExplanation(raw: unknown, document: unknown): Explanation;
};
export type AIOutput = {
  text: string; explanation: string;
  annotations: { blockId: string; quote: string; role: Role; explanation: string }[];
  relationships: Explanation["relationships"];
};
export type DocumentChange = { kind: "DOCUMENT"; document: DocumentNode };
