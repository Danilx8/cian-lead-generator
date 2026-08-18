# Support Tickets API — документация для фронтенда

Бэкенд системы поддержки (тикетов). Данные тикетов хранятся в Telegram-форуме
(по одному топику на тикет), история переписки — в БД. Фронтенд работает только
с этим REST API + Socket.IO для живых сообщений поддержки.

- **Base URL:** `/api/tickets`
- **Формат тела:** создание тикета и отправка сообщения — `multipart/form-data`
  (из-за изображений). Остальное — обычный JSON / query-параметры.
- **Формат ответа:** JSON.

---

## Аутентификация

Все эндпоинты защищены. Передавайте JWT пользователя в заголовке `Authorization`
**без префикса `Bearer`** (либо в cookie `jwt`):

```
Authorization: <jwt>
```

`userId` берётся сервером из токена — **в теле запроса его передавать не нужно и нельзя**
(доступ к чужому тикету вернёт `403`).

### Формат ошибок

Любая ошибка приходит с соответствующим HTTP-статусом и телом:

```json
{ "error": "Текст ошибки" }
```

| Код | Когда |
|-----|-------|
| `400` | Не заполнены обязательные поля / пустое сообщение / некорректный id |
| `401` | Нет/невалидный токен |
| `403` | Тикет принадлежит другому пользователю |
| `404` | Тикет не найден |
| `409` | Лимит открытых тикетов исчерпан / тикет закрыт / топик удалён (нельзя переоткрыть) |

---

## Объекты

### Ticket

```ts
interface Ticket {
  id: number;
  userId: number;
  username: string | null;
  title: string;
  status: "open" | "closed";
  urgency: number;          // 0–10, 0 = ещё не оценён поддержкой
  tags: string[];           // проставляются поддержкой
  threadId: number;         // внутренний id топика Telegram
  cardMessageId: number;    // служебное
  chatId: number;           // служебное
  deepLink: string | null;  // ссылка на топик (для саппорта)
  lastMessageAt: string;    // ISO, для сортировки списка
  createdAt: string;        // ISO
  updatedAt: string;        // ISO
}
```

Для UI обычно нужны: `id`, `title`, `status`, `urgency`, `tags`, `lastMessageAt`, `createdAt`.
Закрытый тикет (`status: "closed"`) показывайте серым; у него доступна кнопка «Открыть заново».

### TicketMessage (история, из `GET …/messages`)

```ts
interface TicketMessage {
  id: number;
  author: "user" | "support" | "system";
  text: string | null;
  authorName: string | null;   // имя сотрудника поддержки (для author=support)
  images: string[];            // готовые URL картинок (живут ~1 час, при необходимости перезапросите историю)
  createdAt: string;           // ISO
}
```

`author: "user"` — сообщения самого пользователя; `author: "support"` — ответы поддержки
(их же приносит WebSocket в реальном времени).

---

## Эндпоинты

### 1. Создать тикет

```
POST /api/tickets
Content-Type: multipart/form-data
```

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `title` | string | да | Заголовок тикета |
| `text` | string | да | Текст первого сообщения |
| `tags` | string / string[] | нет | Теги тикета (см. «Контракт тегов» ниже) |
| `images` | file[] | нет | До 10 изображений, ≤ 10 МБ каждое |

**Ответ `201`:** объект `Ticket`.

#### Контракт тегов (при создании)

- **Имя поля:** `tags`.
- **Несколько тегов:** да, поддерживается.
- **Формат — любой из двух** (сервер понимает оба):
  - **повторяющиеся поля** `tags` (multipart-массив) — рекомендуется;
  - одна **CSV-строка**: `"Баг,Вопрос"` (сервер разобьёт по запятой, обрежет пробелы, выкинет пустые).
- **Whitelist / валидация — на клиенте.** Сервер не проверяет значения и не нормализует регистр;
  что прислали — то и сохранит. Шлите уже готовый набор (например, из `constants/tickets.ts`:
  `Баг` / `Вопрос` / `Предложение`).
- Поле необязательное: без него тикет создаётся с пустыми `tags` (их можно задать позже — эндпоинт №7).

**Пример (fetch) — повторяющиеся поля (рекомендуется):**
```ts
const fd = new FormData();
fd.append("title", title);
fd.append("text", text);
["Баг", "Вопрос"].forEach((t) => fd.append("tags", t));   // несколько раз одно и то же поле
images.forEach((file) => fd.append("images", file));

const res = await fetch("/api/tickets", {
  method: "POST",
  headers: { Authorization: jwt },   // НЕ ставьте Content-Type вручную — браузер сам выставит boundary
  body: fd,
});
const ticket: Ticket = await res.json();
```

**Альтернатива — CSV-строкой:**
```ts
fd.append("tags", ["Баг", "Вопрос"].join(","));   // "Баг,Вопрос"
```

---

### 2. Список тикетов пользователя

```
GET /api/tickets?status=&tags=&q=&page=&limit=
```

| Query | Тип | По умолчанию | Описание |
|-------|-----|--------------|----------|
| `status` | `open` \| `closed` | — | Фильтр по статусу |
| `tags` | string (CSV) | — | Фильтр по тегам, **AND** (тикет должен иметь все указанные) |
| `q` | string | — | Поиск по заголовку (подстрока, без регистра) |
| `page` | number | 1 | Номер страницы |
| `limit` | number | 20 | Размер страницы (макс. 100) |

**Ответ `200`:**
```json
{
  "items": [ /* Ticket[] */ ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```
Сортировка — по `lastMessageAt` (новые сверху). Всего страниц: `Math.ceil(total / limit)`.

