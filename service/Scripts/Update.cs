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

            while (step < 3)
            {
                switch (step)
                {
                    case 0:
                        Console.WriteLine(version == 1 ? "VERSION OK" : "WRONG VERSION");
                        missing = version == 1 ? missing : missing + 1;
                        step++;
                        break;
                    case 1:
                        Console.WriteLine(rollBackBar== 1 ? "ROLL BACK OK" : "WRONG ROLL BACK");
                        missing = rollBackBar == 1 ? missing : missing +1;
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

        public void Begin()
        {
            Console.WriteLine("=============== UPDATE ===============");
            // INITIALIZATION
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

                string ext = Path.GetExtension(update.path).ToUpper();

                update = checkStates(update, obj);
                if (!ext.Contains(".SLD"))
                {
                    update.review = 1; update.checkout = 1; update.update = 1; update.checkin = 1; update.approve = 1;
                    return;
                }

                if (ext.Contains(".SLDDRW") && !updateDrawings)
                {
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
                                bool result = sw.Conform(update.path);
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
                                        attempt++;
                                    }
                                }else if(update.update == 1 && !obj.file.IsLocked)
                                {
                                    update.checkin = 1;
                                    currentState++;
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
