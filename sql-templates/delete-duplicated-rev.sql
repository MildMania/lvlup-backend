DELETE FROM revenue
WHERE "id" IN (
    SELECT "id"
    FROM (
        SELECT 
            "id",
            ROW_NUMBER() OVER (
                PARTITION BY "userId", "timestamp" 
                ORDER BY "id"
            ) AS row_num
        FROM revenue
        WHERE "revenueType" = 'AD_IMPRESSION'
            AND "gameId" = 'cmkkteznd0076mn1m2dxl1ijd'
    ) ranked
    WHERE row_num > 1  -- Keep row_num=1, delete all others
);