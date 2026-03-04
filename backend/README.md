# Pronađi — Backend

Node.js backend za automatski nadzor nekretnina.

## Stack

- **Express** — API server
- **PostgreSQL** — baza podataka
- **Playwright** — web scraper (headless Chrome)
- **node-cron** — automatski scrape svakih N minuta
- **Stripe** — naplata pretplate
- **Resend** — email obavijesti
- **JWT** — autentifikacija

---

## Instalacija na VPS (Hetzner / DigitalOcean)

### 1. Priprema servera (Ubuntu 22.04)

```bash
# Ažuriraj sustav
sudo apt update && sudo apt upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Chromium za Playwright
sudo apt install -y chromium-browser

# PM2 — process manager
sudo npm install -g pm2
```

### 2. Baza podataka

```bash
sudo -u postgres psql

CREATE USER pronadji WITH PASSWORD 'ODABERI_JAKU_LOZINKU';
GRANT ALL PRIVILEGES ON DATABASE pronadji_db TO pronadji;
\q

# Pokreni schema
psql -U pronadji -d pronadji_db -f schema.sql
```

### 3. Klon projekta i instalacija

```bash
git clone https://github.com/TVOJ_USERNAME/pronadji-backend.git
cd pronadji-backend

npm install

# Instalacija Playwright browsera
npx playwright install chromium
npx playwright install-deps chromium
```

### 4. Konfiguracija

```bash
cp .env.example .env
nano .env
# Ispuni sve vrijednosti u .env fajlu
```

### 5. Pokretanje s PM2

```bash
pm2 start src/index.js --name pronadji-backend
pm2 save
pm2 startup   # automatski start pri rebotu servera
```

### 6. Nginx reverse proxy

```bash
sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/pronadji
```

```nginx
server {
    listen 80;
    server_name api.pronadji.hr;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/pronadji /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# SSL certifikat (besplatno)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.pronadji.hr
```

---

## API Dokumentacija

### Auth

| Metoda | Endpoint | Opis |
|--------|----------|------|
| POST | `/api/auth/register` | Registracija |
| POST | `/api/auth/login` | Prijava, vraća JWT |
| GET  | `/api/auth/me` | Trenutni korisnik |

### Oglasi *(zahtijeva JWT + aktivnu pretplatu)*

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/api/listings` | Lista oglasa s filterima |
| GET | `/api/listings/:id` | Jedan oglas |
| GET | `/api/listings/stats/summary` | Brojevi za dashboard |

**Query parametri za `/api/listings`:**
```
source=njuskalo|index|plavi|cackaloo
city=Zagreb
property_type=stan|kuca|villa|poslovni|zemljiste
price_min=50000
price_max=300000
size_min=30
size_max=120
is_new=true
price_dropped=true
show_agency=true        (default: false — samo privatni)
page=1
limit=30
```

### Filtri *(zahtijeva JWT)*

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET    | `/api/filters` | Svi filtri korisnika |
| POST   | `/api/filters` | Novi filter |
| PUT    | `/api/filters/:id` | Ažuriraj filter |
| DELETE | `/api/filters/:id` | Obriši filter |

### Naplata

| Metoda | Endpoint | Opis |
|--------|----------|------|
| POST | `/api/billing/checkout` | Stripe Checkout URL |
| POST | `/api/billing/portal` | Stripe Customer Portal |
| GET  | `/api/billing/price-preview?agents=3` | Pregled cijene |
| POST | `/api/billing/webhook` | Stripe webhook |

---

## Stripe Setup

1. Otvori račun na [stripe.com](https://stripe.com)
2. Kopiraj **Secret Key** u `.env`
3. U Stripe dashboardu → Webhooks → dodaj endpoint `https://api.pronadji.hr/api/billing/webhook`
4. Odaberi eventi: `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.deleted`
5. Kopiraj **Webhook Secret** u `.env`

---

## Struktura projekta

```
pronadji-backend/
├── src/
│   ├── index.js              # Express server + cron
│   ├── config/
│   │   └── db.js             # PostgreSQL konekcija
│   ├── middleware/
│   │   └── auth.js           # JWT middleware
│   ├── routes/
│   │   ├── auth.js           # Registracija / prijava
│   │   ├── listings.js       # Feed oglasa
│   │   ├── filters.js        # CRUD filtri
│   │   └── billing.js        # Stripe
│   ├── scrapers/
│   │   └── njuskalo.js       # Njuškalo scraper
│   └── jobs/
│       └── scrapeJob.js      # Orkestracija + email notif.
├── schema.sql                # Baza podataka
├── package.json
└── .env.example
```

---

## Dodavanje novih scrapera

Svaki scraper treba exportati async funkciju koja:
1. Dohvaća oglase s platforme
2. Sprema u `listings` tablicu
3. Detektira promjene cijene
4. Vraća `{ source, newCount, updatedCount }`

```js
// src/scrapers/index.js (primjer strukture)
async function scrapeIndex() {
  // isto kao njuskalo.js, prilagođeno za index.hr
}
module.exports = { scrapeIndex };
```

Zatim dodaj poziv u `src/jobs/scrapeJob.js`:
```js
const { scrapeIndex } = require('../scrapers/index');
// u runAllScrapers():
scrapeIndex(),
```
