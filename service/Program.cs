using EPDM.Interop.epdm;
using Interface;
using Scripts;
using SolidWorks.Interop.sldworks;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using static System.Net.WebRequestMethods;

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
            for(int i = 0; i < commands.Length; i++)
            {
                if (args[0].Trim().Equals(commands[i]))
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
                    RunDistinta(args[1]);
                    break;
                    ;
                default:
                    Console.WriteLine(usageError);
                    break;

            }
            return 0;
        }

    public static string GetFileNameFromPdmId(IEdmVault5 vault, int fileId)
    {
        if (vault == null || !vault.IsLoggedIn)
            throw new InvalidOperationException("Vault is not initialized or logged in.");

        IEdmFile5 file = (IEdmFile5)vault.GetObject(EdmObjectType.EdmObject_File, fileId);

        return file?.Name;
    }

        public static string to12Digits(string name)
    {
            if (name.Length == 12)
                return name;

            if (name.Length > 12)
                return "CODICE ERRAT";

            int addChars = 12 - name.Length;

            System.Text.StringBuilder str = new System.Text.StringBuilder(name);

            for(int i = 0; i < addChars; i++)
            {
                str.Append(' ');
            }

            return str.ToString();
    }

    public static void RunDistinta(string part, bool flatten = true)
    {
            SQL sql = new SQL();
            PDM pdm = new PDM(sql, true);

            IEdmVault11 vault2 = (IEdmVault11)pdm.vault;
            IEdmBomMgr2 bomMgr = (IEdmBomMgr2)vault2.CreateUtility(EdmUtility.EdmUtil_BomMgr);

            EdmBomLayout2[] layouts;

            bomMgr.GetBomLayouts2(out layouts);

            
            //THIS PRINTS THE AVALIABLE BOMs
            for(int i = 0; i < layouts.Length; i++)
            {
                string name = layouts[i].mbsLayoutName;
                Console.WriteLine(name);
            }


            PDMObject obj = pdm.searchFile(part);
            
            IEdmFile11 file = (IEdmFile11)obj.file;

            //THE FIRST PARAM OF GETCOMPUTED BOM IS THE AVALIABLE BOM LAYOUT.
            IEdmBomView3 bomView = (IEdmBomView3)file.GetComputedBOM("BOM", 0, "@", (int)EdmBomFlag.EdmBf_AsBuilt + (int)EdmBomFlag.EdmBf_ShowSelected);

            object[] rows;
            bomView.GetRows(out rows);

            IEdmBomCell ppoRow = default(IEdmBomCell);


            bool showDescription = false;
            
            int emptyCount = 0;

            List<string> bom = new List<string>();

            for(int i = 0; i < rows.Length; i++)
            {
                EdmBomColumn[] ppoColumns = null;
                bomView.GetColumns(out ppoColumns);

                ppoRow = (IEdmBomCell)rows[i];
                int level = ppoRow.GetTreeLevel();
                
                StringBuilder sb = new StringBuilder();
                sb.Append(level);
                for(int j = 0; j < ppoColumns.Length; j++)
                {

                    if (j == 0 || j == 2 && showDescription || j == 3)
                    {

                        object response;
                        object computedValue;
                        string cfg;
                        bool readOnly;

                        ppoRow.GetVar(ppoColumns[j].mlVariableID,ppoColumns[j].meType, out response,out computedValue, out cfg, out readOnly) ;

                        string val = (string)response;
                        string cVal = (string)computedValue;


                        if (val.Length == 0)
                        {
                            if (j == 0)
                            {
                                emptyCount++;
                                val = $"VUOTO {emptyCount}";
                            }
                            else
                                continue;
                        }

                        if (val.Length !=12 && j == 0 )
                            val = to12Digits(val);

                        sb.Append(" "+val);

                    }
                }
                bom.Add(sb.ToString());
            }

            if (flatten)
            { 
                bom = FlattenBom(bom);
            }

            Console.WriteLine($"======================= {part} ===========================");
            Console.WriteLine("======================= BOM START ===========================");

            foreach(var item in bom)
            {
                string[] line = item.Trim().Split(new[] { ' ' }, 3, StringSplitOptions.RemoveEmptyEntries);

                if (line[1].Equals("2208208090"))
                    Console.WriteLine("DEBUG");

                Console.WriteLine(line[1] +' '+line[2]);
            }

            Console.WriteLine("======================= BOM END ===========================");
        }

        public static List<string> FlattenBom(List<string> bom)
        {
            List<string> flatBom = new List<string>();

            if (bom == null || bom.Count == 0)
                return flatBom;

            for (int i = 0; i < bom.Count; i++)
            {
                int currentLevel = GetLevel(bom[i]);

                if (i == bom.Count - 1)
                {
                    flatBom.Add(bom[i]);
                    break;
                }

                int nextLevel = GetLevel(bom[i + 1]);

                if (nextLevel <= currentLevel)
                {
                    flatBom.Add(bom[i]);
                }
            }

            return flatBom;
        }

        private static int GetLevel(string line)
        {
            string[] parts = line.Trim().Split(' ');
            int.TryParse(parts[0], out int level);
            return level;
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
