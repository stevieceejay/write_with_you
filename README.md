# Write With You — database foundation

This repository contains the approved PostgreSQL/Prisma database design for the
essay-writing application. It does not yet contain the web application.

## Current setup status

- The 13-model Prisma schema and two SQL migrations have been authored.
- The initial migration creates the tables, enums, foreign keys, and ordinary indexes.
- The integrity migration adds one-working-version uniqueness, full-text indexes,
  outline cycle prevention, value checks, and sealed-snapshot protection.
- No live database has been created or migrated from this workspace yet.
- Dependencies could not be downloaded because this execution environment rejects
  npm registry requests with EACCES. There is no lockfile or generated Prisma client yet.
- JavaScript syntax can be checked locally; Prisma validation and the PostgreSQL
  integration suite still require dependency installation and a database.

## Set up Neon PostgreSQL

Neon hosts PostgreSQL. Its CLI is optional; you can also use the Neon web console.
From your normal PowerShell terminal, the current CLI commands are:

```powershell
npm.cmd install --global neon@latest
neon.cmd auth
neon.cmd projects create --name write-with-you
```

Choose a new, empty development database. In Neon, obtain its direct PostgreSQL
connection string, including the provider's TLS parameters. Do not paste the
password or full connection string into chat or commit it to Git.

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

These migrations enforce referential integrity, not end-user authentication.
There are no RLS policies, application server, or authentication routes yet.
Every future query must resolve the authenticated user on the server and check essay
ownership, including reads of child records. UUIDs do not grant authorization.

Use separate migration and restricted runtime database roles before production.
The runtime role must not own tables, disable triggers, truncate tables, or create
schema objects. Add and test RLS with transaction-local identity when the authentication
integration is selected. Never expose migration credentials or DATABASE_URL to a browser.

The partial indexes, checks, and triggers are custom PostgreSQL features. Future
migrations must preserve them; the Prisma schema alone cannot recreate all of them.
