---
name: db-change
description: Procédure pour modifier le schéma Prisma d'Alert Desk sans casser la base ni le serveur de dev (conventions @map, migrations, client périmé).
---

# Modifier le schéma Prisma

## Procédure

1. Éditer `prisma/schema.prisma` — **chaque champ multi-mots doit avoir son `@map("snake_case")`** et chaque modèle son `@@map`/`@@schema`. Une colonne sans @map passe en camelCase silencieusement (bug déjà vécu avec `rearm_mode`).
2. `yarn prisma migrate dev --name <nom-kebab>` — relire le SQL généré avant de continuer.
3. `yarn prisma:generate` (le postinstall recrée aussi `src/generated/prisma/index.ts`).
4. **Redémarrer le serveur de dev** — il garde l'ancien client en mémoire (symptômes : `Cannot read properties of undefined (reading 'findFirst')`, `Unknown field X for select statement`).
5. `yarn build` — le typage attrape les usages obsolètes.

## Renommages sans perte de données

`prisma migrate dev` génère du DROP+CREATE pour les renommages. Écrire la migration à la main (`prisma/migrations/<timestamp>_<nom>/migration.sql`) avec des `ALTER ... RENAME`, **y compris les index et contraintes FK** (Prisma compare leurs noms : `table_colonne_key/_idx/_fkey/_pkey`) — renommer l'index d'une contrainte pkey/unique renomme la contrainte. Puis `yarn prisma migrate dev` applique et doit dire « in sync » sans drift. Exemple complet : `prisma/migrations/20260703090000_broker_accounts/`.

## Interdits

- `prisma migrate reset` sans accord explicite de l'utilisateur (destructif).
- `Float` pour des montants — `Decimal` + strings côté TS.
- Toucher les 3 schémas Postgres autrement que via migrations (`app`, `trading`, `flex_raw`).
