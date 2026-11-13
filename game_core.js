"use strict";
/* ============================================================
 * 修仙守山 · 纯逻辑层（零 DOM 依赖，node 可 require，浏览器挂 window.Core）
 * 渲染层只读这里的状态 + 事件流，不发 DOM。
 * 数据驱动：TOWERS / FOES / WAVES 全是数据表，改数值不动引擎。
 * ============================================================ */
(function (global) {

  // ---------- 地图 ----------
  const MAP = { W: 960, H: 600 };
  // 山道折线：屏外入 → S 形穿越 → 右下山门
  const PATH = [
    [-40, 110], [300, 110], [300, 330], [110, 330], [110, 510],
    [560, 510], [560, 170], [730, 170], [730, 420], [920, 420]
  ];
  const GATE = PATH[PATH.length - 1];
  const SPAWN = PATH[0];

  const segs = []; let PLEN = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, L, s: PLEN, dx: (b[0] - a[0]) / L, dy: (b[1] - a[1]) / L });
    PLEN += L;
  }
  function posAt(d) {
    d = Math.max(0, Math.min(PLEN, d));
    for (const s of segs) {
      if (d <= s.s + s.L) {
        const t = d - s.s;
        return [s.a[0] + s.dx * t, s.a[1] + s.dy * t];
      }
    }
    return GATE.slice();
  }
  // d 处的单位法向（左手侧）
  function pathNormal(d) {
    d = Math.max(0, Math.min(PLEN - 0.001, d));
    for (const s of segs) {
      if (d <= s.s + s.L) return [-s.dy, s.dx];
    }
    return [0, -1];
  }
  // 点到山道折线的最短距离（布阵合法性）
  function pathDistTo(x, y) {
    let best = Infinity;
    for (const s of segs) {
      const t = Math.max(0, Math.min(1, ((x - s.a[0]) * (s.b[0] - s.a[0]) + (y - s.a[1]) * (s.b[1] - s.a[1])) / (s.L * s.L)));
      const dd = Math.hypot(x - (s.a[0] + (s.b[0] - s.a[0]) * t), y - (s.a[1] + (s.b[1] - s.a[1]) * t));
      if (dd < best) best = dd;
    }
    return best;
  }
  // 飞行单位直线航线
  const FLY_A = SPAWN, FLY_B = GATE;
  const FLY_LEN = Math.hypot(FLY_B[0] - FLY_A[0], FLY_B[1] - FLY_A[1]);
  function flyPos(t) { // t ∈ [0,1]
    return [FLY_A[0] + (FLY_B[0] - FLY_A[0]) * t, FLY_A[1] + (FLY_B[1] - FLY_A[1]) * t + 26];
  }

  // ---------- 调色（demo 基线） ----------
  const PAL = {
    paper: "#e8e0ce", ink: "#2b2620", red: "#9e2b25",
    cyan: "#3d6b6b", gold: "#a8842c", green: "#5a6b3d", purple: "#5d3d6b"
  };

  // ---------- 基础阵法表（6 座，覆盖标准 TD 角色） ----------
  const TOWERS = {
    yujian: {
      key: "yujian", name: "御剑阵", ele: "metal", cost: 40,
      dmg: 11, rate: 0.55, range: 130, ground: true, air: false,
      proj: "sword", color: PAL.red, desc: "飞剑自动斩妖，单体速攻",
      up: [0, 40, 72], // 升 2/3 级灵石
    },
    lieyan: {
      key: "lieyan", name: "烈焰符阵", ele: "fire", cost: 60,
      dmg: 13, rate: 1.0, range: 118, ground: true, air: false,
      proj: "fire", splash: 46, splashMul: 0.7, color: PAL.red, desc: "爆符焚群，溅射 AoE",
      up: [0, 60, 108],
    },
    xuanbing: {
      key: "xuanbing", name: "玄冰阵", ele: "ice", cost: 60,
      dmg: 5, rate: 1.15, range: 112, ground: true, air: false,
      proj: "bolt", slowF: 0.45, slowT: 1.3, color: PAL.cyan, desc: "寒气滞行，减速控场",
      up: [0, 55, 100],
    },
    tianlei: {
      key: "tianlei", name: "天雷阵", ele: "thunder", cost: 90,
      dmg: 46, rate: 1.8, range: 152, ground: true, air: false,
      proj: "none", pierce: 0.55, color: PAL.gold, desc: "引雷诛鳞甲，高伤破甲",
      up: [0, 85, 150],
    },
    fukong: {
      key: "fukong", name: "缚空阵", ele: "wind", cost: 70,
      dmg: 15, rate: 0.8, range: 165, ground: false, air: true,
      proj: "lock", color: PAL.green, desc: "气锁御空飞舟，仅对空",
      up: [0, 65, 115],
    },
    juling: {
      key: "juling", name: "聚灵阵", ele: "qi", cost: 80,
      dmg: 0, rate: 0, range: 0, ground: false, air: false,
      proj: "none", qiRate: 0.6, color: PAL.gold, desc: "汇聚灵气，不攻击 · 融合之本",
      up: [0, 70, 120],
    },
  };
  const BASE_KEYS = Object.keys(TOWERS);

  // ---------- 融合阵表（游戏灵魂；recipe 无序对，zhenwu 同种保底，secret 为图鉴暗格） ----------
  // 机制字段：chain{链数,倍率} dot{灼/毒伤,秒} stun{定身率,秒} onKillQi{击杀加灵气}
  //           onKillAirQi{空杀伤灵气} qiPerSec{产灵气} —— 引擎通用结算
  const FUSIONS = {
    shuangren: { key: "shuangren", name: "霜刃剑阵", recipe: ["yujian", "xuanbing"], costQi: 40,
      dmg: 18, rate: 0.6, range: 150, ground: true, air: false, proj: "frostSword",
      slowF: 0.35, slowT: 1.2, chain: { n: 1, mul: 0.5 }, color: PAL.cyan, desc: "寒意附剑，剑气霜弹" },
    zhuxian: { key: "zhuxian", name: "诛仙剑阵", recipe: ["yujian", "tianlei"], costQi: 60,
      dmg: 26, rate: 0.7, range: 170, ground: true, air: false, proj: "thunderSword",
      chain: { n: 3, mul: 0.6 }, pierce: 0.3, color: PAL.red, desc: "连锁雷剑 · 招牌阵" },
    fenjian: { key: "fenjian", name: "焚天剑阵", recipe: ["yujian", "lieyan"], costQi: 40,
      dmg: 17, rate: 0.65, range: 145, ground: true, air: false, proj: "fireSword",
      dot: { dps: 6, dur: 3 }, color: PAL.red, desc: "剑锋燃焰，灼烧不熄" },
    wanjian: { key: "wanjian", name: "万剑归宗", recipe: ["yujian", "fukong"], costQi: 40,
      dmg: 16, rate: 0.5, range: 155, ground: true, air: true, proj: "sword",
      chain: { n: 1, mul: 0.45 }, color: PAL.green, desc: "对空对地，万剑齐发" },
    liaoyuan: { key: "liaoyuan", name: "燎原雾阵", recipe: ["lieyan", "xuanbing"], costQi: 45,
      dmg: 10, rate: 1.1, range: 130, ground: true, air: false, proj: "fire",
      splash: 60, splashMul: 0.6, dot: { dps: 5, dur: 2.5 }, color: PAL.purple, desc: "毒雾燎原，绵绵不绝" },
    zixiao: { key: "zixiao", name: "紫霄神雷", recipe: ["lieyan", "tianlei"], costQi: 50,
      dmg: 40, rate: 1.4, range: 160, ground: true, air: false, proj: "fire",
      splash: 55, splashMul: 0.8, pierce: 0.4, color: PAL.purple, desc: "雷火同源，高伤溅射" },
    danlu: { key: "danlu", name: "丹炉阵", recipe: ["lieyan", "juling"], costQi: 40,
      dmg: 12, rate: 0.9, range: 115, ground: true, air: false, proj: "fire",
      dot: { dps: 8, dur: 2 }, onKillQi: 2, color: PAL.gold, desc: "焚妖炼丹，斩之得灵" },
    hansuo: { key: "hansuo", name: "寒天锁空", recipe: ["xuanbing", "fukong"], costQi: 45,
      dmg: 10, rate: 0.9, range: 190, ground: false, air: true, proj: "lock",
      slowF: 0.5, slowT: 1.6, color: PAL.cyan, desc: "寒锁长空，飞舟滞行" },
    ningquan: { key: "ningquan", name: "玄冰凝泉", recipe: ["xuanbing", "juling"], costQi: 40,
      dmg: 8, rate: 1.2, range: 120, ground: true, air: false, proj: "bolt",
      slowF: 0.3, slowT: 1.0, qiPerSec: 0.35, color: PAL.cyan, desc: "凝泉成灵，缓滞生财" },
    leifa: { key: "leifa", name: "九天雷罚", recipe: ["tianlei", "fukong"], costQi: 45,
      dmg: 34, rate: 1.3, range: 200, ground: false, air: true, proj: "none",
      pierce: 0.3, color: PAL.gold, desc: "九天引罚，诛空中鳞甲" },
    yinlei: { key: "yinlei", name: "引雷纳灵", recipe: ["tianlei", "juling"], costQi: 45,
      dmg: 22, rate: 1.0, range: 155, ground: true, air: false, proj: "none",
      chain: { n: 1, mul: 0.5 }, onKillQi: 1, color: PAL.gold, desc: "雷归丹田，斩妖纳灵" },
    zhenwu: { key: "zhenwu", name: "真武阵", recipe: null, costQi: 25, secret: false,
      dmg: 0, rate: 0, range: 0, ground: true, air: true, proj: "sword",
      color: PAL.ink, desc: "同系归一，纯数强化", dynamic: true }, // 数值由同种融合动态生成
    // —— 图鉴暗格（表上不写，炼成才点亮） ——
    linlei: { key: "linlei", name: "凛雷阵", recipe: ["xuanbing", "tianlei"], costQi: 50, secret: true,
      dmg: 20, rate: 1.0, range: 150, ground: true, air: false, proj: "frostSword",
      stun: { chance: 0.18, dur: 1.1 }, chain: { n: 1, mul: 0.4 }, color: PAL.cyan, desc: "雷凝冰晶，触之即僵" },
    lingzhou: { key: "lingzhou", name: "御灵舟坞", recipe: ["fukong", "juling"], costQi: 45, secret: true,
      dmg: 14, rate: 0.7, range: 170, ground: false, air: true, proj: "lock",
      qiPerSec: 0.25, onKillAirQi: 3, color: PAL.green, desc: "御空纳灵，斩舟倍献" },
    fenkong: { key: "fenkong", name: "焚空阵", recipe: ["lieyan", "fukong"], costQi: 45, secret: true,
      dmg: 15, rate: 0.75, range: 165, ground: false, air: true, proj: "fire",
      dot: { dps: 7, dur: 2.5 }, color: PAL.red, desc: "焚符射空，灼烧飞鳞" },
    jianxin: { key: "jianxin", name: "剑心通明", recipe: ["yujian", "juling"], costQi: 40, secret: true,
      dmg: 14, rate: 0.55, range: 140, ground: true, air: false, proj: "sword",
      qiPerSec: 0.3, color: PAL.gold, desc: "心剑合一，御剑生灵" },
  };
  // 无序配方索引
  const FUSE_INDEX = {};
  for (const k of Object.keys(FUSIONS)) {
    const F = FUSIONS[k];
    if (!F.recipe) continue;
    FUSE_INDEX[[...F.recipe].sort().join("|")] = k;
  }
  // 融合阵升级费用（灵石）：按灵气配方折算，2/3 级递增（与基础阵的经济曲线衔接）
  for (const k of Object.keys(FUSIONS)) {
    const F = FUSIONS[k];
    if (!F.dynamic) F.up = [0, Math.round(F.costQi * 3), Math.round(F.costQi * 5.2)];
  }
  // 查配方：同种→真武阵（动态数值），无匹配→null
  function getFusion(a, b) {
    if (a === b) {
      const T = TOWERS[a];
      return {
        ...FUSIONS.zhenwu,
        key: "zhenwu_" + a,
        name: "真武阵·" + T.name.slice(0, 2),
        ele: T.ele, color: T.color, costQi: 25,
        dmg: T.dmg * 2.2, rate: T.rate, range: T.range + 30,
        ground: T.ground, air: T.air, proj: T.proj,
        splash: T.splash, splashMul: T.splashMul,
        slowF: T.slowF, slowT: T.slowT, pierce: T.pierce, qiRate: T.qiRate,
        up: [0, Math.round(25 * 1.5 * 2), Math.round(25 * 2.6 * 2)], desc: FUSIONS.zhenwu.desc,
      };
    }
    const k = FUSE_INDEX[[a, b].sort().join("|")];
    if (!k) return null;
    return FUSIONS[k];
  }
  const CODEX_ALL = Object.keys(FUSIONS); // 16 格（zhenwu 为代表格）

  // ---------- 妖兽表（每种惩罚一种偷懒布阵） ----------
  const FOES = {
    grunt:  { key: "grunt",  name: "妖兽小兵", hp: 32,  spd: 40, bounty: 6,  armor: 0,    leak: 1, r: 10, fly: false, regen: 0,    desc: "基础妖杂" },
    fox:    { key: "fox",    name: "赤瞳狐",   hp: 15,  spd: 92, bounty: 7,  armor: 0,    leak: 1, r: 9,  fly: false, regen: 0,    desc: "极速低血 · 罚慢速单发阵" },
    scale:  { key: "scale",  name: "鳞甲妖",   hp: 64,  spd: 30, bounty: 12, armor: 0.5,  leak: 1, r: 12, fly: false, regen: 0,    desc: "甲坚减免 · 罚低伤高频阵" },
    boat:   { key: "boat",   name: "御空飞舟", hp: 28,  spd: 55, bounty: 10, armor: 0,    leak: 1, r: 12, fly: true,  regen: 0,    desc: "直线御空 · 罚纯地面阵" },
    wolf:   { key: "wolf",   name: "妖狼",     hp: 19,  spd: 54, bounty: 4,  armor: 0,    leak: 1, r: 8,  fly: false, regen: 0,    desc: "狼群蜂拥 · 罚单体阵" },
    treant: { key: "treant", name: "再生木妖", hp: 115, spd: 23, bounty: 16, armor: 0,    leak: 2, r: 13, fly: false, regen: 0.02, desc: "持续回血 · 罚低 DPS 磨血" },
    boss:   { key: "boss",   name: "千年妖王", hp: 320, spd: 21, bounty: 90, armor: 0.2,  leak: 3, r: 20, fly: false, regen: 0.006, desc: "每十波临世 · HP 尖峰" },
  };

  // ---------- 30 波妖潮数据表（数值骨架，里程碑7用曲线脚本校准） ----------
  // hpMul = 1.11^w；新怪单独登场（telegraph 由 preview 负责）；压力峰之间留喘息波
  const HP_GROWTH = 1.11;
  function gw(w) { return Math.pow(HP_GROWTH, w); }
  function G(type, count, spacing) { return { type, count, spacing }; }
  const WAVES = [
    { n: 1,  groups: [G("grunt", 7, 1.05)], bonus: 18 },
    { n: 2,  groups: [G("grunt", 9, 0.95)], bonus: 20 },
    { n: 3,  groups: [G("grunt", 10, 0.85), G("grunt", 4, 0.7)], bonus: 24 },
    { n: 4,  groups: [G("grunt", 14, 0.75)], bonus: 26 },
    { n: 5,  groups: [G("fox", 9, 0.7)], bonus: 30 },                       // 赤瞳狐登场
    { n: 6,  groups: [G("grunt", 10, 0.75), G("fox", 6, 0.55)], bonus: 32 },
    { n: 7,  groups: [G("grunt", 13, 0.65), G("fox", 7, 0.5)], bonus: 36 },
    { n: 8,  groups: [G("scale", 5, 1.3)], bonus: 38 },                     // 鳞甲妖登场
    { n: 9,  groups: [G("boat", 8, 1.05)], bonus: 40 },                     // 御空飞舟登场（对空教学）
    { n: 10, groups: [G("boss", 1, 1), G("grunt", 8, 0.65)], bonus: 66 },   // 妖王一波
    { n: 11, groups: [G("wolf", 20, 0.38)], bonus: 48 },                    // 狼群登场
    { n: 12, groups: [G("wolf", 16, 0.36), G("fox", 8, 0.45), G("scale", 3, 1.2)], bonus: 50 },
    { n: 13, groups: [G("scale", 8, 1.0), G("grunt", 12, 0.55)], bonus: 54 },
    { n: 14, groups: [G("treant", 5, 1.5)], bonus: 52 },                    // 再生木妖登场
    { n: 15, groups: [G("boat", 10, 0.8), G("wolf", 12, 0.38)], bonus: 56 },
    { n: 16, groups: [G("scale", 10, 0.8), G("treant", 4, 1.3)], bonus: 60 },
    { n: 17, groups: [G("fox", 16, 0.32), G("wolf", 16, 0.34)], bonus: 62 },
    { n: 18, groups: [G("grunt", 24, 0.42), G("boat", 7, 0.9)], bonus: 66 },
    { n: 19, groups: [G("treant", 7, 1.0), G("scale", 8, 0.85)], bonus: 68 },
    { n: 20, groups: [G("boss", 2, 3), G("wolf", 14, 0.34)], bonus: 94 },   // 妖王双临
    { n: 21, groups: [G("boat", 12, 0.7), G("fox", 14, 0.32)], bonus: 76 },
    { n: 22, groups: [G("scale", 12, 0.6), G("treant", 6, 0.95)], bonus: 80 },
    { n: 23, groups: [G("wolf", 28, 0.26), G("boat", 9, 0.75)], bonus: 84 },
    { n: 24, groups: [G("fox", 18, 0.28), G("scale", 12, 0.6)], bonus: 86 },
    { n: 25, groups: [G("treant", 10, 0.85), G("wolf", 22, 0.28)], bonus: 88 },
    { n: 26, groups: [G("boat", 14, 0.55), G("scale", 12, 0.55)], bonus: 90 },
    { n: 27, groups: [G("fox", 24, 0.24), G("wolf", 24, 0.26), G("grunt", 18, 0.34)], bonus: 100 },
    { n: 28, groups: [G("scale", 9, 0.5), G("treant", 6, 0.75)], bonus: 122 },
    { n: 29, groups: [G("boat", 16, 0.48), G("wolf", 28, 0.24), G("fox", 16, 0.24)], bonus: 138 },
    { n: 30, groups: [G("boss", 2, 4), G("scale", 8, 0.5), G("boat", 5, 0.6)], bonus: 130 }, // 终波妖王双临+精锐护卫
  ];
  for (const w of WAVES) { w.hpMul = gw(w.n); w.spdMul = 1 + Math.min(0.5, (w.n - 1) * 0.018); }

  // ---------- 工具 ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let _id = 1;
  const nid = () => _id++;

  // ---------- 游戏状态 ----------
  function createGame(opts) {
    opts = opts || {};
    return {
      gold: 120, qi: 10, lives: 10,
      wave: 0, totalWaves: WAVES.length,
      phase: "build",        // build → wave → win/over
      autoT: Infinity,       // 波间倒计时（首波无限建造期）
      speed: 1,              // 快进（渲染层把 dt×speed 分片喂 gameStep）
      enemies: [], towers: [], projectiles: [],
      buildQueue: [],        // 生成队列 [{type, at(绝对时刻)}]，绝对时刻用 g.clock
      clock: 0, kills: 0, leaked: 0, events: [],
      spentTotal: 0,
      rng: mulberry32(opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0),
      endless: false,        // 里程碑8
      codex: {},             // 融合图鉴：{ [fusionKey]: waveN }，炼成才点亮
      stats: { goldEarned: 0 },
      nextFoeId: 1,
    };
  }

  // ---------- 布阵 ----------
  const TOWER_R = 17;        // 基础阵体半径（渲染/布阵共用）
  function canPlace(g, x, y, typeKey) {
    if (x < TOWER_R + 6 || y < TOWER_R + 6 || x > MAP.W - TOWER_R - 6 || y > MAP.H - TOWER_R - 6)
      return { ok: false, why: "出界" };
    if (pathDistTo(x, y) < 30) return { ok: false, why: "距山道过近" };
    for (const t of g.towers) {
      if (Math.hypot(t.x - x, t.y - y) < radiusOf(t) + TOWER_R + 4) return { ok: false, why: "与阵法重叠" };
    }
    const T = TOWERS[typeKey];
    if (!T) return { ok: false, why: "未知阵法" };
    if (g.gold < T.cost) return { ok: false, why: "灵石不足" };
    return { ok: true };
  }
  function placeTower(g, x, y, typeKey) {
    if (!canPlace(g, x, y, typeKey).ok) return null;
    const T = TOWERS[typeKey];
    g.gold -= T.cost;
    const t = {
      id: nid(), kind: "base", type: typeKey, name: T.name,
      x, y, cd: 0, lvl: 1, spent: T.cost, angle: -Math.PI / 2,
      mode: "first", traits: [], realm: 0, fuseOf: null,
      spin: g.rng() * Math.PI * 2, // 符纹缓转相位
    };
    g.towers.push(t);
    return t;
  }

  // ---------- 妖兽生成 ----------
  // opts: { d, spdMul, hpMul }（测试钩子=正式生成路径）
  function spawnFoe(g, typeKey, opts) {
    opts = opts || {};
    const F = FOES[typeKey];
    if (!F) return null;
    const hpMul = opts.hpMul != null ? opts.hpMul : 1;
    const e = {
      id: nid(), type: typeKey, name: F.name,
      hp: F.hp * hpMul, maxhp: F.hp * hpMul,
      baseSpd: F.spd * (opts.spdMul != null ? opts.spdMul : 1),
      spd: F.spd * (opts.spdMul != null ? opts.spdMul : 1),
      d: opts.d || 0, armor: F.armor, fly: F.fly, regen: F.regen,
      bounty: F.bounty, leakDamage: F.leak, r: F.r,
      slowT: 0, slowF: 0, burnDps: 0, burnT: 0, stunT: 0,
      dead: false, leaked: false, hitT: 0,
      wob: g.rng() * Math.PI * 2, // 步态相位
    };
    if (e.fly) { e.flyT = 0; } // 航线进度
    g.enemies.push(e);
    return e;
  }

  // ---------- 波次 ----------
  function startWave(g) {
    if (g.phase !== "build") return false;
    const w = WAVES[g.wave];
    if (!w) return false;
    // 提前召妖奖励：剩余倒计时折算灵气（奖励自信，不淹没主经济）
    let qiBonus = 0;
    if (isFinite(g.autoT) && g.autoT > 0) qiBonus = Math.ceil(g.autoT * 0.5);
    if (qiBonus > 0) g.events && g.events.push({ t: "qiGift", qi: qiBonus });
    g.qi += qiBonus;
    // 生成队列：groups 依次铺开
    let t0 = g.clock;
    g.buildQueue = [];
    for (const grp of w.groups) {
      for (let i = 0; i < grp.count; i++) {
        g.buildQueue.push({ type: grp.type, at: t0, hpMul: w.hpMul, spdMul: w.spdMul });
        t0 += grp.spacing;
      }
    }
    g.phase = "wave";
    g.waveBonus = w.bonus;
    return true;
  }
  // 下一波预告（渲染 UI 用）
  function wavePreview(g) {
    const w = WAVES[g.wave];
    if (!w) return null;
    const parts = [];
    for (const grp of w.groups) {
      const F = FOES[grp.type];
      const p = parts.find(x => x.key === grp.type);
      if (p) p.count += grp.count; else parts.push({ key: grp.type, name: F.name, count: grp.count, fly: F.fly, boss: grp.type === "boss" });
    }
    return { n: w.n, parts, bonus: w.bonus };
  }

  // ---------- 阵法属性统一访问器（基础/融合一视同仁） ----------
  function stats(t) { return TOWERS[t.type] || FUSIONS_BY_KEY(t.type) || null; }
  function FUSIONS_BY_KEY(k) {
    if (!k.startsWith("zhenwu_")) return FUSIONS[k] || null;
    // 真武阵动态：还原母阵
    const base = k.slice(7);
    return getFusion(base, base);
  }
  function radiusOf(t) { return t.kind === "fusion" ? 30 : TOWER_R; }

  // ---------- 索敌（skill：默认 first = 路径进度优先） ----------
  function acquire(t, g) {
    const T = stats(t);
    if (!T) return null;
    let best = null, score = -Infinity;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const canHit = e.fly ? T.air : T.ground;
      if (!canHit) continue;
      const [ex, ey] = foePos(g, e);
      const dd = Math.hypot(ex - t.x, ey - t.y);
      if (dd > towerRange(t)) continue;
      let s;
      switch (t.mode) {
        case "closest": s = -dd; break;
        case "strongest": s = e.hp; break;
        case "weakest": s = -e.hp; break;
        default: s = e.fly ? e.flyT * FLY_LEN : e.d; // first
      }
      if (s > score) { score = s; best = e; }
    }
    return best;
  }
  function towerRange(t) {
    const T = stats(t);
    if (T) return T.range + (t.lvl - 1) * 10 + (t.rangeBonus || 0);
    return 0;
  }

  // ---------- 升级 / 出售 / 索敌切换（里程碑3） ----------
  function upgradeTower(g, id) {
    const t = g.towers.find(x => x.id === id);
    if (!t || t.lvl >= 3) return { ok: false, why: "已达三级" };
    const T = stats(t);
    if (!T) return { ok: false, why: "未知阵法" };
    const cost = T.up[t.lvl];
    if (g.gold < cost) return { ok: false, why: "灵石不足" };
    g.gold -= cost; t.spent += cost; t.lvl++;
    return { ok: true, cost, lvl: t.lvl };
  }
  function sellTower(g, id) {
    const i = g.towers.findIndex(x => x.id === id);
    if (i < 0) return { ok: false, refund: 0 };
    const t = g.towers[i];
    const refund = Math.round(t.spent * 0.7);
    g.gold += refund;
    g.towers.splice(i, 1);
    return { ok: true, refund };
  }
  function setTargetMode(g, id, mode) {
    const t = g.towers.find(x => x.id === id);
    if (!t || !["first", "last", "closest", "strongest", "weakest"].includes(mode)) return false;
    t.mode = mode;
    return true;
  }

  // ---------- 阵法融合（里程碑4 · 游戏灵魂） ----------
  const FUSE_DIST = TOWER_R * 3; // 相邻阈值：两阵圆心 ≤ 51px（禁重叠 38px 之上留出宽松环带，拖拽手感友好）
  function canFuse(g, idA, idB) {
    const a = g.towers.find(x => x.id === idA), b = g.towers.find(x => x.id === idB);
    if (!a || !b || a === b) return { ok: false, why: "无效目标" };
    if (a.kind === "fusion" || b.kind === "fusion") return { ok: false, why: "融合阵不可再融合" };
    if (Math.hypot(a.x - b.x, a.y - b.y) > FUSE_DIST) return { ok: false, why: "两阵不相邻" };
    const F = getFusion(a.type, b.type);
    if (!F) return { ok: false, why: "无此配方" };
    if (g.qi < F.costQi) return { ok: false, why: "灵气不足", need: F.costQi, have: Math.floor(g.qi) };
    return { ok: true, fusion: F };
  }
  // 拖 A 到 B 上 → A 为体（保留位置），B 化入；等级继承=max，投入折算 70% 入灵气
  function fuseTowers(g, idA, idB) {
    const chk = canFuse(g, idA, idB);
    if (!chk.ok) return chk;
    const a = g.towers.find(x => x.id === idA), b = g.towers.find(x => x.id === idB);
    const F = chk.fusion;
    g.qi -= F.costQi;
    const lvl = Math.max(a.lvl, b.lvl);
    const spent = a.spent + b.spent;
    // 移除 B
    const bi = g.towers.indexOf(b);
    g.towers.splice(bi, 1);
    // A 原地化融合阵
    a.kind = "fusion";
    a.type = F.key.startsWith("zhenwu") ? "zhenwu_" + a.type : F.key;
    a.name = F.name;
    a.lvl = lvl;
    a.spent = spent;
    a.fuseOf = [a.type === F.key ? F.recipe : null, b.type].filter(Boolean);
    a.fuseRecipe = chk.fusion.recipe || [b.type, b.type]; // 记录配方（真武为同种对）
    a.cd = 0;
    a.color = F.color;
    a.spin = g.rng() * Math.PI * 2;
    // 图鉴点亮（真武统一记 zhenwu 格）
    const codexKey = F.key === "zhenwu" || F.dynamic ? "zhenwu" : F.key;
    const isNew = !(codexKey in g.codex);
    if (isNew) g.codex[codexKey] = g.wave + 1;
    g.events.push({ t: "fuse", x: a.x, y: a.y, name: F.name, isNew, codexKey, color: F.color });
    return { ok: true, fusion: F, isNew, codexKey };
  }
  // 图鉴全集（渲染 UI 用；真武 1 格代表）
  function codexList() {
    return Object.keys(FUSIONS).map(k => {
      const F = FUSIONS[k];
      return { key: k, name: F.name, desc: F.desc, secret: !!F.secret, recipe: F.recipe, color: F.color, costQi: F.costQi };
    });
  }
  // 融合阵的战斗属性（里程碑4启用；这里先给占位，避免 acquire 崩）
  function FUSION_TOWER_STATS(t) { return { ground: false, air: false }; }

  function foePos(g, e) {
    if (e.fly) return flyPos(e.flyT || 0);
    return posAt(e.d);
  }

  // ---------- 伤害结算 ----------
  function hitEnemy(g, e, dmg, opts) {
    opts = opts || {};
    if (e.dead) return 0;
    const pierce = opts.pierce || 0;
    const eff = dmg * (1 - Math.min(0.85, e.armor) * (1 - pierce));
    e.hp -= eff;
    e.hitT = 0.18; // 受击白闪
    g.events.push({ t: "hit", x: foePos(g, e)[0], y: foePos(g, e)[1], dmg: Math.round(eff), eid: e.id, ele: opts.ele || "metal" });
    if (e.hp <= 0) killEnemy(g, e, opts.tw, opts.ele);
    return eff;
  }
  // 击杀结算（直伤/DoT 共用；tw=来源阵法，融合阵吃 onKillQi 类词条）
  function killEnemy(g, e, tw, ele) {
    if (e.dead) return;
    e.dead = true;
    const b = bountyOf(e, g.wave + 1);
    g.gold += b; g.stats.goldEarned += b;
    g.qi += 1; g.kills++;
    if (tw) {
      const T = stats(tw);
      if (T && T.onKillQi) g.qi += T.onKillQi;
      if (T && T.onKillAirQi && e.fly) g.qi += T.onKillAirQi;
    }
    g.events.push({ t: "kill", x: foePos(g, e)[0], y: foePos(g, e)[1], bounty: b, eid: e.id, big: e.type === "boss", qi: 1 + ((tw && stats(tw) && stats(tw).onKillQi) || 0) });
  }

  // ---------- 主步 ----------
  function gameStep(g, dt) {
    g.events = [];
    if (g.phase === "over" || g.phase === "win") return g.events;
    g.clock += dt;

    // --- 建造期倒计时 ---
    if (g.phase === "build" && g.wave > 0) {
      g.autoT -= dt;
      if (g.autoT <= 0) startWave(g);
    }

    // --- 生成队列 ---
    if (g.phase === "wave") {
      while (g.buildQueue.length && g.buildQueue[0].at <= g.clock) {
        const q = g.buildQueue.shift();
        const e = spawnFoe(g, q.type, { hpMul: q.hpMul, spdMul: q.spdMul });
        g.events.push({ t: "spawn", eid: e ? e.id : 0, type: q.type });
      }
    }

    // --- 妖兽行进 ---
    for (const e of g.enemies) {
      if (e.dead) continue;
      // 减速/定身衰减
      if (e.slowT > 0) e.slowT -= dt;
      if (e.stunT > 0) e.stunT -= dt;
      // 燃烧 DoT（里程碑4/5 机制，字段先通）
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= e.burnDps * dt;
        if (g.clock % 0.2 < dt) g.events.push({ t: "burn", x: foePos(g, e)[0], y: foePos(g, e)[1] });
        if (e.hp <= 0) { killEnemy(g, e, e.dotTw, "fire"); continue; }
      }
      // 回血（再生木妖）
      if (e.regen > 0 && e.hp < e.maxhp) e.hp = Math.min(e.maxhp, e.hp + e.maxhp * e.regen * dt);
      // 受击闪衰减
      if (e.hitT > 0) e.hitT -= dt;
      // 移动（携带剩余距离天然满足；快慢速同帧推进；定身冻结）
      const mul = e.stunT > 0 ? 0 : (e.slowT > 0 ? (1 - e.slowF) : 1);
      if (e.fly) {
        e.flyT += (e.spd * mul * dt) / FLY_LEN;
        if (e.flyT >= 1) { leak(g, e); continue; }
      } else {
        e.d += e.spd * mul * dt;
        if (e.d >= PLEN) { leak(g, e); continue; }
      }
    }
    g.enemies = g.enemies.filter(e => !e.dead && !e.leaked);

    // --- 塔攻击 ---
    for (const t of g.towers) {
      t.spin += dt;
      const T = stats(t);
      if (!T) continue;
      // 产灵气（聚灵/凝泉/舟坞/剑心）
      const qRate = (T.qiRate || T.qiPerSec || 0);
      if (qRate) g.qi += qRate * dt * (1 + (t.lvl - 1) * 0.5);
      if (!T.rate || T.rate <= 0) continue; // 纯产灵阵不攻击
      if (t.cd > 0) { t.cd -= dt; continue; }
      const target = acquire(t, g);
      if (!target) continue;
      const [tx, ty] = foePos(g, target);
      t.angle = Math.atan2(ty - t.y, tx - t.x);
      const dmg = towerDmg(t);
      t.cd = T.rate * Math.pow(0.92, t.lvl - 1);
      const common = {
        chain: T.chain || null, dot: T.dot || null, stun: T.stun || null,
        onKillQi: T.onKillQi || 0, onKillAirQi: T.onKillAirQi || 0,
        splash: T.splash || 0, splashMul: T.splashMul || 0.7,
        pierce: T.pierce || 0, slowF: T.slowF || 0, slowT: T.slowT || 0,
        ele: T.ele, srcId: t.id, born: g.clock, tw: t,
      };
      if (T.proj === "none") {
        // 即时雷击（天雷/雷罚/引雷）
        hitEnemy(g, target, dmg, { pierce: T.pierce || 0, ele: "thunder", tw: t });
        procChain(g, tx, ty, dmg, T.chain, T.pierce || 0, target.id);
        g.events.push({ t: "bolt", x: t.x, y: t.y, tx, ty });
      } else {
        g.projectiles.push({
          id: nid(), kind: T.proj, x: t.x, y: t.y, tx, ty,
          targetId: target.id, spd: 500, dmg, ...common,
        });
        g.events.push({ t: "shot", x: t.x, y: t.y, tx, ty, kind: T.proj });
      }
    }

    // --- 弹道 ---
    for (const p of g.projectiles) {
      // 目标活着则追踪其位置（制导剑气）
      const tgt = g.enemies.find(e => e.id === p.targetId && !e.dead && !e.leaked);
      if (tgt) { const [nx, ny] = foePos(g, tgt); p.tx = nx; p.ty = ny; }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const L = Math.hypot(dx, dy);
      const step = p.spd * dt;
      if (L <= step) {
        p.done = true;
        const opts = { pierce: p.pierce, ele: p.ele, tw: p.tw };
        if (p.splash) {
          // AoE：落点溅射（主目标全额，其余溅射；附带 DoT/减速/定身）
          for (const e of g.enemies) {
            if (e.dead || e.fly) continue;
            const [ex, ey] = foePos(g, e);
            if (Math.hypot(ex - p.tx, ey - p.ty) <= p.splash) {
              hitEnemy(g, e, p.dmg * (e.id === p.targetId ? 1 : p.splashMul), opts);
              applyDot(e, p.dot, p.tw);
              if (p.slowF) { e.slowF = Math.max(e.slowT > 0 ? e.slowF : 0, p.slowF); e.slowT = Math.max(e.slowT, p.slowT); }
              procStun(g, e, p.stun);
            }
          }
          g.events.push({ t: "boom", x: p.tx, y: p.ty, r: p.splash, ele: p.ele });
          procChain(g, p.tx, p.ty, p.dmg, p.chain, p.pierce, p.targetId);
        } else {
          const e = tgt;
          if (e) {
            hitEnemy(g, e, p.dmg, opts);
            applyDot(e, p.dot, p.tw);
            if (p.slowF) { e.slowF = Math.max(e.slowT > 0 ? e.slowF : 0, p.slowF); e.slowT = Math.max(e.slowT, p.slowT); }
            procStun(g, e, p.stun);
            procChain(g, p.tx, p.ty, p.dmg, p.chain, p.pierce, e.id);
          } else {
            g.events.push({ t: "whiff", x: p.tx, y: p.ty });
          }
        }
      } else {
        p.x += (dx / L) * step; p.y += (dy / L) * step;
      }
    }
    g.projectiles = g.projectiles.filter(p => !p.done);

    // 塔与弹道造成的死亡在本步内出列，保证步进后状态干净
    g.enemies = g.enemies.filter(e => !e.dead && !e.leaked);

    // --- 波次结算 ---
    if (g.phase === "wave" && g.buildQueue.length === 0 && g.enemies.length === 0) {
      g.gold += g.waveBonus; g.stats.goldEarned += g.waveBonus;
      g.qi += 2 + Math.floor(g.wave / 3);
      g.events.push({ t: "waveClear", n: g.wave, bonus: g.waveBonus });
      g.wave++;
      if (!g.endless && g.wave >= g.totalWaves) { g.phase = "win"; g.events.push({ t: "win" }); }
      else { g.phase = "build"; g.autoT = 14; }
    }
    return g.events;
  }

  function leak(g, e) {
    e.leaked = true;
    g.lives -= e.leakDamage; g.leaked++;
    g.events.push({ t: "leak", x: foePos(g, e)[0], y: foePos(g, e)[1], dmg: e.leakDamage });
    if (g.lives <= 0) { g.lives = 0; g.phase = "over"; g.events.push({ t: "lose" }); }
  }

  // 升级伤害/速度
  function towerDmg(t) {
    const T = stats(t);
    if (!T) return 0;
    return T.dmg * Math.pow(1.45, t.lvl - 1);
  }

  // ---------- 特殊机制结算（融合阵） ----------
  function applyDot(e, dot, tw) {
    if (!dot) return;
    e.burnDps = Math.max(e.burnDps, dot.dps);
    e.burnT = Math.max(e.burnT, dot.dur);
    if (tw) e.dotTw = tw;
  }
  function procStun(g, e, stun) {
    if (!stun) return;
    if (g.rng() < stun.chance) { e.stunT = Math.max(e.stunT, stun.dur); g.events.push({ t: "stun", x: foePos(g, e)[0], y: foePos(g, e)[1] }); }
  }
  function procChain(g, fromX, fromY, dmg, chain, pierce, excludeId) {
    if (!chain || chain.n <= 0) return;
    let cx = fromX, cy = fromY;
    const hit = new Set([excludeId]);
    for (let i = 0; i < chain.n; i++) {
      let best = null, bd = 1e9;
      for (const e of g.enemies) {
        if (e.dead || hit.has(e.id)) continue;
        const [ex, ey] = foePos(g, e);
        const dd = Math.hypot(ex - cx, ey - cy);
        if (dd < 130 && dd < bd) { bd = dd; best = e; }
      }
      if (!best) break;
      hit.add(best.id);
      const [ex, ey] = foePos(g, best);
      g.events.push({ t: "chain", x: cx, y: cy, tx: ex, ty: ey, ele: "thunder" });
      hitEnemy(g, best, dmg * chain.mul, { pierce, ele: "thunder" });
      cx = ex; cy = ey;
    }
  }

  // ---------- 曲线检查导出（td_curve_check.py 的输入格式；1 tile = 20px） ----------
  const TILE = 20; // px per tile
  function curveSpec() {
    return {
      start_gold: 120,
      tower: { cost: 40, dps: 20 },          // 参考塔=御剑（最便宜基准）
      kill_zone: 12,                          // 130px 射程贴路 45px ≈ 244px ≈ 12 tiles
      efficiency: 0.55,
      waves: WAVES.map(w => ({
        clear_bonus: w.bonus,
        groups: w.groups.map(grp => {
          const F = FOES[grp.type];
          return {
            hp: Math.round(F.hp * w.hpMul),
            count: grp.count,
            speed: +(F.spd * w.spdMul / TILE).toFixed(2),
            spacing: grp.spacing,
            bounty: bountyOf(F, w.n),
            armor: F.armor,
          };
        }),
      })),
    };
  }
  // 赏金随波次的增长（收入曲线与 HP 曲线复利对冲）
  function bountyOf(e, waveN) { return Math.round(e.bounty * (1 + waveN * 0.03)); }

  // ---------- 导出 ----------
  const Core = {
    MAP, PATH, GATE, SPAWN, PLEN, segs, posAt, pathNormal, pathDistTo, flyPos, FLY_LEN,
    PAL, TOWERS, BASE_KEYS, FOES, WAVES, HP_GROWTH,
    createGame, canPlace, placeTower, spawnFoe, startWave, wavePreview, gameStep,
    acquire, towerRange, towerDmg, foePos, hitEnemy, TOWER_R, curveSpec, bountyOf,
    upgradeTower, sellTower, setTargetMode,
    FUSIONS, getFusion, CODEX_ALL, canFuse, fuseTowers, codexList, radiusOf, FUSE_DIST,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Core;
  else global.Core = Core;

})(typeof window !== "undefined" ? window : globalThis);
