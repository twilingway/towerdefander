## MODIFIED Requirements

### Requirement: Камера следует за spaceship

Camera SHALL следовать за визуально интерполированной spaceship position и SHALL держать её в центре
viewport в любой достижимой core position, включая край арены. Phaser scroll SHALL учитывать
renderer pixels, zoom и фактический responsive logical viewport. Camera SHALL NOT ограничиваться
границами мира: остановленная камера оставляет неровность темпа снимков видимой на самом корабле,
тогда как едущая уносит её вместе с собой. У края арены viewport SHALL показывать пространство
снаружи круга. Circular grid и obstacles SHALL визуально прокручиваться относительно viewport. World
transforms SHALL сохранять дробные coordinates без принудительного pixel rounding.

#### Scenario: Spaceship летит вправо

- **WHEN** authoritative snapshots публикуют возрастающие x и x-velocity
- **THEN** camera scroll изменяется промежуточными дробными positions без скачка на каждый server
  tick

#### Scenario: Spaceship у края мира

- **WHEN** spaceship находится на cardinal либо diagonal legal boundary position при произвольном
  поддерживаемом aspect ratio
- **THEN** корабль остаётся в центре viewport, камера продолжает следовать за ним без остановки, а в
  кадре видно пространство снаружи круга

#### Scenario: Camera использует zoom

- **WHEN** renderer `1920×1080` показывает logical viewport `1600×900` и spaceship находится в
  центре arena `(2200,2200)`
- **THEN** camera midpoint совпадает с spaceship, а world-view top-left равен `(1400,1750)` без
  систематического сдвига из-за zoom
