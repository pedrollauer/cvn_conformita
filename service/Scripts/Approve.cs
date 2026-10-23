using EPDM.Interop.epdm;
using Interface;
using System.Runtime.CompilerServices;

namespace Scripts
{

    public class Approve
    {
       
        private PDM pdm;
        private SQL sql;

        int done = 0;
        int retry = 5;



        public bool ApproveBatch(List<DB.update_flow> data )
        {
            IEdmVault7 vault = (IEdmVault7)this.pdm.vault;
            IEdmBatchChangeState4 batchChanger = (IEdmBatchChangeState4)vault.CreateUtility(EdmUtility.EdmUtil_BatchChangeState);

            foreach (var d in data)
            {
                try
                {
                    IEdmFile5 file = vault.GetFileFromPath(d.path, out IEdmFolder5 folder);

                    if (file != null && file.CurrentState.Name == "Modifica Senza Revisione")
                    {
                        batchChanger.AddFile(file.ID, folder.ID);
                        Console.WriteLine($"Queued for approval: {file.Name}");
                    }

                    if(file.CurrentState.Name == "Approvato")
                    {
                        d.approve = 1;
                        sql.conn.Update(d);

                        sql.conn.Insert(new DB.done{ code = d.code, timestamp= DateTimeOffset.UtcNow.ToUnixTimeSeconds() });
                        done++;
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error queuing {d.path}: {ex.Message}");
                }
            }

            try
            {
                if (batchChanger.CreateTree("Approva Modifica Senza Revisione"))
                {
                    batchChanger.ChangeState2(0, this.pdm.passWord);
                    Console.WriteLine("Batch approval completed successfully.");
                    return true;
                }
                else
                {
                    Console.WriteLine("No files were eligible, or failed to create transition tree.");
                    return false;
                }

            }catch(Exception e)
            {
                Console.WriteLine(e.Message);
                return false;
            }
        }

        public Approve(SQL sql, PDM pdm, int howMany)
        {
            this.sql = sql;
            this.pdm = pdm;

            int attempt = 0;

            while(done < howMany || attempt < retry)
            {
                List<DB.update_flow> files = sql.conn.Table<DB.update_flow>().Where(d => d.checkin == 1 && d.approve != 1).Take(howMany).ToList();
                this.ApproveBatch(files);
                attempt++;
            }
            
        }

    }
}