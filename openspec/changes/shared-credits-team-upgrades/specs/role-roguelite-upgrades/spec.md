## MODIFIED Requirements

### Requirement: Между waves каждая роль получает собственный выбор

После исчерпания wave spawn plan и уничтожения всех enemy ships/wave asteroids core SHALL удалить
все friendly/hostile projectiles и missiles, neutralize role controls, выключить shield и перейти в
`intermission` на ровно 600 fixed steps. Core SHALL создать один общий offer со stable `offerId` и
ровно тремя cards в порядке pilot, gunner, shield: по одной deterministic role-specific card с
`upgradeId`, preview и price 5 credits. Combat transforms/collisions/fire SHALL быть заморожены, а
inactive shield energy SHALL восстанавливаться обычной скоростью. Display и все controllers SHALL
видеть одинаковый offer, общий balance и текущий vote каждого role slot даже при временно
отсутствующей connection.

#### Scenario: Wave закончилась

- **WHEN** spawn plan исчерпан и последняя обязательная wave-угроза уничтожена
- **THEN** encounter становится intermission, countdown равен 600 ticks и клиенты видят три общие
  role cards с price 5

#### Scenario: Игроки не голосовали

- **WHEN** intermission deadline достигнут без единого vote
- **THEN** purchase пропускается и следующая wave начинается с neutral controls и прежними credits

#### Scenario: Голоса разделились

- **WHEN** deadline достигнут с голосами 1–1–1
- **THEN** выигрывает самая ранняя из проголосованных cards в опубликованном порядке

#### Scenario: Все проголосовали раньше срока

- **WHEN** pilot, gunner и shield отправили accepted votes до deadline
- **THEN** votes остаются изменяемыми, а resolution и следующая wave происходят только после полного
  600-tick deadline

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
