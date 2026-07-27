## ADDED Requirements

### Requirement: Матч состоит из пяти волн

Авторитетная симуляция SHALL проводить ровно пять последовательных волн. Snapshot SHALL содержать
номер текущей волны, общее число волн, stage `intermission` или `combat` и оставшиеся секунды
intermission. `intermissionDurationMs` SHALL делиться на `fixedStepMs` без остатка. При создании боя
state SHALL иметь `waveNumber=1`, `stage=intermission` и
`intermissionRemainingSteps=intermissionDurationMs/fixedStepMs`.

#### Scenario: Матч запускается

- **WHEN** два игрока готовы и сервер создаёт бой
- **THEN** начинается intermission перед первой волной с номером 1 и длительностью 10 секунд

#### Scenario: Волна очищена

- **WHEN** расписание текущей волны исчерпано и её активных врагов больше нет
- **THEN** тот же transition устанавливает `waveNumber=N+1`, `stage=intermission` и полный
  `intermissionRemainingSteps`, сохраняя ворота, улучшения, казну и заряд способности

#### Scenario: Последний шаг intermission

- **WHEN** текущий `intermissionRemainingSteps` равен 1
- **THEN** этот transition устанавливает remaining 0, `stage=combat` и `waveStep=0`, не выпуская
  врагов; первый следующий combat transition устанавливает `waveStep=1` и обрабатывает spawn step 1

#### Scenario: Пятая волна очищена

- **WHEN** все враги пятой волны, включая босса, уничтожены
- **THEN** результат становится `victory` без запуска шестой волны

### Requirement: Обычные враги имеют три серверных типа

Конфигурация SHALL определять balanced, fast и heavy с отдельными целочисленными health, speed,
gateDamage и reward. Каждый активный враг SHALL хранить type, текущее и максимальное здоровье.

#### Scenario: Одинаковый тип в одинаковом состоянии

- **WHEN** два боя с одинаковыми config, seed и командами выпускают один тип врага на одном шаге
- **THEN** его характеристики и дальнейшие переходы состояния структурно совпадают

#### Scenario: Типы сравниваются

- **WHEN** balanced, fast и heavy создаются из прототипной конфигурации
- **THEN** fast движется быстрее balanced, heavy имеет больше здоровья balanced, а их награды
  соответствуют конфигурации

### Requirement: Пятая волна содержит босса

Пятая волна SHALL содержать boss с отдельными health, speed, gateDamage и reward. Уничтожение босса
SHALL подчиняться тем же авторитетным правилам атаки и награды, что и обычные враги. Расписания
waves 1–4 SHALL NOT содержать boss, а wave 5 SHALL содержать ровно один boss. Каждый spawn SHALL
иметь локальные для своей волны `{ step, sectorId, enemyType }`, SHALL быть отсортирован по `step`,
а элементы с одинаковым `step` SHALL сохранять declaration order.

#### Scenario: Босс появляется

- **WHEN** расписание пятой волны достигает boss spawn
- **THEN** snapshot содержит врага type `boss` с его настроенным максимальным здоровьем

#### Scenario: Босс достигает ворот

- **WHEN** boss завершает путь
- **THEN** он ровно один раз наносит настроенный boss gateDamage и удаляется из активных врагов
