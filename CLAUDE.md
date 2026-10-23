# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`conformita` is Cavanna's "conformità" project: a system for detecting and correcting errors/non-conformities in parts and assemblies managed by SOLIDWORKS PDM (EPDM). The actual SOLIDWORKS/PDM automation lives in a separate Windows-only .NET service; this repo's root and `frontend/` are meant to be the orchestration layer around it.

The repo currently has three parts, in very different stages of completion:

- **Root (`/`)** — a Node.js/TypeScript backend, currently just scaffolding (`app.ts` is `console.log('Hello world')`). No HTTP server, routes, or logic exist yet.
- **`frontend/`** — intended to hold the frontend app. Currently empty.
- **`service/`** — a working ASP.NET Core minimal-API service (`PdmThumbnailService`) that does the actual SOLIDWORKS/PDM automation. Listens on `http://localhost:5000`. Has its own `service/CLAUDE.md` with full details — **read that file before touching anything under `service/`**.

There is no git repository initialized yet in this directory.

## Repository layout

```
/                     Node.js/TypeScript backend (root) — scaffolding only
  app.ts              Entry point, currently a stub
  tsconfig.json       module: nodenext, strict, target esnext
frontend/             Frontend app — currently empty
service/              ASP.NET Core service (SOLIDWORKS/PDM automation) — see service/CLAUDE.md
interface/
  pdm_sql.ts          Stub file (console.log only) — presumably meant to be the Node-side
                       interface to PDM/SQL, not yet implemented
credentials/
  creds                PLAINTEXT credentials (PDM SQL account/password/server). See warning below.
.vscode/launch.json    Node debug config, launches app.js (compiled from app.ts)
conformita.esproj      Visual Studio JavaScript project file wrapping the root Node project
conformita.slnx        Visual Studio solution referencing the root project (and likely service/)
```

## Build / run

Root (Node/TypeScript):
```
npm install
npm run build     # tsc --build, compiles app.ts -> app.js
node app.js
```
There is no `start`/`dev` script defined yet, and `npm test` is a placeholder that always fails.

Service (.NET, Windows-only, requires SOLIDWORKS + PDM installed/licensed locally):
```
cd service
dotnet build PdmThumbnailService.csproj
dotnet run --project PdmThumbnailService.csproj
```
Always listens on port 5000 (hardcoded via `UseUrls`, overriding launch profiles). See `service/CLAUDE.md` for the service's internals, architecture, and known rough edges before modifying it.

## Security note

`credentials/creds` contains a plaintext account name, password, and server hostname for the PDM SQL account. Treat this file as a secret:
- Do not print its contents in logs, commits, or chat output.
- Do not commit it once git is initialized — add it to `.gitignore` first.
- If this project is ever shared or put under version control, this credential should be rotated and moved to a proper secret store (environment variable, `.env` excluded from git, Windows Credential Manager, etc.) rather than a checked-in plaintext file.

## Current state / working notes

- The root backend and `frontend/` are both pre-implementation scaffolding — there's no established architecture yet to follow or deviate from. Treat early work here as establishing conventions, not matching existing ones.
- `interface/pdm_sql.ts` is a one-line stub; its intended role (presumably bridging the Node backend to PDM SQL data, given its name and the sibling `credentials/creds` SQL login) is not yet implemented anywhere.
- The real automation logic (SOLIDWORKS COM interop, PDM vault operations, conformity checks, state machine) already exists and works in `service/`; the root backend's job is most likely to call the service's HTTP API on port 5000, not duplicate its logic.
