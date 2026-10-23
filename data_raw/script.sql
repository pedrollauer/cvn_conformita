/* =====================================================================
   Stampa BOM Multilevel - V15 (V14 + descrição do item t_dsit_c)
   Mesmo resultado da V7, com:
     - filtros "sargable" (permitem Index Seek)
     - tabela temporária com índice em vez de table variable VARCHAR(MAX)
     - sem FORMAT() (CLR, muito lento) e sem VARCHAR(MAX) na recursão
     - filtro Acq/Pro simplificado (parent tem de ser "Pro")
     - limpeza do código de item calculada uma única vez
   ===================================================================== */
SET NOCOUNT ON;
 
DECLARE @SelectionOption INT      = 2;   -- 1 Lista , 2 Range
DECLARE @MaxLevel        INT      = 7;
DECLARE @DataRef         DATETIME = DATEADD(DAY, -1, GETDATE());  -- = GETDATE()-1 da V7
 
---------------------------- Lista pré-definida (usada só se @SelectionOption = 1)
DECLARE @Lista TABLE (code VARCHAR(50) PRIMARY KEY);
INSERT INTO @Lista (code) VALUES
     ('HV09072  3455206116')   --001
--  ,('XXXXXXX  YYYYYYYYYY')   --002
;
 
---------------------------- Tabela temporária com o MESMO tipo de dados de t_mitm
IF OBJECT_ID('tempdb..#BomToExplode') IS NOT NULL DROP TABLE #BomToExplode;
IF OBJECT_ID('tempdb..#Det')          IS NOT NULL DROP TABLE #Det;
 
SELECT TOP (0) b.t_mitm, CAST('' AS VARCHAR(10)) AS SelOpt
INTO   #BomToExplode
FROM   [erpdb].[dbo].[ttibom010100] AS b;
 
CREATE CLUSTERED INDEX IX_BomToExplode ON #BomToExplode (t_mitm);
 
---------------------------- Opção 1: lista
IF @SelectionOption = 1
BEGIN
    -- Aceita o código com ou sem o segmento de projeto em branco (9 espaços),
    -- substituindo o LTRIM(t_mitm) da V7 (que impedia o uso do índice).
    INSERT INTO #BomToExplode (t_mitm, SelOpt)
    SELECT DISTINCT i.t_item, 'List'
    FROM   [erpdb].[dbo].[ttcibd001100] AS i
    JOIN   @Lista AS l ON i.t_item IN (l.code, SPACE(9) + l.code);
END
---------------------------- Opção 2: range de projetos
ELSE IF @SelectionOption = 2
BEGIN
    -- Equivalente a: LEFT(t_cprj,2)='HV' AND SUBSTRING(t_cprj,3,5) BETWEEN '09000' AND '09291'
    -- mas sem funções sobre a coluna -> Index Seek em t_cprj
    INSERT INTO #BomToExplode (t_mitm, SelOpt)
    SELECT DISTINCT p.t_item, 'Range'
    FROM   [erpdb].[dbo].[ttipcs025100] AS p
    WHERE  p.t_cprj >= 'HV09000'
      AND  p.t_cprj <  'HV09300'
    --AND  SUBSTRING(p.t_item, 10, 4) IN ('3455');   --,'3471','3460'   (V12: desativado)
END
 
---------------------------- (debug) itens selecionados - comentar em produção
SELECT SelOpt, t_mitm FROM #BomToExplode;
 
