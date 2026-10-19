// ブラウザと同じ順番でモジュールを読み込み、globalThis.RGA を返す
import '../../js/core.js';
import '../../js/content.js';
import '../../js/units-more.js';
import '../../js/units-l3.js';
import '../../js/runner.js';
import '../../js/rules.js';
import '../../js/gitsim.js';
import '../../js/tutor.js';
import '../../js/store.js';
import '../../js/hackathon.js';
import '../../js/hack-sprints-a.js';
import '../../js/hack-sprints-b.js';
import '../../js/hack-sprints-c.js';

export const RGA = globalThis.RGA;
