// 里程碑5：渡劫升境 + 词条池（风险成长）
const assert = (c, m) => { if (!c) throw new Error(m || '断言失败'); };
const near = (a, b, eps, m) => { if (Math.abs(a - b) > eps) throw new Error(`${m || '数值'}: ${a} vs ${b}`); };
const Core = require('../game_core.js');

function put(g, key, d, off) {
  off = off == null ? 45 : off;
  g.gold = Math.max(g.gold, 9999);
  for (const [dd, o] of [[d, off], [d, -off], [d + 40, off], [d - 40, off], [d + 80, -off]]) {
    const [px, py] = Core.posAt(dd); const n = Core.pathNormal(dd);
    const t = Core.placeTower(g, px + n[0] * o, py + n[1] * o, key);
    if (t) return t;
  }
  assert(false, `布阵 ${key} 失败`);
  return null;
}
function stepUntil(g, cond, maxT, dt) {
  dt = dt || 1 / 60; let t = 0;
  while (!cond() && t < maxT) { Core.gameStep(g, dt); t += dt; }
  return cond();
}

function run() {
  // ---------- 1. 词条池 ≥12、境界表 ----------
  assert(Core.TRIB_FAIL.length === 3, '三境失败率');
  near(Core.TRIB_FAIL[0], 0.20, 1e-9, '筑基失败率 20%');
  near(Core.TRIB_FAIL[1], 0.35, 1e-9, '金丹失败率 35%');
  near(Core.TRIB_FAIL[2], 0.50, 1e-9, '元婴失败率 50%');
  assert(Core.TRAIT_KEYS.length >= 12, `词条池 ≥12（实际 ${Core.TRAIT_KEYS.length}）`);
  assert(Core.REALMS.length === 4 && Core.REALMS[0] === '练气' && Core.REALMS[3] === '元婴', '四境：练气→元婴');

  // ---------- 2. 渡劫前置：需三级、需灵气 ----------
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', 500);
    let r = Core.attemptTribulation(g, t.id);
    assert(!r.ok && r.why === '需三级阵法', '一级不可渡劫');
    Core.upgradeTower(g, t.id);
    r = Core.attemptTribulation(g, t.id);
    assert(!r.ok, '二级不可渡劫');
    Core.upgradeTower(g, t.id);
    g.qi = 5;
    r = Core.attemptTribulation(g, t.id);
    assert(!r.ok && r.why === '灵气不足', '灵气不足拒绝');
    assert(g.qi === 5, '拒绝不扣灵气');
    g.qi = 100;
    r = Core.attemptTribulation(g, t.id, { force: 'win' });
    assert(r.ok && r.win && t.realm === 1, '三级渡劫成功入筑基');
    assert(g.qi === 100 - 30, '扣 30 灵气');
    assert(r.trait && t.traits.length === 1, `得 1 词条（${r.name}）`);
  }

  // ---------- 3. 失败降级不碎 ----------
  {
    const g = Core.createGame();
    const t = put(g, 'tianlei', 500);
    Core.upgradeTower(g, t.id); Core.upgradeTower(g, t.id);
    g.qi = 500;
    const r = Core.attemptTribulation(g, t.id, { force: 'lose' });
    assert(r.ok && !r.win, '渡劫失败');
    assert(t.lvl === 2, '失败降一级（阵法仍在）');
    assert(t.realm === 0, '境界不升');
    assert(g.qi === 500 - 30, '灵气照扣（风险成本）');
    // 降级后可再升回来再渡
    Core.upgradeTower(g, t.id);
    assert(t.lvl === 3, '可重新升回三级');
  }

  // ---------- 4. 连渡三境到元婴 + 词条不重复 ----------
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', 500);
    Core.upgradeTower(g, t.id); Core.upgradeTower(g, t.id);
    g.qi = 999;
    for (let i = 0; i < 3; i++) {
      const r = Core.attemptTribulation(g, t.id, { force: 'win' });
      if (!t || t.lvl < 3) Core.upgradeTower(g, t.id); // 失败不留级，这里全 force win
      assert(r.win, `第 ${i + 1} 渡成功`);
    }
    assert(t.realm === 3, '元婴圆满');
    assert(new Set(t.traits).size === 3, '词条不重复');
    const r4 = Core.attemptTribulation(g, t.id, { force: 'win' });
    assert(!r4.ok && r4.why === '已至元婴', '元婴后不可再渡');
  }

  // ---------- 5. 境界数值成长 ×1.25^realm ----------
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', 500);
    Core.upgradeTower(g, t.id); Core.upgradeTower(g, t.id);
    const dmg3 = Core.towerDmg(t);
    g.qi = 999;
    Core.attemptTribulation(g, t.id, { force: 'win' });
    const dmgT = Core.towerDmg(t);
    near(dmgT, dmg3 * 1.25, 0.01, '筑基伤害 ×1.25');
  }

  // ---------- 6. 词条效果抽样验证 ----------
  // 6a. 剑意 +12%
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', 500);
    Core.upgradeTower(g, t.id); Core.upgradeTower(g, t.id);
    const d0 = Core.towerDmg(t);
    t.traits.push('jianyi');
    near(Core.towerDmg(t), d0 * 1.12, 0.01, '剑意 +12%');
  }
  // 6b. 洞虚：御剑能打飞舟
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', 500);
    t.traits.push('dongxu');
    const air = Core.spawnFoe(g, 'boat', {});
    air.flyT = 0.30;
    // 御剑位置在路径旁，飞舟航线若在射程内则必选中
    const tgt = Core.acquire(t, g);
    assert(tgt === air, '洞虚御剑锁定飞舟');
  }
  // 6c. 范围词条 +15%（动态即时生效）
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', 500);
    const r0 = Core.towerRange(t);
    t.traits.push('fanwei');
    near(Core.towerRange(t), r0 + Core.TOWERS.yujian.range * 0.15, 0.01, '范围词条 +15%');
    t.realm = 2;
    near(Core.towerRange(t), r0 + Core.TOWERS.yujian.range * 0.15 + 16, 0.01, '境界另加 +8/境');
  }
  // 6d. 吸灵：击杀 +1
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', 500);
    Core.upgradeTower(g, t.id); Core.upgradeTower(g, t.id);
    t.traits.push('xiling');
    const e = Core.spawnFoe(g, 'grunt', { d: Core.PLEN * 0.3, hpMul: 0.02 });
    const qi0 = g.qi;
    stepUntil(g, () => g.kills >= 1, 6);
    assert(g.qi >= qi0 + 2, `击杀灵气 ≥ +2（基础1+吸灵1，实际 +${g.qi - qi0}）`);
  }
  // 6e. 连锁词条：无连锁阵获得连锁
  {
    const g = Core.createGame();
    const t = put(g, 'tianlei', 500); // tianlei 本身无 chain
    Core.upgradeTower(g, t.id); Core.upgradeTower(g, t.id);
    t.traits.push('chain');
    const e1 = Core.spawnFoe(g, 'grunt', { d: Core.PLEN * 0.3 });
    const e2 = Core.spawnFoe(g, 'grunt', { d: Core.PLEN * 0.3 + 50 });
    let sawChain = false, tt = 0;
    while (tt < 6 && !sawChain) {
      const evs = Core.gameStep(g, 1 / 60); tt += 1 / 60;
      if (evs.some(ev => ev.t === 'chain')) sawChain = true;
    }
    assert(sawChain, '连锁词条让天雷落雷弹跳');
  }
  // 6f. 定身词条（固定 seed，确定性验证 8% 概率触发）
  {
    const g = Core.createGame({ seed: 3 });
    g.gold = 9999;
    const d = 500; const [px, py] = Core.posAt(d); const n = Core.pathNormal(d);
    const t = Core.placeTower(g, px + n[0] * 45, py + n[1] * 45, 'yujian');
    t.traits.push('dingshen');
    let stuns = 0;
    for (let round = 0; round < 5; round++) {
      const e = C_spawn(g, d);
      let tt = 0;
      while (tt < 3) { Core.gameStep(g, 1 / 30); tt += 1 / 30; if (e.stunT > 0) { stuns++; break; } }
      e.dead = true; g.enemies.length = 0; t.cd = 0;
    }
    assert(stuns >= 1, `定身词条触发（${stuns} 次/5 轮）`);
  }
  function C_spawn(g, d) { return Core.spawnFoe(g, 'grunt', { d, hpMul: 100 }); }

  // ---------- 7. 渡劫事件流（渲染特效） ----------
  {
    const g = Core.createGame();
    const t = put(g, 'yujian', 500);
    Core.upgradeTower(g, t.id); Core.upgradeTower(g, t.id);
    g.qi = 999;
    const evs = [];
    const orig = Core.attemptTribulation;
    // gameStep 返回事件：渡劫在 step 外调用，事件直接查 g.events
    Core.attemptTribulation(g, t.id, { force: 'win' });
    assert(g.events.some(e => e.t === 'tribWin'), 'tribWin 事件');
    g.events.length = 0;
    Core.upgradeTower(g, t.id);
    Core.attemptTribulation(g, t.id, { force: 'lose' });
    assert(g.events.some(e => e.t === 'tribFail'), 'tribFail 事件');
  }

  // ---------- 8. 概率合理性（统计不崩不偏） ----------
  {
    // 固定 seed 大样本：失败率均值接近 20%±
    const g = Core.createGame({ seed: 12345 });
    const t = put(g, 'yujian', 500);
    Core.upgradeTower(g, t.id); Core.upgradeTower(g, t.id);
    g.qi = 1e6;
    let wins = 0, N = 400;
    for (let i = 0; i < N; i++) {
      t.realm = 0; t.lvl = 3;
      const r = Core.attemptTribulation(g, t.id);
      if (r.win) wins++;
    }
    const p = wins / N;
    assert(p > 0.65 && p < 0.95, `筑基成功率 ${p.toFixed(2)} ∈ (0.65, 0.95)`);
  }
}
module.exports = { run };
