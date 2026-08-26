// Kept in its own module so balance schemas can read the asset ids without
// importing the protocol barrel, which would leave these constants in the
// temporal dead zone. Pure data: no zod, no rendering, no DOM.
//
// The geometry is ported verbatim from the standalone Phaser prototype, down to
// the one-letter constructors, so the two stay diffable line by line. Assets are
// drawn in absolute units around their own nominal `radius` and point nose-up;
// normalising to an entity radius and turning the nose along +X belongs to the
// renderer, not to the data.

export const VISUAL_PALETTE = {
  body: 0x26384f,
  body2: 0x354c68,
  dark: 0x07101d,
  edge: 0xa9c7da,
  trim: 0x6f8fab,
  engine: 0xff7838,
  hot: 0xffd166,
  white: 0xeaf8ff,
  cyan: 0x4de7e2,
  red: 0xff476f,
  yellow: 0xffd34d,
  orange: 0xff8b3d,
  purple: 0xb47cff,
  green: 0x56e39f
} as const;
export type VisualPaletteKey = keyof typeof VISUAL_PALETTE;

/** A palette key, the per-asset accent, or a literal 0xrrggbb value. */
export type VisualColor = VisualPaletteKey | "accent" | number;

export type VisualPoint = readonly [number, number];

interface VisualLayerBase {
  readonly stroke: VisualColor;
  readonly width: number;
  readonly alpha: number;
}

export interface VisualPolygonLayer extends VisualLayerBase {
  readonly t: "poly";
  readonly pts: readonly VisualPoint[];
  readonly fill: VisualColor;
}
export interface VisualRectLayer extends VisualLayerBase {
  readonly t: "rect";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fill: VisualColor;
}
/** A rectangle rotated about its own centre by `a` radians. */
export interface VisualRotatedRectLayer extends VisualLayerBase {
  readonly t: "rrect";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly a: number;
  readonly fill: VisualColor;
}
export interface VisualCircleLayer extends VisualLayerBase {
  readonly t: "circle";
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly fill: VisualColor;
}
export interface VisualEllipseLayer extends VisualLayerBase {
  readonly t: "ellipse";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fill: VisualColor;
}
export interface VisualLineLayer extends VisualLayerBase {
  readonly t: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}
export interface VisualArcLayer extends VisualLayerBase {
  readonly t: "arc";
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly a0: number;
  readonly a1: number;
}

export type VisualLayer =
  | VisualPolygonLayer
  | VisualRectLayer
  | VisualRotatedRectLayer
  | VisualCircleLayer
  | VisualEllipseLayer
  | VisualLineLayer
  | VisualArcLayer;

export const VISUAL_ASSET_CATEGORIES = [
  "ship",
  "station",
  "drone",
  "missile",
  "weapon",
  "boss"
] as const;
export type VisualAssetCategory = (typeof VISUAL_ASSET_CATEGORIES)[number];

export interface VisualAsset {
  readonly id: VisualAssetId;
  readonly name: string;
  readonly category: VisualAssetCategory;
  /** Position in the catalogue, 1-based; also picks the accent colour. */
  readonly index: number;
  /** Units the geometry was drawn around; the renderer normalises by it. */
  readonly radius: number;
  readonly accent: number;
  /** Free-form English tag; the console searches it alongside name and id. */
  readonly role: string;
  /** Radians per second of idle spin the catalogue suggests. Unused in combat. */
  readonly spin: number;
  /** Extra multiplier for assets drawn larger than their nominal radius. */
  readonly scaleHint: number;
  readonly layers: readonly VisualLayer[];
}

const ACCENT_CYCLE = [
  VISUAL_PALETTE.cyan,
  VISUAL_PALETTE.red,
  VISUAL_PALETTE.yellow,
  VISUAL_PALETTE.orange,
  VISUAL_PALETTE.purple,
  VISUAL_PALETTE.green
] as const;

const P = (
  pts: readonly VisualPoint[],
  fill: VisualColor = "body",
  stroke: VisualColor = "edge",
  width = 2,
  alpha = 1
): VisualPolygonLayer => ({ t: "poly", pts, fill, stroke, width, alpha });

const R = (
  x: number,
  y: number,
  w: number,
  h: number,
  fill: VisualColor = "body",
  stroke: VisualColor = "edge",
  width = 2,
  alpha = 1
): VisualRectLayer => ({ t: "rect", x, y, w, h, fill, stroke, width, alpha });

const RR = (
  x: number,
  y: number,
  w: number,
  h: number,
  a: number,
  fill: VisualColor = "body",
  stroke: VisualColor = "edge",
  width = 2,
  alpha = 1
): VisualRotatedRectLayer => ({ t: "rrect", x, y, w, h, a, fill, stroke, width, alpha });

const O = (
  x: number,
  y: number,
  r: number,
  fill: VisualColor = "body",
  stroke: VisualColor = "edge",
  width = 2,
  alpha = 1
): VisualCircleLayer => ({ t: "circle", x, y, r, fill, stroke, width, alpha });

const E = (
  x: number,
  y: number,
  w: number,
  h: number,
  fill: VisualColor = "body",
  stroke: VisualColor = "edge",
  width = 2,
  alpha = 1
): VisualEllipseLayer => ({ t: "ellipse", x, y, w, h, fill, stroke, width, alpha });

const L = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: VisualColor = "edge",
  width = 2,
  alpha = 1
): VisualLineLayer => ({ t: "line", x1, y1, x2, y2, stroke, width, alpha });

const A = (
  x: number,
  y: number,
  r: number,
  a0: number,
  a1: number,
  stroke: VisualColor = "edge",
  width = 2,
  alpha = 1
): VisualArcLayer => ({ t: "arc", x, y, r, a0, a1, stroke, width, alpha });

interface AssetMeta {
  readonly role?: string;
  readonly spin?: number;
  readonly scaleHint?: number;
  /** Carried by the prototype for its own preview; balance owns the real value. */
  readonly hp?: number;
}

/** Hardpoints stay a prototype-only concern, so the argument is taken and dropped. */
interface AssetHardpoint {
  readonly x: number;
  readonly y: number;
  readonly type: string;
}

const asset = (
  id: VisualAssetId,
  name: string,
  category: VisualAssetCategory,
  index: number,
  radius: number,
  hardpoints: readonly AssetHardpoint[],
  layers: readonly VisualLayer[],
  meta: AssetMeta = {}
): VisualAsset => ({
  id,
  name,
  category,
  index,
  radius,
  accent: ACCENT_CYCLE[(index - 1) % ACCENT_CYCLE.length] ?? VISUAL_PALETTE.cyan,
  role: meta.role ?? "",
  spin: meta.spin ?? 0,
  scaleHint: meta.scaleHint ?? 1,
  layers
});

/**
 * Every asset id, in catalogue order. Kept as a literal tuple so the balance
 * schema can be a `z.enum`; `visualCatalog.test.ts` asserts it stays in step
 * with `VISUAL_ASSETS`.
 */
export const VISUAL_ASSET_IDS = [
  "ship-spear",
  "ship-delta",
  "ship-splitwing",
  "ship-needle",
  "ship-hammer",
  "ship-manta",
  "ship-crescent",
  "ship-diamond",
  "ship-twinboom",
  "ship-ringrunner",
  "ship-blockfrigate",
  "ship-arrowhead",
  "ship-fork",
  "ship-broadwing",
  "ship-hexcorvette",
  "ship-scissor",
  "ship-dart",
  "ship-lancer",
  "station-ring",
  "station-crossdock",
  "station-hexhub",
  "station-quad",
  "station-starrelay",
  "station-dualring",
  "station-refinery",
  "station-citadel",
  "drone-orb",
  "drone-tri",
  "drone-quad",
  "drone-mine",
  "drone-repair",
  "drone-gun",
  "drone-shield",
  "drone-harvester",
  "missile-needle",
  "missile-torpedo",
  "missile-cluster",
  "missile-delta",
  "missile-plasma",
  "missile-smart",
  "missile-siege",
  "missile-split",
  "weapon-twin",
  "weapon-railgun",
  "weapon-gatling",
  "weapon-beam",
  "weapon-flak",
  "weapon-missilepod",
  "weapon-pulse",
  "weapon-tesla",
  "boss-dreadnought",
  "boss-carrier",
  "boss-ringlord",
  "boss-hammerhead",
  "boss-fortress",
  "boss-artillery",
  "boss-scythe",
  "boss-twin-core",
  "boss-beetle",
  "boss-trident",
  "boss-hive",
  "boss-serpent",
  "boss-obelisk",
  "boss-crab",
  "boss-voideye",
  "boss-pincer",
  "boss-solar",
  "boss-gunflower",
  "boss-splitter",
  "boss-mothership"
] as const;
export type VisualAssetId = (typeof VISUAL_ASSET_IDS)[number];

