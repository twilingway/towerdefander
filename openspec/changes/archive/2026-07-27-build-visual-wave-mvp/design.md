## Context

Текущий сервер публикует детерминированный снимок короткого боя, а display показывает его React
карточками. Phaser уже установлен, но сцена отсутствует. Новое изменение одновременно расширяет
game-core, protocol/room и общий экран, поэтому визуальный слой должен остаться отделённым от
авторитетных правил.

Профиль утверждён пользователем: пять волн, balanced/fast/heavy, boss в пятой волне, десятисекундный
intermission и общий авиаудар для помощи любому сектору. Текущий лимит двух игроков сохраняется.

## Goals / Non-Goals

**Goals:**

- сделать бой понятным без чтения таблицы чисел;
- получить воспроизводимую пяти-волновую кампанию;
- визуально различить типы врагов, попадания, ворота и авиаудар;
- сохранить server authority, reconnect и idempotency;
- поддержать desktop landscape и будущий Android TV WebView.

**Non-Goals:**

- финальные нарисованные sprites, звук, частицы уровня production и сюжет;
- физика столкновений или расчёт урона в Phaser;
- 3–6 игроков, новые роли, matchmaking или persistence;
- Capacitor/Android manifest в этом изменении.

## Decisions

### Wave model принадлежит game-core

`DefenseConfig` получает пять `WaveConfig`, enemy archetypes и ability config. `DefenseState`
получает `waveNumber`, `stage`, `intermissionRemainingSteps`, type/maxHealth у врагов,
`airstrikeCharge` и описание последнего применённого авиаудара. Переходы остаются pure и используют
только explicit fixed steps.

Альтернатива — менять расписание в Colyseus room. Она разделила бы правила победы и spawn между
двумя слоями и ухудшила deterministic tests.

### Intermission остаётся частью active room

Room phase остаётся `active`, пока game snapshot переключает `stage` между `intermission` и
`combat`. Ready/lobby и reconnect lifecycle не получают лишних переходов. Repair/upgrade доступны во
время обоих stage, airstrike — только во время combat.

Альтернатива — расширить room phase каждой волной. Это смешивает сетевой lifecycle с игровым и
создаёт больше несовместимых client branches.

### Airstrike использует полную identity-envelope

Protocol v3 добавляет `player:airstrike` с `protocolVersion`, `roomId`, `playerId`, `actionId`,
`targetSectorId`. Room сверяет identity, но намеренно не ограничивает target собственным сектором.
Результат, включая rejection, сохраняется в существующем room-wide action journal.

Альтернатива — локальная кнопка display или payload без player/room identity. Оба варианта нарушают
персональный controller flow и проектный realtime invariant.

### Phaser получает immutable public snapshot через bridge

React создаёт `Phaser.Game` один раз в выделенном canvas container и уничтожает при unmount.
`BattlefieldScene` получает новые snapshots через небольшой imperative bridge. Сцена сопоставляет
объекты по `enemyId`, tween-интерполирует progress и пересоздаётся из snapshot после reconnect.

Альтернатива — `react-phaser-fiber`. Она запрещена правилами проекта и добавляет лишнюю зависимость
между React reconciliation и игровым render loop.

### Server публикует разные проекции для display и controller

Colyseus `StateView` открывает display полную коллекцию врагов и данные визуального эффекта, а
controller получает только агрегаты `enemyCount` и `airstrikeTargetAvailable` по секторам. Так
телефоны не загружают координаты, здоровье и identity каждого врага, но сохраняют достаточно данных
для выбора цели.

Альтернатива — отправлять всем клиентам полный snapshot и скрывать его только в React. Она не
уменьшает сетевой трафик и оставляет лишние игровые данные доступными controller-клиенту.

### Code-native визуальный стиль

Первая сцена использует Phaser Graphics: тёмный лесной фон, две светящиеся дороги, каменные ворота,
башни, геометрические silhouettes врагов, health bars, muzzle flash, projectiles и screen flash
авиаудара. Типы кодируются не только цветом, но также формой и размером.

Альтернатива — сразу генерировать полный sprite atlas. Это задерживает проверку читаемости правил и
вводит художественную миграцию до утверждения gameplay.

### Cosmetic event inference ограничен snapshot

Изменение health создаёт hit/projectile effect, исчезновение enemy — death/breach effect, а новый
`lastAirstrikeEffect` с `{ sequence, actionId, playerId, targetSectorId, appliedTick }` — авиаудар.
`sequence` монотонно увеличивается только для принятой команды. Эти эффекты не изменяют snapshot.
При первом snapshot, включая reconnect hydration, сцена принимает текущий `sequence` как baseline и
не повторяет старый эффект; каждый последующий больший `sequence` проигрывается ровно один раз в
указанном секторе.

## Risks / Trade-offs

- [Patch и render churn на слабом TV] → reconciliation по `enemyId`, ограничение числа объектов,
  pooling простых Graphics и один Phaser instance.
- [Цветовые различия плохо читаются] → одновременно менять форму, размер, outline и подпись boss.
- [Tween отстаёт при сетевом jitter] → короткая интерполяция с жёсткой коррекцией на новом snapshot.
- [Airstrike visual повторяется после reconnect] → snapshot хранит sequence, targetSectorId и
  appliedTick; bridge принимает initial/reconnect hydration как baseline и затем запоминает
  последнюю уже показанную sequence.
- [Protocol v3 ломает старые вкладки] → единый deploy server/clients и существующий
  `protocol_mismatch`.
- [Пять волн удлиняют CI] → game-core/room tests используют ручные steps; browser E2E проверяет
  ускоренную test-конфигурацию или одну репрезентативную волну без изменения production authority.

## Migration Plan

1. Расширить и протестировать game-core wave/airstrike state.
2. Повысить protocol и синхронно обновить Colyseus state/room.
3. Обновить controller для wave/charge/target selection.
4. Добавить Phaser bridge и scene, оставив React fallback/HUD.
5. Расширить smoke/E2E, выполнить единый deploy всех приложений.
6. Rollback выполняется возвратом server и обоих clients на предыдущий commit; постоянных данных
   нет.

## Open Questions

- Prototype balance остаётся конфигурацией и будет настроен после ручной игры.
- Финальная художественная тема и звуковой стиль будут выбраны после проверки читаемости code-native
  сцены.
