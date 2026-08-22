## ADDED Requirements

### Requirement: Между waves каждая роль получает собственный выбор

После исчерпания wave spawn plan и уничтожения всех enemy ships/asteroids core SHALL удалить все
friendly/hostile projectiles и missiles, neutralize role controls, выключить shield и перейти в
`intermission` на ровно 200 fixed steps. Pilot, gunner и shield SHALL получить по три role-specific
offers с stable `offerId`, `upgradeId` и preview. Combat transforms/collisions/fire SHALL быть
заморожены, а inactive shield energy SHALL восстанавливаться обычной скоростью. Offers SHALL
принадлежать трём role slots, даже если connection временно отсутствует, и SHALL быть различными
внутри одной role.

#### Scenario: Wave закончилась

- **WHEN** spawn plan исчерпан и последняя enemy/asteroid уничтожена
- **THEN** encounter становится intermission, countdown равен 200 ticks и каждая занятая role видит
  только свои три offers

#### Scenario: Игрок не сделал выбор

- **WHEN** intermission deadline достигнут, а role не имеет selection
- **THEN** server применяет первую опубликованную card этой role и начинает следующую wave с neutral
  controls

#### Scenario: Все роли выбрали раньше срока

- **WHEN** pilot, gunner и shield имеют accepted selection до deadline
- **THEN** cards блокируются, но следующая wave начинается только после полного 200-tick deadline

### Requirement: Upgrade choice строго авторизован и идемпотентен

Strict `upgrade:choose` SHALL содержать protocolVersion 8, roomId, playerId, UUID `actionId`,
`waveNumber`, `offerId` и `upgradeId`. Server SHALL вывести actor из connection и проверить strict
envelope/identity, затем duplicate action fingerprint, затем assigned role, intermission/current
wave, own offer и existing selection до mutation. Selection SHALL атомарно применить ровно один
modifier и сохранить outcome. Journal SHALL хранить последние 32 action fingerprints/outcomes на
player identity, переживать reconnect и удаляться при окончательной замене identity. Evicted action
со старым offer SHALL оставаться неприменимым.

#### Scenario: Выбор доставлен дважды

- **WHEN** accepted command повторяется с тем же actionId и fingerprint
- **THEN** accepted duplicate молчит/остаётся видимым в authoritative selection, rejected business
  duplicate повторяет прежнюю actor-only error, а modifier не применяется второй раз

#### Scenario: Accepted выбор повторён после начала combat

- **WHEN** ранее accepted exact actionId/fingerprint повторяется после завершения intermission
- **THEN** journal replay выполняется до phase check, transport молчит и modifier не применяется
  второй раз

#### Scenario: ActionId использован с другим upgrade

- **WHEN** известный actionId повторяется с другим offerId либо upgradeId
- **THEN** server возвращает `action_conflict`, не перезаписывает journal и не меняет modifiers

#### Scenario: Gunner выбирает offer pilot

- **WHEN** gunner отправляет schema-valid command с pilot offerId
- **THEN** server возвращает `role_mismatch` и не записывает selection

#### Scenario: Старый offer повторён в следующей wave

- **WHEN** command с уже истёкшим offerId отсутствует в bounded journal и приходит в новой
  intermission
- **THEN** server возвращает `action_not_available`, а старый upgrade не применяется

#### Scenario: Роль уже выбрала другой upgrade

- **WHEN** controller отправляет новый actionId для той же role/wave после accepted selection
- **THEN** server возвращает `already_chosen` и modifiers не меняются

#### Scenario: Display пытается выбрать upgrade

- **WHEN** display отправляет strict `upgrade:choose`
- **THEN** server возвращает `not_controller` и offers/modifiers не меняются

### Requirement: Role modifiers сохраняются внутри run

Applied upgrade SHALL принадлежать role slot, складываться только по validated rules и изменять
соответствующий authoritative config/state со следующей combat wave. Reconnect и replacement SHALL
получать уже применённые role modifiers и current selection. Upgrade SHALL NOT переноситься в новую
room или менять другую role.

#### Scenario: Gunner reconnect после выбора

- **WHEN** gunner выбрал damage upgrade и восстановился в grace period
- **THEN** controller видит тот же selection/modifier, а следующий projectile использует upgraded
  damage без повторного command

#### Scenario: Shield заменён новым игроком

- **WHEN** shield identity истекла после нескольких upgrades и replacement занимает role
- **THEN** replacement наследует role modifiers/current offer state, но не старый action journal
