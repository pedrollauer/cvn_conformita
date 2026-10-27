using EPDM.Interop.epdm;
using System.IO;
using System.Runtime.InteropServices.Marshalling;

namespace Interface
{
    public class PDM
    {
        public bool it = false;
        public IEdmVault5 vault;
        private IEdmSearch9 search;

        private String userName = "p.lauer";
        public String passWord = "1tYkJ6=_218#Ay";
        public String vaultName = "_CavannaPDM";
        public int rootFolderID;
        private IEdmFolder5 currentFolder;
        public List<String> currentPathFolders;
        public IEdmPos5 pos;
        private bool endLine = false;
        public string currentFolderSTR = "";
        private List<IEdmFile5> allFiles = new List<IEdmFile5>();

        private SQL sql;

        public PDM(SQL sql, bool it = false)
        {
            this.sql = sql;
            vault = new EdmVault5();

            if (it)
            {
                Console.WriteLine("Connecting to the IT PDM.");
                vault.Login(userName, passWord, vaultName);
            }
            else
            {
                Console.WriteLine("Connecting to the BR PDM.");
                String userName = "pedro lauer";
                String passWord = "0101";
                String vaultName = "_CavannaPDM_BR";
                vault.Login(userName, passWord, vaultName);

            }

            if (!vault.IsLoggedIn)
            {
                Console.WriteLine("Login failed.");
                return;
            }
            currentFolder = vault.RootFolder;
            rootFolderID = currentFolder.ID;
        }


        //Gets the raw references from a pdm file, from its path
        public EdmRawReference[] getRefs(string path)
        {
            var _vault = (IEdmVault7)this.vault;
            var mgr = (IEdmRawReferenceMgr)(_vault.CreateUtility(EdmUtility.EdmUtil_RawReferenceMgr));
            int type = PDM.getType2(path);

            if (type > 2)
                return null;

            EdmRawReference[] refs = null;

            if (!mgr.Open(path))
                return null;

            try
            {
                mgr.GetReferences(ref refs);
                mgr.Close();
                return refs;
            }
            catch (Exception e)
            {
                if (e.Message != "0x80040229")
                    return null;

                Console.WriteLine(e.Message);

                return null;
            }
        }





        //Copies the file especified in fileOrigin to the currentfolder field with the newCode as its file name
        //this method checks the file in.
        public int copyFileToCurrentDir(string fileOrigin, string newCode)
        {
            IEdmFolder5 folder = this.currentFolder;
            int newFileId = folder.AddFile(0, fileOrigin, newCode);
            IEdmFile5 file = folder.GetFile(newCode);

            file.UnlockFile(0, "");

            return newFileId;
        }

        //This creates a directory from the absolute path
        //If many subdirs are especified they are created recursively
        public bool createDirectory(string folder)
        {

            currentFolder = vault.RootFolder;
            string[] rootFolder = currentFolder.LocalPath.Split("\\");

            if (folder == null)
                return false;
            string[] subFolderList = folder.Split("\\");

            for (int i = 0; i < subFolderList.Length; i++)
            {
                if (i < rootFolder.Length)
                    continue;

                currentFolderSTR = this.currentFolder.LocalPath;
                if (!setCurrentFolderToSubFolder(subFolderList[i]))
                {
                    this.createSubFolder(subFolderList[i]);
                }
            }

            return true;

        }
        public String goToFolder(int i)
        {
            return "";
        }

        public IEdmFolder5 getCurrentFolder()
        {
            return this.currentFolder;
        }
        public String getCurrentFolderID()
        {
            return "";
        }

        //Creates a subfolder sets the current subfolder to the 
        //Added subfolder
        public bool createSubFolder(string newFolder)
        {
            IEdmFolder5 folder = this.getCurrentFolder();
            folder = folder.CreateFolderPath(newFolder, 0);

            if (folder != null)
                this.setCurrentFolderToSubFolder(newFolder);
            return true;


        }

