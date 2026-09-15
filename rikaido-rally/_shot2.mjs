import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const srv = spawn('node', ['tests/serve.mjs'], { env: { ...process.env, PORT: '8098' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });

let p = await b.newPage({ viewport: { width: 1180, height: 1000 } });
await p.goto('http://127.0.0.1:8098/?seed=777&bank=java');
await p.waitForSelector('.msg.q');
console.log('q1 =', await p.evaluate(() => window.RR.Rally.current(window.RR.app.session).id));
await p.fill('#answer', 'ちょっと自信がありません');
await p.click('#submit');
await p.waitForSelector('.msg.hint');
const model = await p.evaluate(() => window.RR.Rally.current(window.RR.app.session).model);
await p.fill('#answer', model);
await p.click('#submit');
await p.waitForSelector('.msg.ok');
await p.evaluate(() => { document.querySelector('#m-plan').open = false; document.querySelector('#m-log').open = false; });
await p.screenshot({ path: 'shot-correct.png', clip: { x: 0, y: 0, width: 700, height: 990 } });

p = await b.newPage({ viewport: { width: 1180, height: 1200 } });
await p.goto('http://127.0.0.1:8098/?seed=777&bank=kuwata');
await p.waitForSelector('.msg.q');
for (let i = 0; i < 5; i++) {
  for (let w = 0; w < 2; w++) { await p.fill('#answer', 'ちょっと分かりません'); await p.click('#submit'); }
  const m = await p.evaluate(() => window.RR.Rally.current(window.RR.app.session).model);
  await p.fill('#answer', m); await p.click('#submit');
  await p.waitForSelector('.msg.ok');
  if (await p.locator('#next').isVisible()) await p.click('#next'); else await p.click('#finish');
}
await p.waitForSelector('#result:not([hidden])');
const box = await p.locator('#result').boundingBox();
await p.screenshot({ path: 'shot-result.png', clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 900) } });
await b.close(); srv.kill();
