# Настройка автоматического деплоя на 213.59.113.102

GitHub Actions уже настроен в `.github/workflows/ci.yml`. Нужно только добавить секреты.

## Шаг 1: Получить SSH fingerprint

```bash
ssh-keyscan -H 213.59.113.102
```

Скопируйте строку, которая содержит `ssh-ed25519` или `ecdsa-sha2-nistp256`.

## Шаг 2: Получить приватный ключ

```bash
cat ~/.ssh/market_deploy
```

Скопируйте весь вывод от `-----BEGIN OPENSSH PRIVATE KEY-----` до `-----END OPENSSH PRIVATE KEY-----` включительно.

## Шаг 3: Добавить GitHub Secrets

Откройте: https://github.com/shooozz/my-tg-business_bot/settings/secrets/actions/new

Добавьте следующие secrets в **environment `production`**:

| Secret Name | Value |
|---|---|
| `DEPLOY_HOST` | `213.59.113.102` |
| `DEPLOY_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | Содержимое `~/.ssh/market_deploy` (весь текст) |
| `SSH_KNOWN_HOSTS` | Результат `ssh-keyscan` из шага 1 |

### Как добавить в environment:

1. Откройте https://github.com/shooozz/my-tg-business_bot/settings/environments
2. Нажмите на **production** (или создайте, если нет)
3. Нажмите **Add secret** для каждого секрета выше

## Шаг 4: Включить автодеплой

Откройте: https://github.com/shooozz/my-tg-business_bot/settings/variables/actions/new

Создайте переменную:
- **Name**: `DEPLOY_ENABLED`
- **Value**: `true`

## Шаг 5: Первый автоматический деплой

После коммита в `main` ветку:

```bash
git add -A
git commit -m "Enable auto-deploy and add filters"
git push origin main
```

GitHub Actions автоматически:
1. Запустит тесты
2. Соберёт Docker образ
3. Загрузит код на сервер
4. Запустит `deploy/deploy.sh`

Следите за прогрессом: https://github.com/shooozz/my-tg-business_bot/actions

## Как работает автодеплой

### Что запускает деплой:
- ✅ Push в `main` ветку
- ✅ Manual trigger через GitHub UI (Actions → Run workflow)
- ❌ Pull requests (только тесты, без деплоя)

### Что происходит:

1. **Test job** — всегда выполняется:
   - Установка зависимостей
   - Запуск pytest
   - Сборка Docker образа
   - Проверка docker-compose конфигурации

2. **Deploy job** — только при push в main И `DEPLOY_ENABLED=true`:
   - Настройка SSH ключей
   - Архивирование кода (`git archive`)
   - Загрузка на сервер
   - Распаковка в `/opt/market/releases/$COMMIT_SHA`
   - Запуск `deploy/deploy.sh $COMMIT_SHA`

### Безопасность:

- ✅ Приватный ключ хранится в GitHub Secrets (зашифрован)
- ✅ Деплой только из `main` ветки
- ✅ Только проверенный код (прошедший тесты)
- ✅ Каждый деплой в отдельной директории (rollback возможен)
- ✅ StrictHostKeyChecking включен

### Deploy script (`deploy/deploy.sh`):

```bash
# Что делает:
1. Проверяет commit SHA (40 hex символов)
2. Блокирует параллельные деплои (flock)
3. Проверяет наличие .env файла
4. Валидирует docker-compose конфигурацию
5. Собирает Docker образ
6. Создаёт backup БД (если контейнер работает)
7. Запускает новые контейнеры
8. Записывает SHA в /opt/market/current-release
9. Устанавливает backup скрипт
```

## Откат к предыдущей версии

Если новая версия сломалась:

```bash
ssh -i ~/.ssh/market_deploy deploy@213.59.113.102

# Посмотреть предыдущие релизы
ls -lt /opt/market/releases/

# Откатиться на конкретный SHA
bash /opt/market/releases/<PREVIOUS_SHA>/deploy/deploy.sh <PREVIOUS_SHA>
```

## Мониторинг деплоев

### В GitHub:
- Actions: https://github.com/shooozz/my-tg-business_bot/actions
- Deployments: https://github.com/shooozz/my-tg-business_bot/deployments

### На сервере:

```bash
# Текущая версия
cat /opt/market/current-release

# Логи деплоя
ssh deploy@213.59.113.102 "docker compose -p market logs app | tail -50"

# Статус контейнеров
ssh deploy@213.59.113.102 "docker compose -p market ps"
```

## Отключить автодеплой

Если нужно временно отключить:

1. Откройте https://github.com/shooozz/my-tg-business_bot/settings/variables/actions
2. Измените `DEPLOY_ENABLED` на `false`

Тесты продолжат работать, но деплой не будет запускаться.

## Troubleshooting

### Deploy job не запускается

Проверьте:
1. `DEPLOY_ENABLED` = `true` (не `"true"`, а просто `true`)
2. Push в `main` ветку (не в другую)
3. Environment `production` существует
4. Secrets добавлены в environment, а не в repository

### SSH connection failed

1. Проверьте `SSH_KNOWN_HOSTS` — должен быть результат `ssh-keyscan`
2. Проверьте `SSH_PRIVATE_KEY` — весь ключ с заголовками
3. Убедитесь, что публичный ключ добавлен на сервере:
   ```bash
   ssh deploy@213.59.113.102 "cat ~/.ssh/authorized_keys"
   ```

### Deploy script failed

Проверьте логи в GitHub Actions, раздел "Upload and deploy verified commit".

Частые причины:
- Нет `/opt/market/.env` на сервере
- Docker не запущен
- Недостаточно места на диске
- Синтаксическая ошибка в коде

---

После настройки каждый `git push origin main` будет автоматически деплоить на сервер! 🚀
