SELECT COUNT(DISTINCT u.id) as unique_user_count
FROM users u
INNER JOIN sessions s ON u.id = s."userId"
WHERE s.duration > 0
  AND s."gameId" = 'cmko358je03b1o31mml4czylt'
  AND DATE(s."startTime") = DATE(u."createdAt");