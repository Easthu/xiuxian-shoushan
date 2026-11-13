// 里程碑7：曲线终验 ｜ 里程碑8：无尽模式 + localStorage 存档
const assert = (c, m) => { if (!c) throw new Error(m || '断言失败'); };
const near = (a, b, eps, m) => { if (Math.abs(a - b) > eps) throw new Error(`${m || '数值'}: ${a} vs ${b}`); };
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const Core = require('../game_core.js');

function stepUntil(g, cond, maxT, dt) {
  dt = dt || 1 / 60; let t = 0;
  while (!cond() && t < maxT) { Core.gameStep(g, dt); t += dt; }
  return cond();
}

function run() {
  // ================= 里程碑 7 =================
  // ---------- 1. waves.json 与 core 一致 + 曲线 0 error（--json 精确值断言） ----------
  {
    fs.writeFileSync(path.join(__dirname, '..', 'waves.json'), JSON.stringify(Core.curveSpec(), null, 1));
    const out = execFileSync('python',
      [path.join(__dirname, '..', 'vendor', 'tower-defense-skill', 'scripts', 'td_curve_check.py'),
       path.join(__dirname, '..', 'waves.json'), '--band', '0.6,0.95', '--json'],
      { encoding: 'utf8' });
    const report = JSON.parse(out);
    const waves = report.waves || [];
    assert(waves.length === 30, '30 波全检');
    for (const w of waves) {
      assert(w.pressure < 1.0, `波 ${w.wave} 压力 ${w.pressure.toFixed(3)} < 1.0（无墙）`);
    }
    const inBand = waves.filter(w => w.pressure >= 0.6);
    assert(inBand.length >= 5, `带内压力波 ≥5（实际 ${inBand.length}）`);
    assert(waves.every(w => w.pressure <= 0.99), `峰值压力 ≤0.99（实际 max ${Math.max(...waves.map(w => w.pressure)).toFixed(3)}）`);
  }

  // ---------- 2. 节奏由官方脚本监管（连续 trivial 的 WARNING 即喘息过长） ----------
  {
    const spec = Core.curveSpec();
    assert(spec.waves.length === 30, '30 波主表');
    // BOSS 波（10/20/30）必须存在且带护卫（尖峰设计）
    for (const n of [10, 20, 30]) {
      const w = Core.WAVES[n - 1];
      assert(w.groups.some(x => x.type === 'boss'), `波 ${n} 妖王尖峰`);
    }
  }

  // ================= 里程碑 8 =================
  // ---------- 3. 无尽模式：30 波后不判胜、波次持续 ----------
  {
    const g = Core.createGame();
    g.wave = Core.WAVES.length; // 模拟已到 30 波
    g.lives = 999;
    g.phase = 'win';
    assert(Core.startEndless(g), '胜利后开启无尽');
    assert(g.endless && g.phase === 'build', '进入无尽建造期');
    assert(Core.startWave(g), '无尽波可开');
    assert(g.buildQueue.length > 0, '无尽波有队列');
    assert(g.wave === 30, 'wave 计数未变（>totalWaves 由 endless 分支生成）');
    // 清波后不判 win
    stepUntil(g, () => g.buildQueue.length === 0, 300);
    g.enemies.length = 0;
    stepUntil(g, () => g.phase === 'build', 5);
    assert(g.wave === 31, `清无尽第 1 波 → wave=31（实际 ${g.wave}）`);
    // 未开 endless 的普通局会在 30 波 win（回归）
    const g2 = Core.createGame();
    g2.wave = 29; g2.lives = 999;
    Core.startWave(g2);
    stepUntil(g2, () => g2.buildQueue.length === 0, 60);
    g2.enemies.length = 0;
    stepUntil(g2, () => g2.phase === 'win', 5);
    assert(g2.phase === 'win', '普通局 30 波后仍判胜');
  }

  // ---------- 4. 无尽波生成规律 ----------
  {
    const w31 = Core.endlessWave(31);
    assert(w31.n === 31 && w31.groups.length >= 2, '31 波混编');
    assert(!w31.groups.some(x => x.type === 'boss'), '31 波无妖王');
    const w35 = Core.endlessWave(35);
    assert(w35.groups[0].type === 'boss', '35 波妖王临世');
    const w45 = Core.endlessWave(45);
    assert(w45.groups[0].type === 'boss' && w45.hpMul > Core.endlessWave(35).hpMul, '45 波妖王更强');
    assert(Core.endlessWave(31).bonus > Core.WAVES[29].bonus, '无尽奖励高于终波');
    // 预告可用
    const g = Core.createGame();
    g.endless = true; g.wave = 34;
    const p = Core.wavePreview(g);
    assert(p.parts.some(x => x.boss), '无尽妖王波有预告');
  }

  // ---------- 5. 存档：图鉴/词条/纪录合并（纯逻辑） ----------
  {
    const g = Core.createGame();
    // 模拟本局成果
    const [a, b] = (() => {
      g.gold = 9999;
      const d = 500; const [px, py] = Core.posAt(d); const n = Core.pathNormal(d);
      const a1 = Core.placeTower(g, px + n[0] * 45, py + n[1] * 45, 'yujian');
      const b1 = Core.placeTower(g, px + n[0] * 45 - 45, py + n[1] * 45, 'tianlei');
      return [a1, b1];
    })();
    g.qi = 200;
    Core.fuseTowers(g, a.id, b.id);
    g.wave = 17;
    a.traits.push('crit', 'pierce');
    a.realm = 2;
    const save = Core.makeSave(g);
    assert(save.bestWave === 17, '纪录波次');
    assert(save.codex.zhuxian === 1, '图鉴点亮并入存档（开局炼成记第 1 波）');
    assert(save.traitBank.includes('crit') && save.traitBank.includes('pierce'), '词条收藏');
    assert(save.maxRealm === 2, '最高境界纪录');
    // 二局合并：新图鉴不覆盖旧的
    const g2 = Core.createGame();
    g2.codex.shuangren = 3; g2.wave = 9;
    const save2 = Core.makeSave(g2, save);
    assert(save2.codex.zhuxian === 1 && save2.codex.shuangren === 3, '图鉴跨局累计');
    assert(save2.bestWave === 17, '最深纪录保留');
    assert(Core.SAVE_KEY.length > 0, '存档键名');
  }
}
module.exports = { run };
