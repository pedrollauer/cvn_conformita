using EPDM.Interop.epdm;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;

// TODO CREATE A METHOD TO INITIALIZE SW/PDM IF IT FAILS
// TODO CREATE A METHOD TO CHECK IF ABREFECHA3 WORKED

[DllImport("gdi32.dll")]
static extern bool DeleteObject(IntPtr hObject);

// CLI ARGS: a single optional positional maxPack (defaults to 50, matching scripts/script1.ts's
// MAX_PACK). One invocation = one batch (update loop, then one approve pass), replacing the old
// /update + /approve HTTP endpoints - see service/CLAUDE.md and the "CLI instead of HTTP service"
// migration plan for why this is a whole-batch-per-process design rather than one process per file.
int maxPack = 50;
if (args.Length > 0)
{
    if (!int.TryParse(args[0], out maxPack) || maxPack <= 0)
    {
        Console.Error.WriteLine($"Invalid maxPack argument: \"{args[0]}\" (expected a positive integer)");
        return 1;
    }
}

// SOLIDWORKS / PDM INICIALIZATION
Interface.PDM pdm;
Interface.SW sw;
Interface.SQL sql;
try
{
    sql = new Interface.SQL();
    pdm = new Interface.PDM(sql, true);
    sw = new Interface.SW();
}
catch (Exception ex)
{
    Console.Error.WriteLine($"SOLIDWORKS/PDM/SQL initialization failed: {ex}");
    return 1;
}

try
{
    RunBatch(sw, pdm, sql, maxPack);
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine($"Batch failed: {ex}");
    return 1;
}
finally
{
    // Nothing used to quit SOLIDWORKS because the old web server just stayed up (and SW stayed
    // open) for its whole lifetime. Now every invocation is its own process, so it has to close
    // what it opened or SLDWORKS.exe piles up across runs.
    try
    {
        sw.swApp?.ExitApp();
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Failed to close SOLIDWORKS cleanly: {ex.Message}");
    }
}

/// <summary>
/// Drains up to <paramref name="maxPack"/> jobs from the `queue` table, running
/// <see cref="Scripts.Update"/> on each path exactly as the old /update handler did (one at a
/// time, SW/PDM kept warm across the whole batch), removing jobs that succeeded and leaving
/// failures queued for retry. If the queue is empty, falls back to `update_flow` rows the service
/// already started but hasn't approved yet - same fallback scripts/script1.ts used to do on the
/// Node side. Finishes with one Scripts.Approve pass, identical to the old final /approve call.
/// Emits one JSON line per file to stdout as it's processed so the caller can follow progress
/// live instead of waiting for the whole batch.
/// </summary>
static void RunBatch(Interface.SW sw, Interface.PDM pdm, Interface.SQL sql, int maxPack)
{
    List<QueueRow> jobs = sql.conn.Query<QueueRow>("SELECT id, code, path FROM queue ORDER BY id ASC LIMIT ?", maxPack);
    Console.WriteLine($"[batch] picked up {jobs.Count} job(s) from queue (maxPack={maxPack})");

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
        Console.WriteLine($"[batch] queue empty - {pending.Count} not-yet-approved file(s) to follow up on");

        foreach (DB.update_flow file in pending)
        {
            ProcessFile(sw, pdm, sql, file.path);
        }
    }

    _ = new Scripts.Approve(sql, pdm, maxPack);
    Console.WriteLine("[batch] done");
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
