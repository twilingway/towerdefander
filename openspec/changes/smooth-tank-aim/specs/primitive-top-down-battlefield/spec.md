## MODIFIED Requirements

### Requirement: Display интерполирует, но не владеет состоянием

Display SHALL хранить previous/latest authoritative snapshots и SHALL вычислять визуальные
castle/turret/shield/projectile transforms как функцию snapshot ticks и render delta, а не
фиксированного процента на frame. При 60 Hz и 120 Hz одинаковая пара snapshots SHALL давать
эквивалентную position trajectory по elapsed time с tolerance 0.01 world unit и angular trajectory с
tolerance 0.001 rad. Display SHALL корректироваться к server position и angle за 50 ms. Turret и
shield angle SHALL интерполироваться по кратчайшей дуге с canonical wrap через ±π. Display SHALL NOT
создавать trusted projectile, energy, velocity, angular target или cooldown самостоятельно. Только
первый snapshot, новый projectile и hydration MAY начинаться непосредственно с authoritative
transform.

#### Scenario: Локальная позиция расходится

- **WHEN** display получает positions и angles для соседних 50 ms ticks и рисует несколько кадров
  между ними
- **THEN** визуальный объект проходит промежуточные positions и angles вместо ожидания следующего
  patch и достигает authoritative transform за 50 ms

#### Scenario: Частота кадров различается

- **WHEN** один display рисует position и angular trace при 60 Hz, а другой при 120 Hz
- **THEN** их positions в одинаковый elapsed time отличаются не более чем на 0.01 world unit, а
  angles — не более чем на 0.001 rad

#### Scenario: Display переподключается

- **WHEN** reconnect получает актуальный snapshot во время authoritative traverse
- **THEN** scene сбрасывает interpolation buffer к current server position и angle, пересоздаёт
  projectiles без проигрывания пропущенных inputs, а следующие snapshots снова интерполируются

#### Scenario: Угол проходит через wrap

- **WHEN** соседние authoritative angles находятся по разные стороны границы `π/-π`
- **THEN** visual turret и shield проходят короткую дугу без почти полного оборота
