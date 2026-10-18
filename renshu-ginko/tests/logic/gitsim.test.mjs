import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const G = RGA.gitsim;
const T = 1_700_000_000_000;
const ok = (r) => { assert.ok(!r.error, r.error); return r; };

function setup() {
  return G.initRepo(RGA.content.REPO_TEMPLATE, T);
}

test('FR-040 初期リポジトリに AGENTS.md と初期テストがある', () => {
  const repo = setup();
  assert.ok(repo.work['AGENTS.md'].includes('AGENTS.md'));
  assert.ok(repo.work['tests/bank.test.js']);
  assert.deepEqual(G.status(repo), []);
});

test('FR-041 ブランチ作成 → コミット → PR → マージ → リバート', () => {
  let repo = setup();
  assert.match(G.commit(G.writeFile(repo, 'src/a.js', 'x'), 'feat: a', T).error, /保護/);
  assert.match(G.createBranch(repo, 'Feature/X').error, /ブランチ名/);
  repo = ok(G.createBranch(repo, 'feature/a')).repo;
  repo = G.writeFile(repo, 'src/a.js', 'const A = 1;\n');
  assert.deepEqual(G.status(repo), [{ path: 'src/a.js', kind: 'added' }]);
  assert.match(G.checkout(repo, 'main').error, /コミットしていない/);
  repo = ok(G.commit(repo, 'feat: a を追加', T + 1)).repo;
  const opened = ok(G.openPr(repo, { title: 'a を追加', time: T + 2 }));
  repo = opened.repo;
  const id = opened.pr.id;
  assert.equal(G.prDiff(repo, id)[0].added, 1);
  assert.match(G.mergePr(repo, id, T).error, /CI/);
  repo = G.setCi(repo, id, { status: 'failure' });
  assert.match(G.mergePr(repo, id, T).error, /失敗/);
  repo = G.setCi(repo, id, { status: 'success' });
  repo = ok(G.mergePr(repo, id, T + 3)).repo;
  assert.equal(G.tipTree(repo, 'main')['src/a.js'], 'const A = 1;\n');
  assert.equal(G.findPr(repo, id).status, 'merged');
  repo = ok(G.revertPr(repo, id, T + 4)).repo;
  assert.equal(G.tipTree(repo, 'main')['src/a.js'], undefined);
  assert.match(G.revertPr(repo, id, T).error, /もうリバート/);
});

test('CI の結果は最新のコミットに対するものでないとマージできない', () => {
  let repo = ok(G.createBranch(setup(), 'feature/b')).repo;
  repo = ok(G.commit(G.writeFile(repo, 'src/b.js', '1'), 'feat: b', T)).repo;
  const { repo: r2, pr } = ok(G.openPr(repo, { time: T }));
  let r3 = G.setCi(r2, pr.id, { status: 'success' });
  r3 = ok(G.commit(G.writeFile(r3, 'src/b.js', '2'), 'fix: b', T + 1)).repo;
  assert.match(G.mergePr(r3, pr.id, T).error, /最新/);
});

test('3方向マージ: 別々のファイルは両方残り、同じファイルの別変更はコンフリクト', () => {
  let repo = ok(G.createBranch(setup(), 'feature/x')).repo;
  repo = ok(G.commit(G.writeFile(repo, 'src/x.js', 'x'), 'feat: x', T)).repo;
  repo = ok(G.checkout(repo, 'main')).repo;
  repo = ok(G.createBranch(repo, 'feature/y')).repo;
  repo = ok(G.commit(G.writeFile(repo, 'src/y.js', 'y'), 'feat: y', T)).repo;
  let pr1;
  ({ repo, pr: pr1 } = ok(G.openPr(repo, { head: 'feature/x', time: T })));
  let pr2;
  ({ repo, pr: pr2 } = ok(G.openPr(repo, { head: 'feature/y', time: T })));
  repo = ok(G.mergePr(G.setCi(repo, pr1.id, { status: 'success' }), pr1.id, T)).repo;
  repo = ok(G.mergePr(G.setCi(repo, pr2.id, { status: 'success' }), pr2.id, T)).repo;
  const main = G.tipTree(repo, 'main');
  assert.equal(main['src/x.js'], 'x');
  assert.equal(main['src/y.js'], 'y');

  repo = ok(G.checkout(repo, 'feature/y')).repo;
  repo = ok(G.commit(G.writeFile(repo, 'README.md', 'A'), 'docs: A', T)).repo;
  repo = ok(G.checkout(repo, 'feature/x')).repo;
  repo = ok(G.commit(G.writeFile(repo, 'README.md', 'B'), 'docs: B', T)).repo;
  let p3;
  ({ repo, pr: p3 } = ok(G.openPr(repo, { head: 'feature/y', time: T })));
  let p4;
  ({ repo, pr: p4 } = ok(G.openPr(repo, { head: 'feature/x', time: T })));
  repo = ok(G.mergePr(G.setCi(repo, p3.id, { status: 'success' }), p3.id, T)).repo;
  assert.match(G.mergePr(G.setCi(repo, p4.id, { status: 'success' }), p4.id, T).error, /コンフリクト/);
});

test('FR-043 差分の行数を数える', () => {
  const files = G.treeDiff({ 'a.js': 'a\nb\nc\n' }, { 'a.js': 'a\nB\nc\nd\n', 'b.js': 'x\n' });
  assert.equal(G.diffSize(files), 4);
  assert.equal(RGA.content.UNITS[4].exercises.find((e) => e.stage === 'scratch').solution.includes('300'), true);
});
