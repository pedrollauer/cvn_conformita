using EPDM.Interop.epdm;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;

// TODO CREATE A METHOD TO INITIALIZE SW/PDM IF IT FAILS
// TODO CREATE A METHOD TO CHECK IF ABREFECHA3 WORKED

[DllImport("gdi32.dll")]
static extern bool DeleteObject(IntPtr hObject);

// CLI: PdmThumbnailService.exe <update|approve> [maxPack]
// Two independent commands (not one combined batch) so each can be tested/run on its own -
// replacing the old /update + /approve HTTP endpoints (see service/CLAUDE.md). "update" needs
// SOLIDWORKS; "approve" only touches the PDM vault via Scripts.Approve (SQL + PDM, no SW param),
// so it skips starting SOLIDWORKS entirely - cheaper and faster for approve-only runs.
if (args.Length < 1)
{
    Console.Error.WriteLine("Usage: PdmThumbnailService.exe <update|approve> [maxPack]");
    return 1;
}

string command = args[0].ToLowerInvariant();
if (command != "update" && command != "approve")
{
    Console.Error.WriteLine($"Unknown command \"{command}\" (expected \"update\" or \"approve\")");
    return 1;
}

int maxPack = 50;
if (args.Length > 1)
{
    if (!int.TryParse(args[1], out maxPack) || maxPack <= 0)
    {
        Console.Error.WriteLine($"Invalid maxPack argument: \"{args[1]}\" (expected a positive integer)");
        return 1;
    }
}

// SOLIDWORKS / PDM INICIALIZATION
Interface.PDM pdm;
Interface.SW? sw = null;
Interface.SQL sql;
try
{
    sql = new Interface.SQL();
    pdm = new Interface.PDM(sql, true);
    if (command == "update")
    {
        sw = new Interface.SW();
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine($"SOLIDWORKS/PDM/SQL initialization failed: {ex}");
    return 1;
}

try
{
    if (command == "update")
    {
        RunUpdate(sw!, pdm, sql, maxPack);
    }
    else
    {
        RunApprove(sql, pdm, maxPack);
    }
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine($"{command} failed: {ex}");
    return 1;
}
finally
{
    // Nothing used to quit SOLIDWORKS because the old web server just stayed up (and SW stayed
    // open) for its whole lifetime. Now every invocation is its own process, so it has to close
    // what it opened or SLDWORKS.exe piles up across runs.
    if (sw != null)
    {
        try
        {
            sw.swApp?.ExitApp();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Failed to close SOLIDWORKS cleanly: {ex.Message}");
        }
    }
}

/// <summary>
/// Drains up to <paramref name="maxPack"/> jobs from the `queue` table, running
/// <see cref="Scripts.Update"/> on each path exactly as the old /update handler did (one at a
/// time, SW/PDM kept warm across the whole call), removing jobs that succeeded and leaving
/// failures queued for retry. If the queue is empty, falls back to `update_flow` rows the service
/// already started but hasn't approved yet - same fallback scripts/script1.ts used to do on the
/// Node side. Does NOT approve anything - that's the separate "approve" command.
/// </summary>
static void RunUpdate(Interface.SW sw, Interface.PDM pdm, Interface.SQL sql, int maxPack)
{
    List<QueueRow> jobs = sql.conn.Query<QueueRow>("SELECT id, code, path FROM queue ORDER BY id ASC LIMIT ?", maxPack);
    Console.WriteLine($"[update] picked up {jobs.Count} job(s) from queue (maxPack={maxPack})");

    foreach (QueueRow job in jobs)
    {
        bool ok = ProcessFile(sw, pdm, sql, job.path);
        if (ok)
        {
            sql.conn.Execute("DELETE FROM queue WHERE id = ?", job.id);
        }
    }

    if (jobs.Count == 0)
    {
        List<DB.update_flow> pending = sql.conn.Table<DB.update_flow>()
            .Where(d => d.approve != 1)
            .OrderBy(d => d.date)
            .Take(maxPack)
            .ToList();
        Console.WriteLine($"[update] queue empty - {pending.Count} not-yet-approved file(s) to follow up on");

        foreach (DB.update_flow file in pending)
        {
            ProcessFile(sw, pdm, sql, file.path);
        }
    }

    Console.WriteLine("[update] done");
}

/// <summary>
/// Runs Scripts.Approve on up to <paramref name="maxPack"/> files unchanged (identical to the old
/// final /approve call) - a global sweep of every `update_flow` row with checkin == 1 and
/// approve != 1, not scoped to any particular run of "update". Approve's constructor never
/// returns a result either, so success per file is determined the same way as ProcessFile does
/// for update: snapshot the candidate codes before calling it, then read `update_flow` back
/// afterward to see which now have approve == 1.
/// </summary>
static void RunApprove(Interface.SQL sql, Interface.PDM pdm, int maxPack)
{
    List<DB.update_flow> candidates = sql.conn.Table<DB.update_flow>()
        .Where(d => d.checkin == 1 && d.approve != 1)
        .Take(maxPack)
        .ToList();
    Console.WriteLine($"[approve] {candidates.Count} candidate(s) pending approval (maxPack={maxPack})");

    _ = new Scripts.Approve(sql, pdm, maxPack);

    foreach (DB.update_flow candidate in candidates)
    {
        DB.update_flow? after = sql.conn.Table<DB.update_flow>()
            .Where(u => u.code == candidate.code && u.path == candidate.path)
            .FirstOrDefault();
        bool approved = after != null && after.approve == 1;

        Console.WriteLine(JsonSerializer.Serialize(new { code = candidate.code, path = candidate.path, status = approved ? "ok" : "error" }));
        Console.Out.Flush();
    }

    Console.WriteLine("[approve] done");
}

/// <summary>
/// Runs Scripts.Update on one path, then reads back the `update_flow` row it persisted (the same
/// code+path match Update.cs itself uses) to determine success - Update's constructor never
/// returns or throws on failure, it only records per-step progress, so this is the only way to
/// know the outcome without touching Update.cs. Writes a "start" JSON line before calling Update
/// (Conform() can take a while, so the caller has a live "currently on this file" signal) and a
/// result line after, both flushed immediately.
/// </summary>
static bool ProcessFile(Interface.SW sw, Interface.PDM pdm, Interface.SQL sql, string path)
{
    string code = Path.GetFileName(path);

    Console.WriteLine(JsonSerializer.Serialize(new { code, path, status = "start" }));
    Console.Out.Flush();

    try
    {
        _ = new Scripts.Update(sw, pdm, sql, path);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Update threw for {code}: {ex.Message}");
    }

    DB.update_flow? flow = sql.conn.Table<DB.update_flow>()
        .Where(u => u.code == code && u.path == path)
        .FirstOrDefault();
    bool success = flow != null && flow.review + flow.checkout + flow.update + flow.checkin == 4;

    Console.WriteLine(JsonSerializer.Serialize(new { code, path, status = success ? "ok" : "error" }));
    Console.Out.Flush();

    return success;
}

/// <summary>
/// Local row shape for a plain `SELECT id, code, path FROM queue` - deliberately not using
/// service/DB/queue.cs (it's missing `namespace DB` and has a private, unmapped `id`); raw
/// SQLiteConnection.Query&lt;T&gt; only needs matching property names, no [Table] attribute.
/// </summary>
class QueueRow
{
    public int id { get; set; }
    public string code { get; set; } = "";
    public string path { get; set; } = "";
}
