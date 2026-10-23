using SQLite;

namespace DB
{
    class update_log
    {
        [PrimaryKey,AutoIncrement]
        int id{ get; set; }
        public string code { get; set; }
        public string status { get; set; }
        public long timestamp{ get; set; }
    }
}