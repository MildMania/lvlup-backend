SELECT 
    "userId",
    "timestamp",
    COUNT(*) as duplicate_count,
    SUM("revenueUSD") as total_revenue,
    STRING_AGG("transactionId", ', ') as transaction_ids,
    STRING_AGG("id", ', ') as record_ids
FROM revenue
WHERE "revenueType" = 'IN_APP_PURCHASE'
GROUP BY "userId", "timestamp"
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;