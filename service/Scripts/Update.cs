using Interface;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using System.ComponentModel.Design;
using System.Threading;

namespace Scripts {

public class Update
    {
        private const int max_attempts = 3;

        SW sw;
        PDM pdm;
        SQL sql;

        string path;
        string drafting_standart = "ISO-MODIFICATO 0110509 arial3.7semiridotta Draw";

        bool updateDrawings;

        string SW_VERSION = "2024";

        int numberOfChecks = 3; // Keeps track of how many problems to check(fonts, file version...)

        int done = 0;

        public Update(SW sw, PDM pdm, SQL sql, string path, bool updateDrawings = false)
        {
            this.sw = sw;
            this.pdm = pdm;
            this.sql = sql;
            this.path = path;
            this.updateDrawings = updateDrawings;
        }

        public int checkFile()
        {
            // TODO CHECK IMAGE QUALITY
            int version = 0;
            int rollBackBar = 0;

            sw.Open(this.path);

            // CHECK FILE VERSION
            object historyObj = sw.swApp.VersionHistory(path);

            if (historyObj is string[] versions)
            {
                foreach (string ver in versions)
                {
                    Console.WriteLine($"Saved in version code: {ver}");
                    if (ver.Contains(this.SW_VERSION))
                        version = 1;
                }
            }

            // CHECK ROLLBACK BAR

            Feature swFeat = (Feature)this.sw.model.FirstFeature();
            rollBackBar = swFeat.IsRolledBack()?0:1;

            // CHECK DRAFTING STANDARD

            SldWorks swApp = new SldWorks();
            ModelDoc2 swModel = (ModelDoc2)swApp.ActiveDoc;

            string stdName = null;

            if (swModel != null)
            {
                ModelDocExtension swModExt = swModel.Extension;

                int stdEnum = swModExt.GetUserPreferenceInteger(
                    (int)swUserPreferenceIntegerValue_e.swDetailingDimensionStandard,
                    (int)swUserPreferenceOption_e.swDetailingNoOptionSpecified
                );

                stdName = swModExt.GetUserPreferenceString(
                    (int)swUserPreferenceStringValue_e.swDetailingDimensionStandardName,
                    (int)swUserPreferenceOption_e.swDetailingNoOptionSpecified
                );

            }

            int std = stdName == this.drafting_standart ? 1 : 0;

            int step = 0;
            int missing = 0;
            string code = Path.GetFileName(path);

            while (step < 3)
            {
                switch (step)
                {
                    case 0:
                        Console.WriteLine(version == 1 ? "VERSION OK" : "WRONG VERSION");
                        missing = version == 1 ? missing : missing + 1;
                        // error 11 = "outdated files" in the Errors catalog - clear it from todo
                        // now that this file is confirmed on the current SW version.
                        if (version == 1)
                            sql.conn.Execute("DELETE FROM todo WHERE code = ? AND error = 11", code);
                        step++;
                        break;
                    case 1:
                        Console.WriteLine(rollBackBar== 1 ? "ROLL BACK OK" : "WRONG ROLL BACK");
                        missing = rollBackBar == 1 ? missing : missing +1;
                        // error 5 = "rollback bar" in the Errors catalog.
                        if (rollBackBar == 1)
                            sql.conn.Execute("DELETE FROM todo WHERE code = ? AND error = 5", code);
                        step++;
                        break;
                    case 2:
                        Console.WriteLine(std== 1 ? "FONTS OK" : "WRONG FONT");
                        missing = std == 1 ? missing : missing+1;
                        step++;
                        break;
                    default:
                        break;

                }

            }
            sw.Close();
            
            return missing;
        }

        public DB.update_flow checkStates(DB.update_flow candidate, PDMObject obj)
        {
                int missing = this.checkFile();

                //If there is nothing missing, there is nothing to fix
                if(missing == 0)
                {
                    candidate.update = 1;
                if (obj.file.IsLocked)
                    candidate.checkin = 0;
                else
                    candidate.checkin = 1;
                    
                }
            else
            {
                candidate.update = 0;
                //If there is something to fix we need to make sure that we can check it out

                if(obj.file.CurrentState.Name == "Approvato")
                {
                    candidate.review = 0;
                }
                else
                {
                    candidate.review = 1;
                }

                if (!obj.file.IsLocked)
                {
                    candidate.checkout = 0; 
                }
                
            }

                sql.conn.Update(candidate);
            return candidate;
        }

        public int findState(DB.update_flow candidate)
        {

            if (candidate.update == 1)
                return 3;

            if (candidate.review == 0)
                return 0;

            if (candidate.checkout == 0)
                return 1;

            if (candidate.update == 0)
                return 2;
            
            if (candidate.checkin== 0)
                return 3;

            return 0;
        }

        public void RemoveFileQueue(DB.update_flow? up = null)
        {
            if(up != null)
            {
                Console.WriteLine("Deleting update_flow ...");
                this.sql.conn.Delete(up);

            }

            var queue = sql.conn.Table<DB.queue>().Where(p => p.code == up.code).ToList();
            Console.WriteLine("Deleting from queue...");
            
            if(queue.Count > 0)
            {
                DB.queue delme = queue[0];
                this.sql.conn.Delete(delme);

            }

            Console.WriteLine("Delete done.");
        }

