## Context

Core сейчас считает только score и создаёт три персональных бесплатных offers. Каждый выбор сразу
применяет modifier, а после 200 ticks отсутствующие решения получают fallback. Новый контракт должен
разделить результат и валюту, дать экипажу один общий выбор и сохранить server authority,
детерминизм, reconnect и idempotency.

## Goals / Non-Goals

**Goals:** отдельные score/credits, однократные rewards за projectile/shield interception,
30-секундный общий offer, изменяемые голоса трёх role slots, атомарное списание и один modifier.

**Non-Goals:** meta-wallet, сохранение между runs, in-combat shop, динамические цены, inventory и
leaderboard persistence.

## Decisions

### Pure core владеет rewards и resolution

Combat state получает `credits`, общий `teamUpgradeOffer`, role votes и итоговую purchase selection.
Collision resolution одновременно и детерминированно изменяет score/credits. Room только валидирует
actor/envelope, передаёт vote transition и публикует state; transport не рассчитывает награды.

### Нефармимые credits и независимый score

Missile даёт 5 score, asteroid 10 score независимо от projectile kill либо shield interception.
Credits начисляются только конечным wave targets: wave asteroid 1, gunship 2, missile carrier 4.
Ambient asteroids и missiles дают 0 credits, иначе carrier или ambient stream позволяют бесконечно
фармить кошелёк. Score остаётся соревновательным и не тратится.

### Один общий offer и resolution на fixed deadline

При входе в intermission core публикует три cards в стабильном порядке pilot→gunner→shield, по одной
детерминированно выбранной карте каждой роли, цена каждой 5 credits. Intermission всегда длится 600
ticks. На deadline побеждает максимальное число голосов, tie разрешает порядок cards. Нет голосов
или недостаточно credits — purchase отсутствует. Только тогда core списывает 5 и применяет один
modifier; early purchase отклонён, чтобы разные network latency не сокращали время обсуждения.

### Голос — idempotent role-owned command

Protocol v14 вводит `upgrade:vote` с UUID `actionId`, current run/wave/offer, `upgradeId` и positive
monotonic `revision`. Server проверяет connection identity и assigned role, затем journal replay,
phase/offer/card/revision. Exact duplicate не меняет state; conflict возвращает actor-only error;
revision не выше текущей игнорируется как stale. Vote принадлежит role slot, поэтому reconnect и
replacement видят его и могут отправить следующий revision.

### Общая projection без персональных StateView offers

Display и controllers получают одинаковые credits, offer, votes и purchase result. Mass combat
entities остаются display-only. Это упрощает обсуждение на общем экране и устраняет скрытый
controller-only offer lifecycle.

### UI pending следует authoritative acknowledgement

Controller считает card pending только до появления своего vote revision либо server error. Ошибка
явно очищает pending, позволяя повторить/изменить голос. UI не вычитает credits оптимистически.

## Risks / Trade-offs

- [Один upgrade за wave замедляет power growth] → цена/rewards фиксируются как MVP и позже проходят
  отдельный balance change.
- [1–1–1 tie выбирает card без большинства] → stable published order делает результат прозрачным и
  воспроизводимым; UI заранее сообщает правило.
- [Одновременные duplicate votes] → action journal + revision делают mutation упорядоченной, а
  списание происходит только системным resolution.
- [Breaking schema] → hard-cut v14, server/display/controllers разворачиваются одной сборкой.

## Migration Plan

1. Обновить protocol/core и тесты.
2. Обновить room schema/handler и оба client adapters.
3. Обновить browser/network flows и документацию.
4. Выкатывать все компоненты вместе; rollback — всей сборкой на v13. Existing rooms не мигрируют.

## Open Questions

Нет. Reward/price balance после MVP вынесен в отдельный change.
