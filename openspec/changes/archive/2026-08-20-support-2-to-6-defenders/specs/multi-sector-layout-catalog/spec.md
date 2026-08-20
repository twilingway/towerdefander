## ADDED Requirements

### Requirement: Display имеет раскладку для каждой вместимости

Display SHALL содержать code-native layout manifest для каждого `playerCapacity` от 2 до 6. Manifest
SHALL иметь ровно N записей с уникальными sectorId `0..N-1`; каждая запись SHALL содержать cubic
road, gate, tower, owner label и airstrike effect anchor. Координаты SHALL быть нормализованы
относительно logical canvas `1280x720`: `(0,0)` — верхний левый, `(1,1)` — нижний правый угол.

#### Scenario: Раскладки проходят валидацию

- **WHEN** каталог проверяется для capacity 2, 3, 4, 5 и 6
- **THEN** каждая раскладка содержит точное число уникальных полных sector entries

#### Scenario: Сервер публикует capacity

- **WHEN** display получает public room view с `playerCapacity=N`
- **THEN** он выбирает manifest N и не выводит дополнительные или отсутствующие дороги

### Requirement: Дорога согласована с воротами

Каждая cubic road SHALL начинаться не дальше 0.03 normalized units от любой внешней границы
zoomed-out композиции, завершаться в gate anchor своего сектора с coordinate tolerance `1e-6` и
SHALL отображать рост авторитетного progress движением к этим воротам. Критические gate, tower,
owner label и airstrike effect anchors SHALL оставаться внутри landscape safe area `x=0.03..0.97`,
`y=0.08..0.90`.

#### Scenario: Враг завершает путь

- **WHEN** display отображает врага с `progress=pathLength` в любом секторе раскладки 2..6
- **THEN** центр врага совпадает с gate anchor этого сектора с допустимой погрешностью рендера

#### Scenario: Камера визуально отдалена

- **WHEN** display показывает начало дороги при `progress=0`
- **THEN** дорога начинается у внешнего периметра сцены, а центральный замок и все N дорог видимы

#### Scenario: Размер landscape viewport меняется

- **WHEN** canvas масштабируется на desktop browser или Android TV WebView
- **THEN** все road, gate, tower и label anchors остаются видимыми без изменения layout topology

### Requirement: Раскладка не меняет симуляцию

Layout SHALL преобразовывать только отношение `progress/pathLength` в позицию на cubic road и SHALL
NOT изменять `pathLength`, speed, spawn step, damage или время симуляции.

#### Scenario: Разные визуальные длины

- **WHEN** один авторитетный snapshot отображается в двух допустимых manifests с разной экранной
  длиной кривой
- **THEN** игровой progress и время достижения ворот остаются одинаковыми
