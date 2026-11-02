#!/usr/bin/env bash
# Подготовка сервера Ubuntu 26.04 для Market
# Выполните в консоли хостинга от root

set -euo pipefail

echo "=== Проверка системы ==="
test "$(id -u)" = 0 || { echo 'Запустите от root'; exit 1; }
. /etc/os-release
test "$ID" = ubuntu || { echo 'Требуется Ubuntu'; exit 1; }
echo "Ubuntu $VERSION_ID detected"

echo ""
echo "=== Установка базовых пакетов ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl python3 python3-venv rclone util-linux

echo ""
echo "=== Установка Docker ==="
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  cat > /etc/apt/sources.list.d/docker.list <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $VERSION_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  echo "Docker установлен"
else
  echo "Docker уже установлен"
fi

systemctl enable --now docker
docker compose version

echo ""
echo "=== Создание пользователя deploy ==="
if ! id deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash deploy
  echo "Пользователь deploy создан"
else
  echo "Пользователь deploy уже существует"
fi

usermod -aG docker deploy

echo ""
echo "=== Создание директорий ==="
install -d -m 750 -o deploy -g deploy /opt/market /opt/market/releases
install -d -m 700 -o deploy -g deploy /opt/market/backup /home/deploy/.ssh

echo ""
echo "=== Готово! ==="
echo ""
echo "Следующие шаги:"
echo "1. Добавьте публичный SSH-ключ в /home/deploy/.ssh/authorized_keys"
echo "2. Создайте /opt/market/.env с секретами"
echo "3. Загрузите код и запустите deploy.sh"
echo ""
echo "Для добавления SSH-ключа выполните:"
echo "  echo 'ваш-публичный-ключ' >> /home/deploy/.ssh/authorized_keys"
echo "  chmod 600 /home/deploy/.ssh/authorized_keys"
echo "  chown deploy:deploy /home/deploy/.ssh/authorized_keys"
