using SQLite;

namespace DB
{
public class done 
{
    [PrimaryKey, AutoIncrement]
    public int id { get; set; }
    public string code { get; set; }
    public int error { get; set; }
    public long timestamp { get; set; }

    }

}
