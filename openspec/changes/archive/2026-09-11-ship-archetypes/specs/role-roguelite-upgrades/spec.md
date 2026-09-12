# role-roguelite-upgrades

## MODIFIED Requirements

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
