using EPDM.Interop.epdm;
using Interface;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;
using Scripts;

namespace PdmThumbnailService
{
    public class Program
    {
        // FIELDS
        public static string usageError = "Usage: PdmThumbnailService.exe <update|approve> [maxPack]";

        // METHODS
        public static int Main(string[] args)
        {
            string[] commands = { "update", "approve", "distinta" };

            int run = -1;
            for(int i = 0; i < args.Length; i++)
            {
                if (args[0].Equals(commands[i]))
                {
                    run = i;
                    break;
                }

            }

            if(run == -1)
            {
                Console.WriteLine(usageError);
                return 0;
            }

            switch (run)
            {
                case 0:
                    RunUpdate(args[1]);
                    break;
                case 2:
                    break;
                    ;
                default:
                    Console.WriteLine(usageError);
                    break;

            }
            return 0;
        }

    public static void RunUpdate(string maxPack)
    {
       Console.WriteLine("UPDATE.");
                SW sw = new SW();
                SQL sql = new SQL();
                PDM pdm = new PDM(sql,true);
            try
            {
                int files2Update;

                bool maxPackOk = int.TryParse(maxPack, out files2Update);

                if (!maxPackOk)
                    return;


                // THIS UPDATES ONE FILE
                List<DB.queue> list = sql.conn.Table<DB.queue>().Take(files2Update).ToList();
                foreach(var file in list)
                {
                    Update up = new Update(sw, pdm, sql, file.path);
                    up.Begin();

                }

            }
            catch (Exception e)
            {
                Console.WriteLine(e.Message);
                Console.WriteLine(e.StackTrace);
            }
            finally
            {
                sql.conn.Close();
                sw.swApp.ExitApp();
                
            }


    }

}
    }
