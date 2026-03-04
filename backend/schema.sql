-- ============================================================
--  Pronađi — schema baze podataka
--  Pokrenuti: psql -U postgres -f schema.sql
-- ============================================================

CREATE DATABASE pronadji_db;
\c pronadji_db;

-- ── KORISNICI ──────────────────────────────────────────────
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255),
  agency_name   VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  plan          VARCHAR(50) DEFAULT 'inactive', -- inactive | active
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── PRETPLATE ─────────────────────────────────────────────
CREATE TABLE subscriptions (
  id                    SERIAL PRIMARY KEY,
  user_id               INT REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  status                VARCHAR(50), -- active | canceled | past_due
  agent_count           INT DEFAULT 1,
  monthly_amount_eur    NUMERIC(10,2),
  current_period_end    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── FILTRI ────────────────────────────────────────────────
CREATE TABLE filters (
  id              SERIAL PRIMARY KEY,
  user_id         INT REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL DEFAULT 'Moj filter',
  -- Tip nekretnine: array stringova ['stan','kuca','villa','poslovni','zemljiste']
  property_types  TEXT[] DEFAULT '{"stan"}',
  -- Lokacije: array stringova ['Zagreb','Rijeka',...]
  locations       TEXT[] DEFAULT '{}',
  price_min       INT,
  price_max       INT,
  size_min        INT,
  size_max        INT,
  -- Oglasnici: array ['njuskalo','index','plavi','cackaloo']
  sources         TEXT[] DEFAULT '{"njuskalo","index","plavi","cackaloo"}',
  -- Prikazati agencijske oglase?
  show_agency     BOOLEAN DEFAULT FALSE,
  -- Email obavijesti?
  notify_email    BOOLEAN DEFAULT TRUE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── OGLASI ────────────────────────────────────────────────
CREATE TABLE listings (
  id              SERIAL PRIMARY KEY,
  external_id     VARCHAR(512) UNIQUE NOT NULL,  -- ID oglasa na izvornoj platformi
  source          VARCHAR(50) NOT NULL,           -- njuskalo | index | plavi | cackaloo
  url             TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(12,2),
  price_per_sqm   NUMERIC(10,2),
  size_sqm        NUMERIC(8,2),
  property_type   VARCHAR(100),                   -- stan | kuca | villa | poslovni | zemljiste
  location_raw    TEXT,                           -- originalni tekst lokacije
  city            VARCHAR(100),
  region          VARCHAR(100),
  address         TEXT,                           -- izvučena adresa ako dostupna
  is_private      BOOLEAN DEFAULT FALSE,          -- privatni prodavatelj (ne agencija)
  is_new          BOOLEAN DEFAULT TRUE,           -- novi oglas (nije obnovljeni)
  image_url       TEXT,
  floor           INT,
  total_floors    INT,
  year_built      INT,
  -- Praćenje promjena cijene
  price_history   JSONB DEFAULT '[]',
  price_dropped   BOOLEAN DEFAULT FALSE,
  price_dropped_at TIMESTAMPTZ,
  -- AI sažetak (generirano po potrebi)
  ai_summary      TEXT,
  -- Metapodaci
  scraped_at      TIMESTAMPTZ DEFAULT NOW(),
  published_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_listings_source ON listings(source);
CREATE INDEX idx_listings_city ON listings(city);
CREATE INDEX idx_listings_is_private ON listings(is_private);
CREATE INDEX idx_listings_scraped_at ON listings(scraped_at DESC);
CREATE INDEX idx_listings_price ON listings(price);
CREATE INDEX idx_listings_external_id ON listings(external_id);

-- ── PROSJEČNE CIJENE PO KVARTU ─────────────────────────────
CREATE TABLE area_price_stats (
  id          SERIAL PRIMARY KEY,
  city        VARCHAR(100),
  area        VARCHAR(100),
  avg_price_per_sqm NUMERIC(10,2),
  sample_count INT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── LOG SCRAPEOVA ──────────────────────────────────────────
CREATE TABLE scrape_logs (
  id           SERIAL PRIMARY KEY,
  source       VARCHAR(50),
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  new_count    INT DEFAULT 0,
  updated_count INT DEFAULT 0,
  error_count  INT DEFAULT 0,
  status       VARCHAR(20) DEFAULT 'running'  -- running | success | error
);
