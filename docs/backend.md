# Backend implementation

The app uses Next.js App Router, Prisma 7, PostgreSQL, Clerk, OpenAI Responses,
and the S3-compatible Neon Object Storage interface. It runs in the Node.js runtime.
The React studio connects Plan/Draft/Revise/Review/Explain and Folder views to
these services. See [the frontend guide](frontend.md) for the component map.

## Structure

- `src/server/auth.ts`: verifies Clerk sessions and resolves a local User.
- `src/server/backend.ts`: ownership-checked essay services and transactions.
- `src/server/validation.ts`: strict input, document, and outline validation.
- `src/server/content.ts`: version copying with remapped row identities.
- `src/server/openai.ts`: bounded AI calls and structured suggestions.
- `src/server/ai-contract.ts`: verifies AI quotations against actual passages.
- `src/server/storage.ts`: private exports with five-minute download URLs.
- `src/server/neon-functions.ts` and `hello.ts`: protected text analysis.
- `src/app/actions/essays.ts`: Server Actions for frontend mutations.
- `src/app/api`: HTTP entry points that use the same services.

The production wiring modules use `server-only`. The pure service factory accepts
dependencies for testing; HTTP handlers always use the real server-session adapter.
There is no test-user header, development user override, or client-supplied identity.

## Environment

Copy `.env.example` only if you do not already have an environment file. Fill in
DATABASE_URL, optional DATABASE_URL_UNPOOLED, Clerk credentials, and OpenAI credentials.
Neon deploy/env pull supplies the AWS storage variables and NEON_FUNCTION_HELLO_BASE_URL.
Run `npm run neon:secrets` to generate FUNCTION_API_KEY without printing it.
The same key is forwarded to the Neon function through neon.ts.

Next.js and the command-line environment loader prefer `.env.local` over `.env`.
Do not leave conflicting values in both files. Never use NEXT_PUBLIC_ for database,
AWS, OpenAI, or function secrets. Only Clerk's publishable key belongs in public config.

Clerk must require a verified primary email. On a first authenticated request, the
server reads profile information from Clerk and creates the application's User record.
It never automatically merges accounts just because their email addresses match.
Clerk handles passwords, session cookies, verification, recovery, and sign-out.

The Prisma runtime uses the pooled DATABASE_URL with the Node PostgreSQL driver adapter
and a small reusable pool. Migration configuration prefers DATABASE_URL_UNPOOLED.
This preserves interactive transactions and PostgreSQL locking for saves and snapshots.

## Service behavior

Every service authenticates first. Input objects use explicit allowlists and reject
unexpected keys such as userId. Child records are scoped through the owned essay/version.
Unauthorized resource lookups return NOT_FOUND to avoid disclosing another user's data.

`annotatePassage` is a Server Action for manually labeling selected draft text.
It accepts essayId, expectedLockVersion, blockId, from, to, and role. The service
checks ownership and the version lock, derives the quotation from the stored
document, and rejects missing blocks or invalid ranges over 2,000 characters.
It creates a confirmed student annotation; it does not require an AI call.

Writing mutations lock the owned essay, then compare and increment the working
version's lockVersion. A mismatch rolls back and returns CONFLICT. All clients must
replace their local lockVersion with the returned value after a successful save.
Outline and planning changes use this same protocol. The server derives searchable
plain text from validated rich text; clients cannot submit an independent plainText.

Draft edits mark structural annotations and pending AI proposals stale. Formatting
changes preserve passage locations but invalidate pending AI proposals conservatively.
The initial implementation marks changed annotations stale rather than pretending it
can safely remap every editor operation. Re-analysis provides fresh passage anchors.

Planning follows TOPIC, AUDIENCE, PURPOSE, THESIS, REASONS, SUPPORTING_DETAILS. The
details step repeats for selected parent nodes. `add_reason` starts another reason,
and `finish` completes planning after a thesis and supporting point exist. The
server stores conversation history alongside authoritative settings/outline records.

Snapshots copy settings, document, formatting, outline, annotations, relationships,
and citation snapshots inside one transaction. Row IDs change; logical keys survive.
Snapshots are sealed before commit. Restoring one replaces the working content,
preserves the saved version, and advances the working lock rather than resetting it.
Conversation history remains on the working version and is not rewritten on restore.

Deletion moves essays to trash; restore makes them visible again. Permanent essay or
account deletion is intentionally not exposed by these endpoints yet. Subject deletion
moves its essays to Miscellaneous. A cited source cannot be deleted while a version
still references it. Account deletion/retention and export cleanup need a separate
production lifecycle implementation before release.

## HTTP endpoints

