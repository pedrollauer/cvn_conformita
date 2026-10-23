# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`PdmThumbnailService` is a Windows-only ASP.NET Core minimal-API service that automates SOLIDWORKS and SOLIDWORKS PDM (EPDM) for Cavanna's "conformità" workflow: opening parts/assemblies, generating thumbnails, enforcing drafting/image-quality standards, and driving PDM checkout/update/checkin/approve state transitions, with state persisted to a local SQLite DB.

It is a single project — there is no `.sln` and no test project.

## Build / run

```
dotnet build PdmThumbnailService.csproj
dotnet run --project PdmThumbnailService.csproj
```

- Target framework is `net8.0-windows`. This only builds/runs on Windows because it depends on COM interop with SOLIDWORKS and SOLIDWORKS PDM, which must be installed and licensed on the machine.
- `Program.cs` calls `UseUrls("http://localhost:5000")`, which overrides the profiles in `Properties/launchSettings.json` (5269/7066). The app always listens on port 5000 regardless of launch profile.
- There is no test project and no lint/format config (`.editorconfig`) in the repo.

## Native/COM dependencies (`lib/`)

The csproj references these as plain `<Reference HintPath="lib\...">` assemblies (not NuGet packages), because they are interop assemblies for software installed locally, not redistributable libraries:

- `EPDM.Interop.epdm.dll` — SOLIDWORKS PDM (EPDM) vault API.
- `SolidWorks.Interop.sldworks.dll`, `SolidWorks.Interop.swcommands.dll`, `SolidWorks.Interop.swconst.dll` — SOLIDWORKS application API.

All are referenced with `EmbedInteropTypes=false`. If these DLLs in `lib/` don't match the SOLIDWORKS/PDM version actually installed on the build/run machine, expect COM interop failures at runtime (not build time).

## Architecture

**`Program.cs`** is the whole host: it builds the minimal-API app, then does PDM/SOLIDWORKS/SQLite startup inside a single `try/catch` that **silently swallows all exceptions**. `pdm`, `sw`, and `sql` are declared `= null!` and only assigned inside that `try`. If SOLIDWORKS isn't running, or the PDM vault login fails, these stay null and any endpoint touching them will NullReferenceException at request time — there's no startup health check. These three instances are plain local variables captured by the endpoint lambdas, not DI services.

**`Interfaces/SW.cs`** — wraps the SOLIDWORKS COM API (`SldWorks`, `IModelDoc2`, `ModelDocExtension`, etc.). Owns the currently-open `model` (`IModelDoc2`) as instance state. Responsibilities include: opening/closing parts/assemblies/drawings, generating thumbnails via section-cut or isometric `SaveBMP`, equation editing (`EquationMgr`), drafting-standard/image-quality enforcement (`Conform`), mass-property/material lookups, pack-and-go, and drawing export (PDF/DXF/DWG).

**`Interfaces/PDM.cs`** — wraps the SOLIDWORKS PDM (EPDM) vault API (`IEdmVault5`/`IEdmVault7`, `IEdmFile5`, `IEdmBatchChangeState4`, etc.). Owns vault login/session state (`vault`, `currentFolder`, `rootFolderID`) and has two hardcoded login paths: the `_CavannaPDM` ("IT") vault and the `_CavannaPDM_BR` ("BR") vault, selected by the `it` constructor flag, each with hardcoded plaintext credentials. Also writes PDM lifecycle events (checkout/checkin/errors) to `DB.update_log` via the `SQL` instance passed into its constructor.

**`Interfaces/PDMObject.cs`** — a small handle combining an `IEdmFile5` + `IEdmVault5` + parent folder id + local path, either looked up by path (`new PDMObject(path, pdm)`) or constructed directly from an already-resolved vault file.

**`Interfaces/SQL.cs`** — thin `sqlite-net-pcl` wrapper over a fixed DB file at `C:\db\conformita.db`. Note `CreateDB()` only calls `CreateTable<DB.ASSINATURAS>()` — it does **not** create `DB.update_flow` or `DB.update_log`; those tables must already exist in the DB file for `Scripts.Update` and `PDM.checkoutFile`/`checkinFile` to work.

**`DB/*.cs`** — row models for `sqlite-net-pcl` (`ASSINATURAS`, `update_flow`, `update_log`), identified by `[PrimaryKey]`/`[AutoIncrement]` attributes, no relation to EF Core.

**`Scripts/Update.cs`** — `Update`'s constructor runs a one-shot state machine for a single file path: looks up/creates a row in `DB.update_flow` keyed by filename, then walks `review → checkout → update(conform) → checkin` using `PDM.checkoutFile`/`checkinFile` and `SW.Conform`, persisting progress to `update_flow` after each step so a half-finished run can resume. Only acts on `.SLD*` files; drawings (`.SLDDRW`) are skipped unless `updateDrawings` is true.

**`Scripts/Approve.cs`** — currently an empty file (0 bytes); presumably meant to mirror `Update`'s pattern for an approval state machine, not yet implemented.

**`Program.cs` endpoints** — `POST /api/pdm-thumbnail/batch-br` (stub, no body yet) and `GET /test?path=...` (constructs a `Scripts.Update` for the given path, exercising the full state machine above).

## Working in `Interfaces/SW.cs`

This file accumulated a lot of half-finished/experimental methods referencing domain types (`Escravo`, `Assembly`, `Part`, `SDR`, `Code`, `SQL.Components`/`REFERENCIAS`/`PECAPARAM`/`MUTAVEIS`/`CONFIGURACAO`, `LTROCAS`, `LTD`) that don't exist anywhere in the codebase. These were removed to get the project building; if you add new SW.cs methods, don't assume any of those types exist — check first.
