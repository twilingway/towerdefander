## Context

Controller уже имеет один pointer-captured joystick и отдельные role actions, но card layout и
проверка `isPrimary` мешают надёжному двухпальцевому управлению. Transport contract и 25-ms latest
input scheduler уже подходят для одновременных aim/action intents.

## Goals / Non-Goals

**Goals:** landscape-first fullscreen controls, независимые pointerId, круглая правая action-zone,
безопасная neutralization и сохранение keyboard/portrait fallback.

**Non-Goals:** новая shield ability, изменение protocol/gameplay balance, native orientation lock и
Gamepad API.

## Decisions

### Две независимые pointer-owned зоны

Каждая зона хранит свой captured pointerId и не использует global `event.isPrimary`. Это позволяет
держать левый joystick одним пальцем и одновременно стрелять/переключать щит другим. Событие чужого
pointerId игнорируется. Альтернатива с одним общим gesture handler отклонена: она усложняет
cancel/reconnect и создаёт лишние React renders.

### Справа action-zone, а не второй аналоговый vector

Pilot и gunner получают hold action, shield — tap toggle. Круглая форма визуально образует пару со
стиком, но не вводит неиспользуемую координату. Shield не выключается при отпускании, сохраняя
принятый устойчивый intent.

### React хранит только визуальный transient state

Pointer IDs и high-frequency desired state остаются в refs; render state меняется только для
положения knob/pressed feedback. Existing scheduler объединяет aim и action в один latest intent.

### Responsive CSS без принудительной ориентации

Landscape использует две колонки на весь viewport и уменьшенный HUD; portrait остаётся вертикальным
fallback. Это работает в browser и будущей Android shell без новой зависимости.

## Risks / Trade-offs

- [Browser отменяет один touch при системном жесте] → pointercancel/lostcapture немедленно снимают
  соответствующий continuous intent.
- [Маленький landscape viewport переполняется] → боевой HUD компактен, критичные зоны используют
  clamp/min размеры, secondary controls не перекрывают touch-зоны.
- [Shield tap ошибочно повторяется] → toggle выполняется только на завершённом pointer cycle одного
  captured pointerId.

## Migration Plan

Изменение controller-only и совместимо с protocol v13. Rollback возвращает предыдущие JSX/CSS без
server migration.

## Open Questions

Нет.
