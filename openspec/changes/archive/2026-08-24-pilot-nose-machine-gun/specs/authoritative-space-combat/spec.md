## ADDED Requirements

### Requirement: Носовые снаряды подчиняются общим правилам friendly projectiles

Снаряды носового пулемёта SHALL быть projectiles вида `friendly` со стабильной identity и monotonic
spawn sequence. Они SHALL участвовать в swept collision, damage, перехвате homing missiles и entity
caps на равных с снарядами пушки: 32 friendly projectile cap и 196 dynamic entities cap являются
общими для обоих оружий. Подавленная cap попытка MG fire SHALL очистить pending request и запустить
обычный MG cooldown без projectile и без будущего burst, как и подавленная попытка пушки.

#### Scenario: Носовой снаряд поражает цель

- **WHEN** swept path MG снаряда первым пересекает gunship либо asteroid
- **THEN** target теряет HP равный configured MG damage (8), снаряд удаляется — ровно по тем же
  правилам, что и снаряд пушки

#### Scenario: Носовой снаряд сбивает ракету

- **WHEN** swept path MG снаряда первым пересекает homing missile
- **THEN** обе entities удаляются без damage кораблю

#### Scenario: Общий cap подавляет оба оружия

- **WHEN** 32 friendly projectiles живы и на одном tick eligible к выстрелу и пушка gunner'а, и MG
  пилота
- **THEN** ни одно оружие не создаёт снаряд, оба pending request очищаются вместе со своими
  cooldowns, а после освобождения cap burst не происходит
