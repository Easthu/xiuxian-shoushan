# AGENTS.md — 修仙守山 · 无人值守开发指令

## 任务

读完本文件后，自动实现完整的《修仙守山》塔防游戏（设计见 `DESIGN.md`），最终产出双击即玩的 `game.html`。

## 运行模式（最高优先级）

- **全自动，不问用户**：全程不得向用户提问、不得请求确认、不得中途停下来等回复。用户唯一会做的事是最后双击 game.html 玩。
- **自主决策**：`DESIGN.md` 未覆盖的细节（数值、配色、交互手感、边界情况），按其设计精神自行最佳判断，并把每条决策记录到 `CHANGELOG.md`。
- **测试即验收**：每个里程碑的完成标准是自动化测试通过，不是人工试玩。测试不绿不得进入下一里程碑。

## 必读规范（等效于已安装 skill，无需再装）

1. `DESIGN.md` — 游戏设计，唯一事实来源（玩法/融合表/渡劫/数值/里程碑）
2. `vendor/tower-defense-skill/SKILL.md` — 塔防设计方法论（波次/经济/克制/瞄准/节奏）
3. `vendor/tower-defense-skill/references/balancing.md` — 数值平衡参考

## 工程结构（为可测试性而设，必须遵守）

开发期不用单文件，最后才打包：

```
game.html        # 入口 + 渲染/交互层（DOM/Canvas）
game_core.js     # 纯逻辑层：路径/波次/经济/战斗模拟/融合/渡劫，零 DOM 依赖，node 可直接 require
waves.json       # 妖潮数据表（td_curve_check.py 的输入格式，用 --help 查规格）
test/
  run-tests.js   # 已预置的零依赖测试运行器（node test/run-tests.js）
  *.test.js      # 你写的测试，每个里程碑都要有
build.js         # 最后写：把 game_core.js 内联进 game.html 生成最终单文件
```

## 开发循环

按 `DESIGN.md` 第 9 节里程碑 1→8 顺序，每个里程碑执行：

1. **先写测试**（`test/milestone-N.test.js`，覆盖该里程碑的行为与边界）
2. **再实现**（game_core.js + game.html）
3. **跑测试**：`node test/run-tests.js` 必须全绿；失败就修，不许跳过
4. **波次平衡**（里程碑 2 起）：`python3 vendor/tower-defense-skill/scripts/td_curve_check.py waves.json`，压力调到 0.6–0.95，超界就改数值重跑
5. **渲染冒烟**：若环境有 browser-use 类浏览器插件，打开 game.html 截图确认能渲染、console 无报错；没有该插件则用 `node -e` 对 game_core 模拟 30 波不崩即可，并在 CHANGELOG 注明"渲染未目检"

## 完成标准（全部满足才算完）

- [ ] 里程碑 1–8 全部完成，`node test/run-tests.js` 全绿
- [ ] 波次曲线检查在 0.6–0.95 区间（BOSS 波允许尖峰）
- [ ] `build.js` 产出最终单文件 game.html（内联 core），双击可玩
- [ ] `CHANGELOG.md` 记录：关键决策清单 + 玩法说明三行 + 已知限制

## 资源策略（已定案：纯程序化水墨）

**不使用任何外部素材**，全部程序化绘制。视觉基准是包内的 **`demo.html`**（已验证可玩的水墨 demo）——正式 game.html 的画风不得低于它的水准，并在此基础上精细化：

- 配色板（沿用 demo）：宣纸底 `#e8e0ce`、墨色 `#2b2620`、朱砂红 `#9e2b25`、黛青 `#3d6b6b`、金 `#a8842c`
- 山道：多层笔触叠晕染 + 枯笔边缘；妖兽：墨色剪影 + 朱砂点睛 + 血条用墨痕
- 阵法：符阵圆盘 + 属性色环 + 缓转符纹（demo 已实现御剑/玄冰两种，照此扩展其余四种）
- 氛围：淡墨远山剪影、宣纸噪点纹理（demo 的 CSS 方案可复用）
- `demo.html` 同时是数值平衡的起点：御剑 DPS20/0.55s、妖兽 HP ×1.10/波、初始灵石 120，继续调优但别回退

## 红线

- 不得引入任何外部依赖（npm 包 / CDN / 字体 / 图片 URL / 外部素材），全部程序化
- 不得修改 DESIGN.md 的核心卖点（阵法融合、渡劫词条、双经济、图鉴）
- 不得为了过测试而削弱测试断言
- demo.html 只读不改：它是视觉与数值基线，正式产出写 game.html
