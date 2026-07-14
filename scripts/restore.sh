#!/bin/sh
# ─────────────────────────────────────────────────────────────
# Restauration d'une sauvegarde Alert Desk (⚠️ REMPLACE les données actuelles).
#
#   ./scripts/restore.sh /volume1/backups/alert-desk/alert-desk_YYYYMMDD_HHMMSS.dump.gz
#
# Config (mêmes variables que backup.sh) : DB_CONTAINER, POSTGRES_USER, POSTGRES_DB
# (lues depuis ./.env si présent). L'app doit idéalement être arrêtée pendant
# la restauration (docker compose stop app).
# ─────────────────────────────────────────────────────────────
set -eu

if [ -f ./.env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi

DB_CONTAINER="${DB_CONTAINER:-alert-desk-db}"
: "${POSTGRES_USER:?POSTGRES_USER manquant (env ou .env)}"
: "${POSTGRES_DB:?POSTGRES_DB manquant (env ou .env)}"

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "usage: $0 <fichier .dump.gz>" >&2
  exit 2
fi

echo "⚠️  Restauration de : $FILE"
echo "    dans la base « $POSTGRES_DB » (conteneur $DB_CONTAINER)."
echo "    Les données actuelles seront écrasées. Ctrl-C dans les 8 s pour annuler."
sleep 8

echo "[restore] en cours…"
gzip -dc "$FILE" | docker exec -i "$DB_CONTAINER" \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --clean --if-exists --no-owner --no-privileges

echo "[restore] terminé. Redémarre l'app : docker compose -f docker-compose.prod.yaml up -d"
