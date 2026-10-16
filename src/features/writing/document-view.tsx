import { Fragment, type CSSProperties, type ReactNode } from "react";
import { activeAnnotations, getAnchor, nodeText, roleColors, roleLabels } from "./model.ts";
import type { Annotation, DocumentNode, Json } from "./types.ts";

export function paperStyle(format: Record<string, Json>): CSSProperties {
  return { fontFamily: String(format.fontFamily ?? "Georgia"), fontSize: `${Number(format.fontSize ?? 12)}pt`, lineHeight: Number(format.lineHeight ?? 1.8), backgroundColor: String(format.paperColor ?? "#ffffff"), color: String(format.textColor ?? "#243c35"), "--paper-margin": `${Number(format.marginMm ?? 22)}mm`, "--paper-width": `${Number(format.paperSize === "LETTER" ? 216 : format.paperSize === "CUSTOM" ? format.pageWidthMm ?? 210 : 210)}mm`, "--paper-height": `${Number(format.paperSize === "LETTER" ? 279 : format.paperSize === "CUSTOM" ? format.pageHeightMm ?? 297 : 297)}mm` } as CSSProperties;
}
export function RoleLegend() { return <div className="role-legend" aria-label="Essay structure legend">{(["THESIS", "REASON", "EVIDENCE", "EXAMPLE", "EXPLANATION"] as const).map(role => <span key={role}><i style={{ background: roleColors[role] }}/>{roleLabels[role]}</span>)}</div>; }
export function DocumentView({ document, annotations = [], highlights = false, onAnnotation, selectedId }: { document: DocumentNode; annotations?: Annotation[]; highlights?: boolean; onAnnotation?: (id: string) => void; selectedId?: string | null }) {
  const valid = highlights ? activeAnnotations(annotations, document) : [];
  function render(node: DocumentNode, key: string, offset = { value: 0 }, blockId?: string): ReactNode {
    if (node.type === "text" || node.type === "hardBreak") {
      const text = node.type === "hardBreak" ? "\n" : node.text ?? "", start = offset.value; offset.value += text.length;
      const matches = valid.filter(a => getAnchor(a)?.blockId === blockId);
      const cuts = [...new Set([0, text.length, ...matches.flatMap(a => { const anchor = getAnchor(a)!; return [Math.max(0, Math.min(text.length, anchor.from - start)), Math.max(0, Math.min(text.length, anchor.to - start))]; })])].sort((a, b) => a - b);
      return <Fragment key={key}>{cuts.slice(0, -1).map((from, i) => {
        const to = cuts[i + 1]; let result: ReactNode = text.slice(from, to);
        for (const [index, mark] of (node.marks ?? []).entries()) {
          if (mark.type === "bold") result = <strong key={index}>{result}</strong>;
          if (mark.type === "italic") result = <em key={index}>{result}</em>;
          if (mark.type === "underline") result = <u key={index}>{result}</u>;
          if (mark.type === "strike") result = <s key={index}>{result}</s>;
          if (mark.type === "highlight") result = <mark key={index} style={{ backgroundColor: String(mark.attrs?.color ?? "#f4e7b1") }}>{result}</mark>;
          if (mark.type === "textStyle") result = <span key={index} style={{ color: typeof mark.attrs?.color === "string" ? mark.attrs.color : undefined, fontFamily: typeof mark.attrs?.fontFamily === "string" ? mark.attrs.fontFamily : undefined, fontSize: typeof mark.attrs?.fontSize === "number" ? `${mark.attrs.fontSize}pt` : undefined }}>{result}</span>;
          if (mark.type === "link" && typeof mark.attrs?.href === "string" && /^https?:\/\//i.test(mark.attrs.href)) result = <a key={index} href={mark.attrs.href} target="_blank" rel="noopener noreferrer">{result}</a>;
        }
        const annotation = matches.find(a => { const anchor = getAnchor(a)!; return anchor.from <= start + from && anchor.to >= start + to; });
        return annotation ? <button type="button" className={`passage-highlight${selectedId === annotation.id ? " selected" : ""}`} data-annotation-id={annotation.id} key={from} style={{ "--role-color": roleColors[annotation.role] } as CSSProperties} title={`${roleLabels[annotation.role]}: ${annotation.explanation ?? ""}`} aria-label={`${roleLabels[annotation.role]}: ${text.slice(from, to)}`} onClick={() => onAnnotation?.(annotation.id)}>{result}</button> : <Fragment key={from}>{result}</Fragment>;
      })}</Fragment>;
    }
    const id = typeof node.attrs?.id === "string" ? node.attrs.id : blockId;
    const localOffset = ["paragraph", "heading"].includes(node.type) ? { value: 0 } : offset;
    const children = node.content?.map((child, i) => render(child, `${key}-${i}`, localOffset, id));
    const alignment = node.attrs?.textAlign;
    const style: CSSProperties = { textAlign: ["left", "center", "right", "justify"].includes(String(alignment)) ? alignment as CSSProperties["textAlign"] : undefined };
    if (node.type === "doc") return <Fragment key={key}>{children}</Fragment>;
    if (node.type === "heading") { const Heading = Number(node.attrs?.level ?? 2) <= 2 ? "h2" : "h3"; return <Heading key={key} style={style}>{children}</Heading>; }
    if (node.type === "bulletList") return <ul key={key}>{children}</ul>;
    if (node.type === "orderedList") return <ol key={key} start={Number(node.attrs?.start ?? 1)}>{children}</ol>;
    if (node.type === "listItem") return <li key={key}>{children}</li>;
    if (node.type === "blockquote") return <blockquote key={key}>{children}</blockquote>;
    if (node.type === "horizontalRule") return <hr key={key}/>;
    return <p key={key} style={style} data-block-id={id}>{children?.length ? children : <br/>}</p>;
  }
  return <div className="document-content">{nodeText(document).trim() ? render(document, "document") : <p className="document-placeholder">Your next sentence starts here.</p>}</div>;
}
