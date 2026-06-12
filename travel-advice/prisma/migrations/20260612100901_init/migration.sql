-- CreateTable
CREATE TABLE "countries" (
    "iso_alpha2" TEXT NOT NULL PRIMARY KEY,
    "iso_alpha3" TEXT NOT NULL,
    "name_nl" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "region_nl" TEXT NOT NULL,
    "region_en" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "nlww_slug" TEXT
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name_nl" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "country_iso2" TEXT NOT NULL,
    "flag_emoji" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "fetch_method" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "fetch_interval_h" INTEGER NOT NULL DEFAULT 6,
    "priority" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "advisories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_id" TEXT NOT NULL,
    "dest_iso2" TEXT NOT NULL,
    "raw_level" TEXT NOT NULL,
    "normalized_level" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "risks" TEXT NOT NULL DEFAULT '[]',
    "official_updated_at" DATETIME,
    "scraped_at" DATETIME NOT NULL,
    "source_url" TEXT NOT NULL,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "advisories_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "advisories_dest_iso2_fkey" FOREIGN KEY ("dest_iso2") REFERENCES "countries" ("iso_alpha2") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scrape_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_id" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL,
    "finished_at" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error_message" TEXT,
    "advisories_total" INTEGER NOT NULL DEFAULT 0,
    "advisories_new" INTEGER NOT NULL DEFAULT 0,
    "advisories_updated" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    CONSTRAINT "scrape_logs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_iso_alpha3_key" ON "countries"("iso_alpha3");

-- CreateIndex
CREATE INDEX "advisories_dest_iso2_idx" ON "advisories"("dest_iso2");

-- CreateIndex
CREATE INDEX "advisories_normalized_level_idx" ON "advisories"("normalized_level");

-- CreateIndex
CREATE UNIQUE INDEX "advisories_source_id_dest_iso2_key" ON "advisories"("source_id", "dest_iso2");
