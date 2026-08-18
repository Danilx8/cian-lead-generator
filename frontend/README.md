# Cian Sender React

Веб-фронтенд для [cian-lead-generator](../README.MD) — управление слотами, фильтрами недвижимости, шаблонами и диалогами. Написан по аналогии с goat-sender-react (фронтенд goat-kleinanzeigen-sender), адаптирован под API cian-lead-generator: авторизация по email/паролю (JWT + refresh), аккаунты Cian (логин/пароль) вместо cookie-слотов, фильтры под параметры поиска недвижимости cian.ru.

Цветовая гамма: светлая тема, cyan (#00AEEF) + белый.

## Запуск

```bash
npm install
npm run dev      # dev-сервер Vite, /api проксируется на http://localhost:3050
npm run build    # tsc -b + прод-сборка
```

Бэкенд не раздаёт статику — в проде фронтенд раздаётся отдельно (nginx и т.п.) с проксированием `/api`, `/socket.io` и `/images` на порт бэкенда (3050).

## Env

- `VITE_ADMIN_KEY` — необязательный админ-ключ; уходит на бэкенд в заголовке `X-Admin-Key` и открывает страницы `/admin/*`. Админ-доступ также даёт JWT пользователя с `role: "admin"`.
