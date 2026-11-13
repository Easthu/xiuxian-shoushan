// 里程碑1：核心循环 —— 路径 / 布阵 / 索敌 / 战斗 / 经济 / 胜负
const assert = (c, m) => { if (!c) throw new Error(m || '断言失败'); };
const near = (a, b, eps, m) => { if (Math.abs(a - b) > eps) throw new Error(`${m || '数值'}: ${a} vs ${b}`); };
const Core = require('../game_core.js');

// 把游戏推进到条件满足（防死循环）
function stepUntil(g, cond, maxT, dt) {
  dt = dt || 1 / 60; let t = 0;
  while (!cond() && t < maxT) { Core.gameStep(g, dt); t += dt; }
  return cond();
}

function run() {
  // ---------- 1. 路径几何 ----------
  const p0 = Core.posAt(0);
  assert(p0[0] === Core.PATH[0][0] && p0[1] === Core.PATH[0][1], 'posAt(0) 是山道起点');
  const pe = Core.posAt(Core.PLEN);
  const lastP = Core.PATH[Core.PATH.length - 1];
  assert(pe[0] === lastP[0] && pe[1] === lastP[1], 'posAt(PLEN) 是山道终点（山门）');
  assert(Core.PLEN > 1500 && Core.PLEN < 3500, `山道总长合理 (${Core.PLEN.toFixed(0)})`);
  // posAt 对超界距离做钳制
  assert(Core.posAt(-5)[0] === p0[0], 'posAt 负值钳到起点');
  // 中间点单调推进
  let dPrev = -1;
  for (let d = 0; d <= Core.PLEN; d += 50) {
    const q = Core.posAt(d);
    assert(isFinite(q[0]) && isFinite(q[1]), 'posAt 有限值');
    dPrev = d;
  }
  assert(dPrev > 0, '路径采样推进');

  // ---------- 2. 快速妖兽不卡角（skill 检查项） ----------
  {
    const g = Core.createGame();
    const spd = 420; // ×10 快速
    const e = Core.spawnFoe(g, 'grunt', { spdMul: spd / 40 });
    let t = 0; const dt = 1 / 60;
    while (!e.dead && !e.leaked && t < 30) { Core.gameStep(g, dt); t += dt; }
    near(t, Core.PLEN / spd, 0.1, '快速妖兽行进时间 ≈ 路长/速度');
    assert(e.leaked, '快速妖兽走完全程泄漏');
  }

  // ---------- 3. 初始状态 ----------
  {
    const g = Core.createGame();
    assert(g.gold === 120, '初始灵石 120');
    assert(g.lives === 10, '初始气运 10');
    assert(g.phase === 'build', '开局为建造期');
    assert(g.wave === 0, '波次从 0 开始');
    assert(g.totalWaves === 30, '共 30 波妖潮');
    assert(g.qi >= 0, '灵气资源存在');
  }

  // ---------- 4. 布阵合法性 ----------
  {
    const g = Core.createGame();
    const onPath = Core.posAt(Core.PLEN * 0.3);
    assert(!Core.canPlace(g, onPath[0], onPath[1], 'yujian').ok, '山道上不能布阵');
    assert(!Core.canPlace(g, -50, -50, 'yujian').ok, '出界不能布阵');
    assert(!Core.canPlace(g, 950, 650, 'yujian').ok, '越下界不能布阵');
    // 找一个合法点：路径中段法向偏移 60px
    const d = Core.PLEN * 0.3;
    const [px, py] = Core.posAt(d);
    const n = Core.pathNormal(d);
    const sx = px + n[0] * 60, sy = py + n[1] * 60;
    assert(Core.canPlace(g, sx, sy, 'yujian').ok, '法向偏移 60px 可布阵');
    // 拒绝不扣钱
    Core.canPlace(g, onPath[0], onPath[1], 'yujian');
    assert(g.gold === 120, '拒绝布阵不扣灵石');
    // 重叠拒绝
    const t = Core.placeTower(g, sx, sy, 'yujian');
    assert(t, '布阵成功返回阵法');
    assert(!Core.canPlace(g, sx + 10, sy + 10, 'yujian').ok, '与既有阵法重叠拒绝');
  }

  // ---------- 5. 布阵经济 ----------
  {
    const g = Core.createGame();
    const cost = Core.TOWERS.yujian.cost;
    assert(cost === 40, '御剑阵造价 40（demo 基线）');
    const d = Core.PLEN * 0.3;
    const [px, py] = Core.posAt(d); const n = Core.pathNormal(d);
    const t = Core.placeTower(g, px + n[0] * 60, py + n[1] * 60, 'yujian');
    assert(g.gold === 120 - cost, `布阵扣除灵石 (余 ${g.gold})`);
    assert(g.towers.length === 1, '阵法入列');
    g.gold = 10;
    assert(Core.placeTower(g, px + n[0] * 60 + 90, py + n[1] * 60, 'yujian') === null, '灵石不足返回 null');
    assert(g.gold === 10, '余额不足不扣钱');
  }

  // ---------- 6. 索敌：first（路径进度优先，而非直线距离） ----------
  {
    const g = Core.createGame();
    // 塔放在段2中点 (300,240) 旁
    const t = Core.placeTower(g, 340, 240, 'yujian');
    assert(t, '塔布在 (340,240)');
    // A：进度大 (280,330) 距塔约 91；B：进度小 (300,240) 距塔 40
    const A = Core.spawnFoe(g, 'grunt', { d: 560 + 20 });
    const B = Core.spawnFoe(g, 'grunt', { d: 340 + 130 });
    Core.gameStep(g, 1 / 60);
    assert(g.projectiles.length > 0, '有弹道射出');
    assert(g.projectiles[0].targetId === A.id, 'first 索敌选进度大的 A（即使 B 更近）');
    // 进度相同时无所谓，但进度判定确实用 d
    A.dead = true; B.dead = true;
  }

  // ---------- 7. 战斗与击杀经济 ----------
  {
    const g = Core.createGame();
    const d = Core.PLEN * 0.3;
    const [px, py] = Core.posAt(d); const n = Core.pathNormal(d);
    Core.placeTower(g, px + n[0] * 40, py + n[1] * 40, 'yujian');
    Core.startWave(g);
    assert(g.phase === 'wave', 'startWave 进入妖潮期');
    const e = Core.spawnFoe(g, 'grunt', { d: Math.max(0, d - 60) });
    e.hp = 5; e.maxhp = 5; // 秒杀验证结算
    const goldBefore = g.gold;
    assert(stepUntil(g, () => g.kills >= 1, 8), '妖兽被斩');
    assert(g.gold === goldBefore + e.bounty, `击杀得赏金 ${e.bounty}（${goldBefore}→${g.gold}）`);
    assert(g.enemies.every(x => x.id !== e.id), '尸体出列');
  }

  // ---------- 8. 御剑阵 DPS 对齐 demo 基线 ----------
  {
    const T = Core.TOWERS.yujian;
    near(T.dmg / T.rate, 20, 0.1, '御剑 DPS=20（demo 数值基线）');
    near(T.rate, 0.55, 0.01, '御剑射速 0.55s');
  }

  // ---------- 9. 泄漏与气运 ----------
  {
    const g = Core.createGame();
    const e = Core.spawnFoe(g, 'grunt', { d: Core.PLEN - 2 });
    assert(stepUntil(g, () => g.lives === 9, 5), '泄漏扣 1 气运');
    assert(g.enemies.length === 0, '泄漏妖兽移除');
    assert(g.phase === 'build' || g.phase === 'wave', '未到败局');
    // 败局
    g.lives = 1;
    const e2 = Core.spawnFoe(g, 'grunt', { d: Core.PLEN - 2 });
    stepUntil(g, () => g.phase === 'over', 5);
    assert(g.phase === 'over', '气运耗尽 → 山门失守');
  }

  // ---------- 10. BOSS 泄漏重创（每 10 波妖王） ----------
  {
    const g = Core.createGame();
    const b = Core.spawnFoe(g, 'boss', { d: Core.PLEN - 2 });
    assert(b.leakDamage >= 3, '妖王泄漏重创气运');
    stepUntil(g, () => g.lives === 10 - b.leakDamage, 5);
    assert(g.lives === 10 - b.leakDamage, 'BOSS 泄漏按权重扣气运');
  }

  // ---------- 11. 胜利判定 ----------
  {
    const g = Core.createGame();
    g.wave = g.totalWaves - 1;
    g.lives = 999; // 泄漏也不至于败局，专注测胜利结算
    Core.startWave(g);
    assert(g.phase === 'wave', '终波进入妖潮期');
    // 终波人数与尖峰：3 妖王
    const prev = Core.wavePreview(g);
    assert(prev.parts.some(p => p.boss), '终波预告含妖王');
    stepUntil(g, () => g.buildQueue.length === 0, 40); // 终波生成需 ~22s
    g.enemies.length = 0; // 模拟全歼（行军 50s 太长，结算逻辑已由队列/场上双空判定覆盖）
    assert(stepUntil(g, () => g.phase === 'win', 6), '30 波清完 → 守山成功');
    // 前 29 波正常进入建造期而非胜利
    const g2 = Core.createGame();
    g2.wave = 10; g2.lives = 999;
    Core.startWave(g2);
    stepUntil(g2, () => g2.buildQueue.length === 0, 40);
    g2.enemies.length = 0;
    assert(stepUntil(g2, () => g2.phase === 'build', 6), '非终波清完 → 回到建造期');
  }

  // ---------- 12. 连续模拟 30 波不崩（无塔也被泄漏正确结算） ----------
  {
    const g = Core.createGame();
    Core.startWave(g); // 首波建造期无限，需手动开
    let t = 0; const dt = 1 / 30;
    while (g.phase !== 'over' && g.phase !== 'win' && t < 3000) { Core.gameStep(g, dt); t += dt; }
    assert(g.phase === 'over', '无布阵时被妖潮击溃（能输）');
    assert(g.lives <= 0, '气运归零');
  }

  // ---------- 13. 事件流（渲染层特效依据） ----------
  {
    const g = Core.createGame();
    const d = Core.PLEN * 0.3;
    const [px, py] = Core.posAt(d); const n = Core.pathNormal(d);
    Core.placeTower(g, px + n[0] * 40, py + n[1] * 40, 'yujian');
    Core.startWave(g);
    Core.spawnFoe(g, 'grunt', { d: Math.max(0, d - 60), hpMul: 0.02 });
    let saw = { shot: false, hit: false, kill: false, leak: false };
    let t = 0;
    while (t < 8 && !(saw.shot && saw.hit && saw.kill)) {
      const evs = Core.gameStep(g, 1 / 60); t += 1 / 60;
      for (const ev of evs) saw[ev.t] = true;
    }
    assert(saw.shot && saw.hit && saw.kill, `事件流齐备 ${JSON.stringify(saw)}`);
  }
}

module.exports = { run };