        //FOR NOW NO SLDDRW, NO OBSOLETE FILES
        public bool shouldThisFileBeInQueue(PDMObject obj, string path)
        {
                if (obj.file.CurrentState.Name == "Obsoleto")
                {

                    return false;
                }

                string ext = Path.GetExtension(path).ToUpper();

                if (!ext.Contains(".SLD"))
                {
                
                    return false;
                }

                if (ext.Contains(".SLDDRW") && !updateDrawings)
                {
                    return false;
                }

            return true;

            
        }

        public void Begin()
        {
            string file = Path.GetFileName(path);
            PDMObject obj = new PDMObject(path, pdm);
            obj.getCopy();

            int attempt = 0;

            try
            {
                Console.WriteLine("=============== UPDATE ===============");

                if (!shouldThisFileBeInQueue(obj, path))
                    RemoveFileQueue();

                var exists = sql.conn.Table<DB.update_flow>().Where(p => p.code == file && p.path == path).ToList();
                DB.update_flow update;
                if (exists.Count == 0)
                {
                    update = new DB.update_flow
                    {
                        code = file,
                        path = path,
                        review = 1,
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

                bool chOut = false;
                bool conform = false;
                int chIn = -1;

                try
                {
                    chOut = pdm.checkoutFile(obj);
                    if (!chOut)
                        return;
                    else
                        update.checkout = 1;
                    conform = sw.Conform(path,sql);
                    if (!conform)
                        return;
                    else
                        update.update = 1;

                    chIn = pdm.checkinFile(obj);
                    if (chIn != 1)
                        return;
                    else
                    {
                        update.checkin = 1;
                        update.approve = 1;

                    }

                }catch(Exception e)
                {
                    Console.WriteLine(e.StackTrace);
                }
                finally
                {
                    if (chIn != 1)
                    {
                        pdm.CancelCheckout(obj);
                    }

                    if(chIn !=1 | !chOut | !conform)
                    {
                        //MOVE FROM QUEUE 
                        string errorDesc = "";
                        pdm.vault.GetErrorString(chIn,out errorDesc, out _);
                        sql.conn.Insert(new DB.external_ref
                        {
                            code = update.code,
                            error_code = chIn,
                            error_desc = errorDesc
                        });
                        RemoveFileQueue(update);        
                    }
                    else
                    {
                        sql.conn.Insert(new DB.done
                        {
                            code = update.code,
                            timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                        });
                        RemoveFileQueue(update);
                        List<DB.todo> todos = sql.conn.Table<DB.todo>().Where(p=> p.code == update.code).ToList();
                        if(todos.Count > 0)
                        {
                            foreach(var t in todos)
                                sql.conn.Delete(t);
                        }
                    }

                    sql.conn.Update(update);
                }

            }catch(Exception e)
            {
                Console.WriteLine("ERROR UPDATING");
                Console.WriteLine(e.StackTrace);
            }
            finally
            {
                Console.WriteLine("================ DONE  ==============");
                Console.WriteLine("\n\n");

            }

        }
        public void Begina()
        {
            Console.WriteLine("=============== UPDATE ===============");
            // INITIALIZATION
            sw.swApp.CloseAllDocuments(true);
            string file = Path.GetFileName(path);
            PDMObject obj = new PDMObject(path, pdm);
            obj.getCopy();

            int attempt = 0;

            try
            {
                Console.WriteLine("================== " + file + " ==================");

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

                if (obj.file.CurrentState.Name == "Obsoleto")
                {

                    RemoveFileQueue(update);
                    return;
                }

                string ext = Path.GetExtension(update.path).ToUpper();

                update = checkStates(update, obj);
                if (!ext.Contains(".SLD"))
                {
                    update.review = 1; update.checkout = 1; update.update = 1; update.checkin = 1; update.approve = 1;
                    return;
                }

                //FOR NOW NO SLDDRW
                if (ext.Contains(".SLDDRW") && !updateDrawings)
                {
                    RemoveFileQueue(update);
                    return;
                }


                int currentState = findState(update); 

                while (currentState < 4 && attempt <= max_attempts)
                {
                    int stateBeforeStep = currentState;
                    if (!pdm.vault.IsLoggedIn)
                    {
                        pdm.vault.Login(pdm.userName, pdm.passWord, pdm.vaultName);
                    }

                    try
                    {
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
                                bool result = sw.Conform(update.path,sql);
                                int check = checkFile();

                                if (result && check == 0)
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
                                    int chin = pdm.checkinFile(obj);
                                    Console.WriteLine("chin " + chin);
                                    if (chin == 1)
                                    {
                                        update.checkin = 1;
                                        sql.conn.Update(update);
                                        currentState++;
                                    }
                                    else if(chin != 1)
                                    {
                                        // SMT IS WRONG I CANT CHECK IN
                                        update.checkin = 1; 
                                        sql.conn.Update(update);
                                        pdm.CancelCheckout(obj);
                                        currentState++;
                                        string errorDesc = null;
                                        pdm.vault.GetErrorString(chin,out errorDesc, out _);
                                        DB.external_ref reff = new DB.external_ref {code = update.code, error_code = chin, error_desc=errorDesc };
                                        sql.conn.Insert(reff);

                                    }
                                }else if(update.update == 1 && !obj.file.IsLocked)
                                {
                                    update.checkin = 1;
                                    currentState++;
                                    sql.conn.Update(update);
                                }
                                break;
                            default:
                                currentState = 0;
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
