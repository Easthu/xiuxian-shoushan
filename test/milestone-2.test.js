// 里程碑2：30 波妖潮数据表 + 快进 + 提前召妖 + waves.json 一致性
const assert = (c, m) => { if (!c) throw new Error(m || '断言失败'); };
const near = (a, b, eps, m) => { if (Math.abs(a - b) > eps) throw new Error(`${m || '数值'}: ${a} vs ${b}`); };
const fs = require('fs');
const path = require('path');
const Core = require('../game_core.js');

function stepUntil(g, cond, maxT, dt) {
  dt = dt || 1 / 60; let t = 0;
  while (!cond() && t < maxT) { Core.gameStep(g, dt); t += dt; }
  return cond();
}

function run() {
  // ---------- 1. 30 波数据表完整 ----------
  assert(Core.WAVES.length === 30, '妖潮共 30 波');
  for (const w of Core.WAVES) {
    assert(w.groups && w.groups.length > 0, `第 ${w.n} 波有编组`);
    assert(w.bonus > 0, `第 ${w.n} 波有清波奖励`);
    for (const grp of w.groups) {
      assert(Core.FOES[grp.type], `第 ${w.n} 波怪种 ${grp.type} 在妖兽表中`);
      assert(grp.count > 0 && grp.spacing > 0, `第 ${w.n} 波 ${grp.type} 数量/间隔有效`);
    }
    assert(w.hpMul > 1 && w.spdMul >= 1, `第 ${w.n} 波成长系数有效`);
  }
  // 波次 n 与索引一致
  Core.WAVES.forEach((w, i) => assert(w.n === i + 1, `波次编号连续 (${w.n}@${i})`));

  // ---------- 2. HP 几何增长在 skill 建议区间 ----------
  const growth = Core.HP_GROWTH;
  assert(growth >= 1.12 && growth <= 1.18, `HP 增长率 ${growth} ∈ [1.12, 1.18]（skill 建议）`);
  near(Core.WAVES[5].hpMul / Core.WAVES[4].hpMul, growth, 1e-9, '相邻波 hpMul 几何');

  // ---------- 3. 新怪单独登场（可学习性：telegraph） ----------
  const debut = { fox: 5, scale: 8, boat: 9, wolf: 11, treant: 14, boss: 10 };
  for (const [key, n] of Object.entries(debut)) {
    const w = Core.WAVES[n - 1];
    assert(w.groups.some(g => g.type === key), `${key} 在第 ${n} 波登场`);
    // 登场波以新怪为第一编组（单独认识，不混大杂烩）
    assert(w.groups[0].type === key, `第 ${n} 波新怪 ${key} 领衔登场`);
  }
  // 每种怪都有登场波（除 grunt 基础）
  for (const key of Object.keys(Core.FOES)) {
    if (key === 'grunt') continue;
    assert(Core.WAVES.some(w => w.groups[0].type === key || w.groups.some(g => g.type === key)), `${key} 有登场波`);
  }

  // ---------- 4. 波间倒计时自动开波 ----------
  {
    const g = Core.createGame();
    g.wave = 1; g.lives = 999; // 跳过首波无限建造期
    Core.startWave(g);
    stepUntil(g, () => g.phase === 'build', 120); // 第2波清完回建造期
    assert(g.autoT === 14, `波间倒计时 14s（实际 ${g.autoT}）`);
    const w0 = g.wave;
    stepUntil(g, () => g.phase === 'wave', 20);
    assert(g.wave === w0 + 1, '倒计时归零自动召下一波');
  }

  // ---------- 5. 首波不自动开（首波建造期无限） ----------
  {
    const g = Core.createGame();
    let t = 0;
    while (t < 30 && g.phase === 'build') { Core.gameStep(g, 1 / 30); t += 1; }
    assert(g.phase === 'build' && g.wave === 0, '首波等玩家主动开');
    assert(Core.startWave(g), '手动开局成功');
  }

  // ---------- 6. 提前召妖奖励灵气 ----------
  {
    const g = Core.createGame();
    g.wave = 1; g.lives = 999;
    Core.startWave(g);
    stepUntil(g, () => g.phase === 'build', 120);
    assert(isFinite(g.autoT) && g.autoT > 0, '倒计时进行中');
    const qi0 = g.qi;
    Core.startWave(g); // 提前召
    assert(g.qi > qi0, `提前召妖奖励灵气 (+${g.qi - qi0})`);
    const expect = Math.ceil(14 * 0.5);
    assert(g.qi - qi0 === expect, `奖励 = ceil(剩余×0.5)（${expect}）`);
  }

  // ---------- 7. 快进：speed 大 dt 与多次小步近似一致 ----------
  {
    const mk = () => {
      const g = Core.createGame({ seed: 42 });
      const d = Core.PLEN * 0.3;
      const [px, py] = Core.posAt(d); const n = Core.pathNormal(d);
      Core.placeTower(g, px + n[0] * 40, py + n[1] * 40, 'yujian');
      Core.startWave(g);
      return g;
    };
    const ga = mk(), gb = mk();
    stepUntil(ga, () => ga.kills >= 3 || ga.clock > 20, 25, 1 / 60);
    stepUntil(gb, () => gb.kills >= 3 || gb.clock > 20, 25, 1 / 15); // ≈×4 快进
    near(ga.clock, gb.clock, 1e-6, '游戏时钟一致');
    near(ga.kills, gb.kills, 0.01, '击杀数一致（大 dt 稳定）');
    assert(Math.abs(ga.gold - gb.gold) <= 12, `金币近似一致 (${ga.gold} vs ${gb.gold})`);
  }

  // ---------- 8. waves.json 与 WAVES 一致（单一事实来源：core 导出） ----------
  const spec = Core.curveSpec();
  const specPath = path.join(__dirname, '..', 'waves.json');
  assert(fs.existsSync(specPath), 'waves.json 存在');
  const disk = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  assert(disk.waves.length === spec.waves.length, 'waves.json 波数一致');
  for (let i = 0; i < spec.waves.length; i++) {
    const a = spec.waves[i], b = disk.waves[i];
    assert(a.clear_bonus === b.clear_bonus, `波 ${i + 1} clear_bonus 一致`);
    assert(JSON.stringify(a.groups) === JSON.stringify(b.groups), `波 ${i + 1} groups 一致`);
  }
  assert(disk.start_gold === 120 && disk.tower.dps === 20, 'spec 头部为 demo 基线');

  // ---------- 9. 下一波预告（UI telegraph） ----------
  {
    const g = Core.createGame();
    const p = Core.wavePreview(g);
    assert(p && p.n === 1, '预告第 1 波');
    g.wave = 9;
    const p10 = Core.wavePreview(g);
    assert(p10.parts.some(x => x.boss), '第 10 波预告标注妖王');
  }

  // ---------- 10. 清波奖励与灵气结算 ----------
  {
    const g = Core.createGame();
    g.wave = 0; g.lives = 999;
    Core.startWave(g);
    stepUntil(g, () => g.buildQueue.length === 0, 60);
    g.enemies.length = 0;
    stepUntil(g, () => g.phase === 'build', 5);
    assert(g.gold >= 120 + Core.WAVES[0].bonus, `清波奖励入账（${g.gold}）`);
    assert(g.qi >= 10 + 2, `清波灵气奖励入账（qi=${g.qi}）`);
  }
}
module.exports = { run };
