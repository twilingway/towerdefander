## Context

Репозиторий создаётся с нуля. Первый вертикальный срез должен проверить сеть и жизненный цикл
комнаты раньше боевой симуляции. Общий экран должен работать как обычный web-клиент на компьютере;
будущая Android TV сборка повторно использует тот же bundle.

Клиенты находятся в недоверенной среде. Сервер отвечает за membership, фазу комнаты, ready-состояние
и результаты команд. В vertical slice участвуют один display и два controller-клиента.

## Goals / Non-Goals

**Goals:**

- Одна команда поднимает три приложения для локальной разработки.
- Display создаёт Colyseus room и показывает browser-friendly join data.
- Два controllers проходят join, ready, active и signal flow.
- Неожиданное отключение controller восстанавливается в течение 30 секунд.
- Shared protocol компилируется из одного пакета и проверяется на сервере.

**Non-Goals:**

- Игровой tick, враги, pathfinding и Phaser gameplay scene.
- Публичный matchmaking и постоянное хранилище.
- Несколько server instances, Redis presence и production autoscaling.
- Android native project.

## Decisions

### pnpm workspaces без task runner

Root scripts используют recursive/filter команды pnpm. Это сохраняет bootstrap прозрачным и не
добавляет Turborepo до появления измеримой потребности в cache и pipeline orchestration.

Альтернатива: Turborepo. Отклонена для первого среза как лишний слой.

### Два React/Vite клиента и отдельный Colyseus server

`apps/display` и `apps/controller` являются независимыми Vite entry points. Display создаёт комнату;
controller присоединяется по `roomId`. `apps/server` владеет Colyseus room.

Альтернатива: один React bundle с route-based ролями. Отклонена, потому что display загружает Phaser
и графические assets, которые не нужны controllers.

### Server-authoritative room state

Colyseus Schema содержит фазу, display presence и игроков. Клиенты отправляют сообщения, а room
является единственным писателем синхронизируемого состояния. Служебный `Set` применённых `actionId`
остаётся несинхронизируемым server-only state.

Альтернатива: TV-hosted simulation. Отклонена из-за потери матча при lifecycle событии display и
невозможности атомарно разрешать будущие траты общей казны.

### Общий protocol package и runtime validation

`packages/protocol` экспортирует protocol version, join options, message names, payload schemas и
error codes. TypeScript types уменьшают ошибки разработки, а runtime schemas защищают server
boundary от произвольных browser payloads.

Альтернатива: только TypeScript interfaces. Отклонена, поскольку типы исчезают во время выполнения.

### Восстановление через Colyseus reconnection token

Controller сохраняет reconnection token в `sessionStorage`. Room вызывает `allowReconnection` с
30-секундным timeout и не удаляет player state до завершения grace period. Обычный повторный вход
после истечения token создаёт новую identity.

### Конфигурируемые browser endpoints

Vite использует `VITE_GAME_SERVER_URL`. Значение по умолчанию для разработки — origin hostname и
порт server, чтобы страницу можно было открыть с другого устройства в LAN. Production HTTPS/WSS
endpoint будет задан окружением.

### UI без финального art

Display использует React lobby shell и резервирует контейнер Phaser. Controller использует крупные
touch/mouse/keyboard controls. В этом изменении визуальный стиль доказывает layout, а не финальный
art direction.

## Risks / Trade-offs

- **Разные hostnames при LAN-разработке** → вычислять server hostname из `window.location.hostname`,
  слушать `0.0.0.0`, документировать firewall.
- **Повтор сообщения после reconnect** → обязательный `actionId` и server-side deduplication.
- **Display disconnect уничтожает UX комнаты** → room не завершается сразу и display presence
  отражается в состоянии; identity recovery display-клиента остаётся вне этого изменения.
- **Colyseus API изменится** → закрепить версии lockfile и покрыть room-level tests.
- **Android TV WebView отличается от desktop browser** → не заявлять TV support в этом change;
  провести real-device gate при Capacitor change.
- **QR ведёт на localhost** → строить ссылку из явно заданного `VITE_CONTROLLER_URL` или текущего
  LAN hostname.

## Migration Plan

Greenfield migration не требуется.

1. Создать workspace packages и установить зависимости.
2. Реализовать protocol и room tests.
3. Реализовать display/controller lobby UI.
4. Проверить два browser contexts локально.
5. Добавить Playwright smoke test после стабилизации ручного потока.

Rollback: удалить новые workspace packages и change artifacts; пользовательских данных нет.

## Open Questions

- Production hosting provider и Redis adapter выбираются перед первым публичным deployment.
- Политика восстановления display-клиента будет уточнена вместе с полноценным матчем.
