#!/usr/bin/env bash
set -euo pipefail

app_directory="${1:-/opt/offertrack-prod/app}"
environment_file="${app_directory}/.env"
credential_file="/root/offertrack-initial-admin.txt"

if [[ -e "${environment_file}" ]]; then
  echo "Refusing to overwrite existing ${environment_file}." >&2
  exit 1
fi

umask 077
admin_password="$(openssl rand -hex 24)"

{
  printf '%s\n' 'OFFERTRACK_ADMIN_USERNAME=admin'
  printf '%s\n' 'OFFERTRACK_ADMIN_DISPLAY_NAME=系统管理员'
  printf 'OFFERTRACK_ADMIN_PASSWORD=%s\n' "${admin_password}"
  printf '%s\n' 'OFFERTRACK_SECURE_COOKIES=false'
  printf '%s\n' 'OFFERTRACK_DATA_DIR=/opt/offertrack-prod/data'
  printf '%s\n' 'OFFERTRACK_BACKUP_DIR=/opt/offertrack-prod/backups'
} > "${environment_file}"

{
  printf '%s\n' 'OfferTrack initial administrator'
  printf '%s\n' 'Username: admin'
  printf 'Temporary password: %s\n' "${admin_password}"
  printf '%s\n' 'Change this password immediately after the first login.'
} > "${credential_file}"

chown root:root "${environment_file}" "${credential_file}"
chmod 600 "${environment_file}" "${credential_file}"

echo "Production environment initialized."
echo "Read the one-time credential locally with: sudo cat ${credential_file}"
