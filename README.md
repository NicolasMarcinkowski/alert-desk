# Alert Desk

Tracker de trading self-hosted : **saisie manuelle d'ordres** (actions, options, autres) sans dépendre d'aucun broker, suivi quasi temps réel des positions, journal de trades, watchlist et alertes de prix avec notifications Telegram/Discord.

En option, un compte **IBKR** peut être lié pour l'import automatique des ordres via le Flex Web Service (le modèle `BrokerAccount` est extensible à d'autres connecteurs — Trade Republic n'a pas d'API officielle : saisie manuelle ou import CSV à venir).

Multi-utilisateurs (≤5, Google OAuth + allowlist), hébergé en Docker sur NAS.

## Saisie manuelle (v0)

Bouton « + Ajouter un ordre » (Positions, Journal, Dashboard) : on saisit des **exécutions** — le pipeline (positions, round-trips, analytics, quotes live, alertes) est identique pour tous les brokers. Le P&L réalisé des ordres manuels est calculé en **méthode PRU moyen** (les ordres IBKR gardent le FIFO exact du broker). Les exécutions manuelles sont supprimables depuis le détail d'un trade ; le compte « Portefeuille manuel » est créé automatiquement au premier ordre.

## Stack

Next.js 16 (App Router, full-stack) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 (`@prisma/adapter-pg`) · Postgres 18 · Auth.js v5 (Google) · Yarn.

## Dev local

```bash
cp .env.example .env           # remplir NEXTAUTH_SECRET, GOOGLE_*, ALLOWED_EMAILS, APP_ENCRYPTION_KEY
docker compose up -d           # Postgres 18 local (port hôte 5433)
yarn install                   # génère aussi le client Prisma (postinstall)
yarn prisma migrate dev        # applique les migrations
yarn dev                       # http://localhost:3000
```

## Configuration IBKR — Flex Queries (requis au jalon M1)

Dans Client Portal IBKR → *Performance & Reports* → *Flex Queries* :

1. **Activer le Flex Web Service** (Settings → API → Flex Web Service) et générer un **token** (valable 1 an max).
2. Créer **deux** Flex Queries :
   - **Trade Confirmation Flex Query** — période « Today ». Sections : Trade Confirms (tous les champs : execID, orderID, conid, symbol, assetCategory, strike/expiry/putCall/multiplier, quantity, price, proceeds, commission, currency, fxRateToBase, dateTime, codes).
   - **Activity Flex Query** — période « Last 5 calendar days ». Sections : Trades (**avec `fifoPnlRealized`, champ opt-in**), Open Positions, Equity Summary in Base, Cash Report, Cash Transactions, Corporate Actions, Change in NAV (dépôts/retraits).
3. Renseigner le token + les deux Query IDs dans **Réglages → IBKR** de l'app (chiffrés en base).

## Déploiement NAS

- Push sur `main` → GitHub Actions build l'image → GHCR → SSH sur le NAS → `docker compose pull && up -d` dans `/volume1/docker/alert-desk/` (secrets `NAS_HOST/USERNAME/PASSWORD/PORT`).
- Sur le NAS : créer le dossier, y copier `docker-compose.prod.yaml` + un `.env` complété (voir `.env.example`). Port hôte : **3020**.
- **Reverse proxy** (domaine HTTPS, requis pour Google OAuth) : sous-domaine → `NAS:3020`. Pour le flux SSE `/api/stream` : désactiver le buffering (`X-Accel-Buffering: no` est envoyé par l'app ; côté nginx prévoir `proxy_buffering off`, et un `read timeout` généreux).
- **Cron NAS** (jalon M1) :
  - toutes les 15 min, lun–ven 15h–22h30 (Paris) : `curl -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/cron/intraday`
  - une fois par nuit vers 08h00 (Paris) : `curl -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/cron/nightly`

### Sauvegarde Postgres (indispensable)

Les annotations du journal (stratégie/tags/notes/note) et les ordres saisis
manuellement n'existent **que** dans Postgres — non rejouables depuis IBKR.
Un `pg_dump` quotidien est le seul filet contre une perte de disque.

- **Cron NAS** (quotidien 03h00), depuis `/volume1/docker/alert-desk` :
  ```cron
  0 3 * * *  cd /volume1/docker/alert-desk && ./scripts/backup.sh >> backup.log 2>&1
  ```
  Le script (`scripts/backup.sh`) fait un dump `-Fc` compressé et vérifié dans
  `BACKUP_DIR` (déf. `/volume1/backups/alert-desk`), avec rotation à
  `RETENTION_DAYS` jours (déf. 30). Il lit `POSTGRES_USER/DB` depuis le `.env`.
  Idéalement, `BACKUP_DIR` pointe vers un **autre disque** que `./data`.
- **Restauration** : `./scripts/restore.sh <fichier.dump.gz>` (arrête l'app
  d'abord : `docker compose -f docker-compose.prod.yaml stop app`).
- Roundtrip dump→restore vérifié (comptes et annotations préservés).

## Données de marché (M2)

- **Actions US en temps réel : Finnhub** — crée une clé gratuite sur finnhub.io (60 req/min + websocket 50 symboles) et renseigne `FINNHUB_API_KEY`. Sans clé, l'app fonctionne mais les cotations actions passent en différé best-effort.
- **Options : Yahoo Finance (non officiel, différé ~15 min)** via le symbole OCC — best effort avec disjoncteur anti-429 ; en cas d'indisponibilité, l'UI retombe sur le dernier mark EOD du relevé IBKR (badge `EOD`). La vraie source temps réel options = gateway IBKR (v2).
- Chaque valeur affichée porte un badge de fraîcheur : `LIVE` / `~15 MIN` / `EOD`.
- Flux navigateur : SSE sur `/api/stream` (session requise) ; snapshot REST sur `/api/quotes`.

## Jalons

- **M0** ✅ Socle : auth Google + allowlist, layout, Docker/CI-CD.
- **M1** ✅ Import IBKR (Flex), positions & journal.
- **M2** ✅ Données de marché live (Finnhub + SSE), P&L latent, watchlist.
- **M3** ✅ Alertes + notifications Telegram/Discord.
- **M4** ✅ Analytics, détail de trade (notes/tags/stratégie), mobile.

**v1 complète.** Pistes v2 : gateway IBKR live (ib-gateway docker, 2FA hebdo), greeks/IV, groupement multi-legs (spreads), TWR, slippage alerte→entrée, autres brokers en saisie manuelle, PWA.