        //This method creates a new folder from the absolute path
        //It sets the current folder to the new folder
        public bool createFolder(string absolutePath, string newFolder)
        {
            setCurrentFolderToAbsolute(absolutePath);


            bool value = this.setCurrentFolderToAbsolute(absolutePath);

            if (!value)
                return false;

            IEdmFolder5 folder = this.getCurrentFolder();
            folder = folder.CreateFolderPath(newFolder, 0);

            if (folder != null)
                setCurrentFolderToAbsolute(newFolder);
            return true;

        }

        //This sets the field current folder to a folder from the path,
        //The path should be absolute
        public bool setCurrentFolderToAbsolute(string folder)
        {
            currentFolder = vault.RootFolder;
            string[] rootFolder = currentFolder.LocalPath.Split("\\");

            if (folder == null)
                return false;
            string[] subFolderList = folder.Split("\\");

            for (int i = 0; i < subFolderList.Length; i++)
            {
                if (i < rootFolder.Length)
                    continue;

                setCurrentFolderToSubFolder(subFolderList[i]);
            }

            return true;
        }
        //This method set the field current folder to a current's folder child folder
        public bool setCurrentFolderToSubFolder(String folderName)
        {
            try
            {
                currentFolder = currentFolder.GetSubFolder(folderName);
                return true;
            }
            catch (Exception e)
            {
                Console.WriteLine(e.Message);
                return false;
            }

        }
        public bool setCurrentFolder(int folderID)
        {

            String newFolder = currentPathFolders[folderID];
            currentFolder = currentFolder.GetSubFolder(newFolder);
            if (currentFolder == null)
            {
                return false;
            }
            else
            {
                return true;
            }

        }
        public List<String> listFolders()
        {
            List<String> list = new List<String>();
            currentPathFolders = new List<String>();
            pos = currentFolder.GetFirstSubFolderPosition();
            if (pos.IsNull)
                // list from csv
                return null;
            else
            {
                while (!pos.IsNull)
                {
                    IEdmFolder5 sf = currentFolder.GetNextSubFolder(pos);
                    if (currentFolder.ID != 13282 && sf.Name.IndexOf("-") == -1)
                    {
                        continue;
                    }
                    list.Add(sf.Name);
                    currentPathFolders.Add(sf.Name);
                }
            }

            return list;
        }

        public void saveRefs(string path, EdmRawReference[] refs)
        {
            var _vault = (IEdmVault7)this.vault;
            var mgr = (IEdmRawReferenceMgr)(_vault.CreateUtility(EdmUtility.EdmUtil_RawReferenceMgr));

            if (!mgr.Open(path))
                return;

            try
            {
                mgr.UpdateReferences(refs);
                mgr.Close();
            }
            catch (Exception e)
            {
                string file = Path.GetFileName(path);
                Console.WriteLine(file + ": " + e.Message);
            }
        }

        public void makeFileLocal(string filePath, string destination)
        {

            IEdmFolder5 parentFolder;
            IEdmFile5 file = vault.GetFileFromPath(filePath, out parentFolder);

            if (file != null)
            {

                file.GetFileCopy(0, 0, destination, (int)EdmGetFlag.EdmGet_RefsVerLatest, "");
                Console.WriteLine($"Arquivo {file.Name} agora está disponível localmente.");
            }
            else
            {
                Console.WriteLine("Arquivo não encontrado no PDM.");
            }
        }
        public static string dirDrawing(string dirPart)
        {
            if (dirPart == null)
                return null;

            string ext = Path.GetExtension(dirPart).ToUpper();

            return dirPart.Replace(ext, ".SLDDRW");
        }

        public string cavannaType(string code)
        {
            string head = code[0..2];
            string returnMe = "";

            switch (head)
            {
                case "73":
                    returnMe = ".SLDPRT";
                    break;
                case "59":
                    returnMe = ".SLDASM";
                    break;
                case "28":
                    returnMe = ".SLDASM";

                    break;
                case "29":
                    returnMe = ".SLDASM";

                    break;
                case "77":

                    returnMe = ".SLDASM";
                    break;
                case "10":
                    returnMe = ".SLDPRT";
                    break;
                default:
                    returnMe = ".SLDPRT";
                    break;
            }

            return returnMe;
        }


