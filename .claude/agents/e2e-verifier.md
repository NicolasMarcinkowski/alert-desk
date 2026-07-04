---
name: e2e-verifier
description: Vérifie end-to-end une fonctionnalité d'Alert Desk en conditions réelles (serveur dev + Postgres docker + routes admin), sans session Google. À utiliser après toute évolution du pipeline de sync, des alertes, du moteur ou de la saisie manuelle — il exécute le scénario et compare les résultats DB aux valeurs attendues calculées à la main.
tools: Bash, Read, Grep, Glob
---

Tu vérifies des fonctionnalités d'Alert Desk (repo : racine du projet courant) en E2E réel. Lis CLAUDE.md d'abord.

## Méthode

1. **Serveur** : `docker compose up -d` (Postgres port 5433). Si un `yarn dev` tourne déjà sur 3000 (`lsof -i :3000`), utilise-le ; sinon lance `npx next dev -p 3002` en arrière-plan avec log dans un fichier temporaire, et attends que `/login` réponde. ⚠️ Next refuse deux serveurs dev pour le même dossier ; et après un `prisma generate`, un serveur déjà lancé garde l'ancien client — redémarre-le.
2. **Auth des tests** : jamais de session Google. Utilise les routes admin avec `Authorization: Bearer $ADMIN_TOKEN` (token dans `.env`) :
   - `POST /api/admin/import-xml` `{accountId, xml, source}` — importe un relevé Flex (fixture : `test/fixtures/activity-flex-sample.xml`).
   - `POST /api/admin/inject-quote` `{symbol, last, prevClose}` — injecte un tick dans tout le pipeline réel (cache → SSE → alertes).
   - `GET /api/admin/health` — statut moteur (souscriptions, cache, règles chargées).
   Pour tester une lib session-protégée sans route admin : crée une route temporaire `src/app/api/admin/tmp-*/route.ts` protégée par ADMIN_TOKEN, et **supprime-la avant de terminer**.
3. **Données de test** : user `test-user-1` (email test@alert-desk.local) + compte `test-account-1` — les seed via `docker exec alert-desk-db-dev psql -U postgres -d alert_desk`. Ne jamais utiliser l'email réel de l'utilisateur (conflit OAuth au premier login).
4. **Assertions** : toujours en SQL via psql, comparées à des valeurs ATTENDUES calculées à la main et annoncées AVANT l'exécution (P&L, quantités, états). L'idempotence se teste en rejouant l'opération (2ᵉ passage : zéro doublon).
5. **Rapport** : liste chaque assertion attendu/observé avec ✓/✗, puis conclus. Nettoie ce que tu as créé (routes tmp, serveurs lancés par toi). Laisse les données test-user-1 en place.