All essay/subject endpoints require a verified session. Mutation requests require
application/json when they have bodies, enforce byte limits, and reject cross-site
origins. API responses are private/no-store and contain safe errors without database
messages or credentials. Server Actions additionally use Next.js's origin protection.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Public application liveness; does not claim database health |
| GET / POST | `/api/essays` | Search/list or create essays |
| GET / PATCH / DELETE | `/api/essays/:essayId` | Read, edit metadata, or move to trash |
| GET | `/api/essays/:essayId/planning` | Planning progress and latest messages |
| GET | `/api/essays/:essayId/versions` | Version history |
| GET | `/api/essays/:essayId/versions?versionId=UUID` | An owned version and structure |
| POST | `/api/essays/:essayId/draft` | Save rich-text writing |
| POST | `/api/essays/:essayId/formatting` | Save review appearance |
| POST | `/api/essays/:essayId/settings` | Save topic/audience/purpose/type |
| POST | `/api/essays/:essayId/outline` | Replace a validated nested outline |
| POST | `/api/essays/:essayId/planning` | Answer or advance planning |
| POST | `/api/essays/:essayId/snapshot` | Create a saved version |
| POST | `/api/essays/:essayId/restore-snapshot` | Restore saved content into the working version |
| POST | `/api/essays/:essayId/restore` | Restore a trashed essay; body `{}` |
| POST | `/api/essays/:essayId/annotations` | Correct a working annotation's role/status |
| POST | `/api/essays/:essayId/sources` | Create or update bibliography metadata |
| POST | `/api/essays/:essayId/evidence` | Link an owned source to an owned current passage |
| GET / POST | `/api/essays/:essayId/ai` | Read request history or request suggestions |
| POST | `/api/essays/:essayId/proposal` | Accept/reject a suggestion |
| POST | `/api/essays/:essayId/export` | Store a private text export; body `{}` or `{versionId}` |
| POST | `/api/essays/:essayId/analyze` | Call the deployed protected text-analysis function |
| GET / POST / DELETE | `/api/subjects` | List/create/delete owned subjects |

Source deletion and other frontend writes are also available through Server Actions.
Use backend services directly from Server Components instead of making an HTTP call
back into this same application.

Example Server Action call (the browser supplies no user ID):

```ts
import { saveDraft } from "./app/actions/essays";

const result = await saveDraft({
  essayId,
  expectedLockVersion: 3,
  document: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "My argument." }] }],
  },
});
// Success: { ok: true, data: { versionId, lockVersion: 4, document } }
// Conflict: { ok: false, error: { code: "CONFLICT", message, requestId } }
```

The equivalent HTTP draft body omits essayId because it comes from the URL. Add
formatting only when needed. Supported formatting fields and allowed document
nodes/marks are defined in validation.ts; HTML and executable link protocols are rejected.

## AI suggestions

Operations are DRAFT, REVISE, and EXPLAIN. Requests include expectedLockVersion,
an optional instruction, and a fresh UUID idempotencyKey. Topic, audience, and purpose
must already exist; drafting also requires an outline. A user-row lock makes admission
atomic across instances: at most 20 attempts/hour and two recent active requests/user.

Only relevant essay context is sent to OpenAI. Responses use a strict schema, a
45-second timeout, bounded input/output, and store:false. There are no arbitrary tools
or direct AI database writes. Failed/incomplete responses cannot replace student text.
Results become pending proposals; changed versions make them stale. Accepted document
proposals are editable writing. Explanation proposals must quote existing blocks and
have valid relationships before annotations can be saved. Claims remain unverified.

The current API returns a complete proposal, not a token stream. A durable cancellation
queue, source-research verification, and cross-request provider cancellation are not
implemented. They should not be inferred from the request status fields.

## Verification

```powershell
npm.cmd test
npm.cmd run db:test:local
npm.cmd run db:validate
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3100
# In another terminal:
npm.cmd run test:smoke
```

The local database contract runs the checked-in migrations on a fresh in-memory
PGlite PostgreSQL engine, then verifies cross-owner foreign keys, unique working
versions, cycles, immutable snapshots, cascaded deletion, locking, and search.
`npm run db:test` runs the same contract against configured PostgreSQL, with every
fixture transaction rolled back. The pure service tests use controlled database
doubles; they do not establish real Clerk, Prisma/PostgreSQL, OpenAI, or S3 connectivity.

Hosted end-to-end checks require provider credentials and a signed-in test account.
No hosted deployment, real account sign-in, AI generation, or storage round-trip has
been verified from this workspace yet. RLS policies and restricted runtime database
roles are also not provisioned by the application code.
