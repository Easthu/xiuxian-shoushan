// 零依赖测试运行器：node test/run-tests.js
// 约定：test/*.test.js 每个文件导出 run()，抛错即失败。
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();

let pass = 0, fail = 0;
for (const f of files) {
  try {
    const t = require(path.join(dir, f));
    t.run();
    pass++;
    console.log(`  ok  ${f}`);
  } catch (e) {
    fail++;
    console.error(`FAIL  ${f}\n      ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (files.length === 0) console.log('(no *.test.js found)');
process.exit(fail === 0 ? 0 : 1);
