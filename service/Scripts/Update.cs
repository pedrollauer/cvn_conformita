using Interface;
using System.Threading;

namespace Scripts {

public class Update
    {
        private const int max_attempts = 3;
        public Update(SW sw, PDM pdm, SQL sql, string path, bool updateDrawings = false)
        {
            // INITIALIZATION
            string file = Path.GetFileName(path);
            PDMObject obj = new PDMObject(path, pdm);
            obj.getCopy();

            int attempt = 0;

            try
            {
                Console.WriteLine("================== " + file + " ==================");

                // Match on path too, not just filename, so same-named files in
                // different PDM folders don't collide on the same DB row.
                var exists = sql.conn.Table<DB.update_flow>().Where(p => p.code == file && p.path == path).ToList();
                DB.update_flow update;
                if (exists.Count == 0)
                {
                    update = new DB.update_flow
                    {
                        code = file,
                        path = path,
                        review = 0,
                        checkout = 0,
                        update = 0,
                        approve = 0,
                        checkin = 0
                    };

                    sql.conn.Insert(update);
                }
                else
                {
                    update = exists[0];
                    update.path = path;
                }

                string ext = Path.GetExtension(update.path).ToUpper();

                if (!ext.Contains(".SLD"))
                {
                    return;
                }

                if (ext.Contains(".SLDDRW") && !updateDrawings)
                {
                    return;
                }

                int currentState = update.review + update.checkout + update.update + update.checkin;

                while (currentState < 4 && attempt <= max_attempts)
                {
                    int stateBeforeStep = currentState;

                    try
                    {
                        // Refresh every iteration so IsLocked/CurrentState reflect the
                        // vault's current view instead of a stale snapshot from an earlier step.
                        obj = new PDMObject(path, pdm);

                        switch (currentState)
                        {
                            case 0:
                                if (obj.file.CurrentState.Name == "Approvato")
                                {
                                    bool res = pdm.changeFileState(update.path, 9);
                                    if (res)
                                    {
                                        update.review = 1;
                                        sql.conn.Update(update);
                                        currentState++;
                                    }
                                }
                                else if (obj.file.CurrentState.Name == "Modifica Senza Revisione")
                                {
                                    update.review = 1;
                                    sql.conn.Update(update);
                                    currentState++;
                                }
                                break;
                            case 1:
                                if (obj.file.IsLocked)
                                {
                                    update.checkout = 1;
                                    sql.conn.Update(update);
                                    currentState++;
                                }
                                else
                                {
                                    bool ress = pdm.checkoutFile(obj);
                                    if (ress)
                                    {
                                        update.checkout = 1;
                                        sql.conn.Update(update);
                                        currentState++;
                                    }
                                }
                                break;
                            case 2:
                                obj.getCopy();
                                bool result = sw.Conform(update.path);

                                if (result)
                                {
                                    update.update = 1;
                                    sql.conn.Update(update);
                                    currentState++;
                                    Console.WriteLine("Reconstructed.");
                                }
                                break;
                            case 3:
                                if (update.checkout == 1 && update.checkin != 1 && obj.file.IsLocked)
                                {
                                    Console.WriteLine("STEP 3");
                                    bool chin = pdm.checkinFile(obj);
                                    Console.WriteLine("chin " + chin);
                                    if (chin)
                                    {
                                        update.checkin = 1;
                                        sql.conn.Update(update);
                                        currentState++;
                                    }
                                    else
                                    {
                                        Console.WriteLine("Unable to checkin. Falling back.");
                                        update.checkin = 0;
                                        update.update = 0;
                                        currentState = 2;
                                    }
                                }
                                break;
                        }
                    }
                    catch (Exception e)
                    {
                        Console.WriteLine($"Error on step {currentState} for {file}: {e}");
                    }

                    if (currentState == stateBeforeStep)
                    {
                        attempt++;
                        Thread.Sleep(1000);
                    }
                }

                if (currentState < 4)
                {
                    Console.WriteLine($"Giving up on {file} after {attempt} failed attempt(s), stuck at state {currentState}.");

                    if (update.checkout == 1 && update.checkin != 1)
                    {
                        sql.conn.Insert(new DB.update_log
                        {
                            code = file,
                            status = "STUCK CHECKED OUT",
                            timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                        });
                    }
                }
            }
            catch (Exception e)
            {
                attempt++;
                Console.WriteLine($"Error processing {file}: {e}");
            }
            finally
            {
                Console.WriteLine("==================  DONE  ==================");
                Console.WriteLine("\n\n");
            }
        }
    }

}
