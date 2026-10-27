using Interface;

namespace Scripts {

public class Update
    {
        private const int max_retries = 3;
        public Update(SW sw, PDM pdm, SQL sql,string path, bool updateDrawings = false)
        {

            // INITIALIZATION
            string file = Path.GetFileName(path);
            PDMObject obj = new PDMObject(path, pdm);
            int attempt = 0;

                try
                {
                    Console.WriteLine("================== " + file+ " ==================");

                    // Check if we are resuming
                    var exists = sql.conn.Table<DB.update_flow>().Where(p => p.code == file).ToList();
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

                    if (!ext.Contains(".SLD") )
                    {
                        return;
                    }

                    if(ext.Contains(".SLDDRW") && !updateDrawings)
                    {
                        return;
                    }

                    int currentState = update.review + update.checkout + update.update + update.checkin;


                    while(currentState < 4 || attempt > 3*max_retries )
                    {
                        switch (currentState)
                        {
                        case 0:
                            if (obj.file.CurrentState.Name == "Approvato")
                            {
                                bool res = pdm.changeFileState(update.path, 9);
                                if (res)
                                {
                                    update.review= 1;
                                    sql.conn.Update(update);
                                    currentState++;

                                }
                            }
                            if (obj.file.CurrentState.Name == "Modifica Senza Revisione")
                            {
                                    update.review= 1;
                                    sql.conn.Update(update);
                            }
                            break;
                        case 1:
                            if (obj.file.IsLocked)
                            {
                                update.checkout = 1;
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

                            obj = new PDMObject(path, pdm);
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
                        if (update.checkout == 1 && update.checkin!=1 && obj.file.IsLocked)
                        {
                            Console.WriteLine("STEP 3");
                            bool chin = pdm.checkinFile(obj);
                            Console.WriteLine("chin "+chin);
                            if (chin)
                            {
                                update.checkin = 1;
                                sql.conn.Update(update);
                                currentState++;
                            }
                            if(!chin)
                            {
                                Console.WriteLine("Unable to checkin. Falling back.");
                                update.checkin = 0;
                                update.update = 0;
                                currentState=2;
                                                                                                                                        
                            }
                        }
                            break;
                        }

                    }

                }
                catch (Exception e)
                {
                    attempt++;
                    Console.WriteLine(e.Message);
                }
                finally
                {

                    Console.WriteLine("==================  DONE  ==================");
                    Console.WriteLine("\n\n");
                }

            }
        }

    }


