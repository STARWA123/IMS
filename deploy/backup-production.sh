#!/usr/bin/env bash

set -euo pipefail

readonly app_directory="/opt/offertrack-prod/app"
readonly backup_directory="/opt/offertrack-prod/backups"
readonly retained_backups=30

resolved_backup_directory="$(realpath -e "${backup_directory}")"
if [[ "${resolved_backup_directory}" != "${backup_directory}" ]]; then
  echo "Unexpected backup directory: ${resolved_backup_directory}" >&2
  exit 1
fi

cd "${app_directory}"

if ! /usr/bin/docker compose ps --status running --services | grep -qx "offertrack"; then
  echo "OfferTrack container is not running; backup was not created." >&2
  exit 1
fi

/usr/bin/docker compose exec -T offertrack npm run db:backup

mapfile -d '' -t backups < <(
  find "${backup_directory}" \
    -maxdepth 1 \
    -type f \
    -name 'OfferTrack_Backup_*.db' \
    -printf '%T@ %p\0' \
    | sort -z -nr
)

for ((index = retained_backups; index < ${#backups[@]}; index += 1)); do
  backup_path="${backups[index]#* }"
  if [[ "${backup_path}" == "${backup_directory}/"OfferTrack_Backup_*.db ]]; then
    rm -- "${backup_path}"
  else
    echo "Refusing to remove unexpected path: ${backup_path}" >&2
    exit 1
  fi
done
