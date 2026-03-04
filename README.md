# Pronađi

> Automatski nadzor nekretnina za agente — prati sve oglase na jednom mjestu.

---

## Struktura projekta

```
pronadji/
├── frontend/          ← Web stranica (HTML/CSS/JS)
│   ├── index.html     ← Landing page
│   ├── login.html     ← Prijava
│   ├── register.html  ← Registracija
│   ├── checkout.html  ← Odabir pretplate (Stripe)
│   ├── dashboard.html ← Aplikacija
│   ├── css/
│   │   └── style.css  ← Svi stilovi
│   └── js/
│       ├── api.js         ← API klijent (mijenjaj samo API_BASE)
│       ├── landing.js     ← Landing page logika
│       └── dashboard.js   ← Dashboard logika
│
└── backend/           ← Node.js API server
    ├── src/
    │   ├── index.js          ← Express server + cron
    │   ├── config/db.js      ← PostgreSQL
    │   ├── middleware/auth.js ← JWT zaštita
    │   ├── routes/
    │   │   ├── auth.js       ← Registracija / prijava
    │   │   ├── listings.js   ← Oglasi
    │   │   ├── filters.js    ← Korisnički filtri
    │   │   └── billing.js    ← Stripe naplata
    │   ├── scrapers/
    │   │   └── njuskalo.js   ← Njuškalo scraper
    │   └── jobs/
    │       └── scrapeJob.js  ← Orkestracija + email
    ├── schema.sql     ← Baza podataka
    ├── package.json
    └── .env.example   ← Predložak za .env
```

---

## Kako pokrenuti lokalno (razvoj)

### Backend

```bash
cd backend
npm install
npx playwright install chromium

# Kopiraj .env.example i ispuni vrijednosti
cp .env.example .env
nano .env

# Pokreni bazu (PostgreSQL mora biti instaliran)
psql -U postgres -f schema.sql

npm run dev
```

### Frontend

Frontend su statički HTML fajlovi — otvori `frontend/index.html` u browseru.

Za lokalni razvoj promijeni u `frontend/js/api.js`:
```js
const API_BASE = 'http://localhost:3000/api';
```

---

## Deploy na server

Vidi `backend/README.md` za kompletne upute za Ubuntu VPS.

**Kratki pregled:**
1. VPS (Hetzner CX22) — ~5 €/mj
2. Node.js 20 + PostgreSQL + PM2 + Nginx
3. SSL certifikat (Let's Encrypt, besplatno)
4. Frontend → uploadaj fajlove u `/var/www/pronadji.hr/`
5. Backend → pokreni s PM2 na portu 3000

---

## Promjena API URL-a

Kada postavljaš na domenu, promijeni samo jednu liniju u `frontend/js/api.js`:

```js
// Razvoj:
const API_BASE = 'http://localhost:3000/api';

// Produkcija:
const API_BASE = 'https://api.pronadji.hr/api';
```

---

## © Qantun d.o.o. 2026
