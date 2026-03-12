# Gallery Prospects API

API Node / Express pour la section admin `Prospection Galeries`.

## Stack

- Node.js + Express
- PostgreSQL
- `pg` pour l'acces SQL

## Installation

```bash
npm install
cp .env.example .env
```

Configurer `DATABASE_URL`, puis appliquer le schema:

```bash
psql "$DATABASE_URL" -f src/db/schema.sql
psql "$DATABASE_URL" -f src/db/seed.sql
```

## Lancement

```bash
npm run dev
```

Par defaut l'API expose:

- `GET /api/health`
- `GET /api/gallery-prospects`
- `GET /api/gallery-prospects/stats`
- `GET /api/gallery-prospects/export.csv`
- `POST /api/gallery-prospects`
- `PATCH /api/gallery-prospects/:id`
- `POST /api/gallery-prospects/import`

## Exemple de payload

```json
{
  "name": "Galerie Exemple",
  "city": "Paris",
  "country": "France",
  "address": "12 rue Exemple, 75003 Paris",
  "email": "contact@exemple.com",
  "website": "https://exemple.com",
  "type": "sculpture",
  "status": "a_contacter",
  "contactDate": "2026-03-12",
  "notes": "Premier envoi avec dossier PDF."
}
```
