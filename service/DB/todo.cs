using SQLite;

namespace DB
{
public class todo 
{
    [PrimaryKey]
    public string code { get; set; }
    public int error { get; set; }

    }

}
