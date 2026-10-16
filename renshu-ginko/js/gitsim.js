/*
 * ブラウザ上の Git サンドボックス（FR-040〜043、Q-08: MVP は独自の簡易版）
 * 純粋。操作はすべて新しい repo を返す（失敗は { error } を返し、元の repo は変えない）。
 * 時刻は引数でもらう。
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const { sha256, clone } = RGA.core;

  const MAIN = 'main';
  const BRANCH_RE = /^(feature|fix)\/[a-z0-9][a-z0-9-]*$/;
  const PR_LINE_LIMIT = 300;

  function makeCommit(parents, tree, message, time) {
    const id = sha256(JSON.stringify({ parents, tree, message, time })).slice(0, 7);
    return { id, parents, tree, message, time };
  }

  function initRepo(files, time) {
    const c = makeCommit([], { ...files }, 'chore: 練習銀行のリポジトリを作成', time);
    return { commits: { [c.id]: c }, branches: { [MAIN]: c.id }, head: MAIN, work: { ...files }, prs: [], nextPr: 1 };
  }

  const tip = (repo, branch) => repo.commits[repo.branches[branch]];
  const headTree = (repo) => tip(repo, repo.head).tree;

  function status(repo) {
    const base = headTree(repo);
    const paths = [...new Set([...Object.keys(base), ...Object.keys(repo.work)])].sort();
    const out = [];
    for (const p of paths) {
      if (!(p in base)) out.push({ path: p, kind: 'added' });
      else if (!(p in repo.work)) out.push({ path: p, kind: 'deleted' });
      else if (base[p] !== repo.work[p]) out.push({ path: p, kind: 'modified' });
    }
    return out;
  }

  function writeFile(repo, path, content) {
    const next = clone(repo);
    next.work[path] = content;
    return next;
  }

  function createBranch(repo, name) {
    if (!BRANCH_RE.test(name)) return { error: 'ブランチ名は feature/〜 か fix/〜 で、英小文字・数字・ハイフンだけにしてください（例: feature/l1-01）' };
    if (repo.branches[name]) return { error: 'ブランチ「' + name + '」はもうあります' };
    const next = clone(repo);
    next.branches[name] = repo.branches[repo.head];
    next.head = name; // 作ったブランチに切り替える（作業中の変更はそのまま持っていく）
    return { repo: next };
  }

  function checkout(repo, name) {
    if (!repo.branches[name]) return { error: 'ブランチ「' + name + '」がありません' };
    if (name === repo.head) return { repo };
    if (status(repo).length) return { error: 'コミットしていない変更があります。先にコミットしてから切り替えてください' };
    const next = clone(repo);
    next.head = name;
    next.work = { ...tip(repo, name).tree };
    return { repo: next };
  }

  function commit(repo, message, time) {
    const msg = String(message || '').trim();
    if (repo.head === MAIN) return { error: 'main は保護されています。ブランチを作ってからコミットしてください（AGENTS.md の約束）' };
    if (!msg) return { error: 'コミットメッセージを書いてください' };
    if (!status(repo).length) return { error: 'コミットする変更がありません' };
    const c = makeCommit([repo.branches[repo.head]], { ...repo.work }, msg, time);
    const next = clone(repo);
    next.commits[c.id] = c;
    next.branches[repo.head] = c.id;
    return { repo: next, commit: c };
  }

  function ancestors(repo, id) {
    const seen = new Set();
    const stack = [id];
    while (stack.length) {
      const x = stack.pop();
      if (!x || seen.has(x)) continue;
      seen.add(x);
      stack.push(...repo.commits[x].parents);
    }
    return seen;
  }
  function mergeBase(repo, a, b) {
    const anc = ancestors(repo, a);
    const queue = [b];
    const seen = new Set();
    while (queue.length) {
      const x = queue.shift();
      if (seen.has(x)) continue;
      seen.add(x);
      if (anc.has(x)) return x;
      queue.push(...repo.commits[x].parents);
    }
    return null;
  }

  // ---- 差分 ----
  function lineDiff(a, b) {
    const A = a === undefined ? [] : String(a).split('\n');
    const B = b === undefined ? [] : String(b).split('\n');
    if (A.length && A[A.length - 1] === '') A.pop();
    if (B.length && B[B.length - 1] === '') B.pop();
    const n = A.length;
    const m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push({ type: ' ', text: A[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { out.push({ type: '-', text: A[i] }); i++; }
      else { out.push({ type: '+', text: B[j] }); j++; }
    }
    while (i < n) out.push({ type: '-', text: A[i++] });
    while (j < m) out.push({ type: '+', text: B[j++] });
    return out;
  }
  function treeDiff(a, b) {
    const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    const files = [];
    for (const p of paths) {
      if (a[p] === b[p]) continue;
      const lines = lineDiff(a[p], b[p]);
      files.push({
        path: p,
        kind: !(p in a) ? 'added' : !(p in b) ? 'deleted' : 'modified',
        lines,
        added: lines.filter((l) => l.type === '+').length,
        removed: lines.filter((l) => l.type === '-').length,
      });
    }
    return files;
  }
  function diffSize(files) {
    return files.reduce((s, f) => s + f.added + f.removed, 0);
  }

  // ---- PR ----
  function openPr(repo, opts) {
    const head = opts.head || repo.head;
    if (head === MAIN) return { error: 'main から main への PR は作れません。ブランチを切り替えてください' };
    if (!repo.branches[head]) return { error: 'ブランチ「' + head + '」がありません' };
    if (repo.prs.some((p) => p.head === head && p.status === 'open')) return { error: 'このブランチの PR はもう開いています' };
    const base = mergeBase(repo, repo.branches[MAIN], repo.branches[head]);
    if (repo.branches[head] === base) return { error: 'main との差分がありません。先にコミットしてください' };
    const next = clone(repo);
    const pr = { id: repo.nextPr, title: String(opts.title || head).trim() || head, body: String(opts.body || ''), head, base: MAIN, status: 'open', createdAt: opts.time, ci: null, unitId: opts.unitId || null };
    next.prs.push(pr);
    next.nextPr += 1;
    return { repo: next, pr };
  }
  const findPr = (repo, id) => repo.prs.find((p) => p.id === id);

  // PR が持ち込む変更（main との分かれ目 → ブランチの先端）
  function prDiff(repo, id) {
    const pr = findPr(repo, id);
    if (!pr) return [];
    if (pr.status === 'merged') {
      const m = repo.commits[pr.mergedCommit];
      return treeDiff(repo.commits[m.parents[0]].tree, m.tree);
    }
    const base = mergeBase(repo, repo.branches[MAIN], repo.branches[pr.head]);
    return treeDiff(repo.commits[base].tree, tip(repo, pr.head).tree);
  }
  // CI はこの木（ブランチの先端を main にマージした結果）に対して走らせる
  function prMergedTree(repo, id) {
    const pr = findPr(repo, id);
    const r = merge3(repo, repo.branches[MAIN], repo.branches[pr.head]);
    return r.conflicts.length ? null : r.tree;
  }

  function setCi(repo, id, ci) {
    const next = clone(repo);
    const pr = findPr(next, id);
    pr.ci = { ...ci, commit: next.branches[pr.head], mainCommit: next.branches[MAIN] };
    return next;
  }
  // CI の結果が今のブランチと main に対するものか
  function ciIsCurrent(repo, pr) {
    return !!(pr.ci && pr.ci.commit === repo.branches[pr.head] && pr.ci.mainCommit === repo.branches[MAIN]);
  }

  function merge3(repo, oursId, theirsId) {
    const baseId = mergeBase(repo, oursId, theirsId);
    const base = repo.commits[baseId].tree;
    const ours = repo.commits[oursId].tree;
    const theirs = repo.commits[theirsId].tree;
    const tree = {};
    const conflicts = [];
    for (const p of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])) {
      const b = base[p];
      const o = ours[p];
      const t = theirs[p];
      let v;
      if (o === t) v = o;
      else if (b === o) v = t;
      else if (b === t) v = o;
      else { conflicts.push(p); v = o; }
      if (v !== undefined) tree[p] = v;
    }
    return { tree, conflicts };
  }

  function mergePr(repo, id, time) {
    const pr = findPr(repo, id);
    if (!pr || pr.status !== 'open') return { error: 'この PR はマージできる状態ではありません' };
    if (!ciIsCurrent(repo, pr)) return { error: 'CI がまだ最新の変更に対して走っていません。CI を実行してください' };
    if (pr.ci.status !== 'success') return { error: 'CI が失敗しています。直してからマージしてください' };
    const r = merge3(repo, repo.branches[MAIN], repo.branches[pr.head]);
    if (r.conflicts.length) return { error: 'コンフリクトがあります: ' + r.conflicts.join(', ') };
    const c = makeCommit([repo.branches[MAIN], repo.branches[pr.head]], r.tree, 'Merge PR #' + pr.id + ': ' + pr.title, time);
    const next = clone(repo);
    next.commits[c.id] = c;
    next.branches[MAIN] = c.id;
    const p = findPr(next, id);
    p.status = 'merged';
    p.mergedCommit = c.id;
    p.mergedAt = time;
    if (next.head === MAIN && !status(repo).length) next.work = { ...r.tree };
    return { repo: next, commit: c };
  }

  function closePr(repo, id) {
    const pr = findPr(repo, id);
    if (!pr || pr.status !== 'open') return { error: 'この PR は閉じられません' };
    const next = clone(repo);
    findPr(next, id).status = 'closed';
    return { repo: next };
  }

  // マージを打ち消すコミットを main に作る（履歴は書き換えない）
  function revertPr(repo, id, time) {
    const pr = findPr(repo, id);
    if (!pr || pr.status !== 'merged') return { error: 'マージ済みの PR だけリバートできます' };
    if (pr.reverted) return { error: 'この PR はもうリバートしています' };
    if (repo.head === MAIN && status(repo).length) return { error: 'main にコミットしていない変更があります' };
    const m = repo.commits[pr.mergedCommit];
    const before = repo.commits[m.parents[0]].tree;
    const cur = tip(repo, MAIN).tree;
    const tree = { ...cur };
    const conflicts = [];
    for (const p of new Set([...Object.keys(before), ...Object.keys(m.tree)])) {
      if (before[p] === m.tree[p]) continue;
      if (cur[p] !== m.tree[p]) { conflicts.push(p); continue; }
      if (before[p] === undefined) delete tree[p];
      else tree[p] = before[p];
    }
    if (conflicts.length) return { error: 'あとから変更されたファイルがあるのでリバートできません: ' + conflicts.join(', ') };
    const c = makeCommit([repo.branches[MAIN]], tree, 'revert: PR #' + pr.id + '「' + pr.title + '」を取り消す', time);
    const next = clone(repo);
    next.commits[c.id] = c;
    next.branches[MAIN] = c.id;
    const p = findPr(next, id);
    p.reverted = true;
    p.revertCommit = c.id;
    if (next.head === MAIN) next.work = { ...tree };
    return { repo: next, commit: c };
  }

  // 先頭の親をたどった履歴
  function log(repo, branch, limit) {
    const out = [];
    let id = repo.branches[branch || repo.head];
    while (id && out.length < (limit || 50)) {
      const c = repo.commits[id];
      out.push(c);
      id = c.parents[0];
    }
    return out;
  }

  RGA.gitsim = {
    MAIN, BRANCH_RE, PR_LINE_LIMIT,
    initRepo, headTree, status, writeFile, createBranch, checkout, commit,
    mergeBase, lineDiff, treeDiff, diffSize,
    openPr, findPr, prDiff, prMergedTree, setCi, ciIsCurrent, mergePr, closePr, revertPr, log,
    tipTree: (repo, branch) => tip(repo, branch).tree,
  };
})(globalThis);
