using SQLite;

class queue
{
    [PrimaryKey, AutoIncrement]
    int id { get; set; }
    public string code { get; set; }
    public string path{ get; set; }

}
