---
name: codex-visual
description:
  Codex CLI as an independent visual consultant for SpaceShip Defender development — a UI/UX concept
  before a substantial interface change, an audit of real screenshots after it, a comparison with a
  reference, and raster image generation or editing. Use before and after substantial UI work, when
  a new raster asset is needed, or when the user asks to consult Codex.
---

# Codex as a visual consultant (development)

Adopted by the operator on 2026-09-13 for development work. Claude Code is the executor and makes
the final decisions. Codex is an independent consultant for:

- UI/UX analysis;
- checking the real layout from screenshots;
- comparing an implementation with a reference;
- generating and editing raster images;
- finding visual defects after implementation.

Codex's recommendations are never applied automatically. Claude checks each one against the active
OpenSpec change, `docs/CODE_STYLE.md`, `AGENTS.md` and the existing style, then tells the user what
was taken, what was rejected, and why.

## Availability

Before the first call in a session:

```bash
codex login status
codex exec -C . --ephemeral --sandbox read-only 'Ответь только: CODEX_CLI_OK'
```

If Codex is unavailable, continue alone and tell the user that the extra check did not happen.

Checked on this machine on 2026-09-13: `codex-cli 0.154.0`. `exec` accepts `-i/--image`,
`-s/--sandbox`, `-C`, `--ephemeral` and `-o/--output-last-message`, and the `image_generation`
feature is `stable` and enabled. A trial `$imagegen` call with `--sandbox workspace-write` and `-C`
pointed at an empty folder wrote exactly the one requested file: a 256×256 RGBA PNG of an asteroid
on a transparent background. For a folder outside a git repository, add `--skip-git-repo-check`.

## Rules

- **Sandbox.** Consultations and audits run with `--sandbox read-only`. Image generation and editing
  run with `--sandbox workspace-write`.
- **Secrets.** Codex may read local dev-stand credentials: `.env`, `.env.local`, and the admin
  passwords of a `pnpm dev` stand. That is the operator's decision of 2026-09-13. Codex never gets
  production credentials: not the host environment behind `docker-compose.prod.yml`, not deploy
  secrets, and nothing from the production setup in `docs/DEPLOYMENT.md`. `read-only` blocks writes,
  not reads, so this rule is kept by what Claude hands over and where Codex is pointed.
- **No code edits.** Codex does not change code during a consultation or an audit.
- **Where generated files go.** Only into the agreed folder:
  - art only the display draws: `apps/display/public/generated/<name>.png`;
  - art more than one app draws — catalogue sprites the console previews, HUD frames, backdrops:
    `packages/sprite-assets/sources/<kind>/<id>.png`, then `pnpm sprites:build`. This follows the
    `codebase-structure` requirement «Запечённые ассеты живут данными в общем пакете».
- **Before wiring in.** Claude looks at every generated file (Read) before using it. The operator
  confirms the art may be committed, because the repository is public.
- **Integration.** Once Codex has answered, Claude decides and does the integration itself.
- **When to call.** Not for every small edit: substantial visual decisions and the final check.
- **Running a call.** Calls take minutes, so run them in the background and keep working on
  independent tasks.
  - Save the answer with `-o <scratchpad>/codex-<topic>.md` and redirect the log.
  - Summarise the answer for the user; do not paste it.
