# Полная инструкция по настройке деплоя

## Текущая ситуация
- ✅ Сервер: Ubuntu 26.04 на 138.16.164.156
- ✅ SSH запущен на сервере
- ❌ SSH недоступен извне (блокируется фаерволом хостинга)
- ✅ GitHub репозиторий: https://github.com/shooozz/my-tg-business_bot

---

## Шаг 1: Открыть порт 22 в панели хостинга

**В панели управления VDS.ina найдите:**
- Раздел "Firewall" / "Фаервол" / "Network Security"
- Добавьте правило:
  - **Протокол**: TCP
  - **Порт**: 22
  - **Источник**: 0.0.0.0/0 (любой IP) или ваш личный IP

После этого проверьте SSH с вашего компьютера:
```bash
ssh root@138.16.164.156
```

---

## Шаг 2: Создать SSH-ключ для деплоя

На вашем компьютере выполните:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/market_deploy -C "deploy@market"
```

Нажмите Enter дважды (без пароля для автоматического деплоя).

Это создаст два файла:
- `~/.ssh/market_deploy` — приватный ключ (НИКОМУ НЕ ПОКАЗЫВАТЬ)
- `~/.ssh/market_deploy.pub` — публичный ключ

---

## Шаг 3: Настроить GitHub Secrets

### 3.1. Создать Environment

1. Откройте https://github.com/shooozz/my-tg-business_bot/settings/environments
2. Нажмите **New environment**
3. Введите имя: `production`
4. Нажмите **Configure environment**

### 3.2. Добавить Secrets в environment `production`

Нажмите **Add secret** для каждого:

| Secret Name | Value |
|---|---|
| `DEPLOY_HOST` | `138.16.164.156` |
| `DEPLOY_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | Содержимое файла `~/.ssh/market_deploy` (весь текст от `-----BEGIN` до `-----END`) |
| `SSH_KNOWN_HOSTS` | Получите командой: `ssh-keyscan -H 138.16.164.156` |

**Как получить SSH_PRIVATE_KEY:**
```bash
cat ~/.ssh/market_deploy
```
Скопируйте весь вывод целиком.

**Как получить SSH_KNOWN_HOSTS:**
```bash
ssh-keyscan -H 138.16.164.156
```
Скопируйте строку, которая содержит `ssh-ed25519` или `ssh-rsa`.

### 3.3. Добавить Repository Variable

1. Откройте https://github.com/shooozz/my-tg-business_bot/settings/variables/actions
2. Нажмите **New repository variable**
3. Name: `DEPLOY_ENABLED`
4. Value: `false` (пока не готовы)

Позже измените на `true`, когда сервер будет полностью настроен.

---

## Шаг 4: Подготовить сервер (через консоль хостинга)

Пока SSH недоступен извне, выполните команды в консоли VDS.ina:

### 4.1. Запустить bootstrap.sh

Скопируйте и выполните этот блок целиком:

```bash
apt update && apt install -y ca-certificates curl python3 python3-venv rclone util-linux

# Установка Docker
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt update
  apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

systemctl enable --now docker
docker compose version
```

### 4.2. Создать пользователя deploy

```bash
useradd --create-home --shell /bin/bash deploy
usermod -aG docker deploy
install -d -m 750 -o deploy -g deploy /opt/market /opt/market/releases
install -d -m 700 -o deploy -g deploy /opt/market/backup /home/deploy/.ssh
```

### 4.3. Добавить публичный SSH-ключ

Скопируйте ваш **публичный** ключ (из `~/.ssh/market_deploy.pub`):

```bash
cat ~/.ssh/market_deploy.pub
```

И выполните на сервере (замените `YOUR_PUBLIC_KEY` на скопированное):

```bash
echo "YOUR_PUBLIC_KEY" >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
```

---

## Шаг 5: Создать .env файл

Локально на вашем компьютере:

```bash
python .venv/Scripts/python scripts/setup_env.py
```

Это создаст файл `.env` со случайным паролем и DATA_KEY.

**Отредактируйте `.env`** и заполните:
- `DOMAIN` — ваш домен (например, `admin.yourdomain.com`)
- `ADMIN_IDS` — ваш Telegram ID (получите у @userinfobot)
- `SHOP_BOT_TOKEN` — токен от @BotFather
- `ADMIN_BOT_TOKEN` — токен от @BotFather
- `SUPPORT_BOT_TOKEN` — токен от @BotFather
- `SUPPORT_BOT_USERNAME` — username бота поддержки (без @)
- `JAHA_API_KEY` — API ключ от Jaha
- `SHOP_TERMS` — условия продажи (одна строка)

### Загрузить .env на сервер

Через консоль хостинга создайте файл:

```bash
nano /opt/market/.env
```

Вставьте содержимое вашего `.env` файла, нажмите Ctrl+X, затем Y, затем Enter.

Установите права:

```bash
chmod 600 /opt/market/.env
chown deploy:deploy /opt/market/.env
```

---

## Шаг 6: Первый деплой (вручную)

После того как SSH будет доступен, выполните с вашего компьютера:

```bash
git push origin main
```

GitHub Actions автоматически:
1. Запустит тесты
2. Соберёт Docker-образ
3. Загрузит код на сервер
4. Запустит deploy.sh

Следите за прогрессом: https://github.com/shooozz/my-tg-business_bot/actions

---

## Шаг 7: Проверка

После успешного деплоя:

1. Откройте ваш домен в браузере: `https://admin.yourdomain.com`
2. Войдите с паролем из `.env`
3. Синхронизируйте каталог с Jaha
4. Установите цены
5. Включите товары
6. Тестовая покупка с другого аккаунта

---

## Альтернатива: Ручной деплой через консоль

Если GitHub Actions не работает, можно развернуть вручную:

```bash
cd /opt/market/releases
mkdir test-deploy
cd test-deploy

# Скопируйте весь код проекта в эту директорию
# Затем:

export RELEASE_ID=manual-v1 ENV_FILE=/opt/market/.env
docker compose -p market --env-file "$ENV_FILE" up -d --build --wait
```

---

## Важные команды

**Проверить статус:**
```bash
docker compose -p market --env-file /opt/market/.env ps
```

**Посмотреть логи:**
```bash
docker compose -p market --env-file /opt/market/.env logs -f app
```

**Остановить:**
```bash
docker compose -p market --env-file /opt/market/.env down
```

**Резервная копия:**
```bash
docker compose -p market --env-file /opt/market/.env exec -T app python scripts/backup.py
```
