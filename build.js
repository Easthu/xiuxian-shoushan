// build.js — 把 game_core.js 内联进 game.html 生成最终单文件 game.html（双击即玩）
// 用法：node build.js
// 原理：game.html 中 <script src="game_core.js"></script> 替换为内联 <script>…</script>。
// 输出写入 game.html 本身（AGENTS 约定最终产物就是 game.html），原始模板存 game.dev.html 供继续开发。
const fs = require("fs");
const path = require("path");
const root = __dirname;
const devPath = path.join(root, "game.dev.html");
const htmlPath = path.join(root, "game.html");
const corePath = path.join(root, "game_core.js");

// 首次运行：把当前 game.html 作为模板存档
if (!fs.existsSync(devPath)) {
  fs.copyFileSync(htmlPath, devPath);
  console.log("已保存开发模板 game.dev.html");
}
const tpl = fs.readFileSync(devPath, "utf8");
const core = fs.readFileSync(corePath, "utf8");
if (!tpl.includes('<script src="game_core.js"></script>')) {
  console.error("模板缺少 game_core.js 引用标记，中止");
  process.exit(1);
}
const out = tpl.replace('<script src="game_core.js"></script>', "<script>\n" + core + "\n</script>");
fs.writeFileSync(htmlPath, out, "utf8");
const kb = (fs.statSync(htmlPath).size / 1024).toFixed(1);
console.log(`打包完成：game.html（${kb} KB，内联 core）`);
// 自检：单文件不再引用外部脚本
if (/<script src=/.test(out)) { console.error("仍存在外部脚本引用！"); process.exit(1); }
console.log("自检通过：无外部依赖引用");
