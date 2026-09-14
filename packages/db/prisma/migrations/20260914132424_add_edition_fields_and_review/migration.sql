-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Edition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movieId" TEXT NOT NULL,
    "name" TEXT,
    "normalizedName" TEXT,
    "type" TEXT,
    "source" TEXT,
    "runtimeMinutes" INTEGER,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Edition_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Edition" ("createdAt", "id", "movieId", "name", "updatedAt") SELECT "createdAt", "id", "movieId", "name", "updatedAt" FROM "Edition";
DROP TABLE "Edition";
ALTER TABLE "new_Edition" RENAME TO "Edition";
CREATE INDEX "Edition_movieId_idx" ON "Edition"("movieId");
CREATE INDEX "Edition_needsReview_idx" ON "Edition"("needsReview");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
