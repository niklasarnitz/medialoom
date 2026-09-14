-- AlterTable
ALTER TABLE "MediaTechnicalMetadata" ADD COLUMN "audioLanguage" TEXT;
ALTER TABLE "MediaTechnicalMetadata" ADD COLUMN "audioLayout" TEXT;
ALTER TABLE "MediaTechnicalMetadata" ADD COLUMN "bitDepth" INTEGER;
ALTER TABLE "MediaTechnicalMetadata" ADD COLUMN "frameRate" REAL;
ALTER TABLE "MediaTechnicalMetadata" ADD COLUMN "hdrFormat" TEXT;
ALTER TABLE "MediaTechnicalMetadata" ADD COLUMN "rawJson" TEXT;

-- CreateTable
CREATE TABLE "MediaStream" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "technicalMetadataId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "streamType" TEXT NOT NULL,
    "codec" TEXT,
    "codecLongName" TEXT,
    "profile" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "frameRate" REAL,
    "bitDepth" INTEGER,
    "hdrFormat" TEXT,
    "channels" INTEGER,
    "channelLayout" TEXT,
    "sampleRate" INTEGER,
    "bitRate" BIGINT,
    "language" TEXT,
    "title" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isForced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaStream_technicalMetadataId_fkey" FOREIGN KEY ("technicalMetadataId") REFERENCES "MediaTechnicalMetadata" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MediaStream_technicalMetadataId_idx" ON "MediaStream"("technicalMetadataId");

-- CreateIndex
CREATE INDEX "MediaStream_streamType_idx" ON "MediaStream"("streamType");
