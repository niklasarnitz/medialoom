/*
  Warnings:

  - You are about to drop the `MediaItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `mediaItemId` on the `Asset` table. All the data in the column will be lost.
  - Added the required column `mediaVersionId` to the `Asset` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "MediaItem_status_idx";

-- DropIndex
DROP INDEX "MediaItem_movieId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MediaItem";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Edition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movieId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Edition_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaVersion_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaTechnicalMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "container" TEXT,
    "formatName" TEXT,
    "durationSeconds" REAL,
    "bitRate" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "videoCodec" TEXT,
    "audioCodec" TEXT,
    "audioChannels" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaTechnicalMetadata_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mediaVersionId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VIDEO',
    "path" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mtime" DATETIME NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_mediaVersionId_fkey" FOREIGN KEY ("mediaVersionId") REFERENCES "MediaVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("createdAt", "id", "mtime", "path", "present", "sizeBytes", "type", "updatedAt") SELECT "createdAt", "id", "mtime", "path", "present", "sizeBytes", "type", "updatedAt" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE UNIQUE INDEX "Asset_path_key" ON "Asset"("path");
CREATE INDEX "Asset_mediaVersionId_idx" ON "Asset"("mediaVersionId");
CREATE TABLE "new_Movie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "originalTitle" TEXT,
    "year" INTEGER,
    "runtimeMinutes" INTEGER,
    "overview" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchConfidence" REAL,
    "tmdbId" INTEGER,
    "imdbId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Movie" ("createdAt", "id", "imdbId", "originalTitle", "overview", "runtimeMinutes", "title", "tmdbId", "updatedAt", "year") SELECT "createdAt", "id", "imdbId", "originalTitle", "overview", "runtimeMinutes", "title", "tmdbId", "updatedAt", "year" FROM "Movie";
DROP TABLE "Movie";
ALTER TABLE "new_Movie" RENAME TO "Movie";
CREATE UNIQUE INDEX "Movie_tmdbId_key" ON "Movie"("tmdbId");
CREATE UNIQUE INDEX "Movie_imdbId_key" ON "Movie"("imdbId");
CREATE INDEX "Movie_status_idx" ON "Movie"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Edition_movieId_idx" ON "Edition"("movieId");

-- CreateIndex
CREATE INDEX "MediaVersion_editionId_idx" ON "MediaVersion"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaTechnicalMetadata_assetId_key" ON "MediaTechnicalMetadata"("assetId");
