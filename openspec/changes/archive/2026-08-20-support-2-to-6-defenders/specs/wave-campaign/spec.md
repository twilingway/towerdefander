## MODIFIED Requirements

### Requirement: Матч состоит из пяти волн

Авторитетная симуляция SHALL проводить ровно пять последовательных волн для каждого из `sectorCount`
секторов. Snapshot SHALL содержать номер текущей волны, общее число волн, stage `intermission` или
`combat` и оставшиеся секунды intermission. `intermissionDurationMs` SHALL делиться на `fixedStepMs`
без остатка. При создании боя state SHALL иметь `waveNumber=1`, `stage=intermission` и
`intermissionRemainingSteps=intermissionDurationMs/fixedStepMs`.

#### Scenario: Матч запускается

- **WHEN** все N игроков room готовы и сервер создаёт бой с `sectorCount=N`
- **THEN** начинается intermission перед первой волной с номером 1 и длительностью 10 секунд

#### Scenario: Волна очищена

- **WHEN** расписание текущей волны всех секторов исчерпано и её активных врагов больше нет
- **THEN** тот же transition устанавливает `waveNumber=currentWave+1`, `stage=intermission` и полный
  `intermissionRemainingSteps`, сохраняя ворота, улучшения, казну и заряд способности

#### Scenario: Последний шаг intermission

- **WHEN** текущий `intermissionRemainingSteps` равен 1
- **THEN** этот transition устанавливает remaining 0, `stage=combat` и `waveStep=0`, не выпуская
  врагов; первый следующий combat transition устанавливает `waveStep=1` и обрабатывает spawn step 1

#### Scenario: Пятая волна очищена

- **WHEN** все враги пятой волны во всех секторах, включая всех боссов, уничтожены
- **THEN** результат становится `victory` без запуска шестой волны

### Requirement: Пятая волна содержит босса

Пятая волна SHALL содержать отдельного boss в каждом секторе с отдельными health, speed, gateDamage
и reward. Уничтожение босса SHALL подчиняться тем же авторитетным правилам атаки и награды, что и
обычные враги. Расписания waves 1–4 SHALL NOT содержать boss, а wave 5 SHALL содержать ровно один
boss для каждого sectorId `0..sectorCount-1`. Каждый spawn SHALL иметь локальные для своей волны
`{ step, sectorId, enemyType }`, SHALL быть отсортирован по `step`, а элементы с одинаковым `step`
SHALL сохранять declaration order. Per-sector spawn template SHALL разворачиваться симметрично: для
каждого template spawn в declaration order builder SHALL выпустить sector IDs по возрастанию
`0..sectorCount-1`.

#### Scenario: Босс появляется

- **WHEN** расписание пятой волны достигает boss spawn в бою с sectorCount N
- **THEN** snapshot содержит по одному врагу type `boss` с настроенным максимальным здоровьем в
  каждом из N секторов

#### Scenario: Босс достигает ворот

- **WHEN** boss завершает путь
- **THEN** он ровно один раз наносит настроенный boss gateDamage воротам своего сектора и удаляется
  из активных врагов

#### Scenario: Расписание симметрично

- **WHEN** prototype config создаётся для любого sectorCount от 2 до 6
- **THEN** каждый сектор получает одинаковую последовательность enemyType и spawn step

#### Scenario: Порядок одновременных spawn стабилен

- **WHEN** один template spawn разворачивается для боя capacity N
- **THEN** N элементов имеют одинаковый step и идут в порядке sectorId от 0 до N-1
