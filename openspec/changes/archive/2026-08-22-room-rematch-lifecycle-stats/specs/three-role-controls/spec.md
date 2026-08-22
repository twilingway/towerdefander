## ADDED Requirements

### Requirement: Controller управляет готовностью к следующему run

В lobby кнопка ready SHALL готовить первый run с runNumber 0; в terminal result та же strict v9
ready command SHALL означать «Играть ещё» для текущего runNumber. Кнопка SHALL показывать
authoritative ready state, блокироваться после принятия и снова становиться false при следующем
terminal result. Combat/intermission SHALL не показывать rematch action.

#### Scenario: Игрок голосует после поражения

- **WHEN** gunner нажимает «Играть ещё» в result run 3
- **THEN** controller отправляет ready с runNumber 3 и показывает принятое authoritative ready

#### Scenario: Ready старого run задержался

- **WHEN** controller доставляет ready run 3 после старта run 4
- **THEN** UI получает `stale_run`, а готовность run 4 не меняется

### Requirement: Controller имеет явный выход из комнаты

Connected controller SHALL показывать доступное действие «Выйти из комнаты» отдельно от controls и
rematch. После подтверждения UI SHALL остановить heartbeat/input, очистить сохранённый reconnect
token, выполнить consented leave и вернуть join form. Cancel подтверждения SHALL не менять room.

#### Scenario: Игрок подтверждает выход

- **WHEN** pilot выбирает и подтверждает выход
- **THEN** transport выполняет consented leave, локальная session очищена и отображается join form

#### Scenario: Игрок отменяет выход

- **WHEN** pilot закрывает confirmation без согласия
- **THEN** connection, reconnect token, role и controls остаются прежними
