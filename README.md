# 修仙守山 · 回家开工包（全自动版）

## 回家只做两步

1. 解压 `tower-defense.zip`
2. ZCode 打开解压出的 `tower-defense` 目录（建议用自动权限模式），说一句：**开工**

之后全自动：ZCode 读到 AGENTS.md 会自己按 DESIGN.md 开发——自己写测试自己跑、自己用曲线脚本调平衡、自己决策所有细节，直到产出双击即玩的 `game.html`。

**你唯一要做的事：最后双击 game.html 玩。**

## 包结构

```
tower-defense/
├── AGENTS.md      无人值守开发指令（ZCode 自动读取，含工程结构与验收标准）
├── DESIGN.md      《修仙守山》完整设计：阵法融合/渡劫词条/双经济/妖兽图鉴
├── demo.html      ⭐ 水墨风可玩 demo（已验证：布阵/攻击/快进都能玩，先双击它看效果）
├── test/run-tests.js   预置零依赖测试运行器（node test/run-tests.js）
└── vendor/tower-defense-skill/   塔防设计方法论（Apache-2.0，AGENTS.md 指定必读）
```

**想先看效果和玩法**：解压后直接双击 `demo.html`（无需任何步骤）——御剑阵+玄冰阵、18 波妖潮、快进，就是《修仙守山》的雏形。正式版游戏让 ZCode 按 AGENTS.md 自动开发出 `game.html`。

## 想看它做完的过程

完成后看 `CHANGELOG.md`（AI 会记录所有自主决策）；想看中间状态，随时打开 `game.html`。

## 备注

- 需要本机有 node（macOS 一般有；没有则 ZCode 会发现并改用其方案）
- 画风已定案：纯程序化水墨 SVG（demo.html 为视觉基线），不需要下载任何素材