        public PDMObject searchFile2(String fileName, bool ignoreDrawing = true)
        {

            IEdmFile5 file = null;
            PDMObject returnFile = null;

            if (fileName == null)
                throw new Exception("Invalid file name.");
            try
            {
                search = (IEdmSearch9)vault.CreateSearch();

                //Seach config flags
                search.FindFolders = false;
                search.Recursive = true;
                search.StartFolderID = rootFolderID;

                if (fileName.Contains('.'))
                {
                    search.FileName = fileName;
                }
                else
                {
                    search.FileName = fileName + ".%";
                }


                // Start reading results:

                IEdmSearchResult5 res = search.GetFirstResult();
                if (res == null)
                {
                    string[] syntax = search.GetSyntaxErrors();

                    return null;
                }
                else
                {
                    file = (IEdmFile5)search.GetFirstResult();
                    int parentID = (search.GetFirstResult()).ParentFolderID;
                    string path = file.GetLocalPath(parentID);
                    if (Path.GetExtension(path).ToUpper().Equals(".PDF"))
                    {
                        var result = search.GetNextResult();
                        parentID = result.ParentFolderID;
                        file = (IEdmFile5)result;
                        path = file.GetLocalPath(parentID);

                    }
                    returnFile = new PDMObject(parentID, file, vault, path);
                }


            }
            catch (System.Runtime.InteropServices.COMException ex)
            {
                Console.WriteLine("COM Exception: " + ex.Message);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
            }

            return returnFile;
        }

        public PDMObject searchFile(String fileName, bool ignoreDrawing = true)
        {
            IEdmFile5 file = null;
            PDMObject returnFile = null;

            if (fileName == null)
                throw new Exception("Invalid file name.");
            try
            {
                search = (IEdmSearch9)vault.CreateSearch();

                //Seach config flags
                search.FindFolders = false;
                search.Recursive = true;
                search.StartFolderID = rootFolderID;

                if (fileName.Contains('.'))
                {
                    search.FileName = fileName;
                }
                else
                {
                    search.FileName = fileName + ".%";
                }


                // Start reading results:

                IEdmSearchResult5 res = search.GetFirstResult();
                if (res == null)
                {
                    string[] syntax = search.GetSyntaxErrors();

                    return null;
                }
                else
                {
                    file = (IEdmFile5)search.GetFirstResult();
                    int parentID = (search.GetFirstResult()).ParentFolderID;
                    string path = file.GetLocalPath(parentID);
                    if (Path.GetExtension(path).ToUpper().Equals(".SLDDRW"))
                    {
                        var result = search.GetNextResult();
                        parentID = result.ParentFolderID;
                        file = (IEdmFile5)result;
                        path = file.GetLocalPath(parentID);

                    }
                    returnFile = new PDMObject(parentID, file, vault, path);
                }


            }
            catch (System.Runtime.InteropServices.COMException ex)
            {
                Console.WriteLine("COM Exception: " + ex.Message);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception: " + ex.Message);
            }

            return returnFile;
        }

        public String listFiles(String root)
        {
            IEdmPos5 pos = currentFolder.GetFirstFilePosition();
            if (pos.IsNull)
                Console.WriteLine("[Root] No files.");
            else
            {
                while (!pos.IsNull)
                {
                    IEdmFile5 f = currentFolder.GetNextFile(pos);
                    Console.WriteLine("  - " + f.Name);
                }
            }
            return "";
        }

        public List<String> getFolderCSV(String baseCode)
        {
            string path = "Data/" + baseCode + ".txt";

            List<string> folders = new List<string>();
            if (!endLine && !File.Exists(path))
            {
                path = "Data/END.txt";
                endLine = true;
            }

            try
            {
                foreach (var line in File.ReadAllLines(path)[1..])
                {

                    folders.Add(line);
                }

                return folders;

            }
            catch (Exception e)
            {
                Console.WriteLine(e.Message);
                return null;
            }

        }

