using SQLite;
using System;
using System.Collections.Generic;
using System.Text;

namespace DB
{
    public class external_ref 
    {
        [PrimaryKey, AutoIncrement]
        public int id { get; set; }
        public string code { get; set; }
        public long error_code { get; set; }
        public string error_desc { get; set; }
        

    }
}