# Pronađi — Kompletni projekt

## Struktura
```
pronadji/
├── frontend/index.html   ← Cijeli frontend (landing + dashboard)
└── backend/              ← Node.js API + scraper
    ├── src/...
    ├── schema.sql
    └── .env.example      ← Kopiraj u .env i ispuni
```

## Brzi start (VPS)
```bash
git clone https://github.com/TVOJ_USERNAME/pronadji.git
cd pronadji/backend && npm install
npx playwright install chromium && npx playwright install-deps chromium
cp .env.example .env  # ispuni varijable
psql -U postgres < schema.sql
pm2 start src/index.js --name pronadji && pm2 save
```

## Troškovi
- Domena .hr: ~15 €/god
- Hetzner VPS CX22: ~65 €/god
- SSL + Email: 0 €
- **Ukupno: ~80 €/god**

## Izmjene
Pošalji link fajla na GitHubu → dobij novi kod → zamijeni fajl.
