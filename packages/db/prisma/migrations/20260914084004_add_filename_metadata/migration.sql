-- CreateTable
CREATE TABLE "MediaFilenameMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "title" TEXT,
    "year" INTEGER,
    "type" TEXT,
    "edition" TEXT,
    "screenSize" TEXT,
    "source" TEXT,
    "videoCodec" TEXT,
    "audioCodec" TEXT,
    "audioChannels" TEXT,
    "releaseGroup" TEXT,
    "streamingService" TEXT,
    "container" TEXT,
    "language" TEXT,
    "rawJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaFilenameMetadata_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaFilenameMetadata_assetId_key" ON "MediaFilenameMetadata"("assetId");
