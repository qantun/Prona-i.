/**
 * Scrape Job — pokreće sve scrapere i šalje email obavijesti
 * korisnicima čiji filteri odgovaraju novim oglasima
 */

const db = require('../config/db');
const { scrapeNjuskalo } = require('../scrapers/njuskalo');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// ── POKRETANJE SVIH SCRAPERA ──────────────────────────────
async function runAllScrapers() {
  const results = await Promise.allSettled([
    scrapeNjuskalo(),
    // scrapeIndex(),    // TODO: dodati
    // scrapePlavi(),    // TODO: dodati
    // scrapeCackaloo(), // TODO: dodati
  ]);

  for (const r of results) {
    if (r.status === 'fulfilled') {
      console.log('[SCRAPE JOB]', r.value);
    } else {
      console.error('[SCRAPE JOB] Greška:', r.reason);
    }
  }

  // Slanje email obavijesti za nove oglase
  await sendEmailNotifications();
}

// ── EMAIL OBAVIJESTI ──────────────────────────────────────
async function sendEmailNotifications() {
  try {
    // Dohvati sve aktivne filtere s notify_email = true
    const filtersRes = await db.query(
      `SELECT f.*, u.email AS user_email, u.full_name
       FROM filters f
       JOIN users u ON u.id = f.user_id
       WHERE f.is_active = TRUE
         AND f.notify_email = TRUE
         AND u.plan = 'active'`
    );

    for (const filter of filtersRes.rows) {
      const newListings = await getMatchingNewListings(filter);
      if (newListings.length === 0) continue;

      await sendNotificationEmail(filter.user_email, filter.full_name, newListings, filter.name);
    }
  } catch (err) {
    console.error('[NOTIFICATIONS] Greška:', err.message);
  }
}

async function getMatchingNewListings(filter) {
  const conditions = [
    `l.is_active = TRUE`,
    `l.is_new = TRUE`,
    `l.scraped_at > NOW() - INTERVAL '${process.env.SCRAPE_INTERVAL_MINUTES || 3} minutes'`,
  ];
  const params = [];
  let p = 1;

  if (!filter.show_agency) {
    conditions.push(`l.is_private = TRUE`);
  }
  if (filter.property_types?.length) {
    conditions.push(`l.property_type = ANY($${p++})`);
    params.push(filter.property_types);
  }
  if (filter.locations?.length) {
    conditions.push(`l.city = ANY($${p++})`);
    params.push(filter.locations);
  }
  if (filter.price_min) { conditions.push(`l.price >= $${p++}`); params.push(filter.price_min); }
  if (filter.price_max) { conditions.push(`l.price <= $${p++}`); params.push(filter.price_max); }
  if (filter.size_min)  { conditions.push(`l.size_sqm >= $${p++}`); params.push(filter.size_min); }
  if (filter.size_max)  { conditions.push(`l.size_sqm <= $${p++}`); params.push(filter.size_max); }
  if (filter.sources?.length) {
    conditions.push(`l.source = ANY($${p++})`);
    params.push(filter.sources);
  }

  const res = await db.query(
    `SELECT title, price, size_sqm, city, source, url, is_private, price_per_sqm
     FROM listings l
     WHERE ${conditions.join(' AND ')}
     ORDER BY scraped_at DESC
     LIMIT 10`,
    params
  );
  return res.rows;
}

async function sendNotificationEmail(email, name, listings, filterName) {
  const listingsHtml = listings.map(l => `
    <tr style="border-bottom:1px solid #E4E4E0">
      <td style="padding:10px 12px">
        <a href="${l.url}" style="font-weight:700;color:#1D4ED8;text-decoration:none">${l.title}</a>
        <div style="font-size:12px;color:#88888E;margin-top:2px">
          📍 ${l.city || '—'} · ${l.source}
          ${l.is_private ? ' · <span style="color:#C2410C;font-weight:700">PRIVATNI</span>' : ''}
        </div>
      </td>
      <td style="padding:10px 12px;font-weight:700;white-space:nowrap;font-family:Georgia,serif">
        ${l.price ? l.price.toLocaleString('hr') + ' €' : '—'}
        ${l.price_per_sqm ? `<div style="font-size:11px;color:#88888E">${l.price_per_sqm} €/m²</div>` : ''}
      </td>
    </tr>
  `).join('');

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `🏠 ${listings.length} novih oglasa — ${filterName}`,
    html: `
      <div style="font-family:'Nunito',Arial,sans-serif;max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E4E4E0">
        <div style="background:#18181A;padding:20px 28px">
          <span style="font-family:Georgia,serif;font-size:22px;font-weight:600;color:#fff">Pronađi<span style="color:#93c5fd">.</span></span>
        </div>
        <div style="padding:28px">
          <p style="font-size:15px;color:#18181A;margin-bottom:6px">
            Zdravo${name ? ' ' + name.split(' ')[0] : ''},
          </p>
          <p style="font-size:14px;color:#44444A;margin-bottom:24px">
            Pronašli smo <strong>${listings.length} novih oglasa</strong> prema filteru <strong>"${filterName}"</strong>:
          </p>
          <table width="100%" style="border-collapse:collapse;border:1px solid #E4E4E0;border-radius:8px;overflow:hidden">
            ${listingsHtml}
          </table>
          <div style="margin-top:24px;text-align:center">
            <a href="${process.env.FRONTEND_URL}/dashboard"
               style="background:#1D4ED8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
              Otvori dashboard →
            </a>
          </div>
        </div>
        <div style="padding:16px 28px;border-top:1px solid #E4E4E0;font-size:12px;color:#88888E;text-align:center">
          © Qantun d.o.o. 2026 · <a href="${process.env.FRONTEND_URL}/dashboard/filters" style="color:#1D4ED8">Uredi obavijesti</a>
        </div>
      </div>
    `,
  });

  console.log(`[EMAIL] Poslano ${listings.length} oglasa na ${email}`);
}

module.exports = { runAllScrapers };
