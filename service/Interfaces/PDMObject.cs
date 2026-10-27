using EPDM.Interop.epdm;
using Scripts;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Interface
{
    public class PDMObject
    {
        public IEdmFile5 file;
        public IEdmVault5 vault;

        public IEdmFolder5 folder;
        public int parentFolderId = 0;
        public string name;
        public string path;

        public PDMObject(string path, PDM pdm)
        {
            this.file = pdm.vault.GetFileFromPath(path, out this.folder);
        }

        public void getCopy()
        {

            file.GetFileCopy(0, null, null, 0, "");
        }

        public PDMObject(int dir, IEdmFile5 file, IEdmVault5 vault, string path = "null")
        {
            this.parentFolderId = dir;
            this.file = file;
            this.vault = vault;
            this.name = file.Name;
            this.path = path;
        }
    }
}
