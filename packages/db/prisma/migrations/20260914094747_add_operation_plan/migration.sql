-- CreateTable
CREATE TABLE "OperationPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mediaItemId" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "destinationRoot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "operationsJson" TEXT NOT NULL,
    "validationJson" TEXT,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" DATETIME,
    "appliedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperationPlan_mediaItemId_fkey" FOREIGN KEY ("mediaItemId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OperationPlan_mediaItemId_idx" ON "OperationPlan"("mediaItemId");

-- CreateIndex
CREATE INDEX "OperationPlan_status_idx" ON "OperationPlan"("status");
