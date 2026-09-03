## MODIFIED Requirements

### Requirement: Spaceship и enemy ships полностью остаются в арене

Для spaceship и каждого enemy ship расстояние его center до arena center плюс entity radius SHALL
быть не больше arenaRadius. Если fixed-step candidate выходит наружу, core SHALL спроецировать
center на legal circle, удалить только направленную наружу radial component velocity и сохранить
tangent либо направленную внутрь component. Enemy ship SHALL NOT удаляться boundary cleanup.

Внутри legal circle у края SHALL существовать упругая полоса заданной ширины. Пока center spaceship
находится в ней, core SHALL добавлять направленное внутрь ускорение, растущее с глубиной захода и с
направленной наружу скоростью, поэтому корабль SHALL терять скорость постепенно и возвращаться
внутрь сам. Проекция на окружность SHALL оставаться страховкой инварианта, а не обычным путём
остановки. Упругая полоса SHALL применяться только к spaceship: у enemy ship своя обработка рима.

#### Scenario: Pilot движется наружу по диагонали

- **WHEN** spaceship у diagonal rim имеет velocity с outward и tangent components
- **THEN** весь body остаётся внутри circle, outward component становится нулевой, tangent
  сохраняется и snapshot не выходит за legal radius

#### Scenario: Корабль входит в упругую полосу

- **WHEN** spaceship на полной скорости заходит в полосу у края
- **THEN** его скорость наружу гасится постепенно на протяжении нескольких tick, шаг за tick не
  становится нулевым скачком, а корабль остаётся внутри legal circle

#### Scenario: Чем быстрее заход, тем сильнее возврат

- **WHEN** два корабля заходят в полосу с разной скоростью наружу
- **THEN** направленное внутрь ускорение у более быстрого больше

#### Scenario: Enemy отступает от spaceship у края

- **WHEN** chase AI много fixed steps рассчитывает outward retreat/orbit у arena rim
- **THEN** enemy полностью остаётся внутри, не удаляется и продолжает tangential движение

#### Scenario: Цель возвращается к центру

- **WHEN** constrained enemy получает следующий AI direction внутрь arena
- **THEN** inward component применяется и enemy уходит от boundary без teleport
