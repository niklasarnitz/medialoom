-- CreateTable
CREATE TABLE "ReviewQueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'FILESYSTEM_CHANGE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "mediaItemId" TEXT,
    "operationPlanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detailsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewQueueItem_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "Movie" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReviewQueueItem_operationPlanId_fkey" FOREIGN KEY ("operationPlanId") REFERENCES "OperationPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewQueueItem_operationPlanId_key" ON "ReviewQueueItem"("operationPlanId");

-- CreateIndex
CREATE INDEX "ReviewQueueItem_status_idx" ON "ReviewQueueItem"("status");

-- CreateIndex
CREATE INDEX "ReviewQueueItem_type_idx" ON "ReviewQueueItem"("type");

-- CreateIndex
CREATE INDEX "ReviewQueueItem_mediaItemId_idx" ON "ReviewQueueItem"("mediaItemId");
