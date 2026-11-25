SET NOCOUNT ON;

DECLARE @SelectionOption INT      = 1;   -- 1 Lista , 2 Range
DECLARE @MaxLevel        INT      = 7;
DECLARE @DataRef         DATETIME = DATEADD(DAY, -1, GETDATE());  -- = GETDATE()-1 da V7

---------------------------- Opções do flat BOM
DECLARE @SoFolhas      BIT = 1;   -- 1 = só folhas (flat clássico) ; 0 = todos os níveis, incluindo semiacabados "Pro"
DECLARE @FiltrarGrupos BIT = 0;   -- 1 = só itens que começam por 28,29,30,58,59,60,77 (filtro da V15)
DECLARE @SoComCusto    BIT = 0;   -- 1 = só itens presentes em tticpr007 (critério da V9)

---------------------------- Lista pré-definida (usada só se @SelectionOption = 1)
DECLARE @Lista TABLE (code VARCHAR(50) PRIMARY KEY);
INSERT INTO @Lista (code) VALUES
     ('290074216187')   --001
--  ,('XXXXXXX  YYYYYYYYYY')   --002
;

IF OBJECT_ID('tempdb..#BomToExplode') IS NOT NULL DROP TABLE #BomToExplode;
IF OBJECT_ID('tempdb..#Bom')          IS NOT NULL DROP TABLE #Bom;

SELECT TOP (0) b.t_mitm, CAST('' AS VARCHAR(10)) AS SelOpt
INTO   #BomToExplode
FROM   [erpdb].[dbo].[ttibom010100] AS b;

CREATE CLUSTERED INDEX IX_BomToExplode ON #BomToExplode (t_mitm);

---------------------------- Opção 1: lista
IF @SelectionOption = 1
BEGIN
    INSERT INTO #BomToExplode (t_mitm, SelOpt)
    SELECT DISTINCT i.t_item, 'List'
    FROM   [erpdb].[dbo].[ttcibd001100] AS i
    JOIN   @Lista AS l ON i.t_item IN (l.code, SPACE(9) + l.code);
END;


---------------------------- BOM recursiva (igual à V15, + item de topo limpo)
WITH RecursiveBOM AS (
    ------------------------ Nível 1
    SELECT
        CAST(b.t_mitm AS VARCHAR(100))                                  AS Lv0_mitm,
        CAST(CASE LEFT(LTRIM(b.t_mitm),1)
                WHEN '0' THEN STUFF(LTRIM(b.t_mitm),1,1,'')
                WHEN 'H' THEN SUBSTRING(LTRIM(b.t_mitm),10,100)
                ELSE LTRIM(b.t_mitm) END AS VARCHAR(50))                AS Lv0_clean,
        b.t_sitm                                                        AS t_sitm,
        CAST(CASE LEFT(LTRIM(b.t_sitm),1)
                WHEN '0' THEN STUFF(LTRIM(b.t_sitm),1,1,'')
                WHEN 'H' THEN SUBSTRING(LTRIM(b.t_sitm),10,100)
                ELSE LTRIM(b.t_sitm) END AS VARCHAR(50))                AS sitm_clean,
        b.t_qana                                                        AS t_qtot,
        d.t_kitm                                                        AS kitm_num,
        1                                                               AS t_hielv
    FROM       [erpdb].[dbo].[ttibom010100] AS b
    INNER JOIN #BomToExplode                AS s ON s.t_mitm = b.t_mitm
    LEFT  JOIN [erpdb].[dbo].[ttcibd001100] AS d ON d.t_item = b.t_sitm
    WHERE b.t_exdt > @DataRef

    UNION ALL

    ------------------------ Níveis seguintes (só abaixo de itens "Pro")
    SELECT
        p.Lv0_mitm,
        p.Lv0_clean,
        b.t_sitm,
        c.sitm_clean,
        b.t_qana * p.t_qtot                                             AS t_qtot,
        d.t_kitm,
        p.t_hielv + 1
    FROM       RecursiveBOM                 AS p
    INNER JOIN [erpdb].[dbo].[ttibom010100] AS b ON b.t_mitm = p.t_sitm
    INNER JOIN [erpdb].[dbo].[ttcibd001100] AS d ON d.t_item = b.t_sitm
    CROSS APPLY (SELECT CAST(CASE LEFT(LTRIM(b.t_sitm),1)
                                WHEN '0' THEN STUFF(LTRIM(b.t_sitm),1,1,'')
                                WHEN 'H' THEN SUBSTRING(LTRIM(b.t_sitm),10,100)
                                ELSE LTRIM(b.t_sitm) END AS VARCHAR(50)) AS sitm_clean) AS c
    WHERE p.t_hielv < @MaxLevel
      AND b.t_exdt  > @DataRef
      AND p.kitm_num = 2
)
---------------------------- Materializar a explosão + marcar folhas
SELECT
     r.Lv0_mitm
    ,r.Lv0_clean
    ,r.t_sitm
    ,r.sitm_clean
    ,r.t_qtot
    ,r.kitm_num
    ,r.t_hielv
    ,ch.TemFilhos
    -- Folha = não foi explodido mais abaixo pela recursão
    ,CAST(CASE WHEN r.kitm_num = 2 AND r.t_hielv < @MaxLevel AND ch.TemFilhos = 1
               THEN 0 ELSE 1 END AS BIT)                                AS IsFolha
    -- "Pro" com filhos válidos, mas cortado por @MaxLevel -> flat incompleto
    ,CAST(CASE WHEN r.kitm_num = 2 AND r.t_hielv >= @MaxLevel AND ch.TemFilhos = 1
               THEN 1 ELSE 0 END AS BIT)                                AS Truncado
