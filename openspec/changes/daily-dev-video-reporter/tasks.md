## 1. Источник ежедневного отчёта

- [x] 1.1 Добавить Node-скрипт, который валидирует дату, читает коммиты Git и создаёт
      `artifacts/daily-videos/<date>/research.md`.
- [x] 1.2 Связать изменённые OpenSpec change с proposal и добавить папку артефактов в `.gitignore`.

## 2. Кадры демо

- [x] 2.1 Добавить opt-in PNG capture с проверкой безопасного каталога.
- [x] 2.2 Добавить Playwright WebM recording и проверить `lobby.png`, `combat.png` и WebM в
      изолированной demo-комнате.

## 3. Historical observer и skill

- [x] 3.1 Создать и провалидировать skill для русскоязычного сценария, статуса и shot list.
- [x] 3.2 Реализовать detached worktree без checkout основного дерева, включая безопасную очистку и
      честный fallback без видео.

## 4. Черновик и ежедневник

- [x] 4.1 Добавить UI-каталог, стабильные test id табов/панелей и Playwright capture изменённых
      записей.
- [x] 4.2 Добавить локальную SAPI-озвучку, ASS-титры и FFmpeg draft MP4 1080×1920/30 fps.
- [x] 4.3 Добавить локальный HTTP-ежедневник с календарём, Markdown, UI-кадрами и draft video.
- [x] 4.4 Добавить чистый `gameplay-raw.mp4` без аудио/текста и SSML-озвучку только мужским русским
      Windows-голосом с честным fallback при его отсутствии.
- [x] 4.5 Снимать изменённые вкладки балансовой админки из detached worktree выбранного дня.

## 5. Проверка

- [x] 5.1 Проверить Node-синтаксис, UI-каталог, SAPI WAV, PNG/WebM capture, ffprobe MP4, HTTP smoke,
      typecheck и skill validator.
- [ ] 5.2 Выполнить `pnpm check`, `pnpm spec:validate` и `git diff --check`.
