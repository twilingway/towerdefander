# role-roguelite-upgrades Specification

## Purpose

TBD - created by archiving change tyrian-combat-roguelite-slice. Update Purpose after archive.

## Requirements

### Requirement: Между waves каждая роль получает собственный выбор

После исчерпания wave spawn plan и уничтожения всех enemy ships/wave asteroids core SHALL удалить
все friendly/hostile projectiles и missiles, neutralize role controls, выключить shield и перейти в
`intermission` на ровно 600 fixed steps. Core SHALL создать один общий offer со stable `offerId` и
картами доступного тира дерева выбранного корпуса — от одной до четырёх — в порядке их описания в
пресете. Карта SHALL нести строковый `upgradeId` модуля, роль автора, собранную сервером подпись и
price 5 credits. Roles SHALL NOT владеть слотами оффера: любая роль голосует за любую карту тира.
Combat transforms/collisions/fire SHALL быть заморожены, а inactive shield energy SHALL
восстанавливаться обычной скоростью. Display и все controllers SHALL видеть одинаковый offer, общий
balance и текущий vote каждого role slot даже при временно отсутствующей connection.

#### Scenario: Wave закончилась

- **WHEN** spawn plan исчерпан и последняя обязательная wave-угроза уничтожена
- **THEN** encounter становится intermission, countdown равен 600 ticks и клиенты видят карты
  доступного тира с price 5

#### Scenario: Первый тир состоит из одной карты

- **WHEN** экипаж уходит в первую передышку, а первый тир дерева описан одним модулем
- **THEN** оффер состоит из одной карты, за неё голосуют все роли и ничья невозможна

#### Scenario: Игроки не голосовали

- **WHEN** intermission deadline достигнут без единого vote
- **THEN** purchase пропускается и следующая wave начинается с neutral controls и прежними credits

#### Scenario: Голоса разделились на широком тире

- **WHEN** deadline достигнут с голосами 1–1–1 на тире из четырёх карт
- **THEN** выигрывает самая ранняя из проголосованных cards в опубликованном порядке тира, и клиенты
  видят это правило подписью рядом с картами

#### Scenario: Все проголосовали раньше срока

- **WHEN** pilot, gunner и shield отправили accepted votes до deadline
- **THEN** votes остаются изменяемыми, а resolution и следующая wave происходят только после полного
  600-tick deadline

#### Scenario: Купленный тир не возвращается

- **WHEN** экипаж купил модуль и дошёл до следующей передышки
- **THEN** оффер состоит из карт следующего тира, а купленная карта в нём не встречается

### Requirement: Upgrade choice строго авторизован и идемпотентен

Strict `upgrade:vote` SHALL содержать current protocolVersion, roomId, playerId, runNumber, UUID
`actionId`, `waveNumber`, `offerId`, `upgradeId` и positive monotonic `revision`. Server SHALL
вывести actor из connection и проверить strict envelope/identity, затем duplicate action
fingerprint, assigned role, intermission/current wave, общий offer/card и revision до mutation.
Accepted vote SHALL заменить только vote actor role и SHALL NOT списывать credits либо применять
modifier до deadline. Journal SHALL хранить последние 32 action fingerprints/outcomes на player
identity, переживать reconnect и удаляться при окончательной замене identity.

#### Scenario: Голос доставлен дважды

- **WHEN** accepted command повторяется с тем же actionId и fingerprint
- **THEN** exact duplicate не меняет vote/revision и не может привести к повторному списанию

#### Scenario: ActionId использован с другим upgrade

- **WHEN** известный actionId повторяется с другим offerId, upgradeId либо revision
- **THEN** server возвращает `action_conflict`, не перезаписывает journal и не меняет vote

#### Scenario: Роль меняет голос

- **WHEN** actor отправляет новую card того же offer с revision выше текущей
- **THEN** server заменяет прежний vote actor role без изменения credits/modifiers

#### Scenario: Старый revision пришёл позже

- **WHEN** command имеет revision не выше authoritative revision role vote
- **THEN** server возвращает `stale_action` либо эквивалентный actor-only error и сохраняет новый
  vote

#### Scenario: Старый offer повторён в следующей wave

- **WHEN** command истёкшего offer отсутствует в journal и приходит в новой intermission
- **THEN** server возвращает `action_not_available`, а vote/purchase не меняются

#### Scenario: Display пытается голосовать

- **WHEN** display отправляет strict `upgrade:vote`
- **THEN** server возвращает `not_controller` и economy state не меняется

### Requirement: Ship stats сохраняются внутри run

Applied upgrade SHALL принадлежать role slot, применяться только по validated rules и изменять
authoritative ship stats со следующей combat wave. Reconnect и replacement SHALL получать уже
применённые stats и current selection. Upgrade SHALL NOT переноситься в новую room или менять другую
role.

Эффект модуля SHALL быть данными: цель из закрытого списка полей корабля, класс операции и число.
Ship stats SHALL считаться от базовых значений прогона и **всех** купленных модулей сразу, а не
наращиваться по одному: сложения складываются, проценты складываются между собой, множители
перемножаются. Поэтому результат SHALL NOT зависеть от порядка покупок. Пересчёт SHALL происходить
на покупке, а не на каждом шаге симуляции.

Симуляция SHALL читать статы корабля только из authoritative state. Производные величины, которые
видит клиент, SHALL считаться из тех же статов, что использует симуляция, поэтому щит SHALL
блокировать ровно ту дугу, которую рисует дисплей.

Изменение максимума корпуса SHALL чинить корабль ровно на прирост и SHALL NOT убивать его при
уменьшении; текущие энергия щита и нагрев стволов SHALL переклампливаться по новым ёмкостям.

#### Scenario: Gunner reconnect после выбора

- **WHEN** gunner выбрал damage upgrade и восстановился в grace period
- **THEN** controller видит тот же selection, а следующий projectile использует upgraded damage без
  повторного command

#### Scenario: Shield заменён новым игроком

- **WHEN** shield identity истекла после нескольких upgrades и replacement занимает role
- **THEN** replacement наследует ship stats и current offer state, но не старый action journal

#### Scenario: Те же модули куплены в другом порядке

- **WHEN** экипаж покупает один и тот же набор модулей в другом порядке
- **THEN** статы корабля совпадают до последнего бита

#### Scenario: Модуль увеличил максимум корпуса

- **WHEN** куплен модуль, поднимающий максимум корпуса на 25
- **THEN** текущее здоровье растёт ровно на 25 и не превышает новый максимум

#### Scenario: Модуль уменьшил ёмкость щита ниже текущей энергии

- **WHEN** после покупки ёмкость щита оказывается ниже накопленной энергии
- **THEN** энергия подрезается до новой ёмкости, а щит не ломается