        public bool goToRoot()
        {

            currentFolder = vault.RootFolder;
            if (currentFolder == null)
            {
                return false;
            }
            else
            {
                return true;
            }

        }
        public List<String> queryPDM(String query)
        {
            IEdmSearch9 search = (IEdmSearch9)vault.CreateSearch();
            List<String> list = new();

            search.FindFiles = true;
            search.FindFolders = false;
            search.Recursive = true;
            search.StartFolderID = vault.RootFolderID;
            search.FileName = query + "%";


            IEdmSearchResult5 res = search.GetFirstResult();
            if (res == null)
            {
                string syntax = search.GetSyntaxErrors()[0];
                if (!string.IsNullOrEmpty(syntax))
                    Console.WriteLine("Search syntax errors: " + syntax);
                Console.WriteLine("Search returned no results.");
            }
            else
            {
                while (res != null)
                {
                    list.Add(res.Name);
                    res = search.GetNextResult();
                }
            }
            return list;

        }

        public String getNextNumInFamily(String code)
        {
            List<String> rawList = queryPDM(code);
            List<long> list = new();

            foreach (String item in rawList)
            {
                if (code.Length > item.Length || item.IndexOf('.') == -1)
                {
                    continue;
                }

                //String newItem = item[code.Length .. item.IndexOf(".")];
                String newItem = item[0..item.IndexOf(".")];
                if (long.TryParse(newItem, out long number))
                {
                    list.Add(number);
                }
            }

            list.Sort();
            long serialNumber = list[list.Count - 1] + 1;

            return serialNumber.ToString();
        }
        public String getNextInFamily(String code)
        {
            List<String> rawList = queryPDM(code);
            List<Int32> list = new();

            foreach (String item in rawList)
            {
                if (code.Length > item.Length || item.IndexOf('.') == -1)
                {
                    continue;
                }

                String newItem = item[code.Length..item.IndexOf(".")];
                if (int.TryParse(newItem, out int number))
                {
                    list.Add(number);
                }
            }

            list.Sort();
            int serialNumber = list[list.Count - 1] + 1;

            return code + serialNumber;
        }

        public static int getType2(String fileName)
        {
            if (fileName == null)
                return -1;

            int extensionPointer = fileName.IndexOf('.');
            if (extensionPointer == -1)
                return -1;

            String extension = (fileName.Substring(extensionPointer + 1)).ToUpper();

            switch (extension)
            {
                case "SLDPRT":
                    return 0;
                case "SLDASM":
                    return 1;
                case "SLDDRW":
                    return 2;
                case "TXT":
                    return 3;
                default:
                    return -1;
            }
        }
        //This Method returns
        //0 if the file extension corresponds to a part
        //1 if the file extension corresponds to an assembly
        //2 if the file extension corresponds to a drawing
        //3 if the file extgension corresponds to a text file
        //-1 if the file extension is unknown or null
        public int getType(String fileName)
        {
            if (fileName == null)
                return -1;

            int extensionPointer = fileName.IndexOf('.');
            if (extensionPointer == -1)
                return -1;

            String extension = (fileName.Substring(extensionPointer + 1)).ToUpper();

            switch (extension)
            {
                case "SLDPRT":
                    return 0;
                case "SLDASM":
                    return 1;
                case "SLDDRW":
                    return 2;
                case "TXT":
                    return 3;
                default:
                    return -1;
            }
        }

        public bool uploadFile(String code)
        {
            return false;
        }

        public void batchApprove(string filePath, string transitionName, string password = "")
        {
            IEdmVault7 vault2 = (IEdmVault7)this.vault;

            IEdmFolder5 folder;
            IEdmFile5 file = vault2.GetFileFromPath(filePath, out folder);

            if (file == null)
            {
                throw new Exception("File was not found in the specified PDM vault path.");
            }

            IEdmBatchChangeState4 batchChanger = (IEdmBatchChangeState4)vault2.CreateUtility(EdmUtility.EdmUtil_BatchChangeState);

            batchChanger.AddFile(file.ID, folder.ID);

            bool treeCreated = batchChanger.CreateTree(transitionName);

            if (treeCreated)
            {
                batchChanger.ChangeState2(0, this.passWord);
            }
            else
            {
                throw new Exception($"Could not create transition tree for '{transitionName}'.");
            }
        }

