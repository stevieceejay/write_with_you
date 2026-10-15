"use server";

import { backend } from "../../server/app.ts";
import { action } from "../../server/transport.ts";

export async function createEssay(input: unknown) { return action(() => backend.createEssay(input)); }
export async function updateEssay(input: unknown) { return action(() => backend.updateEssay(input)); }
export async function trashEssay(input: unknown) { return action(() => backend.trashEssay(input)); }
export async function restoreEssay(input: unknown) { return action(() => backend.restoreEssay(input)); }
export async function saveDraft(input: unknown) { return action(() => backend.saveDraft(input)); }
export async function saveFormatting(input: unknown) { return action(() => backend.saveFormatting(input)); }
export async function saveSettings(input: unknown) { return action(() => backend.saveSettings(input)); }
export async function saveOutline(input: unknown) { return action(() => backend.saveOutline(input)); }
export async function answerPlanning(input: unknown) { return action(() => backend.answerPlanning(input)); }
export async function createSnapshot(input: unknown) { return action(() => backend.createSnapshot(input)); }
export async function restoreSnapshot(input: unknown) { return action(() => backend.restoreSnapshot(input)); }
export async function createSubject(input: unknown) { return action(() => backend.createSubject(input)); }
export async function deleteSubject(input: unknown) { return action(() => backend.deleteSubject(input)); }
export async function saveSource(input: unknown) { return action(() => backend.saveSource(input)); }
export async function deleteSource(input: unknown) { return action(() => backend.deleteSource(input)); }
export async function updateAnnotation(input: unknown) { return action(() => backend.updateAnnotation(input)); }
export async function citeSource(input: unknown) { return action(() => backend.citeSource(input)); }
export async function resolveProposal(input: unknown) { return action(() => backend.resolveProposal(input)); }