```ts
const res = await fetch(`/api/tickets?status=open&page=1&limit=20`, {
  headers: { Authorization: jwt },
});
const { items, total } = await res.json();
```

---

### 3. История переписки тикета

```
GET /api/tickets/:id/messages?page=&limit=
```

| Query | Тип | По умолчанию | Описание |
|-------|-----|--------------|----------|
| `page` | number | 1 | Номер страницы |
| `limit` | number | 50 | Размер страницы (макс. 100) |

**Ответ `200`:**
```json
{
  "items": [ /* TicketMessage[] */ ],
  "total": 17,
  "page": 1,
  "limit": 50
}
```
Сообщения отсортированы по возрастанию (`createdAt ASC`) — от старых к новым.

---

### 4. Отправить сообщение в тикет

```
POST /api/tickets/:id/messages
Content-Type: multipart/form-data
```

| Поле | Тип | Обяз. | Описание |
|------|-----|-------|----------|
| `text` | string | нет* | Текст сообщения |
| `images` | file[] | нет* | До 10 изображений, ≤ 10 МБ каждое |

\* Хотя бы одно из `text` / `images` должно быть непустым, иначе `400`.
Если тикет закрыт — `409` (сначала «Открыть заново»).

**Ответ `201`:** сохранённая запись сообщения (служебный вид, `images` — внутренние Telegram file_id).
Для отображения используйте оптимистичный рендер на клиенте, а актуальную историю с URL картинок
берите через эндпоинт №3 или из WebSocket.

```ts
const fd = new FormData();
fd.append("text", text);
images.forEach((f) => fd.append("images", f));

await fetch(`/api/tickets/${ticketId}/messages`, {
  method: "POST",
  headers: { Authorization: jwt },
  body: fd,
});
```

---

### 5. «Вопрос решён» — закрыть тикет

```
POST /api/tickets/:id/resolve
```
**Ответ `200`:** обновлённый `Ticket` (`status: "closed"`). Идемпотентно.

### 6. «Открыть заново» — переоткрыть тикет

```
POST /api/tickets/:id/reopen
```
**Ответ `200`:** обновлённый `Ticket` (`status: "open"`).
`409`, если топик в Telegram уже удалён — переоткрытие невозможно.

---

### 7. Установить теги тикета

```
PUT /api/tickets/:id/tags
Content-Type: application/json
```

```json
{ "tags": ["возврат", "важно"] }
```

Заменяет весь набор тегов тикета переданным массивом (полная замена, не добавление).
**Валидация — на стороне клиента**: сервер сохраняет теги как есть, ничего не нормализует
и не проверяет. Передавайте уже готовый, очищенный массив строк.

**Ответ `200`:** обновлённый `Ticket`.

```ts
await fetch(`/api/tickets/${ticketId}/tags`, {
  method: "PUT",
  headers: { Authorization: jwt, "Content-Type": "application/json" },
  body: JSON.stringify({ tags: ["возврат", "важно"] }),
});
```

---

## Живые сообщения поддержки (WebSocket / Socket.IO)

Ответы поддержки приходят в реальном времени. Используется существующий
Socket.IO-namespace `/messages`.

1. Подключитесь к namespace `/messages`, передав JWT в заголовке `Authorization` на handshake.
2. После `connect` вступите в свою «комнату», отправив событие `join` со **строковым `userId`**
   (тем же, что в токене), **без второго аргумента**.
3. Слушайте событие `ticket_message`.

```ts
import { io } from "socket.io-client";

const socket = io("/messages", {
  transports: ["websocket", "polling"],
  extraHeaders: { Authorization: jwt },
});

socket.on("connect", () => {
  socket.emit("join", String(userId));   // комната = userId
});

socket.on("ticket_message", (msg: TicketMessageBox) => {
  // добавить сообщение в открытый чат тикета msg.ticketId
});
```

**Payload `ticket_message`:**
```ts
interface TicketMessageBox {
  ticketId: number;
  messageId: number;
  author: "support";
  text?: string;
  authorName?: string;
  images: string[];   // готовые URL
  createdAt: string;  // ISO
}
```

> WebSocket доставляет только **новые** сообщения поддержки, пока клиент онлайн.
> Полную историю всегда берите через `GET /api/tickets/:id/messages`.

---

## Поведение и ограничения

- **Теги** клиент задаёт при создании (поле `tags`, см. эндпоинт №1) и/или позже через
  `PUT /api/tickets/:id/tags` (полная замена набора). Валидация/whitelist — на клиенте.
  Поддержка тоже может менять теги со своей стороны.
- **Срочность** проставляет только поддержка. При создании тикет имеет `urgency: 0` и пустые
  `tags`; значения могут обновиться позже — фронт может реагировать, перезапрашивая список/тикет.
- **Лимит открытых тикетов** на пользователя ограничен (по умолчанию 5) — превышение даёт `409`.
- **Изображения:** до 10 файлов на запрос, ≤ 10 МБ каждый.
- URL картинок в истории временные (~1 час); если ссылка протухла — перезапросите историю.

---

## Сводка эндпоинтов

| Метод | Путь | Назначение |
|-------|------|-----------|
| POST | `/api/tickets` | Создать тикет |
| GET | `/api/tickets` | Список (пагинация, фильтры, поиск) |
| GET | `/api/tickets/:id/messages` | История переписки |
| POST | `/api/tickets/:id/messages` | Отправить сообщение |
| POST | `/api/tickets/:id/resolve` | Закрыть тикет |
| POST | `/api/tickets/:id/reopen` | Переоткрыть тикет |
| PUT | `/api/tickets/:id/tags` | Установить теги тикета |
| WS | `/messages` → `ticket_message` | Живые ответы поддержки |
