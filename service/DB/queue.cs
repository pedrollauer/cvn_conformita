using SQLite;

namespace DB
{
public class queue
{
    [PrimaryKey, AutoIncrement]
    int id { get; set; }
    public string code { get; set; }
    public string path{ get; set; }

}

}
