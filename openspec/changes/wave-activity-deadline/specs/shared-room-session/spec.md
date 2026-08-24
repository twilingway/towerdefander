## ADDED Requirements

### Requirement: Reconnect сохраняет authoritative wave deadline и причину результата

Current-protocol projections SHALL публиковать `waveSecondsRemaining` для combat и nullable
`defeatReason`. Controller/display transport SHALL NOT владеть таймером и SHALL NOT останавливать
или продлевать его. Reconnect SHALL получить остаток текущего server deadline либо frozen terminal
reason.

#### Scenario: Controller возвращается в combat

- **WHEN** controller reconnect завершается до истечения wave deadline
- **THEN** controller получает текущую wave, актуальный остаток секунд и продолжает тот же run

#### Scenario: Controller возвращается после timeout

- **WHEN** controller reconnect завершается во время result после wave timeout
- **THEN** controller получает frozen `defeat/wave_timeout`, итоговый счёт и текущие rematch votes

#### Scenario: Старый клиент пытается войти

- **WHEN** v12 display или controller подключается к v13 room
- **THEN** server отклоняет соединение существующей ошибкой `protocol_mismatch` до mutation state
