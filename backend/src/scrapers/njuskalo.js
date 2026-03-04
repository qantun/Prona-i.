/**
 * Njuškalo scraper
 * Koristi Playwright (headless Chromium) za dohvat oglasa nekretnina
 */

const { chromium } = require('playwright');
const db = require('../config/db');

const BASE_URL = 'https://www.njuskalo.hr';
const LISTING_URL = `${BASE_URL}/prodaja-nekretnina?sort=new`;

// Tip nekretnine → naša kategorija
const TYPE_MAP = {
  'stan': 'stan',
  'stanovi': 'stan',
  'kuća': 'kuca',
  'kuće': 'kuca',
  'vila': 'villa',
  'vile': 'villa',
  'poslovni': 'poslovni',
  'ured': 'poslovni',
  'zemljište': 'zemljiste',
  'zemljista': 'zemljiste',
};

// Regije za normalizaciju
const REGION_MAP = {
  'zagreb': 'Zagreb',
  'split': 'Split',
  'rijeka': 'Rijeka',
  'zadar': 'Zadar',
  'osijek': 'Osijek',
  'dubrovnik': 'Dubrovnik',
  'pula': 'Pula',
  'varaždin': 'Varaždin',
  'sisak': 'Sisak',
  'slavonski brod': 'Slavonski Brod',
};

async function scrapeNjuskalo() {
  console.log('[NJUŠKALO] Pokretanje scrapera...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const logEntry = await db.query(
    `INSERT INTO scrape_logs (source) VALUES ('njuskalo') RETURNING id`
  );
  const logId = logEntry.rows[0].id;

  let newCount = 0, updatedCount = 0, errorCount = 0;

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    // Blokiraj slike i medije radi brzine
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2}', r => r.abort());
    await page.route('**/analytics**', r => r.abort());

    await page.goto(LISTING_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Čekaj da se učitaju oglasi
    await page.waitForSelector('.EntityList-item', { timeout: 15000 }).catch(() => {});

    const items = await page.$$eval('.EntityList-item--Regular, .EntityList-item--VipCategory', els =>
      els.map(el => {
        const anchor    = el.querySelector('h3 a, .entity-title a');
        const priceEl   = el.querySelector('.price-box--regular .price-item');
        const locEl     = el.querySelector('.entity-description-location');
        const titleEl   = el.querySelector('.entity-title');
        const imgEl     = el.querySelector('img[src]');
        const detailEls = el.querySelectorAll('.EntityDescription-desc');
        const isPrivate = !el.querySelector('.seller-type--agency, .badge--agency');

        return {
          url:      anchor?.href || null,
          title:    titleEl?.textContent?.trim() || '',
          price:    priceEl?.textContent?.trim() || '',
          location: locEl?.textContent?.trim() || '',
          image:    imgEl?.src || null,
          details:  [...detailEls].map(d => d.textContent.trim()),
          isPrivate,
        };
      })
    );

    console.log(`[NJUŠKALO] Pronađeno ${items.length} oglasa`);

    for (const item of items) {
      if (!item.url || !item.title) continue;

      try {
        // Izvuci external_id iz URL-a
        const urlMatch = item.url.match(/\/(\d+)(?:\.|$)/);
        if (!urlMatch) continue;
        const externalId = `njuskalo_${urlMatch[1]}`;

        // Parsiraj cijenu
        const priceStr = item.price.replace(/[^\d,]/g, '').replace(',', '.');
        const price = priceStr ? parseFloat(priceStr) : null;

        // Parsiraj lokaciju
        const cityRaw = extractCity(item.location);
        const city    = normalizeCity(cityRaw);
        const region  = extractRegion(item.location);

        // Parsiraj kvadraturu iz naslova ili detalja
        const sizeMatch = (item.title + ' ' + item.details.join(' ')).match(/(\d+[,.]?\d*)\s*m[²2]/i);
        const sizeSqm   = sizeMatch ? parseFloat(sizeMatch[1].replace(',', '.')) : null;

        // Tip nekretnine
        const propertyType = detectType(item.title);

        // Izračun €/m²
        const pricePerSqm = (price && sizeSqm) ? Math.round(price / sizeSqm) : null;

        // Provjeri postoji li oglas već
        const existing = await db.query(
          'SELECT id, price, price_history FROM listings WHERE external_id = $1',
          [externalId]
        );

        if (existing.rows[0]) {
          const old = existing.rows[0];
          // Provjeri sniženje cijene
          if (price && old.price && price < parseFloat(old.price)) {
            const history = old.price_history || [];
            history.push({ price: parseFloat(old.price), date: new Date().toISOString() });
            await db.query(
              `UPDATE listings SET
                price = $1, price_per_sqm = $2,
                price_dropped = TRUE, price_dropped_at = NOW(),
                price_history = $3, updated_at = NOW()
               WHERE external_id = $4`,
              [price, pricePerSqm, JSON.stringify(history), externalId]
            );
            updatedCount++;
          }
        } else {
          // Novi oglas
          await db.query(
            `INSERT INTO listings
               (external_id, source, url, title, price, price_per_sqm, size_sqm,
                property_type, location_raw, city, region, is_private, is_new, image_url, published_at)
             VALUES ($1,'njuskalo',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,NOW())
             ON CONFLICT (external_id) DO NOTHING`,
            [
              externalId, item.url, item.title,
              price, pricePerSqm, sizeSqm,
              propertyType, item.location, city, region,
              item.isPrivate, item.image,
            ]
          );
          newCount++;
        }
      } catch (itemErr) {
        console.error('[NJUŠKALO] Greška pri oglasu:', itemErr.message);
        errorCount++;
      }
    }

    await context.close();

  } catch (err) {
    console.error('[NJUŠKALO] Kritična greška:', err.message);
    await db.query(
      `UPDATE scrape_logs SET status='error', finished_at=NOW(), error_count=$1 WHERE id=$2`,
      [errorCount + 1, logId]
    );
    return { source: 'njuskalo', newCount, error: err.message };
  } finally {
    await browser.close();
  }

  await db.query(
    `UPDATE scrape_logs SET
       status='success', finished_at=NOW(),
       new_count=$1, updated_count=$2, error_count=$3
     WHERE id=$4`,
    [newCount, updatedCount, errorCount, logId]
  );

  console.log(`[NJUŠKALO] Gotovo — novi: ${newCount}, ažurirani: ${updatedCount}`);
  return { source: 'njuskalo', newCount, updatedCount };
}

// ── HELPERS ───────────────────────────────────────────────
function extractCity(location) {
  if (!location) return null;
  const parts = location.split(',').map(s => s.trim());
  return parts[parts.length - 1] || parts[0];
}

function normalizeCity(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for (const [key, val] of Object.entries(REGION_MAP)) {
    if (lower.includes(key)) return val;
  }
  return raw;
}

function extractRegion(location) {
  if (!location) return null;
  const parts = location.split(',').map(s => s.trim());
  return parts[0] || null;
}

function detectType(title) {
  const lower = title.toLowerCase();
  for (const [key, val] of Object.entries(TYPE_MAP)) {
    if (lower.includes(key)) return val;
  }
  return 'ostalo';
}

module.exports = { scrapeNjuskalo };
