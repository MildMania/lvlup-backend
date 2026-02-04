-- CreateIndex
CREATE INDEX "events_gameId_timestamp_idx" ON "events"("gameId", "timestamp");

-- CreateIndex
CREATE INDEX "events_gameId_userId_timestamp_idx" ON "events"("gameId", "userId", "timestamp");
