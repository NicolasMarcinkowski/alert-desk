# Alert Desk — guide pour Claude Code

Tracker de trading self-hosted. Saisie manuelle d'ordres = flux de base ; IBKR (Flex Web Service) = connecteur optionnel. ≤5 utilisateurs, un seul conteneur en prod (NAS UGREEN, port hôte 3020).

## Commandes

```bash
docker compose up -d        # Postgres 18 dev — port hôte 5433 (5432 = team-lol-stats)
yarn dev                    # port 3000 (3001+ si occupé — vérifier la sortie)
yarn build && yarn lint     # à faire passer avant tout commit
yarn prisma migrate dev     # après modif du schéma
yarn prisma:generate        # régénère le client + index.ts re-export
```

⚠️ **Après `prisma generate`, redémarrer `yarn dev`** : le serveur garde l'ancien client en mémoire (erreurs `Cannot read properties of undefined` ou `Unknown field`).

## Architecture (src/)

- `lib/manual-orders.ts` — saisie manuelle : exécutions sur comptes `broker=MANUAL` uniquement, puis reconcile + round-trips.
- `lib/flex/` — client Flex IBKR (SendRequest/GetStatement, backoff 1019) + parser XML (deux dialectes) + timezones.
- `lib/sync/` — orchestrateur (SyncRun, cooldown, mutex, sweep), import idempotent (`dedupeKey`), `reconcile.ts` (positions : snapshot autoritaire + intraday estimé), `round-trips.ts` (builder + P&L PRU moyen pour source MANUAL).
- `lib/marketdata/` — providers (Finnhub live si clé, Yahoo différé fallback), registry par priorité, cache mémoire (EventEmitter), rate limiter.
- `lib/engine/` — moteur in-process démarré par `instrumentation.ts` : souscriptions (positions ∪ alertes ∪ watchlists), hub SSE (ticks coalescés ~300 ms, **filtrés par utilisateur** via user-symbols), évaluateur d'alertes (positions clées par compte+instrument), re-priming REST quotidien du prevClose des symboles websocket. Côté client, `useLiveQuotes` partage UNE connexion EventSource par onglet.
- `lib/db/queries.ts` + `lib/db/analytics.ts` — lectures des pages (server components).
- `app/api/` — REST ; session scopée par `session.user.id`, cron via `CRON_SECRET`, admin via `ADMIN_TOKEN` (Bearer, fail-closed, timing-safe).

## Invariants — à ne jamais casser

1. Montants/prix/quantités : `Decimal` en DB (strings vers Prisma), jamais Float.
2. Annotations journal (`strategy/tags/notes/rating` des round_trips) : **upsert-only**, elles survivent aux ré-imports.
3. Le relevé Activity IBKR **enrichit et écrase** l'intraday ; `fifoPnlRealized` IBKR ne se recalcule jamais (sauf source MANUAL : PRU moyen, matérialisé dans le même champ).
4. Alertes : fire atomique (`updateMany where state=ARMED`), notification **après** l'écriture d'état ; `AUTO_ON_RECROSS` exige une observation fausse avant réarmement.
5. Ordres manuels uniquement sur comptes MANUAL (le snapshot IBKR écraserait la réconciliation).
6. Schéma Prisma : colonnes snake_case via `@map` (une colonne oubliée = bug silencieux, cf. rearm_mode).
7. DA : vert `#22C55E`/rouge `#EF4444` réservés au P&L ; toute valeur de marché porte un badge de fraîcheur LIVE / ~15 MIN / EOD ; réalisé et latent jamais fusionnés.
8. Singletons process (moteur, cache, hub SSE, chaînes sync) : gardés par `globalThis` (hot-reload dev).

## Variables d'env (mêmes noms que palato-scoring / team-lol-stats)

`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `ALLOWED_EMAILS` (allowlist fail-closed), `APP_ENCRYPTION_KEY` (AES-256-GCM, 32 octets base64), `CRON_SECRET`, `ADMIN_TOKEN`, `FINNHUB_API_KEY`, `TELEGRAM_BOT_TOKEN`, `POSTGRES_*` (compose prod). `trustHost` est dans le code (auth.ts), pas en env.

## Vérification (pas de tests unitaires — E2E via routes admin)

Skill dédiée : `/verify-app`. En bref : fixture `test/fixtures/activity-flex-sample.xml` importable via `POST /api/admin/import-xml` (idempotence attendue : 2ᵉ import = 0 insertion) ; quotes synthétiques via `POST /api/admin/inject-quote` (déclenche SSE + alertes) ; état moteur via `GET /api/admin/health` ; données de test appartenant à `test-user-1` (invisible pour les vrais users). `ADMIN_TOKEN` est dans `.env`.

## Déploiement

Push sur `main` → GitHub Actions → GHCR → SSH NAS (`/volume1/docker/alert-desk`, `docker-compose.prod.yaml`). Crons NAS : `/api/cron/intraday` (15 min, heures marché US) et `/api/cron/nightly` (~08h Paris). Reverse proxy : ne pas bufferiser `/api/stream` (SSE).

## Pistes v2 (cadrées dans le plan initial)

Gateway IBKR live (ib-gateway docker, 2FA hebdo) = nouveau provider à préfixer dans `marketdata/registry.ts` ; nouveaux brokers = valeur d'enum `BrokerType` + module de sync (skill `/new-broker`) ; import CSV Trade Republic ; greeks/IV ; groupement multi-legs ; slippage alerte→entrée (lien AlertEvent→RoundTrip).
