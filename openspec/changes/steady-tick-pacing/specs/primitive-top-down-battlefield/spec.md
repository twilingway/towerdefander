## MODIFIED Requirements

### Requirement: Combat interpolation не перезапускается от неизменившихся patches

Display SHALL вести dynamic entities по авторитетному gameplay tick: хранить последние authoritative
снимки, вести локальное время воспроизведения с отставанием от самого свежего полученного tick и
рисовать промежуточное состояние между двумя ближайшими снимками, сохраняя shortest-angle behavior
для headings. Отставание воспроизведения SHALL подстраиваться под наблюдаемый интервал прихода
снимков, чтобы движение оставалось непрерывным при любом темпе, включая темп, отличный от 50 мс.
Patch telemetry, offers, HP или другого HUD state с тем же gameplay tick SHALL NOT перезапускать
entity transition. Patch, поднявший tick сразу на несколько шагов, SHALL проигрываться как
непрерывный отрезок движения, а не как скачок. Первый entity snapshot и hydration MAY snap к
authoritative transform; дальнейшие ticks SHALL снова interpolate.

#### Scenario: Обновился только ping

- **WHEN** room patch меняет latency, но сохраняет combat tick и entity transforms
- **THEN** Phaser runtime не получает новый movement transition и движущиеся visuals не дёргаются

#### Scenario: Снимки приходят реже окна интерполяции

- **WHEN** authoritative снимки приходят ровным темпом реже, чем раз в 50 мс — например раз в 62 мс
- **THEN** видимое движение остаётся непрерывным и не замирает в ожидании следующего снимка

#### Scenario: Патч принёс несколько шагов сразу

- **WHEN** очередной патч поднимает gameplay tick больше чем на один
- **THEN** visual проходит эти шаги одним отрезком движения, а не перескакивает в конечную точку

#### Scenario: Display reconnect в бою

- **WHEN** display восстанавливается после пропущенных combat ticks
- **THEN** первый snapshot snaps к current spaceship/entities/HP, а следующий tick снова
  интерполируется без проигрывания пропущенных collisions
