using SQLite;

namespace DB
{
public class done 
{
    [PrimaryKey, AutoIncrement]
    public string code { get; set; }
    public long timestamp { get; set; }

    }

}
