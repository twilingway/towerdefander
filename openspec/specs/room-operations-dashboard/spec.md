# room-operations-dashboard Specification

## Purpose

TBD - created by archiving change room-rematch-lifecycle-stats. Update Purpose after archive.

## Requirements

### Requirement: Страница показывает безопасную статистику активных комнат

Server SHALL предоставлять read-only HTML `/stats/rooms` и JSON `/stats/rooms.json`, построенные из
Colyseus room metadata. Ответ SHALL содержать timestamp, total rooms, connected controller players,
counts по status и анонимные rows только с status, connectedPlayers, reservedPlayers, capacity,
ageSeconds и expiresInSeconds|null. Display SHALL NOT учитываться как player. RoomId/join code,
player/session identity, name, IP, reconnect token, latency, endpoint, seed и gameplay entities
SHALL NOT попадать в metadata или response. Ответ SHALL иметь `Cache-Control: no-store`.

#### Scenario: Сервер имеет несколько комнат

- **WHEN** существуют lobby с двумя controllers, combat с тремя и result с одним reserved controller
- **THEN** page/json показывают три анонимные строки, корректные status/counts и aggregate players

#### Scenario: Комната уничтожена

- **WHEN** room disposed и следующий stats refresh выполняется
- **THEN** её row и contribution исчезают из ответа

#### Scenario: Ответ проверяется на персональные данные

- **WHEN** тест сериализует metadata, JSON и HTML при известных roomId/name/sessionId/seed
- **THEN** ни одно известное секретное или персональное значение не присутствует

### Requirement: Удалённый доступ к статистике закрыт по умолчанию

Без `ROOM_STATS_PASSWORD` server SHALL разрешать stats endpoints только loopback socket addresses и
SHALL NOT доверять `X-Forwarded-For`. При заданном password server SHALL требовать HTTP Basic
credentials `admin:<password>` и сравнивать secret безопасно; deployment SHALL использовать TLS
reverse proxy для удалённого доступа. Unauthorized ответ SHALL быть 401 без operational data. Stats
query failure SHALL вернуть 503 без stack trace и SHALL NOT влиять на gameplay rooms.

#### Scenario: Localhost открывает страницу без password

- **WHEN** password отсутствует и request socket имеет loopback address
- **THEN** server возвращает statistics page

#### Scenario: LAN-клиент открывает страницу без password

- **WHEN** password отсутствует и socket address не loopback, даже с loopback X-Forwarded-For
- **THEN** server возвращает 401 без room counts

#### Scenario: Удалённый оператор вводит password

- **WHEN** password настроен и request содержит правильный Basic credential
- **THEN** server возвращает страницу, а неправильный credential получает 401

#### Scenario: Driver statistics недоступна

- **WHEN** Colyseus room query завершается ошибкой
- **THEN** stats endpoint возвращает 503 без stack trace, а активная simulation продолжает ticks

### Requirement: Monitoring metadata остаётся компактной и актуальной

Каждая room SHALL публиковать только неперсональные metadata при create, status/membership/deadline
transition и SHALL удалять/переставать публиковать её при disposal. Concurrent updates SHALL быть
упорядочены или coalesced так, чтобы позднее завершившаяся старая запись не перезаписала новый
status. Stats page SHALL обновляться не чаще одного раза в 5 секунд; monitoring failure SHALL быть
изолирована от room lifecycle и gameplay authority.

#### Scenario: Combat переходит в intermission

- **WHEN** status быстро меняется combat → intermission во время предыдущей metadata write
- **THEN** следующий query наблюдает intermission, а не восстановленный stale combat

#### Scenario: Браузер держит stats page открытой

- **WHEN** page работает одну минуту
- **THEN** она выполняет не более 13 JSON requests и не создаёт gameplay WebSocket

### Requirement: Пресет переживает добавление новых настроек

Загрузка сохранённого пресета SHALL дополнять недостающие поля значениями по умолчанию на всех
уровнях документа, включая вложенные профили, а не переносить сохранённый объект целиком. Появление
новой настройки SHALL NOT приводить к отказу всего документа.

#### Scenario: Профиль сохранён до появления настройки

