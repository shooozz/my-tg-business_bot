#!/usr/bin/env bash
# Run as root on a newly provisioned Ubuntu server. Does not change SSH settings.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
. /etc/os-release
test "$ID" = ubuntu || { echo 'Ubuntu required'; exit 1; }
case "$VERSION_CODENAME" in noble|resolute|jammy) ;; *) echo 'Review Docker support for this Ubuntu release first'; exit 1 ;; esac
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl python3 python3-venv rclone util-linux
if ! command -v docker >/dev/null 2>&1; then
  # Do not remove competing container packages automatically on an existing host.
  for package in docker.io docker-compose-v2 podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
      echo "Existing $package detected; review container installation before continuing."
      exit 1
    fi
  done
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $VERSION_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version
systemctl enable --now docker
if test "${1:-}" = --packages-only; then
  echo 'Docker, Compose and backup utilities ready.'
  exit 0
fi
if ! id deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash deploy
fi
usermod -aG docker deploy
install -d -m 750 -o deploy -g deploy /opt/market /opt/market/releases
install -d -m 700 -o deploy -g deploy /opt/market/backup /home/deploy/.ssh
echo 'Docker and deployment directories ready. Install the authorized deployment public key separately.'
