import Link from "next/link";
import { Icon } from "../../components/icon.tsx";
import { dateLabel, modes } from "../writing/model.ts";
import type { EssaySummary, Mode, Subject } from "../writing/types.ts";

export function WritingTools({ latest, onStart, onNew }: { latest?: EssaySummary; onStart: (mode: Mode) => void; onNew: () => void }) {
  return <>
    <section className="start-banner" aria-labelledby="start-heading">
      <div><span className="pill">YOUR NEXT CHAPTER</span>
        <h2 id="start-heading">{latest ? "Good ideas are worth coming back to." : "Big ideas start with a little thinking."}</h2>
        <p>{latest ? <>Pick up <strong>{latest.title}</strong> right where you left off.</> : "You bring the ideas. We’ll help you give them shape."}</p>
        <button className="button button-dark" onClick={() => latest ? onStart("plan") : onNew()}>{latest ? "Continue writing" : "Start a new essay"}<Icon name="arrow" size={17}/></button>
      </div>
      <div className="banner-art" aria-hidden="true"><div className="art-paper"><span className="art-title">A thought worth exploring</span><span className="art-line wide"/><span className="art-line"/><span className="art-note">1. Start with your point of view.</span><span className="art-line wide"/><span className="art-line short"/><span className="art-note lower">2. Find the why behind it.</span><span className="art-line"/></div><span className="art-star">✳</span><span className="art-pencil"/></div>
    </section>
    <section className="modes-section" aria-labelledby="modes-heading">
      <div className="section-heading"><div><h2 id="modes-heading">Where would you like to begin?</h2><p>One essay. A little help at every stage.</p></div><span className="tiny-label">YOUR WRITING TOOLKIT</span></div>
      <div className="mode-grid">{modes.map((mode, index) => <button key={mode.id} className={`mode-card mode-${mode.id}`} onClick={() => onStart(mode.id)}>
        <div className="mode-card-top"><span className="mode-icon"><Icon name={mode.icon} size={23}/></span><span className="mode-number">0{index + 1}</span></div>
        <h3>{mode.title}</h3><p>{mode.description}</p><span className="mode-card-arrow"><Icon name="arrow" size={18}/></span>
      </button>)}
        <Link href="/essays?view=folders" className="mode-card mode-folder"><div className="mode-card-top"><span className="mode-icon"><Icon name="folder" size={23}/></span><span className="mode-number">06</span></div><h3>Folder</h3><p>All your essays, with a place for each idea.</p><span className="mode-card-arrow"><Icon name="arrow" size={18}/></span></Link>
      </div>
    </section>
  </>;
}

export function FolderBrowser({ subjects, selected, busy, onSelect, onNew, onDelete }: { subjects: Subject[]; selected: string; busy: boolean; onSelect: (id: string) => void; onNew: () => void; onDelete: (subject: Subject) => void }) {
  return <section className="folder-browser" aria-label="Subject folders">
    <div className="section-heading"><h2>Browse by subject</h2><button className="button button-quiet" onClick={onNew}><Icon name="plus" size={16}/>New subject</button></div>
    <div className="subject-grid">{subjects.map(subject => <div className={`subject-card ${selected === subject.id ? "selected" : ""}`} key={subject.id}>
      <button onClick={() => onSelect(subject.id)}><Icon name="folder" size={28}/><strong>{subject.name}</strong></button>
      <button className="icon-button subject-delete" aria-label={`Delete ${subject.name} folder`} disabled={busy} onClick={() => onDelete(subject)}><Icon name="close" size={15}/></button>
    </div>)}<button className="subject-card miscellaneous" onClick={() => onSelect("")}><Icon name="folder" size={28}/><strong>Miscellaneous</strong><span>Ideas without a subject yet</span></button></div>
  </section>;
}

type HistoryProps = {
  items: EssaySummary[]; total: number; folder: string; query: string; page: number;
  busy: boolean; loading: boolean; authenticated: boolean; folderView: boolean;
  onQuery: (value: string) => void; onFolder: (value: string) => void; onPage: (page: number) => void;
  onMove: (essay: EssaySummary) => void; onNew: () => void;
};
export function EssayHistory(props: HistoryProps) {
  const { items, total, folder, query, page, loading, busy } = props, trash = folder === "trash";
  return <section className="essay-history" aria-labelledby="history-heading">
    <div className="section-heading history-heading"><div><h2 id="history-heading">{trash ? "Essays you can restore" : props.folderView ? "Your saved essays" : "A little further along"}</h2><p>{trash ? "Your writing stays here until you restore it." : "Your drafts, finished pieces, and everything in between."}</p></div><span className="count-badge">{total} {total === 1 ? "essay" : "essays"}</span></div>
    <div className="history-toolbar"><label className="search-field"><Icon name="search" size={19}/><input aria-label="Search essay history" placeholder="Search by title, subject, or something you wrote…" value={query} onChange={event => props.onQuery(event.target.value)}/>{query && <button className="icon-button" onClick={() => props.onQuery("")} aria-label="Clear search"><Icon name="close" size={15}/></button>}</label>
      {!trash && <select className="filter-select" aria-label="Filter essay organization" value={folder} onChange={event => props.onFolder(event.target.value)}><option value="all">All essays</option><option value="organized">Organized</option><option value="miscellaneous">Miscellaneous</option></select>}
    </div>
    <div aria-busy={loading} className={loading ? "history-content is-loading" : "history-content"}>{items.length ? <div className="essay-table">
      <div className="essay-table-head"><span>ESSAY</span><span>SUBJECT</span><span>LAST EDITED</span><span>STAGE</span><span/></div>
      {items.map(essay => <div className="essay-row" key={essay.id}>
        <div className="essay-title-cell"><span className="essay-file-icon"><Icon name="document"/></span><div>{trash ? <strong>{essay.title}</strong> : <Link href={`/essays/${essay.id}`}>{essay.title}</Link>}<small>Created {dateLabel(essay.createdAt)}</small></div></div>
        <span className="essay-subject">{essay.subject?.name ?? "Miscellaneous"}</span><span className="essay-date">{dateLabel(essay.updatedAt)}</span><span className={`stage-tag stage-${essay.workflowStage.toLowerCase()}`}>{essay.workflowStage.toLowerCase()}</span>
        <button className="icon-button" aria-label={trash ? `Restore ${essay.title}` : `Move ${essay.title} to Recently deleted`} disabled={busy} onClick={() => props.onMove(essay)}><Icon name={trash ? "refresh" : "trash"} size={17}/></button>
      </div>)}
    </div> : <div className="empty-state"><span className="empty-state-icon"><Icon name={query ? "search" : "document"} size={29}/></span><h3>{query ? "No essays found" : trash ? "Nothing here to restore" : "A blank page is a good beginning."}</h3><p>{query ? "Try another word, title, or subject." : trash ? "Essays you delete will appear here." : props.authenticated ? "Start your first essay. Your ideas already have a place here." : "Sign in to save your essays and come back to them anytime."}</p>{!query && !trash && <button className="button button-quiet" onClick={props.onNew}>{props.authenticated ? "Create your first essay" : "Sign in to begin"}<Icon name="arrow" size={16}/></button>}</div>}</div>
    {(page > 0 || (page + 1) * 12 < total) && <div className="pagination"><button className="button button-quiet" disabled={!page || loading} onClick={() => props.onPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button className="button button-quiet" disabled={(page + 1) * 12 >= total || loading} onClick={() => props.onPage(page + 1)}>Next</button></div>}
  </section>;
}
