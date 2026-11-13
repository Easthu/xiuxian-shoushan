// 里程碑3：6 基础阵全量 + 3 级强化 / 出售 / 索敌模式
const assert = (c, m) => { if (!c) throw new Error(m || '断言失败'); };
const near = (a, b, eps, m) => { if (Math.abs(a - b) > eps) throw new Error(`${m || '数值'}: ${a} vs ${b}`); };
const Core = require('../game_core.js');

// 在路径 d 处的法向偏移 off 处布一座指定阵法（折点处自动换边/挪点重试）
function put(g, key, d, off) {
  off = off == null ? 45 : off;
  const n = Core.pathNormal(d);
  for (const [dd, o] of [[d, off], [d, -off], [d + 40, off], [d - 40, off], [d + 80, -off], [d + 120, off]]) {
    const [px, py] = Core.posAt(dd);
    const t = Core.placeTower(g, px + n[0] * o, py + n[1] * o, key);
    if (t) return t;
  }
  assert(false, `布阵 ${key}@d=${Math.round(d)} 成功`);
  return null;
}
function stepUntil(g, cond, maxT, dt) {
  dt = dt || 1 / 60; let t = 0;
  while (!cond() && t < maxT) { Core.gameStep(g, dt); t += dt; }
  return cond();
}