---------------------------- BOM recursiva
WITH RecursiveBOM AS (
    ------------------------ Nível 1
    SELECT
        CAST(b.t_mitm AS VARCHAR(100))                                  AS Lv0_mitm,
        b.t_mitm                                                        AS t_mitm,
        CAST(CASE LEFT(LTRIM(b.t_mitm),1)
                WHEN '0' THEN STUFF(LTRIM(b.t_mitm),1,1,'')
                WHEN 'H' THEN SUBSTRING(LTRIM(b.t_mitm),10,100)
                ELSE LTRIM(b.t_mitm) END AS VARCHAR(50))                AS mitm_clean,
        CAST(IIF(b.t_pono < 1000, RIGHT('00' + CAST(b.t_pono AS VARCHAR(10)), 3),
                                  CAST(b.t_pono AS VARCHAR(10))) AS VARCHAR(10)) AS t_pono,
        b.t_sitm                                                        AS t_sitm,
        CAST(CASE LEFT(LTRIM(b.t_sitm),1)
                WHEN '0' THEN STUFF(LTRIM(b.t_sitm),1,1,'')
                WHEN 'H' THEN SUBSTRING(LTRIM(b.t_sitm),10,100)
                ELSE LTRIM(b.t_sitm) END AS VARCHAR(50))                AS sitm_clean,
        b.t_qana                                                        AS t_qana,
        b.t_qana                                                        AS t_qtot,
        d.t_citg                                                        AS t_citg,
        d.t_cpcp                                                        AS t_cpcp,
        d.t_kitm                                                        AS kitm_num,
        CAST(IIF(d.t_kitm = 2,'Pro','Acq') AS VARCHAR(3))               AS t_kitm,
        b.t_exdt                                                        AS t_exdt,
        1                                                               AS t_hielv,
        CAST('|' + IIF(d.t_kitm = 2,'Pro','Acq') AS VARCHAR(1000))      AS Path_kitm,
        CAST('|' + d.t_citg                      AS VARCHAR(1000))      AS Path_citg,
        CAST('|' + IIF(b.t_pono < 1000, RIGHT('00' + CAST(b.t_pono AS VARCHAR(10)), 3),
                                        CAST(b.t_pono AS VARCHAR(10))) AS VARCHAR(1000)) AS Path_pono,
        CAST(CASE LEFT(LTRIM(b.t_sitm),1)
                WHEN '0' THEN STUFF(LTRIM(b.t_sitm),1,1,'')
                WHEN 'H' THEN SUBSTRING(LTRIM(b.t_sitm),10,100)
                ELSE LTRIM(b.t_sitm) END AS VARCHAR(1000))              AS Path_sitm
    FROM       [erpdb].[dbo].[ttibom010100] AS b
    INNER JOIN #BomToExplode                AS s ON s.t_mitm = b.t_mitm      -- Index Seek (sem LTRIM)
    LEFT  JOIN [erpdb].[dbo].[ttcibd001100] AS d ON d.t_item = b.t_sitm
    WHERE b.t_exdt > @DataRef
    -- (os NOT LIKE '%Acq|Pro%' / '%Acq|Acq%' da V7 nunca são verdadeiros no nível 1 -> removidos)
 
    UNION ALL
 
    ------------------------ Níveis seguintes
    SELECT
        p.Lv0_mitm,
        b.t_mitm,
        CAST(p.sitm_clean AS VARCHAR(50))                               AS mitm_clean,  -- o pai já vem limpo
        CAST(IIF(b.t_pono < 1000, RIGHT('00' + CAST(b.t_pono AS VARCHAR(10)), 3),
                                  CAST(b.t_pono AS VARCHAR(10))) AS VARCHAR(10)) AS t_pono,
        b.t_sitm,
        c.sitm_clean,
        b.t_qana,
        b.t_qana * p.t_qtot                                             AS t_qtot,
        d.t_citg,
        d.t_cpcp,
        d.t_kitm                                                        AS kitm_num,
        CAST(IIF(d.t_kitm = 2,'Pro','Acq') AS VARCHAR(3))               AS t_kitm,
        b.t_exdt,
        p.t_hielv + 1,
        CAST(p.Path_kitm + '|' + IIF(d.t_kitm = 2,'Pro','Acq') AS VARCHAR(1000)),
        CAST(p.Path_citg + '|' + d.t_citg                      AS VARCHAR(1000)),
        CAST(p.Path_pono + '|' + IIF(b.t_pono < 1000, RIGHT('00' + CAST(b.t_pono AS VARCHAR(10)), 3),
                                                     CAST(b.t_pono AS VARCHAR(10))) AS VARCHAR(1000)),
        CAST(p.Path_sitm + '|' + c.sitm_clean                 AS VARCHAR(1000))
    FROM       RecursiveBOM                 AS p
    INNER JOIN [erpdb].[dbo].[ttibom010100] AS b ON b.t_mitm = p.t_sitm
    INNER JOIN [erpdb].[dbo].[ttcibd001100] AS d ON d.t_item = b.t_sitm
    CROSS APPLY (SELECT CAST(CASE LEFT(LTRIM(b.t_sitm),1)
                                WHEN '0' THEN STUFF(LTRIM(b.t_sitm),1,1,'')
                                WHEN 'H' THEN SUBSTRING(LTRIM(b.t_sitm),10,100)
                                ELSE LTRIM(b.t_sitm) END AS VARCHAR(50)) AS sitm_clean) AS c
    WHERE p.t_hielv < @MaxLevel
      AND b.t_exdt  > @DataRef
      AND p.kitm_num = 2      -- equivale aos NOT LIKE '%Acq|Pro%' / '%Acq|Acq%':
                              -- só se explode abaixo de um item "Pro" (fabricado)
)
---------------------------- V11: detalhe filtrado materializado numa só vez em #Det
SELECT
     LTRIM(RTRIM(r.sitm_clean))                                 AS t_sitm    -- sem espaços (cola melhor no Excel)
    ,TRY_CAST(SUBSTRING(r.Lv0_mitm, 3, 5) AS INT)               AS ProjNum   -- 'HV09300  xxxx' -> 9300
    ,LTRIM(RTRIM(LEFT(r.Lv0_mitm, 9)))                          AS ProjCod   -- 'HV09300' (alternativa)
    ,CAST(COALESCE(NULLIF(LTRIM(RTRIM(SUBSTRING(r.Lv0_mitm, 10, 4))),''),'SemParte') AS VARCHAR(10)) AS Parte  -- 'HV09007  3455605928' -> '3455'
    ,LTRIM(RTRIM(i.t_dsca))                                     AS t_dsit_c  -- descrição do item (tcibd001)
