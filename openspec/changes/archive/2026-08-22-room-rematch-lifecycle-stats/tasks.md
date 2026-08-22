## 1. Закрыть dependency и protocol v9

- [x] 1.1 Завершить оставшиеся benchmark/network/Playwright/manual tasks
      `tyrian-combat-roguelite-slice`, выполнить archive-apply check и архивировать его до изменения
      canonical v8 specs; проверить `pnpm spec:validate`.
- [x] 1.2 Добавить protocol v9 `runNumber`, terminal `result/outcome`, `stale_run` и strict поля во
      все ready/gameplay/upgrade commands и display/controller projections; покрыть v8 mismatch,
      cross-field result и unsafe/stale run tests; выполнить protocol test/typecheck/build/lint.

## 2. Deterministic run reset

- [x] 2.1 Нормализовать pure core terminal phase в result с `defeat|victory`, сохранив текущий
      defeat source и frozen snapshot; добавить deterministic tests и не вводить victory condition.
- [x] 2.2 Добавить pure clean-run factory/reset assertions: новый explicit seed создаёт исходные
      HP/wave/score/entities/modifiers/offers/input без carry-over; выполнить game-core
      test/typecheck/build/lint.

## 3. Authoritative rematch и run isolation

- [x] 3.1 Синхронизировать runNumber/result в Colyseus state и adapters; валидировать runNumber до
      phase/sequence/journal mutation для всех controller commands и покрыть `stale_run` room tests.
- [x] 3.2 Реализовать terminal ready 3/3 и единственный atomic clean restart в той же room с новым
      seed, сохранёнными connections/identity/role и очищенными per-run state/journals/watermarks;
      покрыть 2/3, duplicate ready, disconnected ready, reconnect и replacement.
- [x] 3.3 Реализовать явный controller consented leave и display close/disconnect semantics; покрыть
      отличие от reload/transport reconnect и stable close reason в server/network tests.

## 4. Bounded room lifecycle

- [x] 4.1 Расширить validated server config и `.env.example`: lobby 15m, result 10m, zero-controller
      5m, absolute 4h при существующем display grace 30s; добавить range tests.
- [x] 4.2 Реализовать единый generation-safe lifecycle scheduler и idempotent disposal cleanup для
      simulation, latency, TTL, journals и metadata; fake-timer tests должны покрыть каждый
      deadline, first-controller distinction, reservation и earliest-deadline precedence.

## 5. Room operations dashboard

- [x] 5.1 Публиковать compact PII-free Colyseus metadata через ordered/coalesced writer на create,
      status, membership, deadline и disposal transitions; failures не должны влиять на gameplay.
- [x] 5.2 Добавить `/stats/rooms.json` через `matchMaker.query()` с aggregate/status/anonymous rows,
      `no-store`, 503 isolation и сериализационным тестом отсутствия roomId/name/session/IP/token/
      ping/seed/entity values.
- [x] 5.3 Добавить server-rendered `/stats/rooms` с 5-second polling и безопасным fixed-value
      render; без password разрешать только socket loopback, с `ROOM_STATS_PASSWORD` требовать
      constant-time Basic Auth; покрыть IPv4/IPv6, spoofed forwarding, 401 и correct password HTTP
      tests.

## 6. Display и controller UX

- [x] 6.1 Обновить adapters на v9 runNumber/result и сделать runNumber hydration boundary display;
      проверить, что новый run snap-ится один раз и не наследует visuals прошлого result.
- [x] 6.2 Добавить display result overlay outcome/final score/ready 0..3 и подтверждаемую кнопку
      «Закрыть комнату» с возвратом к create screen; выполнить display tests/typecheck/build/lint.
- [x] 6.3 Добавить controller «Играть ещё», authoritative ready state и подтверждаемый «Выйти из
      комнаты» с остановкой scheduler/очисткой reconnect storage; выполнить controller
      tests/typecheck/build/lint.

## 7. Интеграция, документация и lifecycle

- [x] 7.1 Проверить сетевой lifecycle совокупностью transport smoke и room tests: defeat → 2/3 wait
      → 3/3 same-room runNumber+1, old-run packet rejection, result reconnect/replacement,
      controller exit и display close.
- [x] 7.2 Расширить Playwright display+3 controllers: result readiness, новый run без повторного
      join, clean world, controller exit UI и возврат всех clients после display close.
- [x] 7.3 Обновить `docs/PROJECT_PLAN.md`, `.env.example` и deployment notes для TTL, stats access,
      Basic Auth/TLS и protocol v9 migration.
- [x] 7.4 Выполнить package checks, `pnpm check`, `pnpm spec:validate`, `git diff --check` и
      archive-apply dry-run; затем read-only reviewer pass и исправить blocker/high/medium findings.
- [x] 7.5 Запустить local stack для ручного rematch/exit/stats/TTL playtest и получить подтверждение
      пользователя; только после него reconcile checkbox, archive, commit, push и restart.