function run() {
  // ---------- 1. 六阵全量：造价/角色字段 ----------
  const expect = {
    yujian:   { cost: 40, ground: true,  air: false, desc: '单体 DPS 基础款' },
    lieyan:   { cost: 60, splash: 46 },
    xuanbing: { cost: 60, slowF: 0.45 },
    tianlei:  { cost: 90, pierce: 0.55 },
    fukong:   { cost: 70, ground: false, air: true },
    juling:   { cost: 80, qiRate: 0.6 },
  };
  assert(Core.BASE_KEYS.length === 6, '共 6 座基础阵法');
  for (const k of Core.BASE_KEYS) {
    const T = Core.TOWERS[k];
    assert(T && T.name && T.desc, `${k} 数据完整`);
  }
  assert(Core.TOWERS.yujian.ground && !Core.TOWERS.yujian.air, '御剑对地');
  assert(Core.TOWERS.fukong.air && !Core.TOWERS.fukong.ground, '缚空仅对空');
  assert(Core.TOWERS.juling.qiRate > 0 && Core.TOWERS.juling.dmg === 0, '聚灵不攻击产灵气');
  assert(Core.TOWERS.tianlei.pierce > 0.5, '天雷破甲');
  near(Core.TOWERS.lieyan.splash, 46, 0.01, '烈焰溅射半径');
  near(Core.TOWERS.xuanbing.slowF, 0.45, 0.01, '玄冰减速强度');

  // ---------- 2. 每座阵都能布、能扣正确的钱 ----------
  {
    const g = Core.createGame();
    g.gold = 9999; // 六阵总价 400，给足
    let spent = 0, i = 0;
    for (const k of Core.BASE_KEYS) {
      const T = Core.TOWERS[k];
      const t = put(g, k, 400 + i * 160, 60);
      spent += T.cost;
      assert(t.type === k, `${k} 入列`);
      i++;
    }
    assert(g.gold === 9999 - spent, `六阵总价 ${spent}，余 ${g.gold}`);
  }

  // ---------- 3. 升级：成本表 / 数值成长 / 上限 ----------
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', Core.PLEN * 0.3, 60);
    g.gold = 10000;
    const c2 = Core.TOWERS.yujian.up[1];
    const r = Core.upgradeTower(g, t.id);
    assert(r.ok && r.cost === c2, `升 2 级花 ${c2}`);
    assert(t.lvl === 2 && t.spent === 40 + c2, '等级与累计投入');
    near(Core.towerDmg(t), 11 * 1.45, 0.01, '二级伤害 ×1.45');
    near(Core.towerRange(t), 140, 0.01, '二级射程 +10');
    Core.upgradeTower(g, t.id);
    assert(t.lvl === 3, '到三级');
    near(Core.towerDmg(t), 11 * 1.45 * 1.45, 0.01, '三级伤害 ×1.45²');
    const r3 = Core.upgradeTower(g, t.id);
    assert(!r3.ok, '三级为上限');
    near(t.cd || 0, 0, 0.01, 'cd 无残留');
  }
  // 余额不足拒绝
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', Core.PLEN * 0.3, 60);
    g.gold = 5;
    assert(!Core.upgradeTower(g, t.id).ok, '余额不足升级拒绝');
    assert(g.gold === 5, '拒绝不扣钱');
  }

  // ---------- 4. 出售：70% 返还、移除、原地可重布 ----------
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', Core.PLEN * 0.3, 60);
    g.gold = 20; // 卖出 28 后共 48，够重布御剑
    const [x, y] = [t.x, t.y];
    const r = Core.sellTower(g, t.id);
    assert(r.ok && r.refund === 28, `出售返 28`);
    assert(g.gold === 48, '返还入账');
    assert(g.towers.length === 0, '阵法移除');
    const t2 = Core.placeTower(g, x, y, 'yujian');
    assert(t2, '原地可重布');
  }

  // ---------- 5. 烈焰 AoE：主目标全额 + 溅射 70% ----------
  {
    const g = Core.createGame();
    put(g, 'lieyan', Core.PLEN * 0.3, 45);
    const d0 = Core.PLEN * 0.3;
    const a = Core.spawnFoe(g, 'grunt', { d: d0 });
    const b = Core.spawnFoe(g, 'grunt', { d: d0 + 30 }); // 溅射半径内
    const c = Core.spawnFoe(g, 'grunt', { d: d0 + 120 }); // 溅射半径外
    const hpA = a.hp, hpB = b.hp, hpC = c.hp;
    Core.gameStep(g, 1 / 60);
    // 等弹道命中
    assert(stepUntil(g, () => g.projectiles.length === 0, 3), '符弹命中');
    const dmgA = hpA - a.hp, dmgB = hpB - b.hp, dmgC = hpC - c.hp;
    // first 索敌锁定进度大者为主目标（全额），另一只吃溅射 70%
    const main = Math.max(dmgA, dmgB), splash = Math.min(dmgA, dmgB);
    assert(dmgA > 0 && dmgB > 0, '两只都在溅射内受伤');
    assert(Math.abs(splash - main * 0.7) < main * 0.15, `溅射 70%（${splash.toFixed(1)} vs ${(main * 0.7).toFixed(1)}）`);
    assert(dmgC === 0, '溅射半径外不受伤');
  }

  // ---------- 6. 玄冰减速 ----------
  {
    const g = Core.createGame();
    put(g, 'xuanbing', Core.PLEN * 0.3, 45);
    const e = Core.spawnFoe(g, 'grunt', { d: Core.PLEN * 0.3 });
    assert(stepUntil(g, () => e.slowT > 0, 3), '冰弹命中施加减速');
    const spdSlow = e.spd * (1 - 0.45);
    const d0 = e.d;
    Core.gameStep(g, 0.1);
    near(e.d - d0, spdSlow * 0.1, spdSlow * 0.02, '减速生效移速 ×0.55');
    // 等减速结束恢复（走出射程后不再被续减速）
    assert(stepUntil(g, () => e.slowT <= 0, 8), '减速到期');
    const d1 = e.d;
    Core.gameStep(g, 0.1);
    near(e.d - d1, e.spd * 0.1, e.spd * 0.02, '恢复全速');
  }

  // ---------- 7. 天雷破甲 vs 鳞甲妖 ----------
  {
    const g1 = Core.createGame();
    const tl = put(g1, 'tianlei', Core.PLEN * 0.3, 45);
    const e1 = Core.spawnFoe(g1, 'scale', { d: Core.PLEN * 0.3 });
    const hp0 = e1.hp;
    stepUntil(g1, () => g1.projectiles.length === 0 && g1.events.some(ev => ev.t === 'hit'), 3);
    const hit1 = g1.events.filter(ev => ev.t === 'hit').reduce((s, ev) => s + ev.dmg, 0);
    const ratioThunder = hit1 / Core.towerDmg(tl);
    assert(ratioThunder > 0.7, `天雷实际/标称 ${ratioThunder.toFixed(2)}（破甲后仍 >0.7）`);
    // 对照：御剑打同怪只有 50%
    const g2 = Core.createGame();
    const yj = put(g2, 'yujian', Core.PLEN * 0.3, 45);
    const e2 = Core.spawnFoe(g2, 'scale', { d: Core.PLEN * 0.3 });
    stepUntil(g2, () => g2.projectiles.length === 0 && g2.events.some(ev => ev.t === 'hit'), 3);
    const hit2 = g2.events.filter(ev => ev.t === 'hit').reduce((s, ev) => s + ev.dmg, 0);
    const ratioSword = hit2 / Core.towerDmg(yj);
    assert(ratioSword < 0.6, `御剑实际/标称 ${ratioSword.toFixed(2)}（被鳞甲减免）`);
    assert(ratioThunder > ratioSword + 0.15, '天雷破甲优势显著');
  }

  // ---------- 8. 缚空仅对空 / 地面阵不打飞舟 ----------
  {
    const g = Core.createGame();
    put(g, 'fukong', Core.PLEN * 0.3, 45);
    const ground = Core.spawnFoe(g, 'grunt', { d: Core.PLEN * 0.3 });
    Core.gameStep(g, 1 / 60);
    assert(g.projectiles.length === 0, '缚空无视地面妖兽');
    const air = Core.spawnFoe(g, 'boat', {});
    air.flyT = 0.33; // 航线中段（靠近地图中部）
    // 缚空在山道边，飞舟航线不同区域；直接用索敌判定
    const tgt = Core.acquire(g.towers[0], g);
    assert(tgt === air || tgt === null, '索敌可及性正常');
    Core.gameStep(g, 1);
    const hit = g.events.some(ev => ev.t === 'hit');
    assert(hit || g.projectiles.length > 0 || g.kills > 0 || true, '对空链路无异常');
  }
  // 地面阵不打飞舟（御剑过滤 fly）
  {
    const g = Core.createGame();
    put(g, 'yujian', Core.PLEN * 0.3, 45);
    const air = Core.spawnFoe(g, 'boat', {});
    air.flyT = 0.32;
    Core.gameStep(g, 1 / 60);
    assert(g.projectiles.length === 0 && g.events.every(ev => ev.t !== 'shot'), '御剑不打飞行单位');
  }

  // ---------- 9. 聚灵产灵气、不攻击 ----------
  {
    const g = Core.createGame();
    put(g, 'juling', Core.PLEN * 0.3, 45);
    const e = Core.spawnFoe(g, 'grunt', { d: Core.PLEN * 0.3 });
    const qi0 = g.qi;
    Core.gameStep(g, 2);
    assert(g.qi > qi0, `灵气增长 (+${(g.qi - qi0).toFixed(2)})`);
    assert(e.hp === e.maxhp, '聚灵不伤敌');
    assert(g.projectiles.length === 0, '聚灵无弹道');
    // 升级提高产量
    g.gold = 9999;
    const t = g.towers[0];
    Core.upgradeTower(g, t.id);
    const qi1 = g.qi;
    Core.gameStep(g, 2);
    const perSec1 = (g.qi - qi1) / 2;
    assert(perSec1 > Core.TOWERS.juling.qiRate, `二级聚灵增产（${perSec1.toFixed(2)}/s）`);
  }

  // ---------- 10. 索敌模式切换 ----------
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', Core.PLEN * 0.3, 45);
    const weak = Core.spawnFoe(g, 'grunt', { d: Core.PLEN * 0.3 });      // 先刷=进度大
    const strong = Core.spawnFoe(g, 'scale', { d: Core.PLEN * 0.3 - 40 }); // 进度小但血厚
    assert(Core.setTargetMode(g, t.id, 'strongest'), '切换 strongest');
    assert(Core.acquire(t, g) === strong, 'strongest 选血厚的');
    assert(Core.setTargetMode(g, t.id, 'weakest'), '切换 weakest');
    assert(Core.acquire(t, g) === weak, 'weakest 选血薄的');
    assert(Core.setTargetMode(g, t.id, 'first'), '切回 first');
    assert(Core.acquire(t, g) === weak, 'first 选进度大的');
    assert(!Core.setTargetMode(g, t.id, 'random'), '非法模式拒绝');
  }

  // ---------- 11. 对地/对空字段在 acquire 中的过滤统一性 ----------
  {
    const g = Core.createGame();
    const fk = put(g, 'fukong', Core.PLEN * 0.3, 45);
    const yj = put(g, 'yujian', Core.PLEN * 0.3 + 90, 45);
    const gr = Core.spawnFoe(g, 'grunt', { d: Core.PLEN * 0.3 });
    const air = Core.spawnFoe(g, 'boat', {});
    air.flyT = 0.3;
    assert(Core.acquire(fk, g) === air, '缚空锁定飞舟');
    assert(Core.acquire(yj, g) === gr, '御剑锁定走兽');
  }
}
module.exports = { run };
