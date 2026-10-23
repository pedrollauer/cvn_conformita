using EPDM.Interop.epdm;
using System.Drawing;
using System.Runtime.InteropServices;

// TODO CREATE A METHOD TO INITIALIZE SW/PDM IF IT FAILS
// TODO CREATE A METHOD TO CHECK IF ABREFECHA3 WORKED



// WEB HOST INITIALIZATION
var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://localhost:5000");

var app = builder.Build();

[DllImport("gdi32.dll")]
static extern bool DeleteObject(IntPtr hObject);

// SOLIDWORKS / PDM INICIALIZATION
Interface.PDM pdm = null!;
Interface.SW sw = null!;
Interface.SQL sql = null!;
try
{
    sql = new Interface.SQL();
    pdm = new Interface.PDM(sql,true);
    sw = new Interface.SW();

}
catch (Exception ex)
{
}

app.MapPost("/api/pdm-thumbnail/batch-br", (List<string> fileNames) =>
{
});

app.MapGet("/update", (string path) =>
{
    var update = new Scripts.Update(sw, pdm, sql, path);
});

app.MapGet("/approve", (int num) =>
{
    var update = new Scripts.Approve(sql, pdm, num);
});

app.Run();


