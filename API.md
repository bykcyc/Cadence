# Transcriber — внешняя интеграция

Для внешней программы (например, бота, который по встречам ставит задачи) есть **два способа**
интеграции. Оба используют одну и ту же модель данных — файл `meeting.json` в каждой папке записи.

## 1. Файловый контракт (работает всегда, даже когда приложение закрыто)

Каждая встреча — папка `…/Records/YYYY-MM-DD_HH-MM-SS/` с файлами:

```
mic.flac                  # микрофон пользователя
system.flac               # звук встречи (собеседники)
mixed.flac                # сведённая дорожка
transcript.json           # транскрипт (segments: [{speaker,start,end,text}], text)
transcript.diarized.json  # транскрипт с разделением по говорящим
notes.md                  # meeting notes (markdown)
meeting.json              # метаданные + статусы (контракт)
```

`meeting.json`:

```json
{
  "schemaVersion": 1,
  "id": "2026-06-04_15-30-12",
  "title": "Созвон с командой",
  "createdAt": "2026-06-04T15:30:12.000Z",
  "durationSec": 3725,
  "language": "ru",
  "audio": { "mic": "mic.flac", "system": "system.flac", "mixed": "mixed.flac", "format": "flac", "sampleRate": 48000 },
  "artifacts": {
    "transcript":         { "status": "done", "path": "transcript.json" },
    "diarizedTranscript": { "status": "done", "path": "transcript.diarized.json" },
    "notes":              { "status": "done", "path": "notes.md", "model": "deepseek-v4-flash" }
  },
  "speakers": { "me": "Я", "spk_1": "Иван" },
  "processed": false,
  "processedAt": null,
  "processedBy": null,
  "tags": []
}
```

**Как обрабатывать встречи без дублей:**
1. Обойти `Records/*/meeting.json`, взять те, где `processed === false`.
2. Прочитать `transcript.diarized.json` (или `transcript.json`) и/или `notes.md`, поставить задачи.
3. Записать обратно `meeting.json` с `processed: true`, `processedAt: <ISO>`, `processedBy: "<имя-бота>"`.

Запись должна быть **атомарной** (запись во временный файл + переименование), чтобы приложение
не прочитало половину файла. Приложение следит за папкой и сразу отражает изменение `processed`
в интерфейсе (и в фильтрах «Обработаны / Не обработаны»).

## 2. Локальный HTTP API (когда приложение запущено)

По умолчанию на `http://127.0.0.1:47800` (можно выключить/сменить порт в настройках).

| Метод | Путь | Описание |
|---|---|---|
| GET | `/health` | `{ "status": "ok" }` |
| GET | `/meetings` | список всех встреч (массив `meeting.json`) |
| GET | `/meetings?processed=false` | только необработанные (`true` — только обработанные) |
| GET | `/meetings/:id` | одна встреча |
| POST | `/meetings/:id/processed` | тело `{ "processed": true, "by": "task-bot" }` → ставит отметку |

Пример (PowerShell):

```powershell
# получить необработанные встречи
$todo = Invoke-RestMethod 'http://127.0.0.1:47800/meetings?processed=false'
foreach ($m in $todo) {
  # ... обработать $m (прочитать transcript/notes, поставить задачи) ...
  Invoke-RestMethod "http://127.0.0.1:47800/meetings/$($m.id)/processed" `
    -Method Post -ContentType 'application/json' `
    -Body (@{ processed = $true; by = 'task-bot' } | ConvertTo-Json)
}
```

API без аутентификации и слушает только `127.0.0.1` (локально). Для постоянной автоматизации
надёжнее файловый контракт (способ 1) — он не зависит от того, запущено ли приложение.