INTO #Bom
FROM RecursiveBOM AS r
-- mesmas condições do passo recursivo (exdt + item existente em tcibd001)
CROSS APPLY (SELECT CAST(CASE WHEN EXISTS (
                        SELECT 1
                        FROM       [erpdb].[dbo].[ttibom010100] AS x
                        INNER JOIN [erpdb].[dbo].[ttcibd001100] AS xd ON xd.t_item = x.t_sitm
                        WHERE x.t_mitm = r.t_sitm
                          AND x.t_exdt > @DataRef)
                    THEN 1 ELSE 0 END AS BIT) AS TemFilhos) AS ch
OPTION (MAXRECURSION 50);

---------------------------- Aviso: explosão cortada por @MaxLevel
IF EXISTS (SELECT 1 FROM #Bom WHERE Truncado = 1)
    SELECT 'ATENÇÃO: aumentar @MaxLevel' AS Aviso, Lv0_mitm, sitm_clean, t_hielv
    FROM   #Bom
    WHERE  Truncado = 1;

---------------------------- Resultado: flat BOM
-- Uma linha por (item de topo, componente), quantidade total somada
-- sobre todos os caminhos onde o componente aparece.
SELECT
    LTRIM(RTRIM(f.sitm_clean))                                        AS Code
    ,LTRIM(RTRIM(MAX(i.t_dsca)))                                        AS Description
    ,MAX(IIF(f.kitm_num = 2,'Pro','Acq'))                               AS t_kitm
    ,MAX(i.t_citg)                                                      AS t_citg
    ,MAX(i.t_cuni)                                                      AS Unidade
    ,SUM(f.t_qtot)                                                      AS Quantity
FROM       #Bom                             AS f
LEFT  JOIN [erpdb].[dbo].[ttcibd001100]     AS i ON i.t_item = f.t_sitm
WHERE (@SoFolhas = 0 OR f.IsFolha = 1)
  AND (@FiltrarGrupos = 0 OR LEFT(f.sitm_clean, 2) IN ('28','29','30','58','59','60','77'))
  AND (@SoComCusto = 0 OR EXISTS (SELECT 1 FROM [erpdb].[dbo].[tticpr007100] AS k
                                  WHERE k.t_item = f.t_sitm))
GROUP BY f.Lv0_mitm, f.Lv0_clean, f.t_sitm, f.sitm_clean
ORDER BY Code
OPTION (RECOMPILE);

DROP TABLE #Bom;
DROP TABLE #BomToExplode;
