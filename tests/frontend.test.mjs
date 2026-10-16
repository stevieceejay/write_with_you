import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { activeAnnotations, applyMark, createParagraph, documentText, editBlock, getAnchor, inlineRuns, outlinePayload, outlineRows, reorderBlock, splitBlock, wordCount } from '../src/features/writing/model.ts';
import { document as validateDocument } from '../src/server/validation.ts';

const makeDocument = (...lines) => ({ type: 'doc', content: lines.map(createParagraph) });
test('editing text preserves formatting outside the changed range and stable block identity', () => {
  let doc = makeDocument('Reason and evidence'); const id = doc.content[0].attrs.id;
  doc = applyMark(doc, { blockId: id, from: 0, to: 6 }, 'bold');
  const edited = editBlock(doc, id, 'Reason and reliable evidence');
  assert.equal(edited.content[0].attrs.id, id);
  assert.equal(documentText(edited), 'Reason and reliable evidence');
  assert.deepEqual(inlineRuns(edited.content[0])[0].marks, [{ type: 'bold' }]);
  assert.deepEqual(validateDocument(edited), edited);
});
test('marks apply only to the selection and toggle without removing unrelated marks', () => {
  let doc = makeDocument('A clear idea'); const selection = { blockId: doc.content[0].attrs.id, from: 2, to: 7 };
  doc = applyMark(doc, selection, 'bold'); doc = applyMark(doc, selection, 'italic'); doc = applyMark(doc, selection, 'bold');
  const runs = inlineRuns(doc.content[0]);
  assert.equal(runs[0].text, 'A '); assert.equal(runs[1].text, 'clear'); assert.equal(runs[2].text, ' idea');
  assert.deepEqual(runs[1].marks, [{ type: 'italic' }]); assert.equal(runs[0].marks, undefined);
});
test('splitting a paragraph retains surrounding formatting and creates a new stable identity', () => {
  let doc = makeDocument('First second'); const id = doc.content[0].attrs.id;
  doc = applyMark(doc, { blockId: id, from: 0, to: 12 }, 'italic');
  const split = splitBlock(doc, { blockId: id, from: 5, to: 6 });
  assert.equal(documentText(split), 'First\n\nsecond');
  assert.equal(split.content[0].attrs.id, id); assert.notEqual(split.content[1].attrs.id, id);
  assert.deepEqual(split.content[1].content[0].marks, [{ type: 'italic' }]);
  assert.deepEqual(validateDocument(split), split);
});
test('reordering paragraphs preserves IDs, text, and marks, and ignores edge moves', () => {
  const doc = makeDocument('Intro', 'Reason', 'Conclusion'), reordered = reorderBlock(doc, 1, -1);
  assert.equal(documentText(reordered), 'Reason\n\nIntro\n\nConclusion');
  assert.equal(reordered.content[0].attrs.id, doc.content[1].attrs.id);
  assert.deepEqual(reorderBlock(doc, 0, -1), doc); assert.deepEqual(reorderBlock(doc, 2, 1), doc);
});
test('outline numbering uses tree structure and serializes logical parent keys', () => {
  const parent = { id: randomUUID(), nodeKey: randomUUID(), parentId: null, position: 0, role: 'THESIS', content: 'Central idea' };
  const child = { id: randomUUID(), nodeKey: randomUUID(), parentId: parent.id, position: 0, role: 'EVIDENCE', content: 'Support' };
  const sibling = { id: randomUUID(), nodeKey: randomUUID(), parentId: null, position: 1, role: 'REASON', content: 'Reason' };
  assert.deepEqual(outlineRows([sibling, child, parent]).map(row => row.number), ['1', '1.1', '2']);
  assert.equal(outlinePayload([parent, child])[1].parentKey, parent.nodeKey);
});
test('only current, exact, non-dismissed annotation ranges become highlights', () => {
  const doc = makeDocument('A reason with evidence'), id = doc.content[0].attrs.id;
  const base = { id: randomUUID(), role: 'REASON', mappingStatus: 'CURRENT', reviewStatus: 'CONFIRMED', anchor: { blockId: id, from: 2, to: 8, quote: 'reason' } };
  const candidates = [base, { ...base, mappingStatus: 'STALE' }, { ...base, reviewStatus: 'DISMISSED' }, { ...base, anchor: { ...base.anchor, from: -1 } }, { ...base, anchor: { ...base.anchor, quote: 'changed' } }, { ...base, anchor: { ...base.anchor, blockId: randomUUID() } }];
  assert.deepEqual(activeAnnotations(candidates, doc), [base]);
  assert.equal(getAnchor({ ...base, anchor: { blockId: id, from: 0.5, to: 2, quote: 'A' } }), null);
});
test('word count handles whitespace, punctuation, and Unicode without inventing progress', () => {
  assert.equal(wordCount(makeDocument('')), 0); assert.equal(wordCount(makeDocument('  A clear argument.\nWith evidence! ')), 5);
  assert.ok(wordCount(makeDocument('学生写文章')) > 0);
});
