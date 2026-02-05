SELECT 
    "userId",
    "timestamp",
    COUNT(*) as duplicate_count,
    SUM("revenueUSD") as total_revenue,
    STRING_AGG("adImpressionId", ', ') as ad_impression_ids,
    STRING_AGG("id", ', ') as record_ids
FROM revenue
WHERE "revenueType" = 'AD_IMPRESSION'
GROUP BY "userId", "timestamp"
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;