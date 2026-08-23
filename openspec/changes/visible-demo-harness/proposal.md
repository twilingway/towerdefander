## Why

Фоновые smoke/E2E тесты доказывают корректность, но не позволяют владельцу продукта наблюдать
плавность управления, читаемость боя и смену волн. Перед расширением enemy AI и multi-ship arena
нужен воспроизводимый видимый сценарий в обычном Chrome.

## What Changes

- Добавить отдельную команду `pnpm demo:visible`, которая поднимает изолированные local server и
  display, открывает headed Chrome и создаёт комнату.
- Подключать pilot/gunner/shield как три обычных authenticated controller connection и управлять ими
  только current strict messages.
- Автоматизировать движение, auto-aim по authoritative display snapshot, server-authoritative
  turret/fire outcome, shield energy management, interval upgrades и rematch после result.
- Добавить dev-only display overlay со статусом, wave/phase и действиями Pause/Resume/Stop.
- Показывать в dev-only overlay измеренные render FPS, authoritative snapshot Hz и auto-control Hz,
  чтобы видимая демонстрация отличала проблемы рендера от server/network cadence.
- Запускать headed Chrome без background/occlusion throttling и рисовать круглую grid arena без
  неподдерживаемой WebGL geometry mask.
- Добавить dev-only public-display telemetry для deterministic target selection без trusted state
  mutation.
- Не включать видимую бесконечную демонстрацию в `pnpm check` или обычный headless Playwright flow.

Не входят: новый protocol version, gameplay/balance overrides, production admin controls, NPC AI,
multi-ship combat, PvP и Android TV demo launcher.

## Capabilities

### New Capabilities

- `visible-demo-harness`: запуск, управление, наблюдаемость и безопасное завершение видимой
  локальной демонстрации.

### Modified Capabilities

Отсутствуют: production gameplay и realtime contracts не меняются.

## Impact

Изменяются root/controller scripts, package scripts, dev-only React overlay и диагностические
атрибуты display. Новых dependencies, protocol messages, server endpoints и production state fields
нет. Harness предназначен для desktop development и использует уже установленный Playwright/Chrome.