        public bool ApprovePdmFile(string filePath, string transitionName, string password = "")
        {
            IEdmVault7 vault2 = (IEdmVault7)this.vault;

            IEdmFolder5 folder;
            IEdmFile5 file = vault2.GetFileFromPath(filePath, out folder);

            if (file == null)
            {
                throw new Exception("File was not found in the specified PDM vault path.");

            }

            IEdmBatchChangeState4 batchChanger = (IEdmBatchChangeState4)vault2.CreateUtility(EdmUtility.EdmUtil_BatchChangeState);

            batchChanger.AddFile(file.ID, folder.ID);

            bool treeCreated = batchChanger.CreateTree(transitionName);

            if (treeCreated)
            {
                Console.WriteLine("Approving...");
                batchChanger.ChangeState2(0, this.passWord);
                Console.WriteLine("Approved.");
                return true;
            }
            else
            {
                throw new Exception($"Could not create transition tree for '{transitionName}'.");
                return false;
            }
        }

        public bool checkinFile(PDMObject obj, string comment = "Checked in via API")
        {
            try
            {
                Console.WriteLine("Checking in...");

                if (obj.file != null)
                {
                        Console.WriteLine("File not null");
                    if (obj.file.IsLocked)
                    {
                        Console.WriteLine("File is locked");
                        obj.file.UnlockFile(0, comment);
                        if (!obj.file.IsLocked)
                        {
                            Console.WriteLine("File state changed");
                            sql.conn.Insert(new DB.update_log{code = obj.file.Name, status="CHECKIN", timestamp=DateTimeOffset.UtcNow.ToUnixTimeSeconds()});
                            Console.WriteLine($"File {obj.file.Name} checked in successfully.");
                              return true;
                        }

                    }
                }
            }
            catch (System.Runtime.InteropServices.COMException ex)
            {
                sql.conn.Insert(new DB.update_log{code = obj.file.Name, status="ERROR CHECKIN", timestamp=DateTimeOffset.UtcNow.ToUnixTimeSeconds()});
                Console.WriteLine("PDM Error: " + ex.ErrorCode + " - " + ex.Message);
            }

            return false;
        }

        public List<int> PrintAvailableTransitions(string filePath)
        {
            List<int> availableTransitionIds = new List<int>();

            try
            {
                IEdmFolder5 parentFolder = null;
                IEdmFile5 file = vault.GetFileFromPath(filePath, out parentFolder);

                if (file != null)
                {
                    IEdmState5 currentState = file.CurrentState;
                    Console.WriteLine($"File is currently in state: {currentState.Name}");
                    Console.WriteLine("Valid transitions you can use:");

                    IEdmPos5 pos = currentState.GetFirstTransitionPosition();

                    if (pos.IsNull)
                    {
                        Console.WriteLine(" - No transitions available from this state.");
                    }

                    // Loop through all transitions without breaking
                    while (!pos.IsNull)
                    {
                        IEdmTransition5 transition = currentState.GetNextTransition(pos);


                        int targetStateId = transition.ToState.ID;
                        Console.WriteLine($"Transition {transition.ID}: '{transition.Name}' -> Leads to State ID {targetStateId} ('{transition.ToState.Name}')");

                        availableTransitionIds.Add(transition.ID);
                    }
                }
                else
                {
                    Console.WriteLine("File not found.");
                }

                return availableTransitionIds;
            }
            catch (System.Runtime.InteropServices.COMException ex)
            {
                Console.WriteLine("PDM Error: " + ex.ErrorCode + " - " + ex.Message);
                return availableTransitionIds;
            }
        }

