## ADDED Requirements

### Requirement: Display показывает authoritative нагрев носового пулемёта

Боевой React HUD SHALL показывать текущие `heat`, `capacity` и `overheated` носового пулемёта только
из последнего authoritative display snapshot. Шкала SHALL безопасно ограничиваться диапазоном 0–100%
даже при некорректной нулевой capacity и SHALL иметь заметное красное состояние с текстом
«ПЕРЕГРЕВ», когда `overheated=true`. Display SHALL NOT моделировать нагрев или охлаждение локально.

#### Scenario: Пулемёт нагрет частично

- **WHEN** snapshot содержит `heat=40`, `capacity=100`, `overheated=false`
- **THEN** главный display показывает шкалу 40% и значение `40 / 100` без состояния перегрева

#### Scenario: Пулемёт перегрет

- **WHEN** snapshot содержит `overheated=true`
- **THEN** главный display выделяет индикатор красным и показывает текст «ПЕРЕГРЕВ»

#### Scenario: Display переподключился во время охлаждения

- **WHEN** после reconnect либо нового run первый snapshot содержит актуальное состояние пулемёта
- **THEN** HUD сразу показывает это состояние и не воспроизводит пропущенное охлаждение локально

### Requirement: Display показывает круглый обзорный радар всей арены

Боевой React HUD SHALL показывать круглую полупрозрачную north-up мини-карту, на которой вся
authoritative круглая arena целиком вписана без растяжения. Координаты SHALL проецироваться из
`worldWidth`, `worldHeight` и `arenaRadius`; содержимое за окружностью SHALL обрезаться круглой
маской. Радар SHALL показывать один общий корабль экипажа бирюзовым маркером и enemy ships красными.
Asteroids, homing missiles и обычные friendly/hostile projectiles SHALL NOT показываться. Маркеры
SHALL создаваться, обновляться и удаляться по текущему snapshot без локального предсказания
gameplay.

#### Scenario: Вся арена показана на радаре

- **WHEN** корабль и угрозы находятся в разных точках круглой арены
- **THEN** радар сохраняет их относительное положение внутри круглой north-up проекции всей арены

#### Scenario: Враг исчез из snapshot

- **WHEN** следующий authoritative snapshot больше не содержит enemy ID
- **THEN** соответствующий маркер отсутствует на мини-карте

#### Scenario: Враг находится за круглой границей

- **WHEN** позиция enemy находится за `arenaRadius`
- **THEN** его маркер обрезается круглой маской и не рисуется поверх рамки радара

#### Scenario: В snapshot есть ракеты и астероиды

- **WHEN** authoritative snapshot содержит homing missiles и asteroids
- **THEN** радар не создаёт для них маркеры

#### Scenario: Display переподключился

- **WHEN** reconnect либо новый run публикует первый актуальный snapshot
- **THEN** радар сразу соответствует его позициям и не проигрывает пропущенные перемещения

### Requirement: Боевой радар сохраняет читаемость HUD

Display SHALL показывать один радар снизу по центру поверх Phaser viewport и над основным combat
HUD. Он SHALL не изменять размер canvas и SHALL учитывать safe area телевизора. Его размер SHALL
быть адаптивным, форма SHALL оставаться круглой на поддерживаемых aspect ratio, а полупрозрачный
фон, рамка и маркеры SHALL оставаться различимыми поверх космоса. Радар SHALL NOT перекрывать нижний
combat HUD, room status и ping участников.

#### Scenario: Display меняет размер

- **WHEN** viewport меняется между `1920×1080`, `1366×768` и `1024×768`
- **THEN** радар остаётся кругом, расположен снизу по центру, целиком виден в safe area и не
  уменьшает Phaser viewport
