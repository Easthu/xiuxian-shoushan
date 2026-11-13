// 里程碑6：7 种妖兽行为差异 + BOSS（每种都惩罚一种偷懒布阵）
const assert = (c, m) => { if (!c) throw new Error(m || '断言失败'); };
const near = (a, b, eps, m) => { if (Math.abs(a - b) > eps) throw new Error(`${m || '数值'}: ${a} vs ${b}`); };
const Core = require('../game_core.js');

function stepUntil(g, cond, maxT, dt) {
  dt = dt || 1 / 60; let t = 0;
  while (!cond() && t < maxT) { Core.gameStep(g, dt); t += dt; }
  return cond();
}

function run() {
  // ---------- 1. 妖兽表完整：7 种 ----------
  const keys = Object.keys(Core.FOES);
  assert(keys.length === 7, `共 7 种妖兽（${keys.join(',')}）`);
  for (const k of keys) {
    const F = Core.FOES[k];
    assert(F.hp > 0 && F.spd > 0 && F.bounty > 0 && F.r > 0, `${k} 基础数值有效`);
    assert(F.leak >= 1, `${k} 泄漏伤害`);
  }

  // ---------- 2. 赤瞳狐：极速低血（罚慢速单发阵） ----------
  assert(Core.FOES.fox.spd > Core.FOES.grunt.spd * 2, '狐速 > 2× 小兵');
  assert(Core.FOES.fox.hp < Core.FOES.grunt.hp, '狐血 < 小兵');

  // ---------- 3. 鳞甲妖：物理减免 50%（罚低伤高频阵） ----------
  {
    assert(Core.FOES.scale.armor === 0.5, '鳞甲减免 50%');
    const g = Core.createGame();
    const e = Core.spawnFoe(g, 'scale', {});
    const hp0 = e.hp;
    Core.hitEnemy(g, e, 100, {});
    // 期望 100*(1-0.5)=50 伤害
    near(hp0 - e.hp, 50, 0.01, '鳞甲直伤减半');
    // 高频低伤 vs 低频高伤对比：armor 是乘法，两者同比例——差异在"过量伤害浪费"，数据上核实减免生效即可
  }

  // ---------- 4. 御空飞舟：直线飞行（罚纯地面阵） ----------
  {
    const g = Core.createGame();
    const e = Core.spawnFoe(g, 'boat', {});
    assert(e.fly === true, '飞舟标记飞行');
    const p0 = Core.foePos(g, e);
    Core.gameStep(g, 0.5);
    const p1 = Core.foePos(g, e);
    // 直线：位移矢量恒定方向（起点→终点）
    const dx = Core.GATE[0] - Core.SPAWN[0], dy = (Core.GATE[1] + 26) - (Core.SPAWN[1] + 26);
    const mvx = p1[0] - p0[0], mvy = p1[1] - p0[1];
    near(mvx / Math.hypot(mvx, mvy), dx / Math.hypot(dx, dy), 0.01, '飞舟沿直线航向 X');
    near(mvy / Math.hypot(mvx, mvy), dy / Math.hypot(dx, dy), 0.01, '飞舟沿直线航向 Y');
    // 不走山道：位置距山道有距离
    const pd = Core.pathDistTo(p1[0], p1[1]);
    assert(pd > 30, `飞舟脱离山道 (${pd.toFixed(0)}px)`);
  }

  // ---------- 5. 狼群：一次大量（罚单体阵） ----------
  {
    const w11 = Core.WAVES[10];
    const wolves = w11.groups[0];
    assert(wolves.type === 'wolf' && wolves.count >= 14, '第 11 波 20 连狼');
    assert(wolves.spacing <= 0.4, '间隔紧密成群');
    assert(Core.FOES.wolf.bounty <= 5, '狼赏金低（单体阵经济崩）');
  }

  // ---------- 6. 再生木妖：持续回血（罚低 DPS 磨血） ----------
  {
    const g = Core.createGame();
    const e = Core.spawnFoe(g, 'treant', {});
    e.hp = e.maxhp * 0.4;
    const hp0 = e.hp;
    Core.gameStep(g, 1);
    assert(e.hp > hp0, `木妖回血中 (+${(e.hp - hp0).toFixed(1)}/s)`);
    near(e.hp - hp0, e.maxhp * e.regen, 0.5, '回血速率 = maxhp×regen');
  }

  // ---------- 7. BOSS：每 10 波 HP 尖峰 + 泄漏重创 ----------
  {
    assert(Core.FOES.boss.leak === 3, '妖王泄漏 -3 气运');
    assert(Core.FOES.boss.regen > 0, '妖王带回复');
    for (const n of [10, 20, 30]) {
      const w = Core.WAVES[n - 1];
      assert(w.groups.some(g => g.type === 'boss'), `第 ${n} 波有妖王`);
    }
    // 同波对比：妖王单体 HP ≥ 8× 同波小兵（叠加 armor/regen 构成尖峰，罚裸基础阵）
    const w10 = Core.WAVES[9];
    const bossHp = Core.FOES.boss.hp * w10.hpMul;
    const gruntHp = Core.FOES.grunt.hp * w10.hpMul;
    assert(bossHp >= gruntHp * 8, `第10波妖王单体 HP ${(bossHp / gruntHp).toFixed(1)}× 小兵`);
    // HP 尖峰：BOSS 波 HP 总量显著高于前一浪峰波
    const totalHp = w => w.groups.reduce((s, g) => s + Core.FOES[g.type].hp * w.hpMul * g.count, 0);
    const bossW = totalHp(Core.WAVES[9]);
    const prevW = totalHp(Core.WAVES[8]);
    assert(bossW > prevW * 2.2, `第10波 HP 尖峰 (${(bossW / prevW).toFixed(1)}× 前波)`);
  }

  // ---------- 8. 泄漏惩罚差异 ----------
  {
    const g = Core.createGame();
    const e = Core.spawnFoe(g, 'treant', { d: Core.PLEN - 2 });
    stepUntil(g, () => g.leaked >= 1, 5);
    assert(g.lives === 10 - 2, '木妖泄漏 -2');
  }

  // ---------- 9. 减速对快速单位同样生效（狐不至于免疫控场） ----------
  {
    const g = Core.createGame();
    const fox = Core.spawnFoe(g, 'fox', { d: 100 });
    fox.slowF = 0.5; fox.slowT = 1;
    const d0 = fox.d;
    Core.gameStep(g, 0.5);
    near(fox.d - d0, fox.spd * 0.5 * 0.5, 1, '狐被减速');
  }

  // ---------- 10. 全兵种满波模拟不崩 ----------
  {
    const g = Core.createGame({ seed: 99 });
    g.lives = 200;
    for (const k of Object.keys(Core.FOES)) {
      const e = Core.spawnFoe(g, k, { hpMul: 2 });
      assert(e && !e.dead, `${k} 入场`);
    }
    let t = 0;
    while (g.enemies.length > 0 && t < 300) { Core.gameStep(g, 1 / 30); t += 1 / 30; }
    assert(g.enemies.length === 0, `全兵种清场（leaked=${g.leaked}）`);
    assert(g.phase === 'build' || g.phase === 'over' || g.phase === 'wave', '状态机未崩');
  }
}
module.exports = { run };