        public bool changeFileState2(string filePath, int transitionId, int destination, string comment = "")
        {
            try
            {
                IEdmFolder5 parentFolder = null;
                IEdmFile5 file = vault.GetFileFromPath(filePath, out parentFolder);

                if (file != null)
                {
                    if (!file.IsLocked)
                    {
                        IEdmFile13 file13 = (IEdmFile13)file;

                        object stateIdOrName = "";
                        object transIdOrName = transitionId;

                        // 0 is the window handle, the second 0 is for lEdmStateFlags, "" is for password
                        file13.ChangeState3(destination, ref transIdOrName, parentFolder.ID, comment, 0, 0, this.passWord);
                        //file13.ChangeState3("Approvato", "Approva Modifica Senza Revisione", parentFolder.ID, comment, 0, 0, this.passWord);

                        Console.WriteLine($"File {file.Name} successfully pushed through transition ID: {transitionId}");
                        return true;
                    }
                    else
                    {
                        Console.WriteLine($"Cannot change state. File is checked out by: {file.LockedByUser}");
                    }
                }
                else
                {
                    Console.WriteLine("File not found.");
                }
            }
            catch (System.Runtime.InteropServices.COMException ex)
            {
                Console.WriteLine("PDM Error: " + ex.ErrorCode + " - " + ex.Message);
            }
            return false;
        }

        public bool changeFileState(string filePath, int transitionId, string comment = "")
        {
            try
            {
                IEdmFolder5 parentFolder = null;
                IEdmFile5 file = vault.GetFileFromPath(filePath, out parentFolder);

                if (file != null)
                {
                    if (!file.IsLocked)
                    {
                        IEdmFile13 file13 = (IEdmFile13)file;

                        string originalState = file.CurrentState.Name;

                        object stateIdOrName = "";
                        object transIdOrName = transitionId;

                        file13.ChangeState3(12, ref transIdOrName, parentFolder.ID, comment, 0, 0, this.passWord);

                        string newState = file.CurrentState.Name;

                        if (originalState != newState)
                        {
                            Console.WriteLine($"Success: File '{file.Name}' moved from '{originalState}' to '{newState}' (Transition ID: {transitionId}).");
                            
                            return true;
                        }
                    }
                }
            }
            catch (System.Runtime.InteropServices.COMException ex)
            {
                Console.WriteLine("PDM Error: " + ex.ErrorCode + " - " + ex.Message);
            }

            return false;
        }

        /*
        public bool approveFile(string filePath,  string comment = "Approved via API")
        {
            // Replace "Approve" with the exact string of your PDM workflow transition
            string approvalTransitionName = "Approve";

            bool success = changeFileState(filePath, approvalTransitionName, comment);

            if (success)
            {
                Console.WriteLine($"{filePath} was successfully approved.");
            }

            return success;
        }
        */

        public bool checkoutFile(PDMObject obj)
        {
            try
            {

                if (obj.file != null)
                {
                    // Check if it is already checked out
                    if (!obj.file.IsLocked)
                    {
                        obj.file.LockFile(obj.folder.ID, 0);
                        if (obj.file.IsLocked)
                        {
                            Console.WriteLine($"File {obj.file.Name} checked out successfully.");
                            sql.conn.Insert(new DB.update_log{code = obj.file.Name, status="CHECK OUT", timestamp=DateTimeOffset.UtcNow.ToUnixTimeSeconds()});
                            return true;
                        }
                        else
                        {

                            sql.conn.Insert(new DB.update_log{code = obj.file.Name, status="ERROR CHECK OUT", timestamp=DateTimeOffset.UtcNow.ToUnixTimeSeconds()});
                        }
                    }
                    else
                    {
                        return false;
                    }
                }
            }
            catch (System.Runtime.InteropServices.COMException ex)
            {
                sql.conn.Insert(new DB.update_log{code = obj.file.Name, status="ERROR CHECK OUT", timestamp=DateTimeOffset.UtcNow.ToUnixTimeSeconds()});
                Console.WriteLine("PDM Error: " + ex.ErrorCode + " - " + ex.Message);
            }
            return false;
        }
    }
}
