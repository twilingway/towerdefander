## REMOVED Requirements

### Requirement: Wave campaign недоступна в первом flying-castle slice

**Reason**: Первый realtime slice завершён; утверждённый combat slice вводит полноценные waves.

**Migration**: Protocol-v8 clients используют новое требование
`Run выполняет бесконечные возрастающие waves` и encounter fields вместо отсутствующих v5 wave
fields.

Protocol v5 room SHALL NOT публиковать wave number, wave timer или enemy wave state.

#### Scenario: Active snapshot опубликован

- **WHEN** display получает active protocol v5 snapshot
- **THEN** snapshot не содержит wave fields

## ADDED Requirements

### Requirement: Run выполняет бесконечные возрастающие waves

Active protocol v8 run SHALL публиковать monotonic `waveNumber`, encounter phase и countdown. Wave 1
SHALL начаться при старте run; gunship и asteroid доступны с wave 1, missile carrier — не раньше
wave 3. Spawn budget, enemy HP и attack tempo SHALL монотонно увеличивать либо сохранять сложность
до validated saturation limits, не уменьшая difficulty следующей wave. Run SHALL быть бесконечным до
`defeated`; victory и boss wave в этом slice отсутствуют.

#### Scenario: Первая combat wave опубликована

- **WHEN** display получает первый active protocol v8 snapshot
- **THEN** snapshot содержит `waveNumber=1`, `encounterPhase=combat` и authoritative wave state

#### Scenario: Следующая wave сложнее

- **WHEN** intermission после wave N завершается
- **THEN** начинается wave N+1 с budget/HP/attack tempo не ниже wave N и в пределах validated caps

#### Scenario: Третья wave открывает carrier

- **WHEN** director строит spawn plan для wave 3
- **THEN** plan может детерминированно содержать missileCarrier, тогда как plans waves 1–2 его не
  содержат
