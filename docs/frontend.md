# React writing studio

The frontend uses the existing Next.js App Router and React stack. It adds no
runtime dependencies. Server Components load owned records, Client Components
handle interaction, Server Actions save data, and existing Route Handlers provide
AI, export, and asynchronous reads. No browser-provided user ID is accepted.

## Component map

| Component | Responsibility | Server operations |
| --- | --- | --- |
| Dashboard | Create essays, search history, organize and restore | listEssays, createEssay, trashEssay, restoreEssay |
| FolderBrowser | Subject folders and Miscellaneous | listSubjects, createSubject, deleteSubject |
| PlanPanel / Outline | Guided topic, audience, purpose, thesis, reasons, nested support | getPlanning, answerPlanning, saveOutline |
| Workspace / Editor | Structured document editing and save coordination | getEssay, saveDraft, saveSettings, updateEssay |
| RevisionTools / ProposalDialog | Alternative openings and structure, compare before accepting | requestAI, listAI, resolveProposal |
| FormattingTools / DocumentView | Type, paper, colors, spacing, rendered text | saveFormatting |
| ExplainPanel | Exact passage roles, confirmation, and idea relationships | requestAI, annotatePassage, updateAnnotation |
| Version dialog | Save, compare, and restore snapshots | listVersions, getVersion, createSnapshot, restoreSnapshot |
| Sources dialog | References and passage citations | saveSource, deleteSource, citeSource |
| Review export controls | Local text download, browser print/PDF, private cloud export | exportData through the export Route Handler |

Files live under `src/features/dashboard`, `src/features/writing`, and
`src/components`. Browser-safe document transformations live in `model.ts`;
server validation is imported only as types by client modules.

## Writing workflow

1. Sign in and choose **New essay**. A subject is optional; essays without one
   appear in Miscellaneous. Subject folders can be created from My folders.
2. Plan asks one question at a time. Answers persist through the existing
   planning state machine. Supporting details can attach to any outline point,
   including another detail. Click an outline point in Plan to edit it.
3. Draft supports paragraph editing, Enter to split, Shift+Enter for a line,
   selected-text bold/italic/underline/highlights, and rendered Preview. Existing
   structured lists can be previewed or explicitly converted to editable paragraphs.
   The editor uses controlled textareas instead of accepting arbitrary HTML.
4. Click **Save writing** to persist draft changes. Writing is not autosaved.
   Saving is explicit and its status is visible. Before AI, formatting, planning,
   annotation, and snapshot operations, unsaved writing is saved first.
5. In Revise, move paragraphs or request a different opening, main-idea placement,
   introduction/conclusion treatment, or terminology. A proposed document is shown
   beside the current draft. It changes the saved work only when accepted.
   Select words and assign a role to create your own structural annotation.
6. Review renders actual marks and page settings. Appearance settings apply after
   saving. Local text downloads need no cloud storage; private exports require the
   configured storage service. Browser print/PDF depends on printer settings and
   does not promise exact pagination for every custom paper dimension.
7. Explain displays current, exact quotation anchors with both colors and labels.
   AI explanations must be reviewed before their highlights are installed. Roles
   can then be confirmed, changed, or dismissed. Relationships link real annotations.
   Text edits mark earlier explanations stale; stale ranges are never highlighted.
8. Save named snapshots before trying alternatives. Compare and restore them in
   Versions. Sources may be linked to highlighted passages; cited sources cannot
   be removed while their evidence links remain in working or saved versions.

The introduction/body/conclusion guides in the paragraph editor indicate paragraph
positions. They are not AI analysis. Explain's validated annotations provide the
actual semantic roles. Milestones indicate saved settings, outline, writing, and
snapshots; they are not a writing-quality score.

## Save safety and accessibility

One mutation runs at a time and the editor is disabled during it. All version
writes carry the server's lockVersion. A conflicting save preserves local text,
offers a text download, and requires an explicit reload before discarding edits.
The app warns on browser unload and ordinary in-app links with unsaved writing.
Browser Back/Forward and process termination cannot be guaranteed by a client
navigation warning; use Save writing before leaving.

The interface includes keyboard focus styles, labeled controls, native modal
dialogs, error/status announcements, a skip link, reduced-motion support, and
responsive navigation. User text is rendered through React; no essay HTML is
injected into the page. Keys and database credentials remain server-side.

## Local verification

```powershell
npm.cmd test
npm.cmd run db:test:local
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3100
# In a second terminal:
npm.cmd run test:smoke
```

The unit tests cover document transformations, mark preservation, stable paragraph
IDs, outline hierarchy, exact/stale highlights, Unicode word counts, authentication,
and student annotation ownership/range validation. In-memory PostgreSQL tests cover
migration constraints. HTTP smoke tests exercise the home, folder, trash, auth, and
health pages and verify that anonymous private API requests fail closed.

The selected AI model is `gpt-6.1-sol`, configured through OPENAI_MODEL. The private
OpenAI key has been detected without printing it; provider access could not be
verified because outbound API requests from this workspace return EACCES.

Clerk is currently unconfigured in the workspace. Full authenticated browser CRUD,
real Neon saves, OpenAI suggestions, and private storage exports require valid
provider credentials and reachable services. An anonymous homepage preview does
not demonstrate those operations. No production authentication bypass or demo-user
route was introduced.
