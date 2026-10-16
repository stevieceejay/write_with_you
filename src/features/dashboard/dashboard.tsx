"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "../../components/shell.tsx";
import { Dialog } from "../../components/dialog.tsx";
import { Icon } from "../../components/icon.tsx";
import { createEssay, createSubject, deleteSubject, restoreEssay, trashEssay } from "../../app/actions/essays.ts";
import { api } from "../writing/api.ts";
import type { EssaySummary, Mode, Notice, Subject } from "../writing/types.ts";
import { EssayHistory, FolderBrowser, WritingTools } from "./dashboard-views.tsx";

type Props = { initialEssays: EssaySummary[]; subjects: Subject[]; total: number; authenticated: boolean; initialQuery?: string; initialFolder?: string; folderView?: boolean; initialNew?: boolean; loadError?: string };
export function Dashboard(props: Props) {
  const router = useRouter();
  const [items, setItems] = useState(props.initialEssays), [total, setTotal] = useState(props.total);
  const [subjects, setSubjects] = useState(props.subjects), [query, setQuery] = useState(props.initialQuery ?? "");
  const [folder, setFolder] = useState(props.initialFolder ?? "all"), [subjectFilter, setSubjectFilter] = useState("");
  const [page, setPage] = useState(0), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(props.loadError ? { kind: "error", text: props.loadError } : null);
  const [dialog, setDialog] = useState<"essay" | "subject" | null>(props.initialNew && props.authenticated ? "essay" : null);
  const [newTitle, setNewTitle] = useState(""), [subjectId, setSubjectId] = useState(""), [subjectName, setSubjectName] = useState("");
  const first = useRef(true), folders = Boolean(props.folderView), trash = folder === "trash";
  useEffect(() => { setNotice(props.loadError ? { kind: "error", text: props.loadError } : null); }, [props.loadError]);
  const parameters = () => new URLSearchParams({ query, folder, page: String(page), limit: "12", ...(subjectFilter ? { subjectId: subjectFilter } : {}) });
  async function reload(clearSubject = false) { const params = parameters(); if (clearSubject) params.delete("subjectId"); const result = await api<{ items: EssaySummary[]; total: number }>(`/api/essays?${params}`); setItems(result.items); setTotal(result.total); }
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!props.authenticated) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ query, folder, page: String(page), limit: "12", ...(subjectFilter ? { subjectId: subjectFilter } : {}) });
        const result = await api<{ items: EssaySummary[]; total: number }>(`/api/essays?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted) { setItems(result.items); setTotal(result.total); }
      } catch (error) { if (!controller.signal.aborted) setNotice({ kind: "error", text: error instanceof Error ? error.message : "Essays could not be loaded." }); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 300);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, folder, subjectFilter, page, props.authenticated]);
  function openNew() { if (!props.authenticated) { router.push("/sign-in"); return; } setNotice(null); setDialog("essay"); }
  function start(mode: Mode) { if (!props.authenticated) router.push("/sign-in"); else if (items[0] && !trash) router.push(`/essays/${items[0].id}?mode=${mode}`); else openNew(); }
  async function perform(operation: () => Promise<void>) {
    setBusy(true); setNotice(null);
    try { await operation(); } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Please try again." }); }
    finally { setBusy(false); }
  }
  function newEssay(event: FormEvent) {
    event.preventDefault(); void perform(async () => {
      const result = await createEssay({ title: newTitle.trim() || "Untitled essay", subjectId: subjectId || null });
      if (!result.ok) throw new Error(result.error.message);
      router.push(`/essays/${result.data.id}?mode=plan`);
    });
  }
  function newSubject(event: FormEvent) {
    event.preventDefault(); void perform(async () => {
      const result = await createSubject({ name: subjectName });
      if (!result.ok) throw new Error(result.error.message);
      setSubjects(previous => [...previous, { id: result.data.id, name: result.data.name }]); setSubjectId(result.data.id); setSubjectName(""); setDialog(null); setNotice({ kind: "success", text: "Your subject folder is ready." });
    });
  }
  function moveEssay(essay: EssaySummary) {
    if (!trash && !window.confirm(`Move “${essay.title}” to Recently deleted? You can restore it later.`)) return;
    void perform(async () => { const result = await (trash ? restoreEssay : trashEssay)({ essayId: essay.id }); if (!result.ok) throw new Error(result.error.message); await reload(); setNotice({ kind: "success", text: trash ? "Essay restored." : "Essay moved to Recently deleted." }); });
  }
  function removeSubject(subject: Subject) {
    if (!window.confirm(`Delete the “${subject.name}” folder? Its essays will move to Miscellaneous.`)) return;
    void perform(async () => { const result = await deleteSubject({ subjectId: subject.id }); if (!result.ok) throw new Error(result.error.message); setSubjects(previous => previous.filter(item => item.id !== subject.id)); setSubjectFilter(""); await reload(true); setNotice({ kind: "success", text: "Folder removed. Your essays are still saved." }); });
  }
  return <Shell active={trash ? "trash" : folders ? "folder" : "home"} authenticated={props.authenticated} onNew={openNew}>
    <div className="dashboard page-enter">
      <div className="page-heading"><div><p className="eyebrow">{trash ? "NOT GONE FOR GOOD" : folders ? "EVERY IDEA HAS A HOME" : "A FRESH PAGE, A NEW POSSIBILITY"}</p><h1>{trash ? "Recently deleted" : folders ? "Your essay library" : <>Your words.<br className="mobile-break"/> Your way<span className="accent-period">.</span></>}</h1><p className="heading-description">{trash ? "A change of mind is welcome. Restore an essay whenever you need it." : folders ? "Keep your subjects together and your next draft within reach." : "From that first spark to the final sentence. Let’s write something that sounds like you."}</p></div><span className="heading-flourish" aria-hidden="true"><Icon name={folders ? "folder" : "pen"} size={57}/><span>make it<br/>your own.</span></span></div>
      {notice && <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}<button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss message"><Icon name="close" size={16}/></button></div>}
      {!folders && !trash && <WritingTools latest={items[0]} onStart={start} onNew={openNew}/>}
      {folders && <FolderBrowser subjects={subjects} selected={subjectFilter} busy={busy} onSelect={id => { setSubjectFilter(id === subjectFilter ? "" : id); setFolder(id ? "organized" : "miscellaneous"); setPage(0); }} onNew={() => props.authenticated ? setDialog("subject") : router.push("/sign-in")} onDelete={removeSubject}/>}
      <EssayHistory items={items} total={total} folder={folder} query={query} page={page} busy={busy} loading={loading} authenticated={props.authenticated} folderView={folders} onQuery={value => { setQuery(value); setPage(0); }} onFolder={value => { setFolder(value); setSubjectFilter(""); setPage(0); }} onPage={setPage} onMove={moveEssay} onNew={openNew}/>
    </div>
    {dialog === "essay" && <Dialog title="A new essay starts here" onClose={() => !busy && setDialog(null)}><form onSubmit={newEssay} className="dialog-form"><p>A title can change. Your first thought is enough.</p><label>Essay title<input autoFocus value={newTitle} onChange={event => setNewTitle(event.target.value)} maxLength={300} placeholder="What’s on your mind?"/></label><label>Subject <span className="optional">optional</span><select value={subjectId} onChange={event => setSubjectId(event.target.value)}><option value="">Save in Miscellaneous</option>{subjects.map(subject => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label>{notice?.kind === "error" && <p className="field-error" role="alert">{notice.text}</p>}<button className="button button-dark" disabled={busy}>{busy ? "Opening your page…" : "Let’s make a plan"}<Icon name="arrow" size={17}/></button></form></Dialog>}
    {dialog === "subject" && <Dialog title="Make room for a subject" onClose={() => !busy && setDialog(null)}><form className="dialog-form" onSubmit={newSubject}><label>Subject name<input autoFocus value={subjectName} onChange={event => setSubjectName(event.target.value)} maxLength={120} required placeholder="Literature, Biology, History…"/></label>{notice?.kind === "error" && <p role="alert" className="field-error">{notice.text}</p>}<button disabled={busy} className="button button-dark">{busy ? "Creating…" : "Create subject folder"}</button></form></Dialog>}
  </Shell>;
}
