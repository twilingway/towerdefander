## ADDED Requirements

### Requirement: Score и credits являются разными authoritative ресурсами

Server-owned core SHALL хранить нетратимый `score` и общий неотрицательный safe-integer `credits`.
Projectile kill либо active-shield interception SHALL однократно давать missile 5 score и asteroid
10 score. Gunship kill SHALL давать 2 credits, missile carrier kill 4 credits, wave asteroid kill
либо shield interception 1 credit. Missile и ambient asteroid SHALL давать 0 credits. Enemy score
SHALL сохранять текущие правила. Duplicate collision/removal SHALL NOT повторять reward.

#### Scenario: Ракета сбита пушкой

- **WHEN** friendly projectile уничтожает homing missile
- **THEN** score увеличивается на 5, credits не меняются, missile удаляется один раз

#### Scenario: Ракета перехвачена щитом

- **WHEN** active shield блокирует homing missile
- **THEN** score увеличивается на 5, credits не меняются и hull не получает её damage

#### Scenario: Wave asteroid остановлен щитом

- **WHEN** active shield блокирует asteroid с `origin=wave`
- **THEN** score увеличивается на 10 и credits на 1 ровно один раз

#### Scenario: Ambient asteroid уничтожен

- **WHEN** projectile либо shield удаляет asteroid с `origin=ambient`
- **THEN** score увеличивается на 10, а credits не меняются

### Requirement: Командная покупка списывает общий баланс атомарно

В одном intermission core SHALL применить не более одного team upgrade стоимостью 5 credits.
Resolution SHALL сначала определить winning card, затем проверить balance, затем одной transition
списать price и применить соответствующий role modifier. При отсутствии голосов или недостаточном
balance SHALL не быть ни списания, ни modifier. Credits SHALL переноситься между waves и
сбрасываться вместе со score/modifiers при новом run/rematch.

#### Scenario: Победившая карта доступна по балансу

- **WHEN** deadline достигнут, winning card стоит 5 и balance равен 7
- **THEN** balance становится 2 и ровно один modifier применяется со следующей combat wave

#### Scenario: Монет недостаточно

- **WHEN** winning card стоит 5, а balance равен 4
- **THEN** purchase пропускается, balance остаётся 4 и modifiers не меняются

#### Scenario: Начат rematch

- **WHEN** result переходит в новый clean run
- **THEN** score, credits, offer, votes, selection и modifiers возвращаются к начальным значениям
