#!/bin/sh
# ─────────────────────────────────────────────────────────────
# Sauvegarde Postgres d'Alert Desk (à lancer depuis le NAS via cron).
#
# Dump au format custom (-Fc, restaurable finement par pg_restore) compressé,
# vérifié, avec rotation. Les données irremplaçables (annotations du journal,
# ordres saisis manuellement) ne vivent QUE dans Postgres : sans ce backup,
# une panne de disque = perte totale.
#
# Config par variables d'env (défauts = prod NAS) :
#   DB_CONTAINER   nom du conteneur Postgres      (déf. alert-desk-db)
#   BACKUP_DIR     dossier de destination         (déf. /volume1/backups/alert-desk)
#   RETENTION_DAYS suppression au-delà de N jours  (déf. 30)
#   POSTGRES_USER / POSTGRES_DB : lus depuis ./.env s'il existe, sinon l'env.
#
# Exemple cron NAS (quotidien 03h00) :
#   0 3 * * *  cd /volume1/docker/alert-desk && ./scripts/backup.sh >> backup.log 2>&1
# ─────────────────────────────────────────────────────────────
set -eu

# Charge POSTGRES_* depuis le .env du compose s'il est présent.
if [ -f ./.env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi

DB_CONTAINER="${DB_CONTAINER:-alert-desk-db}"
BACKUP_DIR="${BACKUP_DIR:-/volume1/backups/alert-desk}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

: "${POSTGRES_USER:?POSTGRES_USER manquant (env ou .env)}"
: "${POSTGRES_DB:?POSTGRES_DB manquant (env ou .env)}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/alert-desk_${STAMP}.dump.gz"

echo "[backup] dump de $POSTGRES_DB (conteneur $DB_CONTAINER) → $FILE"
docker exec "$DB_CONTAINER" pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$FILE"

# Intégrité : l'archive gzip doit être valide et non vide.
if ! gzip -t "$FILE" 2>/dev/null; then
  echo "[backup] ÉCHEC : archive corrompue, suppression de $FILE" >&2
  rm -f "$FILE"
  exit 1
fi
SIZE="$(wc -c < "$FILE")"
if [ "$SIZE" -lt 1000 ]; then
  echo "[backup] ÉCHEC : dump suspicieusement petit ($SIZE octets)" >&2
  rm -f "$FILE"
  exit 1
fi

# Rotation : supprime les dumps plus vieux que RETENTION_DAYS.
find "$BACKUP_DIR" -name 'alert-desk_*.dump.gz' -mtime +"$RETENTION_DAYS" -delete

echo "[backup] OK ($SIZE octets) — rétention ${RETENTION_DAYS} j"
