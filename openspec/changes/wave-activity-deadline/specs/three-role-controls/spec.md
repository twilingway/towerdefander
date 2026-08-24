## ADDED Requirements

### Requirement: Controllers показывают срок волны и точную причину поражения

Каждый role controller SHALL во время combat показывать тот же authoritative wave countdown, что и
display. Terminal panel SHALL различать `spaceship_destroyed` и `wave_timeout`, сохраняя
существующий unanimous rematch flow.

#### Scenario: Все роли видят один срок

- **WHEN** pilot, gunner и shield подключены к одной combat wave
- **THEN** каждый controller получает и показывает один server-owned остаток времени волны

#### Scenario: Timeout не мешает rematch

- **WHEN** controller получает result с `defeatReason=wave_timeout`
- **THEN** panel сообщает об истечении времени и позволяет отправить обычный rematch ready один раз
