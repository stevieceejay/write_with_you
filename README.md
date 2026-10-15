# Write With You

This repository contains the Next.js backend, a small application shell, and the
approved PostgreSQL/Prisma schema for the essay-writing application. The complete
six-mode writing interface is not implemented yet. See [the backend guide](docs/backend.md)
for service contracts and API examples.

## Current setup status

- The 13-model Prisma schema and two SQL migrations have been authored.
- The initial migration creates the tables, enums, foreign keys, and ordinary indexes.
- The integrity migration adds one-working-version uniqueness, full-text indexes,
  outline cycle prevention, value checks, and sealed-snapshot protection.
- No live database has been created or migrated from this workspace yet.
- Dependencies were installed from the user's terminal. A lockfile is included.
- Prisma validation, TypeScript checking, and a production build have passed.
- Backend/security tests and migration tests on in-memory PostgreSQL have passed.
- The server has started successfully and passed HTTP smoke checks.
- Hosted Neon, Clerk, OpenAI, and storage checks still need live credentials.

## Set up Neon PostgreSQL

The local `.neon` file targets project `hidden-mouse-66679667`, branch `production`,
organization `org-red-leaf-23033290`. This link was written offline and has not been
verified against Neon. From a terminal with network access:

```powershell
neon.cmd login --config-dir .cache/neon
npm.cmd run neon:secrets
neon.cmd deploy --config-dir .cache/neon
```

Finish browser sign-in when prompted. Deploy provisions the private `assets`
bucket and protected text-analysis function declared in `neon.ts`, and pulls
environment variables. This command does not host the Next.js frontend.
Use a dedicated development database or branch for testing. Never reset an existing
database or paste credentials into chat or Git.

## Configure and apply the migrations

Run these commands from this repository in a terminal with npm network access:

```powershell
npm.cmd install
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
```

Copy the environment file only if `.env` does not already exist. Edit `.env` to set
`DATABASE_URL` to the new development database's connection string. The migrations
target the `public` schema. The local example URL is a placeholder, not a running server.

```powershell
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:status
npm.cmd run db:test
npm.cmd test
npm.cmd run db:test:local
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

`db:migrate` first checks the target, refuses an existing unmanaged database, and
then runs `prisma migrate deploy`. It does not reset or erase an existing database.
The migrations run in transactions. Do not edit migrations after they are applied.

`db:test` runs integration tests in rolled-back transactions so their fixture users
and essays do not persist. Run it only against development/test databases.

## Data organization

- A User is linked to a verified identity from a future managed authentication provider.
  Authentication itself has not been configured by these migrations.
- A Subject belongs to a User. An Essay's composite subject foreign key prevents
  it from being assigned to another user's subject. No subject means Miscellaneous.
- An Essay has one WORKING version and any number of saved SNAPSHOT versions.
- Each version owns its outline, document JSON, formatting, audience, and purpose.
- OutlineNode supports nested points. Numbering is calculated in the interface.
- Annotation and IdeaRelationship power structural highlights and Explain.
- Source and EvidenceLink connect supporting passages to citations.
- AIRequest and AIProposal store operation status and proposed changes, not API keys.

## Saving and snapshot rules

Autosaves must check and increment `lockVersion`. Outline/planning edits must use
the same version lock discipline and update the parent essay's `updatedAt` in one
transaction. Database triggers do not replace the application's save protocol.

To save a snapshot, start one transaction, insert a SNAPSHOT with no `sealedAt`, copy
the document and child rows (remapping row IDs but preserving logical keys), and
set `sealedAt` before committing. Copy citation snapshots as well. Deferred checks
reject snapshots left unsealed at commit. A version's parent, if present, must be
an already sealed snapshot from that essay. Working versions are never converted
into snapshots; they remain available for editing.

Once sealed, a snapshot's writing and structural child records cannot be edited,
inserted, or deleted. AI operation/proposal status can still change. Plan conversation
normally stays on the working version; if copied into a snapshot, it is protected too.

Deleting an essay should normally set `deletedAt`. Permanent essay deletion cascades
through its snapshots and other dependent records. Only an explicit, ownership-checked
purge service should expose permanent deletion; there is no purge API in this repository.
Deleting a subject requires clearing its essays' `subjectId` first in one transaction.

## Security boundaries before production

The backend uses Clerk for server-verified identity and checks essay ownership for
every service operation, including reads of child records. Sign-in and sign-up routes
are included. Configure a Clerk application with verified email before using them.
The backend fails closed when authentication is unconfigured. UUIDs do not grant access.
RLS policies are not enabled yet; database constraints do not replace authorization.

Use separate migration and restricted runtime database roles before production.
The runtime role must not own tables, disable triggers, truncate tables, or create
schema objects. Add and test RLS with transaction-local identity when the authentication
integration is selected. Never expose migration credentials or DATABASE_URL to a browser.

The partial indexes, checks, and triggers are custom PostgreSQL features. Future
migrations must preserve them; the Prisma schema alone cannot recreate all of them.