- **Cost** (operator's decision of 2026-09-13, after one consultation used 243 972 tokens). The
  account's default is `model_reasoning_effort = "high"` in `~/.codex/config.toml`, so:
  - consultations and audits pass `-c 'model_reasoning_effort="medium"'`; `high` is kept for the
    final audit of a finished UI task;
  - inputs stay narrow: images scaled down to at most 1024 px on the long side, files named in a
    list rather than "read the change in full", one topic per call;
  - the token count is at the end of the log (`tokens used`): report it with the answer.
- **Model.** The account default is `gpt-5.6-sol`; `gpt-5.6-terra` is also available (`-m`). One
  side-by-side run on 2026-09-13 — the same narrow visual task (find the pause button's rectangle on
  a HUD frame), both at `medium` — came out even: both rectangles removed the button and its glow
  without touching the neighbouring bars. Sol left a safer margin (≈14 px against ≈2 px) in 23 s and
  7 716 tokens; Terra took 17 s and 8 100 tokens. One sample decides nothing: keep Sol by default
  and compare again on a design consultation before switching.

## Screenshots in this loop

For a substantial UI task in this loop, screenshots of the running app are in scope. This overrides
the "unrequested screenshot loops" exclusion in `CLAUDE.md`, and only for this loop.

- Take them through the Playwright MCP session (see the `browser-playwright` skill).
- Save them under `.playwright-mcp/`, which is gitignored.
- One screenshot per target screen: the 1920×1080 shared display, a 1366×768 desktop, and an 844×390
  phone in landscape with the solo cockpit.

## Command templates

### Interface design

Before implementing a substantial interface:

```bash
codex exec -C . --ephemeral --sandbox read-only -o <scratchpad>/codex-design.md '
Изучи требования задачи (openspec/changes/<change>/) и существующую реализацию проекта.
Выступи как независимый UI/UX-консультант.
Не изменяй файлы.

Предложи:
1. композицию экрана;
2. визуальную иерархию;
3. состояния элементов;
4. поведение на разных размерах экрана;
5. возможные проблемы доступности и управления;
6. конкретные рекомендации для реализации.

Claude Code примет окончательное решение.
'
```

With the answer in hand, Claude:

1. Matches the recommendations against the product requirements.
2. Picks the useful ones.
3. Rejects the ones that do not fit.
4. Implements the final version itself.

### Checking the real layout

Take the screenshot first (see above), then:

```bash
codex exec -C . --ephemeral --sandbox read-only -o <scratchpad>/codex-audit.md '
Проанализируй приложенный скриншот реального интерфейса.
Не изменяй файлы.

Проверь:
- композицию;
- визуальную иерархию;
- отступы и выравнивание;
- размеры элементов;
- типографику;
- контраст и читаемость;
- состояния кнопок и элементов управления;
- признаки переполнения или обрезки;
- удобство интерфейса на целевом экране.

Раздели замечания на:
1. Critical;
2. Important;
3. Optional.

Для каждого замечания укажи проблему и конкретное исправление.
Финальное решение принимает Claude Code.
' -i .playwright-mcp/ui-current.png
```

Pass the prompt before `-i`: the image flag takes several files, and a prompt placed after it can be
read as one more file name.

### Comparison with a reference

```bash
codex exec -C . --ephemeral --sandbox read-only -o <scratchpad>/codex-compare.md '
Изображение 1 — текущая реализация.
Изображение 2 — визуальный референс.

Сравни композицию, пропорции, цвета, типографику, отступы,
визуальную иерархию и общее настроение.

Перечисли существенные расхождения.
Не требуй слепого копирования референса.
Не изменяй файлы.
Предложи улучшения для рассмотрения Claude Code.
' -i .playwright-mcp/ui-current.png -i <reference.png>
```

### Generating an image

```bash
codex exec -C . --ephemeral --sandbox workspace-write -o <scratchpad>/codex-imagegen.md '
$imagegen Создай оригинальный визуальный ассет для SpaceShip Defender.

Назначение: [описать назначение].
Содержание: [описать объект или сцену].
Стиль: псевдо-3D космическая графика, рассчитанная на 2D-игру.
Композиция: [описать композицию].
Размер и формат: [указать размер и PNG/WebP].
Фон: [прозрачный или описать фон].
Ограничения: без логотипов, водяных знаков и лишнего текста.

Сохрани результат строго в:
[папка по правилу «Where generated files go»]/[имя-файла].png

Не изменяй исходный код, конфигурацию и другие файлы.
В конце перечисли созданные файлы.
'
```

Claude checks the result before connecting it to the app.

### Editing an existing image

```bash
codex exec -C . --ephemeral --sandbox workspace-write -o <scratchpad>/codex-imageedit.md '
$imagegen Отредактируй приложенное изображение.

Измени только:
[перечислить необходимые изменения].

Обязательно сохрани:
[перечислить неизменяемые элементы].

Сохрани результат в:
[папка по правилу «Where generated files go»]/[имя-файла].png

Не изменяй код и другие файлы.
' -i <source.png>
```

## The visual loop for a substantial UI task

1. Claude studies the requirements and the existing code.
2. Codex proposes an independent visual concept.
3. Claude makes the final decision.
4. Claude implements the interface.
5. Claude runs the app and takes screenshots.
6. Codex audits the screenshots.
7. Claude fixes the confirmed problems.
8. If needed, Codex generates images.
9. Claude integrates the chosen assets.
10. Claude takes final screenshots and checks the result.
11. Claude runs the tests (`pnpm check`) and reports to the user.

Codex consults and produces visual material. Claude answers for the decisions, the code, the
architecture, responsiveness, accessibility, integration and the final quality.
