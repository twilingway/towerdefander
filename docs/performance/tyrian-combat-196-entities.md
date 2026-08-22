# Tyrian combat: benchmark комнаты при 196 сущностях

Команда воспроизведения:

```text
pnpm benchmark:combat
```

Harness создаёт детерминированное состояние, полностью заполняющее утверждённые лимиты комнаты: 40
кораблей, 16 астероидов, 96 вражеских снарядов, 12 самонаводящихся ракет и 32 дружественных снаряда.
После 250 прогревочных шагов измеряются 2000 одинаковых чистых fixed-step и 2000 переключений
Colyseus schema между соседними состояниями. Это ручной reference benchmark, а не переносимый
CI-порог.

## Reference run — 22 августа 2026

- CPU: AMD Ryzen 9 5900X 12-Core Processor, 12 logical CPUs;
- RAM: 63.93 GiB;
- OS: Windows `win32 10.0.26200 x64`;
- Node.js: `v22.22.1`;
- fixed step: 50 ms;
- pure fixed-step: p50 `0.0510 ms`, p95 `0.1230 ms`, max `0.8779 ms`;
- schema sync: p50 `0.1569 ms`, p95 `0.1820 ms`, max `0.5488 ms`;
- combined room fixed-step и schema sync: p50 `0.2056 ms`, p95 `0.2723 ms`, max `0.6114 ms`;
- полный display snapshot: `19012 bytes`;
- patch только с latency/tick: `15 bytes`;
- patch движущихся сущностей: `5103 bytes`.

Pure fixed-step p95 укладывается в утверждённый ориентир `≤ 2 ms`. Результат зависит от фоновой
нагрузки, версии Node.js и CPU; при изменении core, schema или лимитов нужно повторить команду и
добавить новый датированный reference run, не затирая предыдущий.
