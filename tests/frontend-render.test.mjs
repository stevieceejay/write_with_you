import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the real TSX component; this hook is restricted to this test process.
registerHooks({ load(url, context, nextLoad) { if (url.startsWith('file:') && url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText }; return nextLoad(url, context); } });
const { DocumentView } = await import('../src/features/writing/document-view.tsx');
const render = props => renderToStaticMarkup(createElement(DocumentView, props));
test('essay markup is escaped and executable link protocols are never rendered', () => {
  const html = render({ document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert("hello")</script>', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] } });
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<a ')); assert.ok(html.includes('&lt;script&gt;'));
});
test('exact passage highlights span marked runs without losing quotation offsets', () => {
  const blockId = randomUUID();
  const document = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: blockId }, content: [{ type: 'text', text: 'A ' }, { type: 'text', text: 'clear', marks: [{ type: 'bold' }] }, { type: 'text', text: ' idea.' }] }] };
  const annotation = { id: randomUUID(), role: 'THESIS', anchor: { blockId, from: 2, to: 12, quote: 'clear idea' }, mappingStatus: 'CURRENT', reviewStatus: 'CONFIRMED' };
  const html = render({ document, annotations: [annotation], highlights: true });
  assert.equal((html.match(/class="passage-highlight"/g) ?? []).length, 2);
  assert.match(html, /<strong>clear<\/strong>/); assert.match(html, /aria-label="Central idea:/);
  assert.ok(!render({ document, annotations: [{ ...annotation, mappingStatus: 'STALE' }], highlights: true }).includes('passage-highlight'));
});
test('safe links open with protection and text formatting survives rendering', () => {
  const html = render({ document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Evidence', marks: [{ type: 'underline' }, { type: 'italic' }, { type: 'link', attrs: { href: 'https://example.com/reference' } }] }] }] } });
  assert.match(html, /rel="noopener noreferrer"/); assert.match(html, /<em><u>Evidence<\/u><\/em>/);
});
