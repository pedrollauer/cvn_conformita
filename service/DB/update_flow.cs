using SQLite;
using System;
using System.Collections.Generic;
using System.Text;

namespace DB
{
    public class update_flow
    {
        [PrimaryKey]
        public string code { get; set; }

        public string path { get; set; }

        public int review { get; set; }
        public int checkout { get; set; }
        public int update { get; set; }
        public int checkin { get; set; }
        public int approve { get; set; }

        public long date { get; set; }
    }
}