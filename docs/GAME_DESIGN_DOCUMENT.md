# SpaceShip Defender — Game Design Document

## 1. Концепция

**SpaceShip Defender** — кооперативный top-down space wave-defense про один развиваемый корабль. Три
игрока смотрят на общий большой экран и управляют разными системами корабля из браузеров своих
устройств:

- pilot отвечает за позиционирование, уклонение и носовой огонь;
- gunner направляет оружие и уничтожает угрозы;
- shield operator разворачивает и расходует directional energy shield.

Короткая формулировка продукта:

> Top-down space wave-defense с одним развиваемым кораблём, где игрок уничтожает волны противников,
> зарабатывает кредиты и непосредственно во время боя модернизирует корпус, щиты и систему
> вооружения.

## 2. Core experience

Команда постоянно выбирает между атакой, безопасной позицией и расходом энергии щита. Волны
нарастают, добавляют быстрые корабли, тяжёлые носители, астероиды, линейные снаряды и наводящиеся
ракеты. После поражения три игрока могут начать чистый новый run в той же комнате.

Текущая реализованная версия использует score и role-specific upgrades между волнами. Целевая
credits economy и покупки прямо во время боя требуют отдельного design: цены, источник credits,
идемпотентные purchase commands, pacing и controller UI пока не определены.

## 3. Роли

### Pilot

- WASD/arrows или virtual stick;
- мягкий разгон и торможение;
- уклонение от снарядов, ракет и астероидов;
- носовой пулемёт: стреляет вдоль текущего heading корабля (heading плавно доворачивается за
  направлением движения), hold-to-fire с накоплением тепла на каждый выстрел; перегрев блокирует
  огонь до остывания и rearm, поэтому пилот балансирует между манёвром и непрерывным огнём;
- будущие upgrades: speed, acceleration, hull и repair.

### Gunner

- absolute direction stick и плавный server-authoritative traverse;
- hold-fire с authoritative cooldown;
- повреждение enemy ships/asteroids и перехват ракет;
- будущие upgrades: damage, cooldown, projectile speed и новые weapon patterns.

### Shield operator

- направление shield arc независимо от его активности;
- ручной ON/OFF, drain/recharge и дополнительная стоимость перехвата;
- будущие upgrades: capacity, recharge, arc width и specialized shield effects.

## 4. Run loop

```text
combat wave
  → все угрозы уничтожены
  → короткий upgrade interval
  → следующая усиленная wave
  → spaceship HP достигает нуля
  → result / unanimous rematch или выход
```

Будущий economy change заменит или дополнит бесплатный interval выбором модернизаций за credits
непосредственно во время combat. До принятия этого change существующий loop остаётся authoritative.

## 5. Враги и угрозы

- `gunship`: держит дистанцию и стреляет линейными bullets;
- `missileCarrier`: запускает limited-turn homing missiles;
- `asteroid`: постоянно появляется во время combat с одной из случайных сторон круглой арены,
  пересекает её по seeded-траектории и наносит contact damage;
- будущие archetypes: swarm, sniper, charger, support, elite и bosses.

Enemy AI, spawn director, movement, collisions, damage, rewards и RNG принадлежат pure server-side
simulation. Display только интерполирует snapshots и рисует эффекты.

## 6. Визуальное направление

Цель — **2D pseudo-3D art + глубокие космические backgrounds + modern particles/shaders**.

Нужны:

- layered nebulae, distant stars, dust и parallax для ощущения масштаба;
- хорошо читаемый silhouette корабля и его систем сверху;
- светящиеся projectiles, engine trails, shield refraction, impacts и explosions;
- original art direction с performance fallback для слабых Android TV устройств.

Не нужны:

- настоящий 3D renderer;
- карта, навигация или интерфейс по образцу «Космических Рейнджеров»;
- торговля, диалоги, RPG и большая campaign map;
- копирование чужих assets или конкретного интерфейса.

От «Космических Рейнджеров» берётся только ощущение красивого глубокого космоса.

## 7. Multiplayer architecture

- server: authoritative Colyseus room `spaceship_defender`;
- protocol: strict versioned schemas, current target v12;
- core: deterministic 50 ms fixed step с explicit seeded randomness;
- world: server-authoritative circle `4400×4400`, radius `2200`; spaceship и enemy ships не могут
  покинуть арену, а transient hazards удаляются только за внешней circular envelope;
- display: React HUD + Phaser 2D/WebGL rendering;
- controllers: responsive React UI, intents only;
- reconnect, replacement, unanimous rematch и room TTL защищают session lifecycle.

## 8. Product boundaries

В ближайший art/economy этап не входят true 3D, trading/RPG, persistent accounts, MMO world,
процедурная campaign map и копирование существующей игры. Каждое существенное gameplay или protocol
изменение проходит отдельный OpenSpec lifecycle.
