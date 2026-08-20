## MODIFIED Requirements

### Requirement: Камера следует за летающим замком

Camera SHALL следовать за визуально интерполированной castle position и SHALL оставаться внутри
world bounds. Background grid и obstacles SHALL визуально прокручиваться относительно viewport.
World transforms SHALL сохранять дробные coordinates без принудительного pixel rounding.

#### Scenario: Замок летит вправо

- **WHEN** authoritative snapshots публикуют возрастающие x и x-velocity
- **THEN** camera scroll изменяется промежуточными дробными positions без скачка на каждый server
  tick

#### Scenario: Замок у края мира

- **WHEN** castle находится у границы world
- **THEN** camera не показывает область за world bounds и не дрожит от outward velocity correction

### Requirement: Display интерполирует, но не владеет состоянием

Display SHALL хранить previous/latest authoritative snapshots и SHALL вычислять визуальные
castle/turret/shield/projectile transforms как функцию snapshot ticks и render delta, а не
фиксированного процента на frame. При 60 Hz и 120 Hz одинаковая пара snapshots SHALL давать
эквивалентную trajectory по elapsed time с tolerance 0.01 world unit. Display SHALL корректироваться
к server position за 50 ms и SHALL NOT создавать trusted projectile, energy, velocity или cooldown
самостоятельно. Только первый snapshot, новый projectile и hydration MAY начинаться непосредственно
с authoritative position.

#### Scenario: Локальная позиция расходится

- **WHEN** display получает positions для соседних 50 ms ticks и рисует несколько кадров между ними
- **THEN** визуальный объект проходит промежуточные positions вместо ожидания следующего patch

#### Scenario: Частота кадров различается

- **WHEN** один display рисует trace при 60 Hz, а другой при 120 Hz
- **THEN** их positions в одинаковый elapsed time отличаются не более чем на 0.01 world unit

#### Scenario: Display переподключается

- **WHEN** reconnect получает актуальный snapshot
- **THEN** scene сбрасывает interpolation buffer к нему и пересоздаёт projectiles без проигрывания
  пропущенных inputs
