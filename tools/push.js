// 自动测试+打包+上传：node tools/push.js "提交说明"
// 测试必须全绿才打包提交；推送失败自动尝试绕过本地代理直连。
// 首次推送时 Git Credential Manager 会弹窗要求登录 GitHub（一次即可）。
const { execSync } = require("child_process");
const msg = process.argv[2] || `自动提交 ${new Date().toLocaleString("zh-CN")}`;
function run(cmd) { console.log(`> ${cmd}`); execSync(cmd, { stdio: "inherit" }); }
try { run("node test/run-tests.js"); } catch (e) { console.error("测试未绿，拒绝推送"); process.exit(1); }
try { run("node build.js"); } catch (e) { console.error("打包失败"); process.exit(1); }
run("git add -A");
let dirty = false;
try { execSync("git diff --cached --quiet"); } catch (e) { dirty = true; }
if (dirty) run(`git commit -m "${msg.replace(/"/g, "")}"`); else console.log("无变更可提交");
try { run("git push -u origin main"); console.log("已推送 origin/main"); }
catch (e1) {
  try { run("git -c http.proxy= push -u origin main"); console.log("已推送（绕过代理直连）"); }
  catch (e2) { console.error("推送失败：" + String(e2.message).slice(0, 200)); process.exit(1); }
}
