## MODIFIED Requirements

### Requirement: Authoritative arena имеет круглую геометрию

Активный пресет баланса SHALL нести радиус арены, а сборка конфигурации симуляции SHALL выводить
square bounding world из него, чтобы `worldWidth === worldHeight === arenaRadius*2` выполнялось по
построению. Current strict game snapshot SHALL публиковать этот мир и радиус. Arena center SHALL
быть `(worldWidth/2,worldHeight/2)`. Strict schema SHALL продолжать отклонять geometry, где радиус
не равен половине стороны мира; server SHALL быть единственным владельцем geometry и positions.
Сохранённый пресет без радиуса SHALL получать его из встроенных дефолтов, сохраняя остальной
документ, включая таблицу волн.

#### Scenario: Новый run создаёт круглый мир

- **WHEN** server создаёт run с активным пресетом, несущим радиус 4400
- **THEN** initial snapshot содержит world `8800×8800`, arenaRadius 4400 и spaceship в центре
  `(4400,4400)`

#### Scenario: Оператор меняет радиус

- **WHEN** оператор сохраняет из консоли другой радиус и запускается следующий прогон
- **THEN** мир и центр арены следуют за ним, оставаясь квадратом со стороной в два радиуса

#### Scenario: Geometry противоречива

- **WHEN** snapshot/config содержит radius, не равный половине square world
- **THEN** strict validation отклоняет geometry без частичного state

#### Scenario: Старый пресет без радиуса

- **WHEN** стор грузит сохранённый пресет предыдущей версии файла
- **THEN** радиус берётся из встроенных дефолтов, а таблица волн оператора остаётся на месте