- **WHEN** сохранённый профиль не содержит поля, добавленного в схему позже
- **THEN** пресет загружается, недостающее поле берётся из значений по умолчанию, а остальные
  настройки пресета — включая таблицу волн — сохраняются

### Requirement: Непригодный пресет не пропадает молча

Если сервер не смог использовать сохранённый пресет, он SHALL сохранить копию исходного файла рядом
прежде, чем перейти на встроенные значения, и SHALL назвать в предупреждении конкретные поля, из-за
которых проверка не прошла. Консоль после такого перехода показывает встроенные значения, поэтому
сохранение из неё SHALL NOT быть единственной копией работы оператора.

#### Scenario: Пресет не прошёл проверку

- **WHEN** сохранённый пресет не проходит проверку схемы
- **THEN** рядом остаётся копия исходного файла, а предупреждение называет поля, на которых проверка
  упала

#### Scenario: Пресет не может вести симуляцию

- **WHEN** пресет проходит схему, но не годится для симуляции
- **THEN** копия исходного файла точно так же остаётся рядом

### Requirement: Оружие игрока берёт вид из каталога

Пресет SHALL хранить вид орудия на корпусе и отдельный вид снаряда для каждого ствола игрока. Каждый
из них SHALL быть необязательным: без выбора отрисовка остаётся прежней. Орудие SHALL рисоваться
поверх корпуса и поворачиваться вместе с углом наведения. Снаряд SHALL брать вид того ствола, из
которого вылетел, чтобы очередь из пушки и очередь из пулемёта различались на экране.

#### Scenario: Выбраны разные снаряды

- **WHEN** оператор задал разный вид снарядам пушки и пулемёта
- **THEN** выстрелы двух стволов рисуются разными силуэтами

#### Scenario: Вид не выбран

- **WHEN** ни один из трёх видов не выбран
- **THEN** орудие и снаряды рисуются прежними примитивами

### Requirement: Превью корабля показывает выбранное орудие

Превью корабля в консоли SHALL рисовать выбранное орудие поверх корпуса и SHALL называть его. Выбор
орудия SHALL менять саму картинку, а не только подпись: иначе рабочая настройка неотличима от
сломанной.

#### Scenario: Орудие выбрано

- **WHEN** оператор выбирает орудие на вкладке игрока
- **THEN** в превью поверх корпуса появляется его силуэт

### Requirement: Точка вращения орудия настраивается

Вид орудия SHALL нести смещение картинки в долях радиуса корпуса. Смещение SHALL двигать рисунок
орудия и SHALL NOT двигать точку, вокруг которой орудие поворачивается: она остаётся центром
корабля. Превью SHALL применять то же смещение, что и бой, иначе подогнанное в консоли не совпадёт с
тем, что увидит экипаж.

#### Scenario: Крепление ассета не в начале координат

- **WHEN** оператор задаёт смещение выбранному орудию
- **THEN** силуэт орудия сдвигается, а вращается оно по-прежнему вокруг центра корабля

#### Scenario: Орудие выбрано до появления смещения

- **WHEN** пресет несёт орудие, сохранённое до того, как смещение появилось
- **THEN** орудие сохраняет выбор и масштаб и рисуется без смещения, как рисовалось раньше

### Requirement: Оружие крепится не только по центру

Вид орудия SHALL нести точку крепления в долях радиуса корпуса, отсчитываемую от центра корабля.
Крепление SHALL задаваться в системе координат корпуса и SHALL поворачиваться вместе с ним, чтобы
оружие, вынесенное на крыло, оставалось на этом крыле при любом курсе. Орудие SHALL вращаться вокруг
своего крепления, а смещение рисунка SHALL отсчитываться от него же. Нулевое крепление SHALL
оставлять оружие по центру корабля.

#### Scenario: Оружие вынесено на крыло

- **WHEN** оператор задаёт орудию ненулевое крепление и корабль разворачивается
- **THEN** орудие остаётся на той же точке корпуса и вращается вокруг неё

#### Scenario: Крепление не задано

- **WHEN** крепление нулевое
- **THEN** орудие стоит и вращается в центре корабля