/** Drawn when a preset names an asset this build does not carry. */
export const FALLBACK_VISUAL_ASSET_ID: VisualAssetId = "ship-spear";

/**
 * The 70 prototype silhouettes, ported verbatim. Prettier is off for the block so
 * it keeps the one-asset-per-entry shape of the source it was copied from.
 */
// prettier-ignore
export const VISUAL_ASSETS: readonly VisualAsset[] = [
    // ===== SHIPS 01-18 =====
    asset("ship-spear","Копьё","ship",1,44,[{x:0,y:-42,type:"gun"},{x:-13,y:30,type:"engine"},{x:13,y:30,type:"engine"}],[
      P([[0,-50],[-26,28],[-8,20],[0,34],[8,20],[26,28]],"body"),
      P([[0,-37],[-9,11],[0,23],[9,11]],"accent","white"),
      P([[-27,26],[-42,37],[-18,34]],"body2"), P([[27,26],[42,37],[18,34]],"body2"),
      R(-16,31,8,7,"engine","engine",1), R(8,31,8,7,"engine","engine",1),
      L(0,-49,0,31,"trim",1)
    ],{role:"interceptor"}),
    asset("ship-delta","Дельта","ship",2,48,[{x:0,y:-36,type:"gun"},{x:-28,y:18,type:"gun"},{x:28,y:18,type:"gun"},{x:0,y:34,type:"engine"}],[
      P([[0,-45],[-48,32],[-12,21],[0,37],[12,21],[48,32]],"body"),
      P([[0,-31],[-16,12],[0,20],[16,12]],"accent","white"),
      L(-40,27,-8,-30,"accent",3), L(40,27,8,-30,"accent",3),
      R(-8,32,16,8,"engine","engine",1)
    ],{role:"fighter"}),
    asset("ship-splitwing","Разрезное крыло","ship",3,50,[{x:0,y:-38,type:"gun"},{x:-33,y:5,type:"gun"},{x:33,y:5,type:"gun"},{x:-12,y:35,type:"engine"},{x:12,y:35,type:"engine"}],[
      P([[0,-46],[-13,-8],[-39,-22],[-50,31],[-20,20],[-9,39],[0,20],[9,39],[20,20],[50,31],[39,-22],[13,-8]],"body"),
      P([[0,-32],[-10,10],[0,24],[10,10]],"accent","white"),
      L(-42,-12,-27,22,"trim",2), L(42,-12,27,22,"trim",2),
      R(-18,34,10,7,"engine","engine",1), R(8,34,10,7,"engine","engine",1)
    ],{role:"strike fighter"}),
    asset("ship-needle","Игла","ship",4,42,[{x:0,y:-49,type:"gun"},{x:-12,y:28,type:"engine"},{x:12,y:28,type:"engine"}],[
      P([[0,-55],[-13,18],[-28,34],[-7,29],[0,42],[7,29],[28,34],[13,18]],"body"),
      P([[0,-37],[-6,13],[0,25],[6,13]],"accent","white"),
      L(0,-54,0,40,"trim",1), R(-17,31,8,7,"engine","engine",1), R(9,31,8,7,"engine","engine",1)
    ],{role:"fast interceptor"}),
    asset("ship-hammer","Молот","ship",5,52,[{x:-30,y:-29,type:"gun"},{x:30,y:-29,type:"gun"},{x:-17,y:35,type:"engine"},{x:17,y:35,type:"engine"}],[
      P([[-42,-34],[42,-34],[45,-9],[25,-2],[20,34],[-20,34],[-25,-2],[-45,-9]],"body"),
      R(-17,-25,34,45,"body2","edge",2), O(0,-5,11,"accent","white",2),
      R(-43,-20,16,23,"body2","edge",2), R(27,-20,16,23,"body2","edge",2),
      R(-24,32,12,8,"engine","engine",1), R(12,32,12,8,"engine","engine",1)
    ],{role:"gunship"}),
    asset("ship-manta","Манта","ship",6,55,[{x:0,y:-27,type:"gun"},{x:-39,y:12,type:"gun"},{x:39,y:12,type:"gun"},{x:0,y:35,type:"engine"}],[
      P([[0,-38],[-17,-18],[-55,8],[-38,22],[-18,16],[0,42],[18,16],[38,22],[55,8],[17,-18]],"body"),
      E(0,-6,23,32,"accent","white",2),
      L(-49,9,-20,8,"trim",2), L(49,9,20,8,"trim",2),
      P([[-9,33],[0,48],[9,33]],"engine","engine",1)
    ],{role:"bomber"}),
    asset("ship-crescent","Полумесяц","ship",7,53,[{x:-8,y:-39,type:"gun"},{x:32,y:-10,type:"gun"},{x:-30,y:24,type:"engine"}],[
      P([[-32,-40],[6,-49],[42,-22],[49,10],[31,37],[2,45],[-19,31],[3,21],[18,0],[8,-19],[-12,-26]],"body"),
      P([[0,-31],[21,-17],[28,4],[15,19],[-3,18],[9,3],[4,-12]],"accent","white"),
      L(-27,-34,-8,31,"trim",2), R(-35,25,10,8,"engine","engine",1)
    ],{role:"raider"}),
    asset("ship-diamond","Алмаз","ship",8,42,[{x:0,y:-43,type:"gun"},{x:-22,y:0,type:"gun"},{x:22,y:0,type:"gun"},{x:0,y:38,type:"engine"}],[
      P([[0,-48],[-34,0],[0,44],[34,0]],"body"),
      P([[0,-30],[-18,0],[0,25],[18,0]],"accent","white"),
      L(-33,0,33,0,"trim",2), L(0,-47,0,42,"trim",1),
      R(-6,38,12,8,"engine","engine",1)
    ],{role:"scout"}),
    asset("ship-twinboom","Двойная балка","ship",9,48,[{x:0,y:-34,type:"gun"},{x:-26,y:-26,type:"gun"},{x:26,y:-26,type:"gun"},{x:-28,y:34,type:"engine"},{x:28,y:34,type:"engine"}],[
      P([[-38,-39],[-18,-33],[-16,30],[-38,40]],"body"), P([[38,-39],[18,-33],[16,30],[38,40]],"body"),
      P([[0,-40],[-14,-5],[-11,32],[0,40],[11,32],[14,-5]],"body2"),
      O(0,-8,9,"accent","white",2), L(-20,-1,20,-1,"trim",2),
      R(-36,35,14,8,"engine","engine",1), R(22,35,14,8,"engine","engine",1)
    ],{role:"long range fighter"}),
    asset("ship-ringrunner","Кольцевик","ship",10,50,[{x:0,y:-18,type:"gun"},{x:0,y:35,type:"engine"}],[
      O(0,0,43,"dark","edge",7), O(0,0,30,"dark","accent",4),
      P([[0,-38],[-12,-9],[-11,28],[0,39],[11,28],[12,-9]],"body2"),
      O(0,-5,9,"accent","white",2), R(-7,34,14,7,"engine","engine",1),
      L(-36,-22,-25,-29,"accent",3), L(36,-22,25,-29,"accent",3)
    ],{role:"experimental fighter"}),
    asset("ship-blockfrigate","Блок-фрегат","ship",11,55,[{x:-26,y:-34,type:"gun"},{x:26,y:-34,type:"gun"},{x:-38,y:3,type:"gun"},{x:38,y:3,type:"gun"},{x:-20,y:40,type:"engine"},{x:20,y:40,type:"engine"}],[
      R(-31,-42,62,78,"body","edge",2), R(-48,-18,17,36,"body2","edge",2), R(31,-18,17,36,"body2","edge",2),
      P([[0,-48],[-17,-26],[17,-26]],"body2"), R(-13,-24,26,38,"accent","white",2),
      R(-28,35,15,8,"engine","engine",1), R(13,35,15,8,"engine","engine",1),
      L(-25,18,25,18,"trim",2)
    ],{role:"frigate"}),
    asset("ship-arrowhead","Стрела","ship",12,47,[{x:0,y:-48,type:"gun"},{x:-30,y:22,type:"gun"},{x:30,y:22,type:"gun"},{x:0,y:39,type:"engine"}],[
      P([[0,-54],[-44,34],[-15,22],[0,45],[15,22],[44,34]],"body"),
      P([[0,-41],[-13,14],[0,27],[13,14]],"accent","white"),
      P([[-37,28],[-20,-6],[-16,23]],"body2"), P([[37,28],[20,-6],[16,23]],"body2"),
      R(-7,39,14,8,"engine","engine",1)
    ],{role:"assault fighter"}),
    asset("ship-fork","Вилка","ship",13,49,[{x:-18,y:-47,type:"gun"},{x:18,y:-47,type:"gun"},{x:0,y:-20,type:"gun"},{x:-12,y:36,type:"engine"},{x:12,y:36,type:"engine"}],[
      P([[-35,-49],[-16,-49],[-9,-14],[0,-5],[9,-14],[16,-49],[35,-49],[23,29],[11,39],[-11,39],[-23,29]],"body"),
      P([[0,-23],[-10,5],[0,24],[10,5]],"accent","white"),
      L(-29,-43,-18,24,"trim",2), L(29,-43,18,24,"trim",2),
      R(-18,35,10,7,"engine","engine",1), R(8,35,10,7,"engine","engine",1)
    ],{role:"fork interceptor"}),
    asset("ship-broadwing","Ширококрыл","ship",14,58,[{x:-45,y:-5,type:"gun"},{x:45,y:-5,type:"gun"},{x:0,y:-28,type:"gun"},{x:-20,y:35,type:"engine"},{x:20,y:35,type:"engine"}],[
      P([[0,-37],[-22,-24],[-58,-7],[-49,28],[-21,15],[-14,37],[14,37],[21,15],[49,28],[58,-7],[22,-24]],"body"),
      R(-14,-23,28,46,"accent","white",2),
      P([[-55,-3],[-25,-17],[-20,11],[-46,22]],"body2"), P([[55,-3],[25,-17],[20,11],[46,22]],"body2"),
      R(-27,34,14,8,"engine","engine",1), R(13,34,14,8,"engine","engine",1)
    ],{role:"heavy bomber"}),
    asset("ship-hexcorvette","Гекс-корвет","ship",15,52,[{x:0,y:-43,type:"gun"},{x:-34,y:-15,type:"gun"},{x:34,y:-15,type:"gun"},{x:-18,y:38,type:"engine"},{x:18,y:38,type:"engine"}],[
      P([[0,-48],[-34,-25],[-44,14],[-23,38],[23,38],[44,14],[34,-25]],"body"),
      P([[0,-33],[-19,-15],[-18,16],[0,29],[18,16],[19,-15]],"accent","white"),
      L(-34,-23,34,-23,"trim",2), L(-42,12,42,12,"trim",1),
      R(-25,35,13,8,"engine","engine",1), R(12,35,13,8,"engine","engine",1)
    ],{role:"corvette"}),
    asset("ship-scissor","Ножницы","ship",16,54,[{x:-31,y:-43,type:"gun"},{x:31,y:-43,type:"gun"},{x:0,y:-25,type:"gun"},{x:0,y:39,type:"engine"}],[
      P([[-49,-45],[-20,-35],[-5,-2],[-20,38],[-40,26],[-17,-3]],"body"),
      P([[49,-45],[20,-35],[5,-2],[20,38],[40,26],[17,-3]],"body"),
      P([[0,-31],[-12,2],[0,33],[12,2]],"accent","white"),
      L(-43,-39,-13,30,"trim",2), L(43,-39,13,30,"trim",2), R(-7,36,14,8,"engine","engine",1)
    ],{role:"agile fighter"}),
    asset("ship-dart","Дротик","ship",17,39,[{x:0,y:-51,type:"gun"},{x:-14,y:29,type:"engine"},{x:14,y:29,type:"engine"}],[
      P([[0,-57],[-18,5],[-31,24],[-9,17],[0,40],[9,17],[31,24],[18,5]],"body"),
      P([[0,-39],[-7,9],[0,23],[7,9]],"accent","white"),
      L(-24,20,-8,-7,"trim",2), L(24,20,8,-7,"trim",2),
      R(-19,31,10,7,"engine","engine",1), R(9,31,10,7,"engine","engine",1)
    ],{role:"scout"}),
    asset("ship-lancer","Тяжёлый лансер","ship",18,60,[{x:0,y:-58,type:"gun"},{x:-39,y:-18,type:"gun"},{x:39,y:-18,type:"gun"},{x:-24,y:40,type:"engine"},{x:24,y:40,type:"engine"}],[
      P([[0,-61],[-17,-29],[-47,-19],[-55,26],[-25,18],[-17,45],[17,45],[25,18],[55,26],[47,-19],[17,-29]],"body"),
      P([[0,-48],[-11,-20],[-11,27],[0,39],[11,27],[11,-20]],"body2"), O(0,-7,11,"accent","white",2),
      R(-31,40,14,9,"engine","engine",1), R(17,40,14,9,"engine","engine",1), L(-48,19,48,19,"trim",2)
    ],{role:"heavy strike ship"}),

    // ===== STATIONS 19-26 =====
    asset("station-ring","Орбитальное кольцо","station",19,62,[{x:0,y:-58,type:"dock"},{x:58,y:0,type:"dock"},{x:0,y:58,type:"dock"},{x:-58,y:0,type:"dock"}],[
      O(0,0,54,"dark","edge",8), O(0,0,39,"dark","accent",3),
      R(-9,-63,18,18,"body2","edge",2), R(-9,45,18,18,"body2","edge",2), R(-63,-9,18,18,"body2","edge",2), R(45,-9,18,18,"body2","edge",2),
      O(0,0,10,"accent","white",2)
    ],{role:"dock",spin:0.08}),
    asset("station-crossdock","Крестовый док","station",20,62,[{x:0,y:-60,type:"dock"},{x:60,y:0,type:"dock"},{x:0,y:60,type:"dock"},{x:-60,y:0,type:"dock"}],[
      R(-17,-60,34,120,"body","edge",2), R(-60,-17,120,34,"body","edge",2), O(0,0,24,"body2","edge",3), O(0,0,11,"accent","white",2),
      R(-10,-68,20,14,"accent","accent",1),R(-10,54,20,14,"accent","accent",1),R(-68,-10,14,20,"accent","accent",1),R(54,-10,14,20,"accent","accent",1)
    ],{role:"shipyard",spin:0.03}),
    asset("station-hexhub","Шестиугольный хаб","station",21,60,[{x:0,y:-56,type:"dock"},{x:48,y:-28,type:"dock"},{x:48,y:28,type:"dock"},{x:0,y:56,type:"dock"},{x:-48,y:28,type:"dock"},{x:-48,y:-28,type:"dock"}],[
      P([[0,-55],[47,-28],[47,28],[0,55],[-47,28],[-47,-28]],"body"),
      P([[0,-37],[31,-19],[31,19],[0,37],[-31,19],[-31,-19]],"dark","accent",3), O(0,0,12,"accent","white",2),
      R(-8,-65,16,15,"body2"), RR(41,-39,16,15,Math.PI/3,"body2"), RR(41,24,16,15,-Math.PI/3,"body2"), R(-8,50,16,15,"body2"), RR(-57,24,16,15,Math.PI/3,"body2"), RR(-57,-39,16,15,-Math.PI/3,"body2")
    ],{role:"relay",spin:0.05}),
    asset("station-quad","Квад-платформа","station",22,64,[{x:-48,y:-48,type:"dock"},{x:48,y:-48,type:"dock"},{x:48,y:48,type:"dock"},{x:-48,y:48,type:"dock"}],[
      R(-42,-42,84,84,"body","edge",2), R(-25,-25,50,50,"dark","accent",3), O(0,0,13,"accent","white",2),
      R(-63,-63,27,27,"body2"), R(36,-63,27,27,"body2"), R(-63,36,27,27,"body2"), R(36,36,27,27,"body2"),
      L(-48,-48,-24,-24,"trim",3),L(48,-48,24,-24,"trim",3),L(-48,48,-24,24,"trim",3),L(48,48,24,24,"trim",3)
    ],{role:"industrial platform",spin:0.02}),
    asset("station-starrelay","Звёздный ретранслятор","station",23,66,[{x:0,y:-61,type:"antenna"},{x:58,y:-19,type:"antenna"},{x:36,y:50,type:"antenna"},{x:-36,y:50,type:"antenna"},{x:-58,y:-19,type:"antenna"}],[
      O(0,0,17,"body2","edge",3), O(0,0,8,"accent","white",2),
      P([[0,-15],[-8,-55],[0,-68],[8,-55]],"body"),
      P([[14,-5],[48,-34],[64,-29],[52,-17]],"body"),
      P([[9,12],[35,50],[30,64],[17,53]],"body"),
      P([[-9,12],[-35,50],[-30,64],[-17,53]],"body"),
      P([[-14,-5],[-48,-34],[-64,-29],[-52,-17]],"body"),
      O(0,-60,5,"accent"),O(55,-26,5,"accent"),O(32,57,5,"accent"),O(-32,57,5,"accent"),O(-55,-26,5,"accent")
    ],{role:"sensor relay",spin:0.12}),
    asset("station-dualring","Двойные врата","station",24,66,[{x:0,y:-63,type:"dock"},{x:0,y:63,type:"dock"}],[
      O(0,0,55,"dark","edge",7), O(0,0,43,"dark","accent",3), O(0,0,28,"dark","trim",2),
      R(-12,-68,24,21,"body2"),R(-12,47,24,21,"body2"),R(-68,-12,21,24,"body2"),R(47,-12,21,24,"body2"),
      A(0,0,35,-0.7,0.7,"accent",5), A(0,0,35,2.44,3.84,"accent",5)
    ],{role:"jump gate",spin:0.06}),
    asset("station-refinery","Нефтепереработчик","station",25,65,[{x:0,y:-62,type:"dock"},{x:0,y:62,type:"dock"},{x:-52,y:10,type:"pipe"},{x:52,y:10,type:"pipe"}],[
      R(-15,-58,30,116,"body","edge",2), R(-43,-24,28,32,"body2"), R(15,-24,28,32,"body2"), R(-53,16,38,30,"body2"), R(15,16,38,30,"body2"),
      O(0,-28,10,"accent","white",2), O(0,27,10,"hot","edge",2),
      L(-43,-7,-15,-7,"accent",3), L(15,-7,43,-7,"accent",3), L(-53,31,-15,31,"hot",3), L(15,31,53,31,"hot",3)
    ],{role:"refinery"}),
    asset("station-citadel","Оборонительная цитадель","station",26,70,[{x:0,y:-60,type:"turret"},{x:60,y:0,type:"turret"},{x:0,y:60,type:"turret"},{x:-60,y:0,type:"turret"}],[
      P([[0,-62],[44,-44],[62,0],[44,44],[0,62],[-44,44],[-62,0],[-44,-44]],"body"),
      O(0,0,33,"dark","edge",5), O(0,0,15,"accent","white",3),
      R(-8,-72,16,25,"body2"),R(-8,47,16,25,"body2"),R(-72,-8,25,16,"body2"),R(47,-8,25,16,"body2"),
      L(-40,-40,40,40,"trim",2),L(40,-40,-40,40,"trim",2)
    ],{role:"defense station",spin:0.015}),

    // ===== DRONES 27-34 =====
    asset("drone-orb","Сферический разведчик","drone",27,30,[{x:0,y:-23,type:"sensor"}],[
      O(0,0,22,"body","edge",3), O(0,0,10,"accent","white",2), R(-30,-5,9,10,"body2"),R(21,-5,9,10,"body2"),R(-5,-30,10,9,"body2"),R(-5,21,10,9,"body2")
    ],{role:"scout",spin:0.18}),
    asset("drone-tri","Три-дрон","drone",28,34,[{x:0,y:-26,type:"gun"},{x:-23,y:18,type:"engine"},{x:23,y:18,type:"engine"}],[
      O(0,0,11,"accent","white",2), P([[0,-12],[-10,-31],[0,-39],[10,-31]],"body"), P([[10,6],[31,18],[30,29],[17,24]],"body"), P([[-10,6],[-31,18],[-30,29],[-17,24]],"body"),
      O(0,-31,4,"hot"),O(27,22,4,"engine"),O(-27,22,4,"engine")
    ],{role:"attack drone",spin:0.1}),
    asset("drone-quad","Квад-дрон","drone",29,35,[{x:0,y:-25,type:"gun"},{x:25,y:0,type:"gun"},{x:0,y:25,type:"gun"},{x:-25,y:0,type:"gun"}],[
      P([[0,-18],[18,0],[0,18],[-18,0]],"body2"), O(0,0,9,"accent","white",2),
      R(-5,-36,10,17,"body"),R(-5,19,10,17,"body"),R(-36,-5,17,10,"body"),R(19,-5,17,10,"body"),
      O(0,-30,3,"hot"),O(30,0,3,"hot"),O(0,30,3,"hot"),O(-30,0,3,"hot")
    ],{role:"combat drone",spin:0.14}),
    asset("drone-mine","Мина","drone",30,34,[],[
      O(0,0,22,"body","edge",3), O(0,0,9,"red","white",2),
      P([[0,-21],[-5,-34],[0,-42],[5,-34]],"body2"),P([[21,0],[34,-5],[42,0],[34,5]],"body2"),P([[0,21],[-5,34],[0,42],[5,34]],"body2"),P([[-21,0],[-34,-5],[-42,0],[-34,5]],"body2")
    ],{role:"proximity mine",spin:0.22}),
    asset("drone-repair","Ремонтный дрон","drone",31,36,[{x:0,y:-28,type:"tool"},{x:-26,y:18,type:"tool"},{x:26,y:18,type:"tool"}],[
      O(0,0,17,"body","edge",3), O(0,0,8,"green","white",2),
      P([[-8,-12],[-13,-31],[-6,-39],[0,-27]],"body2"), P([[8,-12],[13,-31],[6,-39],[0,-27]],"body2"),
      P([[-13,8],[-35,18],[-34,28],[-15,21]],"body2"), P([[13,8],[35,18],[34,28],[15,21]],"body2"),
      L(-31,23,-40,30,"green",2),L(31,23,40,30,"green",2)
    ],{role:"repair"}),
    asset("drone-gun","Орудийный дрон","drone",32,35,[{x:-8,y:-35,type:"gun"},{x:8,y:-35,type:"gun"}],[
      R(-19,-14,38,37,"body","edge",2), O(0,4,9,"accent","white",2), R(-14,-40,8,30,"body2"), R(6,-40,8,30,"body2"),
      R(-30,-4,11,13,"body2"),R(19,-4,11,13,"body2"),L(-10,-36,-10,-47,"hot",2),L(10,-36,10,-47,"hot",2)
    ],{role:"gun drone"}),
    asset("drone-shield","Щит-дрон","drone",33,38,[{x:0,y:-29,type:"emitter"}],[
      O(0,0,27,"dark","accent",5), O(0,0,17,"body","edge",3), O(0,0,7,"accent","white",2),
      A(0,0,34,-0.65,0.65,"cyan",3),A(0,0,34,2.49,3.79,"cyan",3)
    ],{role:"shield support",spin:0.09}),
    asset("drone-harvester","Сборщик","drone",34,39,[{x:0,y:-34,type:"tool"},{x:-30,y:14,type:"tool"},{x:30,y:14,type:"tool"}],[
      P([[0,-35],[25,-15],[31,21],[0,35],[-31,21],[-25,-15]],"body"), O(0,0,10,"yellow","white",2),
      P([[-21,-10],[-38,-2],[-43,10],[-29,7]],"body2"),P([[21,-10],[38,-2],[43,10],[29,7]],"body2"),
      P([[-12,26],[0,46],[12,26]],"body2"),L(-37,4,-49,4,"yellow",2),L(37,4,49,4,"yellow",2)
    ],{role:"harvester"}),

    // ===== ROCKETS / PROJECTILES 35-42 =====
    asset("missile-needle","Игла-ракета","missile",35,22,[{x:0,y:30,type:"engine"}],[
      P([[0,-44],[-8,-24],[-8,24],[-15,34],[0,29],[15,34],[8,24],[8,-24]],"body"), P([[0,-43],[-5,-27],[5,-27]],"accent","accent",1),
      P([[-8,18],[-20,31],[-8,29]],"body2"),P([[8,18],[20,31],[8,29]],"body2"),R(-5,29,10,9,"engine","engine",1)
    ],{role:"fast missile"}),
    asset("missile-torpedo","Тяжёлая торпеда","missile",36,27,[{x:0,y:35,type:"engine"}],[
      P([[0,-45],[-15,-29],[-17,24],[-9,38],[9,38],[17,24],[15,-29]],"body"), R(-12,-17,24,21,"body2","edge",2),
      R(-11,4,22,12,"accent","white",2),P([[-16,18],[-28,32],[-16,29]],"body2"),P([[16,18],[28,32],[16,29]],"body2"),R(-8,36,16,9,"engine","engine",1)
    ],{role:"torpedo"}),
    asset("missile-cluster","Кластер","missile",37,32,[{x:-14,y:31,type:"engine"},{x:0,y:34,type:"engine"},{x:14,y:31,type:"engine"}],[
      P([[-16,-40],[-25,-20],[-21,26],[-11,32],[-7,22],[-7,-22]],"body"),
      P([[0,-47],[-9,-25],[-8,30],[0,39],[8,30],[9,-25]],"body2"),
      P([[16,-40],[25,-20],[21,26],[11,32],[7,22],[7,-22]],"body"),
      P([[-16,-39],[-22,-25],[-10,-25]],"red"),P([[0,-46],[-6,-30],[6,-30]],"accent"),P([[16,-39],[10,-25],[22,-25]],"yellow"),
      R(-20,29,10,8,"engine","engine",1),R(-5,35,10,8,"engine","engine",1),R(10,29,10,8,"engine","engine",1)
    ],{role:"cluster missile"}),
    asset("missile-delta","Дельта-ракета","missile",38,28,[{x:0,y:32,type:"engine"}],[
      P([[0,-47],[-26,28],[-9,21],[0,38],[9,21],[26,28]],"body"), P([[0,-31],[-8,13],[0,25],[8,13]],"accent","white"),
      L(-20,23,-5,-18,"trim",2),L(20,23,5,-18,"trim",2),R(-6,34,12,8,"engine","engine",1)
    ],{role:"guided rocket"}),
    asset("missile-plasma","Плазменная капсула","missile",39,28,[{x:0,y:34,type:"engine"}],[
      P([[0,-40],[-18,-22],[-22,22],[-10,38],[10,38],[22,22],[18,-22]],"body"), E(0,-2,23,47,"accent","white",2),
      L(-18,-19,-12,30,"trim",2),L(18,-19,12,30,"trim",2),R(-8,36,16,8,"engine","engine",1)
    ],{role:"plasma bomb"}),
    asset("missile-smart","Умная ракета","missile",40,25,[{x:0,y:31,type:"engine"}],[
      P([[0,-42],[-12,-27],[-13,18],[-23,28],[-10,28],[0,38],[10,28],[23,28],[13,18],[12,-27]],"body"),
      O(0,-13,7,"accent","white",2),P([[-13,12],[-28,20],[-13,23]],"body2"),P([[13,12],[28,20],[13,23]],"body2"),R(-6,34,12,8,"engine","engine",1)
    ],{role:"homing missile"}),
    asset("missile-siege","Осадная ракета","missile",41,31,[{x:-8,y:37,type:"engine"},{x:8,y:37,type:"engine"}],[
      P([[0,-50],[-18,-31],[-20,29],[-12,42],[12,42],[20,29],[18,-31]],"body"),
      R(-15,-20,30,35,"body2","edge",2), R(-11,-14,22,10,"red","white",2),R(-11,1,22,10,"yellow","edge",2),
      P([[-19,15],[-31,31],[-19,29]],"body2"),P([[19,15],[31,31],[19,29]],"body2"),R(-15,40,12,8,"engine","engine",1),R(3,40,12,8,"engine","engine",1)
    ],{role:"siege rocket"}),
    asset("missile-split","Раздельная БЧ","missile",42,32,[{x:0,y:34,type:"engine"}],[
      P([[0,-48],[-22,-25],[-16,20],[0,39],[16,20],[22,-25]],"body"),
      P([[-2,-46],[-17,-24],[-8,-9],[0,-18]],"red","white",1),P([[2,-46],[17,-24],[8,-9],[0,-18]],"yellow","white",1),
      L(0,-19,0,29,"trim",2),P([[-16,14],[-29,30],[-13,26]],"body2"),P([[16,14],[29,30],[13,26]],"body2"),R(-7,34,14,8,"engine","engine",1)
    ],{role:"split warhead"}),

    // ===== WEAPONS 43-50 =====
    asset("weapon-twin","Спаренная пушка","weapon",43,42,[{x:-10,y:-41,type:"muzzle"},{x:10,y:-41,type:"muzzle"}],[
      O(0,9,29,"body","edge",4), O(0,9,18,"dark","accent",3), R(-16,-40,10,44,"body2","edge",2),R(6,-40,10,44,"body2","edge",2),
      O(0,9,8,"accent","white",2),L(-11,-40,-11,-49,"hot",2),L(11,-40,11,-49,"hot",2)
    ],{role:"ballistic turret"}),
    asset("weapon-railgun","Рельсотрон","weapon",44,44,[{x:0,y:-53,type:"muzzle"}],[
      O(0,14,31,"body","edge",4),O(0,14,18,"dark","accent",3),R(-7,-53,14,63,"body2","edge",2),R(-3,-45,6,47,"accent","white",1),
      L(-15,-28,-15,3,"trim",2),L(15,-28,15,3,"trim",2),O(0,14,7,"accent","white",2)
    ],{role:"railgun turret"}),
    asset("weapon-gatling","Тройной гатлинг","weapon",45,44,[{x:-14,y:-42,type:"muzzle"},{x:0,y:-46,type:"muzzle"},{x:14,y:-42,type:"muzzle"}],[
      O(0,14,31,"body","edge",4),O(0,14,18,"dark","orange",3),R(-20,-39,10,45,"body2"),R(-5,-45,10,51,"body2"),R(10,-39,10,45,"body2"),
      O(-15,-31,3,"hot"),O(0,-37,3,"hot"),O(15,-31,3,"hot"),O(0,14,7,"orange","white",2)
    ],{role:"gatling turret"}),
    asset("weapon-beam","Лучевая башня","weapon",46,43,[{x:0,y:-48,type:"beam"}],[
      O(0,15,30,"body","edge",4),O(0,15,18,"dark","cyan",3),R(-10,-47,20,55,"body2","edge",2),R(-5,-40,10,42,"cyan","white",1),
      R(-15,-15,30,11,"body2"),O(0,15,7,"cyan","white",2)
    ],{role:"beam turret"}),
    asset("weapon-flak","Флак-башня","weapon",47,42,[{x:-11,y:-42,type:"muzzle"},{x:11,y:-42,type:"muzzle"}],[
      O(0,13,30,"body","edge",4),O(0,13,18,"dark","yellow",3),P([[-18,-34],[-11,-46],[-6,-34],[-7,1],[-16,1]],"body2"),P([[18,-34],[11,-46],[6,-34],[7,1],[16,1]],"body2"),
      O(0,13,7,"yellow","white",2),L(-11,-43,-11,-50,"hot",3),L(11,-43,11,-50,"hot",3)
    ],{role:"flak turret"}),
    asset("weapon-missilepod","Ракетный блок","weapon",48,46,[{x:-16,y:-31,type:"tube"},{x:0,y:-31,type:"tube"},{x:16,y:-31,type:"tube"}],[
      O(0,18,31,"body","edge",4),O(0,18,18,"dark","red",3),R(-27,-38,54,38,"body2","edge",2),
      O(-16,-24,6,"red","white",1),O(0,-24,6,"red","white",1),O(16,-24,6,"red","white",1),O(-16,-8,6,"orange","edge",1),O(0,-8,6,"orange","edge",1),O(16,-8,6,"orange","edge",1),
      O(0,18,7,"red","white",2)
    ],{role:"missile turret"}),
    asset("weapon-pulse","Импульсный излучатель","weapon",49,42,[{x:0,y:-39,type:"emitter"}],[
      O(0,13,30,"body","edge",4),O(0,13,19,"dark","purple",3),O(0,-15,14,"purple","white",2),A(0,-15,22,-2.6,-0.55,"purple",3),A(0,-15,22,0.55,2.6,"purple",3),
      R(-5,-42,10,17,"body2"),O(0,13,7,"purple","white",2)
    ],{role:"pulse cannon"}),
    asset("weapon-tesla","Тесла-дуга","weapon",50,45,[{x:-13,y:-36,type:"arc"},{x:13,y:-36,type:"arc"}],[
      O(0,16,31,"body","edge",4),O(0,16,18,"dark","cyan",3),R(-20,-26,10,33,"body2"),R(10,-26,10,33,"body2"),O(-15,-29,7,"cyan","white",2),O(15,-29,7,"cyan","white",2),
      L(-15,-36,-5,-45,"cyan",2),L(-5,-45,4,-36,"white",2),L(4,-36,15,-45,"cyan",2),O(0,16,7,"cyan","white",2)
    ],{role:"chain lightning turret"}),
    // ===== BOSSES 51-70 =====
    asset("boss-dreadnought","Дредноут «Клин»","boss",51,76,[{x:0,y:-67,type:"gun"},{x:-42,y:-36,type:"gun"},{x:42,y:-36,type:"gun"},{x:-58,y:3,type:"gun"},{x:58,y:3,type:"gun"},{x:-28,y:58,type:"engine"},{x:0,y:64,type:"engine"},{x:28,y:58,type:"engine"}],[
      P([[0,-72],[-24,-48],[-58,-31],[-67,10],[-45,44],[-23,35],[0,62],[23,35],[45,44],[67,10],[58,-31],[24,-48]],"body"),
      P([[0,-54],[-19,-29],[-18,24],[0,45],[18,24],[19,-29]],"body2"), O(0,-12,13,"accent","white",2),
      R(-58,-20,18,34,"body2"),R(40,-20,18,34,"body2"),L(-51,11,51,11,"trim",2),
      R(-36,53,16,10,"engine","engine",1),R(-8,59,16,10,"engine","engine",1),R(20,53,16,10,"engine","engine",1)
    ],{role:"dreadnought",hp:1800,scaleHint:.72}),
    asset("boss-carrier","Авианосец «Улей»","boss",52,79,[{x:-52,y:-24,type:"gun"},{x:52,y:-24,type:"gun"},{x:-58,y:18,type:"dock"},{x:58,y:18,type:"dock"},{x:0,y:-60,type:"gun"},{x:-30,y:59,type:"engine"},{x:0,y:63,type:"engine"},{x:30,y:59,type:"engine"}],[
      R(-31,-60,62,112,"body","edge",2),R(-65,-30,34,78,"body2","edge",2),R(31,-30,34,78,"body2","edge",2),
      P([[0,-70],[-24,-48],[24,-48]],"body2"),O(0,-16,14,"accent","white",2),
      R(-58,-9,22,18,"dark","accent",2),R(36,-9,22,18,"dark","accent",2),R(-24,20,48,18,"dark","trim",2),
      R(-39,51,18,10,"engine","engine",1),R(-9,55,18,10,"engine","engine",1),R(21,51,18,10,"engine","engine",1)
    ],{role:"drone carrier",hp:2100,scaleHint:.7}),
    asset("boss-ringlord","Кольцевой Лорд","boss",53,80,[{x:0,y:-69,type:"gun"},{x:69,y:0,type:"gun"},{x:0,y:69,type:"gun"},{x:-69,y:0,type:"gun"}],[
      O(0,0,66,"dark","edge",9),O(0,0,50,"dark","accent",5),O(0,0,27,"body2","edge",4),O(0,0,12,"accent","white",2),
      R(-10,-78,20,25,"body2"),R(53,-10,25,20,"body2"),R(-10,53,20,25,"body2"),R(-78,-10,25,20,"body2"),
      A(0,0,58,-.5,.5,"hot",3),A(0,0,58,1.07,2.07,"hot",3),A(0,0,58,2.64,3.64,"hot",3),A(0,0,58,4.21,5.21,"hot",3)
    ],{role:"rotating ring boss",hp:1600,spin:.18,scaleHint:.7}),
    asset("boss-hammerhead","Молотоглав","boss",54,77,[{x:-55,y:-39,type:"gun"},{x:55,y:-39,type:"gun"},{x:-28,y:-49,type:"gun"},{x:28,y:-49,type:"gun"},{x:-22,y:58,type:"engine"},{x:22,y:58,type:"engine"}],[
      R(-66,-49,132,30,"body","edge",2),P([[-30,-21],[-21,50],[0,67],[21,50],[30,-21]],"body"),
      R(-49,-41,28,20,"body2"),R(21,-41,28,20,"body2"),O(0,-5,13,"accent","white",2),
      P([[-28,24],[-48,45],[-22,42]],"body2"),P([[28,24],[48,45],[22,42]],"body2"),
      R(-30,52,16,10,"engine","engine",1),R(14,52,16,10,"engine","engine",1)
    ],{role:"siege ram",hp:1900,scaleHint:.72}),
    asset("boss-fortress","Летающая крепость","boss",55,82,[{x:0,y:-69,type:"gun"},{x:-55,y:-45,type:"gun"},{x:55,y:-45,type:"gun"},{x:-68,y:0,type:"gun"},{x:68,y:0,type:"gun"},{x:-50,y:44,type:"gun"},{x:50,y:44,type:"gun"},{x:0,y:65,type:"engine"}],[
      P([[0,-72],[50,-55],[72,-10],[58,49],[0,70],[-58,49],[-72,-10],[-50,-55]],"body"),
      O(0,0,39,"dark","edge",5),O(0,0,20,"body2","accent",4),O(0,0,9,"accent","white",2),
      R(-10,-80,20,22,"body2"),R(-78,-10,22,20,"body2"),R(56,-10,22,20,"body2"),R(-10,58,20,22,"body2"),
      L(-47,-47,47,47,"trim",2),L(47,-47,-47,47,"trim",2),P([[-8,64],[0,78],[8,64]],"engine","engine",1)
    ],{role:"fortress ship",hp:2600,scaleHint:.66}),
    asset("boss-artillery","Артиллерийская баржа","boss",56,78,[{x:0,y:-78,type:"muzzle"},{x:-18,y:-66,type:"muzzle"},{x:18,y:-66,type:"muzzle"},{x:-52,y:-25,type:"gun"},{x:52,y:-25,type:"gun"},{x:-27,y:55,type:"engine"},{x:27,y:55,type:"engine"}],[
      P([[0,-67],[-38,-43],[-61,-2],[-52,44],[-22,58],[22,58],[52,44],[61,-2],[38,-43]],"body"),
      R(-9,-79,18,83,"body2","edge",2),R(-28,-67,10,55,"body2"),R(18,-67,10,55,"body2"),
      O(0,12,15,"accent","white",2),R(-58,-34,22,22,"body2"),R(36,-34,22,22,"body2"),
      R(-35,52,16,10,"engine","engine",1),R(19,52,16,10,"engine","engine",1)
    ],{role:"long-range artillery",hp:1750,scaleHint:.7}),
    asset("boss-scythe","Коса","boss",57,80,[{x:-12,y:-66,type:"gun"},{x:43,y:-38,type:"gun"},{x:62,y:4,type:"gun"},{x:-45,y:44,type:"engine"}],[
      P([[-49,-61],[-8,-72],[39,-52],[70,-16],[73,23],[51,54],[15,68],[-18,57],[9,39],[34,13],[38,-16],[22,-38],[-3,-49]],"body"),
      P([[-7,-51],[18,-36],[29,-11],[24,13],[7,31],[-11,35],[2,15],[3,-8],[-8,-26]],"accent","white"),
      L(-42,-54,-10,48,"trim",2),R(-57,39,18,10,"engine","engine",1)
    ],{role:"asymmetric leviathan",hp:1850,scaleHint:.7}),
    asset("boss-twin-core","Двойное ядро","boss",58,80,[{x:-28,y:-56,type:"gun"},{x:28,y:-56,type:"gun"},{x:-66,y:0,type:"gun"},{x:66,y:0,type:"gun"},{x:-28,y:58,type:"engine"},{x:28,y:58,type:"engine"}],[
      P([[-28,-64],[-61,-33],[-70,5],[-50,49],[-27,61],[-8,29],[8,29],[27,61],[50,49],[70,5],[61,-33],[28,-64],[8,-29],[-8,-29]],"body"),
      O(-23,-8,17,"accent","white",3),O(23,-8,17,"purple","white",3),L(-6,-8,6,-8,"hot",5),
      R(-67,-10,22,20,"body2"),R(45,-10,22,20,"body2"),R(-37,54,18,10,"engine","engine",1),R(19,54,18,10,"engine","engine",1)
    ],{role:"dual-reactor boss",hp:2000,scaleHint:.68}),
    asset("boss-beetle","Бронежук","boss",59,78,[{x:0,y:-66,type:"gun"},{x:-47,y:-33,type:"gun"},{x:47,y:-33,type:"gun"},{x:-55,y:22,type:"gun"},{x:55,y:22,type:"gun"},{x:-18,y:58,type:"engine"},{x:18,y:58,type:"engine"}],[
      E(0,0,102,132,"body","edge",3),P([[0,-66],[-18,-32],[-17,47],[0,62],[17,47],[18,-32]],"body2"),O(0,-9,15,"accent","white",2),
      P([[-40,-40],[-66,-19],[-58,6],[-43,-4]],"body2"),P([[40,-40],[66,-19],[58,6],[43,-4]],"body2"),
      P([[-47,17],[-70,35],[-56,51],[-35,32]],"body2"),P([[47,17],[70,35],[56,51],[35,32]],"body2"),
      R(-27,55,15,9,"engine","engine",1),R(12,55,15,9,"engine","engine",1)
    ],{role:"armored bruiser",hp:2400,scaleHint:.7}),
    asset("boss-trident","Трезубец","boss",60,80,[{x:0,y:-76,type:"gun"},{x:-45,y:-65,type:"gun"},{x:45,y:-65,type:"gun"},{x:-25,y:57,type:"engine"},{x:0,y:63,type:"engine"},{x:25,y:57,type:"engine"}],[
      P([[0,-79],[-12,-18],[-23,15],[-18,54],[0,67],[18,54],[23,15],[12,-18]],"body2"),
      P([[-56,-70],[-40,-70],[-26,-8],[-35,45],[-57,37],[-42,-4]],"body"),P([[56,-70],[40,-70],[26,-8],[35,45],[57,37],[42,-4]],"body"),
      O(0,-8,13,"accent","white",2),L(-44,-64,-28,31,"trim",2),L(44,-64,28,31,"trim",2),
      R(-33,52,16,10,"engine","engine",1),R(-8,58,16,10,"engine","engine",1),R(17,52,16,10,"engine","engine",1)
    ],{role:"trident command ship",hp:2050,scaleHint:.68}),
    asset("boss-hive","Матка роя","boss",61,80,[{x:0,y:-64,type:"gun"},{x:-59,y:-12,type:"dock"},{x:59,y:-12,type:"dock"},{x:-45,y:45,type:"dock"},{x:45,y:45,type:"dock"}],[
      O(0,0,54,"body","edge",4),O(0,0,37,"dark","accent",4),O(0,0,17,"accent","white",3),
      P([[0,-51],[-10,-72],[0,-82],[10,-72]],"body2"),P([[45,-22],[67,-35],[78,-26],[58,-12]],"body2"),P([[45,22],[69,38],[66,52],[50,38]],"body2"),
      P([[-45,22],[-69,38],[-66,52],[-50,38]],"body2"),P([[-45,-22],[-67,-35],[-78,-26],[-58,-12]],"body2"),
      O(0,-70,5,"hot"),O(66,-27,5,"hot"),O(61,42,5,"hot"),O(-61,42,5,"hot"),O(-66,-27,5,"hot")
    ],{role:"swarm mothership",hp:1700,spin:.08,scaleHint:.68}),
    asset("boss-serpent","Сегментный змей","boss",62,82,[{x:0,y:-68,type:"gun"},{x:-18,y:58,type:"engine"},{x:18,y:58,type:"engine"}],[
      P([[0,-75],[-24,-52],[-18,-25],[-38,-4],[-26,20],[-43,42],[-22,62],[0,53],[22,62],[43,42],[26,20],[38,-4],[18,-25],[24,-52]],"body"),
      O(0,-48,13,"accent","white",2),O(-9,-15,11,"body2","accent",2),O(10,14,11,"body2","accent",2),O(-7,42,10,"body2","accent",2),
      L(0,-36,-9,-26,"trim",3),L(-3,-4,10,4,"trim",3),L(5,25,-7,33,"trim",3),
      R(-27,56,16,9,"engine","engine",1),R(11,56,16,9,"engine","engine",1)
    ],{role:"segmented serpent",hp:1550,scaleHint:.72}),
    asset("boss-obelisk","Обелиск","boss",63,80,[{x:0,y:-78,type:"beam"},{x:-43,y:-32,type:"gun"},{x:43,y:-32,type:"gun"},{x:-35,y:44,type:"engine"},{x:35,y:44,type:"engine"}],[
      P([[0,-82],[-25,-38],[-32,44],[0,69],[32,44],[25,-38]],"body"),P([[0,-66],[-11,-29],[-12,32],[0,51],[12,32],[11,-29]],"accent","white"),
      P([[-29,-25],[-63,-7],[-58,17],[-30,8]],"body2"),P([[29,-25],[63,-7],[58,17],[30,8]],"body2"),
      L(0,-78,0,44,"white",2),R(-43,41,16,9,"engine","engine",1),R(27,41,16,9,"engine","engine",1)
    ],{role:"beam obelisk",hp:1800,scaleHint:.7}),
    asset("boss-crab","Краб-носитель","boss",64,81,[{x:-57,y:-42,type:"gun"},{x:57,y:-42,type:"gun"},{x:-69,y:3,type:"gun"},{x:69,y:3,type:"gun"},{x:-45,y:45,type:"gun"},{x:45,y:45,type:"gun"},{x:0,y:60,type:"engine"}],[
      P([[-33,-54],[33,-54],[48,-20],[35,36],[0,57],[-35,36],[-48,-20]],"body"),O(0,-5,17,"accent","white",2),
      P([[-43,-33],[-73,-51],[-80,-36],[-59,-15]],"body2"),P([[43,-33],[73,-51],[80,-36],[59,-15]],"body2"),
      P([[-45,3],[-79,-6],[-78,12],[-50,19]],"body2"),P([[45,3],[79,-6],[78,12],[50,19]],"body2"),
      P([[-35,30],[-61,52],[-49,62],[-24,43]],"body2"),P([[35,30],[61,52],[49,62],[24,43]],"body2"),P([[-8,56],[0,72],[8,56]],"engine","engine",1)
    ],{role:"multi-arm carrier",hp:2250,scaleHint:.67}),
    asset("boss-voideye","Око Пустоты","boss",65,80,[{x:0,y:-66,type:"beam"},{x:57,y:33,type:"gun"},{x:-57,y:33,type:"gun"}],[
      O(0,0,62,"dark","edge",7),O(0,0,47,"body","accent",4),E(0,-3,46,65,"accent","white",3),O(0,-3,10,"dark","white",2),
      A(0,0,70,-.9,-.15,"purple",5),A(0,0,70,.15,.9,"purple",5),A(0,0,70,2.24,2.99,"purple",5),A(0,0,70,3.29,4.04,"purple",5),
      R(-8,-78,16,20,"body2"),RR(50,40,18,25,-.85,"body2"),RR(-50,40,18,25,.85,"body2")
    ],{role:"gravity eye",hp:1950,spin:.11,scaleHint:.68}),
    asset("boss-pincer","Клещи","boss",66,82,[{x:-52,y:-64,type:"gun"},{x:52,y:-64,type:"gun"},{x:-28,y:-22,type:"gun"},{x:28,y:-22,type:"gun"},{x:-20,y:59,type:"engine"},{x:20,y:59,type:"engine"}],[
      P([[-68,-70],[-39,-55],[-24,-23],[-35,16],[-23,54],[-7,63],[-9,14],[-21,-3],[-42,-18]],"body"),
      P([[68,-70],[39,-55],[24,-23],[35,16],[23,54],[7,63],[9,14],[21,-3],[42,-18]],"body"),
      P([[0,-32],[-15,-5],[-13,37],[0,54],[13,37],[15,-5]],"body2"),O(0,-8,12,"accent","white",2),
      L(-60,-61,-29,-15,"trim",2),L(60,-61,29,-15,"trim",2),R(-28,55,16,9,"engine","engine",1),R(12,55,16,9,"engine","engine",1)
    ],{role:"pincer boss",hp:1750,scaleHint:.68}),
    asset("boss-solar","Солнечный ковчег","boss",67,80,[{x:0,y:-61,type:"gun"},{x:-58,y:0,type:"gun"},{x:58,y:0,type:"gun"},{x:-28,y:55,type:"engine"},{x:28,y:55,type:"engine"}],[
      O(0,0,34,"body2","edge",4),O(0,0,19,"hot","white",3),O(0,0,10,"accent","accent",1),
      P([[0,-32],[-14,-70],[0,-82],[14,-70]],"body"),P([[32,0],[70,-14],[82,0],[70,14]],"body"),P([[0,32],[-14,70],[0,82],[14,70]],"body"),P([[-32,0],[-70,-14],[-82,0],[-70,14]],"body"),
      P([[23,-23],[43,-60],[57,-57],[60,-43]],"body2"),P([[23,23],[60,43],[57,57],[43,60]],"body2"),P([[-23,23],[-43,60],[-57,57],[-60,43]],"body2"),P([[-23,-23],[-60,-43],[-57,-57],[-43,-60]],"body2")
    ],{role:"solar ark",hp:2300,spin:.04,scaleHint:.66}),
    asset("boss-gunflower","Орудийный цветок","boss",68,80,[{x:0,y:-70,type:"gun"},{x:49,y:-49,type:"gun"},{x:70,y:0,type:"gun"},{x:49,y:49,type:"gun"},{x:0,y:70,type:"gun"},{x:-49,y:49,type:"gun"},{x:-70,y:0,type:"gun"},{x:-49,y:-49,type:"gun"}],[
      O(0,0,28,"body2","edge",4),O(0,0,13,"accent","white",2),
      R(-9,-76,18,49,"body"),RR(52,-52,18,49,.785,"body"),RR(52,52,18,49,2.356,"body"),R(-9,27,18,49,"body"),
      R(-76,-9,49,18,"body"),RR(-52,52,18,49,-2.356,"body"),RR(-52,-52,18,49,-.785,"body"),R(27,-9,49,18,"body"),
      O(0,-68,5,"hot"),O(48,-48,5,"hot"),O(68,0,5,"hot"),O(48,48,5,"hot"),O(0,68,5,"hot"),O(-48,48,5,"hot"),O(-68,0,5,"hot"),O(-48,-48,5,"hot")
    ],{role:"omnidirectional gunship",hp:1650,spin:.07,scaleHint:.67}),
    asset("boss-splitter","Расщепитель","boss",69,81,[{x:-27,y:-67,type:"gun"},{x:27,y:-67,type:"gun"},{x:-57,y:-5,type:"gun"},{x:57,y:-5,type:"gun"},{x:-27,y:57,type:"engine"},{x:27,y:57,type:"engine"}],[
      P([[-17,-70],[-54,-42],[-67,-4],[-53,39],[-18,62],[-7,30],[-10,-22]],"body"),
      P([[17,-70],[54,-42],[67,-4],[53,39],[18,62],[7,30],[10,-22]],"body"),
      O(-22,-5,14,"red","white",2),O(22,-5,14,"cyan","white",2),L(-6,-5,6,-5,"white",4),
      R(-64,-14,21,20,"body2"),R(43,-14,21,20,"body2"),R(-36,54,18,9,"engine","engine",1),R(18,54,18,9,"engine","engine",1)
    ],{role:"split-phase boss",hp:2000,scaleHint:.69}),
    asset("boss-mothership","Материнский корабль","boss",70,84,[{x:0,y:-73,type:"gun"},{x:-54,y:-49,type:"gun"},{x:54,y:-49,type:"gun"},{x:-72,y:0,type:"dock"},{x:72,y:0,type:"dock"},{x:-52,y:46,type:"gun"},{x:52,y:46,type:"gun"},{x:-30,y:64,type:"engine"},{x:0,y:69,type:"engine"},{x:30,y:64,type:"engine"}],[
      P([[0,-78],[-37,-61],[-67,-31],[-77,5],[-62,44],[-31,64],[0,72],[31,64],[62,44],[77,5],[67,-31],[37,-61]],"body"),
      P([[0,-58],[-25,-40],[-34,12],[-19,43],[0,55],[19,43],[34,12],[25,-40]],"body2"),
      O(0,-13,18,"accent","white",3),O(0,-13,8,"dark","white",1),
      R(-74,-13,24,26,"dark","accent",2),R(50,-13,24,26,"dark","accent",2),R(-58,31,20,22,"body2"),R(38,31,20,22,"body2"),
      L(-56,-45,56,-45,"trim",2),L(-55,44,55,44,"trim",2),
      R(-39,60,18,10,"engine","engine",1),R(-9,65,18,10,"engine","engine",1),R(21,60,18,10,"engine","engine",1)
    ],{role:"final mothership",hp:3200,scaleHint:.64})
];

const VISUAL_ASSETS_BY_ID: ReadonlyMap<string, VisualAsset> = new Map(
  VISUAL_ASSETS.map((entry) => [entry.id, entry])
);

/** Asset ids come from operator presets, so an unknown one resolves to the fallback. */
export function getVisualAsset(id: string): VisualAsset {
  const found = VISUAL_ASSETS_BY_ID.get(id);
  if (found !== undefined) return found;
  const fallback = VISUAL_ASSETS_BY_ID.get(FALLBACK_VISUAL_ASSET_ID);
  if (fallback === undefined) throw new Error("Visual catalogue is missing its fallback asset.");
  return fallback;
}

export function isVisualAssetId(id: string): id is VisualAssetId {
  return VISUAL_ASSETS_BY_ID.has(id);
}

export function getVisualAssetsByCategory(category: VisualAssetCategory): readonly VisualAsset[] {
  return VISUAL_ASSETS.filter((entry) => entry.category === category);
}
