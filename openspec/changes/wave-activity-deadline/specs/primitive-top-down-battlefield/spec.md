## ADDED Requirements

### Requirement: Display показывает срок волны и точную причину поражения

Во время combat общий display SHALL показывать минуты и секунды до authoritative wave deadline. При
timeout result display SHALL явно сообщать «Время волны истекло», а при уничтожении hull SHALL
сохранять сообщение об уничтожении корабля.

#### Scenario: Экипаж видит countdown

- **WHEN** display показывает активную combat wave
- **THEN** HUD содержит номер волны и server-authoritative время до её провала

#### Scenario: Волна провалена по времени

- **WHEN** display получает frozen defeat с `defeatReason=wave_timeout`
- **THEN** result overlay показывает причину timeout, итоговую волну, счёт и готовность к rematch
