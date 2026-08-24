## ADDED Requirements

### Requirement: Каждая combat wave имеет server-authoritative deadline

Server SHALL давать каждой новой combat wave конфигурируемый wall-clock deadline с default 20 минут
и допустимым диапазоном 1..86400 секунд. Server SHALL создавать новый полный deadline только при
фактическом входе в следующую combat wave. Inputs, reconnect, intermission и upgrade choice SHALL
NOT продлевать текущий deadline. Display и controllers SHALL получать одинаковый
`waveSecondsRemaining`.

#### Scenario: Первая волна получает полный срок

- **WHEN** первый run переходит из lobby в combat wave 1
- **THEN** при default config server публикует countdown 1200 секунд и запускает authoritative
  deadline этой волны

#### Scenario: Следующая волна обновляет срок

- **WHEN** intermission волны N заканчивается и начинается combat wave N+1
- **THEN** новая волна получает полный настроенный deadline независимо от длительности предыдущей
  волны

#### Scenario: Operator настраивает длительность волны

- **WHEN** server стартует с валидным `ROOM_WAVE_TTL_SECONDS` вместо default
- **THEN** каждая новая combat wave получает указанное число секунд в диапазоне 1..86400

#### Scenario: Reconnect не останавливает срок

- **WHEN** controllers отключаются и возвращаются во время combat
- **THEN** wall-clock countdown продолжает уменьшаться и reconnect получает актуальный остаток

### Requirement: Незавершённая к deadline волна заканчивает run поражением

Если wave-угрозы не уничтожены до deadline, server SHALL до следующего simulation step создать
frozen `result/defeat` с `defeatReason=wave_timeout`, сохранить фактический hull/счёт/сущности и
остановить новые spawns/damage. Уничтожение hull SHALL публиковать
`defeatReason=spaceship_destroyed`.

#### Scenario: Время волны истекло при живом корабле

- **WHEN** deadline наступил, combat wave не завершена и hull больше нуля
- **THEN** run переходит в frozen defeat с причиной `wave_timeout` без обнуления hull

#### Scenario: Последний допустимый step завершает волну

- **WHEN** последний wave target уничтожен simulation step, начавшимся до deadline
- **THEN** server переводит run в intermission и не создаёт timeout defeat

#### Scenario: Deadline наступил до следующего step

- **WHEN** server clock достиг deadline до применения очередного combat step
- **THEN** timeout result имеет приоритет, а очередные movement, spawn и damage не применяются
