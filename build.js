// build.js — 把 vendor/three.min.js + game_core.js 内联进 game.html 生成最终单文件（双击即玩）
// 用法：node build.js
// 模板 game.dev.html 保留外部引用继续开发；产物 game.html 全内联零网络依赖。
const fs = require("fs");
const path = require("path");
const root = __dirname;
const devPath = path.join(root, "game.dev.html");
const htmlPath = path.join(root, "game.html");

const tpl = fs.readFileSync(devPath, "utf8");
const core = fs.readFileSync(path.join(root, "game_core.js"), "utf8");
const three = fs.readFileSync(path.join(root, "vendor", "three.min.js"), "utf8");

const threeTag = '<script src="vendor/three.min.js"></script>';
const coreTag = '<script src="game_core.js"></script>';
if (!tpl.includes(threeTag) || !tpl.includes(coreTag)) {
  console.error("模板缺少 three/core 引用标记，中止");
  process.exit(1);
}
const out = tpl
  .replace(threeTag, "<script>\n" + three + "\n</script>")
  .replace(coreTag, "<script>\n" + core + "\n</script>");
fs.writeFileSync(htmlPath, out, "utf8");
const kb = (fs.statSync(htmlPath).size / 1024).toFixed(1);
console.log(`打包完成：game.html（${kb} KB，内联 three.js + core）`);
if (/<script src=/.test(out)) { console.error("仍存在外部脚本引用！"); process.exit(1); }
console.log("自检通过：无外部依赖引用");
