using SQLite;

namespace Interface
{
    public class SQL
    {
        private string dbPath = "C:\\db\\conformita.db";
        public SQLiteConnection conn;

        public void CreateDB()
        {
            conn.CreateTable<DB.update_flow>();
            conn.CreateTable<DB.update_log>();

            conn.CreateTable<DB.done>();
        }

        public SQL()
        {
            conn = new SQLiteConnection(dbPath);
            CreateDB();

        }

    }
}