INTO #Det
FROM       RecursiveBOM                 AS r
-- JOIN pelo código ORIGINAL (r.t_sitm, com os espaços do LN, ex. '         0101000032'):
-- igualdade exata -> Index Seek, sem LTRIM sobre a coluna
LEFT  JOIN [erpdb].[dbo].[ttcibd001100] AS i ON i.t_item = r.t_sitm
INNER JOIN [erpdb].[dbo].[tticpr007100] AS k ON k.t_item = r.t_sitm   -- só itens com custo (critério da V9); remover para incluir todos
WHERE LEFT(r.sitm_clean, 1) IN ('29') -- CHANGE ME HERE
OPTION (MAXRECURSION 50);
 
---------------------------- Resultado final (V13)
-- t_sitm | t_dsit_c | N_Progetti | Progetto (só nº projeto) | N_Ocorrencias | uma coluna por parte (3455, 3460, 3471, ...)
-- As colunas das partes são criadas dinamicamente a partir das partes encontradas em #Det.
DECLARE @ColsPivot  NVARCHAR(MAX);
DECLARE @ColsSelect NVARCHAR(MAX);
DECLARE @Sql        NVARCHAR(MAX);
 
SELECT
     @ColsPivot  = STRING_AGG(CAST(QUOTENAME(Parte) AS NVARCHAR(MAX)), ',')
                     WITHIN GROUP (ORDER BY Parte)
    ,@ColsSelect = STRING_AGG(CAST('ISNULL(pv.' + QUOTENAME(Parte) + ',0) AS ' + QUOTENAME(Parte) AS NVARCHAR(MAX)), ',')
                     WITHIN GROUP (ORDER BY Parte)
FROM (SELECT DISTINCT Parte FROM #Det) AS x;
 
IF @ColsPivot IS NULL
BEGIN
    PRINT 'Nenhum item encontrado com os filtros atuais.';
END
ELSE
BEGIN
    SET @Sql = N'
    SELECT
         o.t_sitm
        ,o.t_dsit_c
        ,p.N_Progetti
        ,p.Progetto
        ,o.N_Ocorrencias
        ,' + @ColsSelect + N'
    FROM (
            SELECT t_sitm, MAX(t_dsit_c) AS t_dsit_c, COUNT(*) AS N_Ocorrencias
            FROM   #Det
            GROUP BY t_sitm
         ) AS o
    JOIN (
            SELECT d.t_sitm,
                   COUNT(*) AS N_Progetti,   -- nº de projetos distintos onde o item aparece
                   STRING_AGG(CAST(ISNULL(CAST(d.ProjNum AS VARCHAR(10)), d.ProjCod) AS VARCHAR(MAX)), '','')
                       WITHIN GROUP (ORDER BY d.ProjNum, d.ProjCod) AS Progetto
            FROM  (SELECT DISTINCT t_sitm, ProjNum, ProjCod FROM #Det) AS d
            GROUP BY d.t_sitm
         ) AS p ON p.t_sitm = o.t_sitm
    LEFT JOIN (
            SELECT t_sitm, ' + @ColsPivot + N'
            FROM  (SELECT t_sitm, Parte, 1 AS n FROM #Det) AS src
            PIVOT (SUM(n) FOR Parte IN (' + @ColsPivot + N')) AS pvt
         ) AS pv ON pv.t_sitm = o.t_sitm
    ORDER BY o.N_Ocorrencias DESC, o.t_sitm;';
 
    EXEC sp_executesql @Sql;
END
 
DROP TABLE #Det;
DROP TABLE #BomToExplode;
