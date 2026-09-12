## ADDED Requirements

### Requirement: Combat controller использует landscape-first две зоны

Controller SHALL в landscape размещать role HUD над двумя доступными круглыми зонами: левый joystick
и правую action-zone, не требуя прокрутки для основного управления на типичном phone viewport не
меньше `640×360`. Portrait SHALL оставаться работоспособным вертикальным fallback, а desktop
keyboard/mouse SHALL сохраняться.

#### Scenario: Телефон повёрнут горизонтально

- **WHEN** combat controller имеет viewport `844×390`
- **THEN** левый joystick и правая action-zone одновременно видимы, не пересекаются и доступны без
  вертикальной прокрутки

#### Scenario: Телефон остался вертикальным

- **WHEN** combat controller имеет portrait viewport `390×844`
- **THEN** обе зоны располагаются вертикально либо компактной сеткой и остаются доступными

#### Scenario: Intermission заменяет боевые зоны

- **WHEN** encounter переходит из combat в intermission
- **THEN** continuous controls нейтрализуются, а voting/upgrade panel получает доступную область
  viewport без скрытых активных touch targets
