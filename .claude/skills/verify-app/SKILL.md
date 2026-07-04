---
name: verify-app
description: Lance Alert Desk en local et déroule le smoke test complet (import fixture, idempotence, positions, alertes via inject-quote, SSE, auth fail-closed). À utiliser après toute évolution non triviale, avant commit.
---

# Vérification end-to-end d'Alert Desk

Délègue de préférence à l'agent `e2e-verifier` (il connaît la méthode). Sinon, déroule toi-même :

## Préparation

1. `docker compose up -d` — Postgres dev sur **5433**.
2. Serveur : réutilise le `yarn dev` existant sur 3000 s'il est frais (redémarré depuis le dernier `prisma generate`), sinon `npx next dev -p 3002` en arrière-plan.
3. `ADMIN_TOKEN=$(grep '^ADMIN_TOKEN=' .env | cut -d= -f2)`.

## Smoke test (dans l'ordre)

| # | Action | Attendu |
|---|--------|---------|
| 1 | `GET /login` sans session | 200, contient « Se connecter avec Google » |
| 2 | `GET /` et `GET /positions` sans session | 307 → /login |
| 3 | `GET /api/stream`, `/api/quotes`, `/api/admin/health` sans token | 401 |
| 4 | Seed test-user-1 + test-account-1 (voir agent e2e-verifier) puis `POST /api/admin/import-xml` avec `test/fixtures/activity-flex-sample.xml` | inserted=4 au 1er passage |
| 5 | Re-POST du même XML | inserted=0, updated=4 (idempotence) |
| 6 | psql : positions = exactement les 2 lignes du snapshot ; round-trip AAPL CLOSED avec realized_pnl=47.00, base 43.71 | ✓ |
| 7 | `GET /api/admin/health` avec token | engine.started=true, subscriptionCount ≥ 2 |
| 8 | Seed règle d'alerte (MSFT ≥ 450, cooldown 2 s) puis `inject-quote` 449 → 451 → 451 → 448 → 455 | 0 event → 1 event/COOLDOWN → pas de double fire → ARMED → 2 events |
| 9 | `yarn build` puis `yarn lint` | verts |

## Après

- Supprime toute route `tmp-*` créée pour le test, kill les serveurs que TU as lancés.
- Rapporte chaque ligne attendu/observé avec ✓/✗ — jamais « tout marche » sans le tableau.
