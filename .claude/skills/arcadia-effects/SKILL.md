---
name: arcadia-effects
description:
  Authoring particle effects in the Arcadia Effects editor and baking them into the committed sprite
  atlases of packages/fx-assets. Use when adding or retuning a visual effect, when running `pnpm
  fx:bake` or `pnpm fx:editor`, or when consuming a baked atlas in the display or the balance
  console.
---

# Arcadia Effects

Полный текст скилла — `.agents/skills/arcadia-effects/SKILL.md` (общий с остальными агент-раннерами
репозитория). **Читать его перед авторингом или перезапеканием эффекта** — здесь только границы,
которые решают, можно ли трогать вообще.

- Редактор подключён git submodule-ом в `tools/arcadia-effects` (папка внутри — `Arcada Effects`, с
  пробелом). Это **не npm-пакет**: `package.json` у него нет. После клона —
  `git submodule update --init --recursive`.
- **Файлы submodule не редактируются никогда.** Он движок рендера, не наш код.
- Исходники эффектов — `packages/fx-assets/effects/*.json`, метаданные для консоли —
  `effects/catalogue.json`. В `library/` submodule-а мы не пишем: запекание передаёт эффект
  объектом.
- `atlases/*` и `src/manifest.ts` — **генерируются** `pnpm fx:bake`. Правки руками смоет следующая
  сборка, и `scripts/bake-fx-atlases.node-test.mjs` их поймает.
- `doc.id` и `id` каждого слоя задаются явно и не меняются между итерациями; имена и данные —
  по-английски, русский только в `catalogue.json`.
- Направленный эффект авторится смотрящим **вверх (`-Y`)**, источник на нижней кромке композиции. На
  стороне Phaser это `origin (0.5, 1)` и `rotation = heading - PI/2` (`EXHAUST_ROTATION_OFFSET`).
- `pnpm fx:editor` берёт прошитый порт 5179 и конфликтует с `pnpm dev`, который дополз до него
  авто-инкрементом. `pnpm fx:bake` чужой сервер не поднимает — раздаёт статику сам на 35179.

Рядом: `.claude/skills/phaser-display/SKILL.md` — правила рендера, куда попадает атлас;
`.claude/skills/browser-playwright/SKILL.md` — как смотреть на канву в браузере.
