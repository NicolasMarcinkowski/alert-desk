---
name: new-broker
description: Checklist pour ajouter un connecteur broker à Alert Desk (import automatique d'ordres depuis un nouveau courtier, ou import CSV type Trade Republic).
---

# Ajouter un connecteur broker

Le modèle est prêt : un broker = une valeur d'enum + un module de sync qui produit des **exécutions** — tout l'aval (reconcile, round-trips, journal, analytics, live, alertes) est broker-agnostique.

## Checklist

1. **Schéma** : ajouter la valeur à `enum BrokerType` (prisma/schema.prisma) → `yarn prisma migrate dev` → `yarn prisma:generate` → **redémarrer le dev server**.
2. **Credentials** : champs chiffrés via `seal()/open()` (`src/lib/crypto`) sur `BrokerAccount` (le token Flex y est déjà nullable ; ajouter d'autres colonnes chiffrées si besoin, jamais en clair).
3. **Module de sync** : `src/lib/<broker>/` sur le modèle de `src/lib/flex/` — le connecteur doit produire des exécutions normalisées puis appeler la même mécanique que `processStatementXml` (`src/lib/sync/orchestrator.ts`) : import idempotent par `dedupeKey` (ID d'exécution du broker > hash stable sans champs volatils), puis `reconcilePositions` + `rebuildRoundTrips`.
4. **P&L réalisé** : si le broker le fournit → le stocker dans `fifoPnlRealized` (source de vérité, ne jamais recalculer). Sinon → laisser null et marquer `source` d'un nouveau membre d'enum `ExecutionSource` ; étendre le calcul PRU moyen du builder (`round-trips.ts`) à cette source (aujourd'hui : `MANUAL` seulement).
5. **Positions autoritaires** : si le broker fournit des snapshots de positions (comme IBKR Activity) → alimenter `PositionSnapshot`/`AccountSnapshot` et la réconciliation fait foi. Sinon → positions calculées des fills (comme MANUAL), état `INTRADAY_ESTIMATED`.
6. **Import CSV** (brokers sans API, ex. Trade Republic) : route `POST /api/admin/import-csv` ou UI d'upload → parser vers le même format d'exécutions normalisées ; le `dedupeKey` en hash stable rend le ré-import sans risque.
7. **Orchestrateur** : `runSync` filtre aujourd'hui `broker: "IBKR"` pour la flotte — ajouter le nouveau broker à la sync planifiée s'il a une API pollable.
8. **UI Réglages** : `BrokerAccountsPanel` — formulaire de liaison + badge du broker ; boutons Tester/Sync selon les capacités.
9. **Vérification** : fixture réaliste dans `test/fixtures/`, scénario `/verify-app` étendu (import ×2 → idempotence, P&L comparé à la main).

## Pièges connus

- Devises : toujours stocker le montant natif + `fxRateToBase` (fourni par le broker si possible, sinon best-effort via `resolveFx`).
- Timezones : convertir en UTC **au parsing** (voir `src/lib/flex/time.ts`).
- Options : normaliser en OCC compact (`buildOccSymbol`) pour partager les quotes ; réutiliser les instruments existants avant d'en créer (voir `resolveInstrument` dans manual-orders.ts).
