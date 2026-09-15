/**
 * 問題集の入れ物。
 *
 * エンジン（judge / hint / grade / rally）は題材を一切知らない。
 * 同梱の2つも、講師が資料から作ったものも、ここでは同じ形の「問題集」として並ぶ。
 *
 * bank = {
 *   id, name, subtitle, blurb, origin,            // origin: 'builtin' | 'authored'
 *   units:     [{ id, label, summary, levelNote }],
 *   questions: [{ id, unit, level, prompt, criteria, hints, model, why, source }]
 * }
 */

/**
 * レベルの定義（全問題集で共通）。
 * 問題を書くときはこの5段階のどれに当たるかで level を決める。
 * 「難しそうだから4」ではなく「問われている行為が何か」で決める、というのがこの表の役目。
 */
export const LEVELS = [
  { level: 1, name: '再生', ask: '用語や事実を思い出せる', form: '「〜は何か」「誰か」「何年か」' },
  { level: 2, name: '説明', ask: '仕組みを自分の言葉で言える', form: '「なぜそうなるか」「何が起きるか」' },
  { level: 3, name: '使い分け', ask: '条件によって答えが変わると分かる', form: '「どんなときに」「違いは」' },
  { level: 4, name: '予測', ask: '具体例の結末を当てられる', form: '「このコードは」「この場合どうなる」' },
  { level: 5, name: '判断', ask: 'トレードオフや背景を語れる', form: '「どちらが正しいか、何を壊すか」' }
];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;
export const ALL_LEVELS = [1, 2, 3, 4, 5];

export const levelName = (level) => (LEVELS.find((l) => l.level === level) || {}).name || '';

export const unitOf = (bank, unitId) => bank.units.find((u) => u.id === unitId) || null;
export const unitLabel = (bank, unitId) => (unitOf(bank, unitId) || {}).label || unitId;
export const questionsOf = (bank, unitId) => bank.questions.filter((q) => q.unit === unitId);

/** 単元 × レベルの充足表。画面の「レベルの品揃え」と検査の両方が使う。 */
export function coverage(bank) {
  return bank.units.map((u) => {
    const qs = questionsOf(bank, u.id);
    const levels = {};
    for (const L of ALL_LEVELS) levels[L] = qs.filter((q) => q.level === L).length;
    return { unit: u, total: qs.length, levels, missing: ALL_LEVELS.filter((L) => !levels[L]) };
  });
}

/**
 * 問題集の登録所。
 * 同梱ぶんは起動時に入れ、講師が作ったものは保存から復元して足す。
 */
export function createRegistry(initial = []) {
  const byId = new Map();
  const order = [];

  const api = {
    add(bank, { replace = false } = {}) {
      if (byId.has(bank.id)) {
        if (!replace) throw new Error('問題集idの重複: ' + bank.id);
        byId.set(bank.id, bank);
        return bank;
      }
      byId.set(bank.id, bank);
      order.push(bank.id);
      return bank;
    },
    remove(id) {
      if (!byId.delete(id)) return false;
      order.splice(order.indexOf(id), 1);
      return true;
    },
    has: (id) => byId.has(id),
    /** 見つからなければ先頭を返す。保存された選択が消えた問題集を指していても落ちない。 */
    get: (id) => byId.get(id) || byId.get(order[0]) || null,
    list: () => order.map((id) => byId.get(id)),
    authored: () => api.list().filter((b) => b.origin === 'authored')
  };

  for (const b of initial) api.add(b);
  return api;
}
