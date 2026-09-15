/**
 * 問題集の登録所。
 *
 * 題材はここに「差し込む」だけで増える。エンジン側（judge / hint / grade / rally）は
 * 題材を一切知らない。Java と 桑田佳祐・サザンオールスターズ は、その最初の2つ。
 *
 * bank = {
 *   id, name, subtitle, blurb,
 *   units:     [{ id, label, summary, levelNote }],   // 単元
 *   questions: [{ id, unit, level, prompt, criteria, hints, model, why, source }]
 * }
 */
(function (global) {
  'use strict';
  const RR = (global.RR = global.RR || {});


  /**
   * レベルの定義（全問題集で共通）。
   * 問題を書くときはこの5段階のどれに当たるかで level を決める。
   * 「難しそうだから4」ではなく「問われている行為が何か」で決める、というのがこの表の役目。
   */
  const LEVELS = [
    { level: 1, name: '再生',   ask: '用語や事実を思い出せる',          form: '「〜は何か」「誰か」「何年か」' },
    { level: 2, name: '説明',   ask: '仕組みを自分の言葉で言える',      form: '「なぜそうなるか」「何が起きるか」' },
    { level: 3, name: '使い分け', ask: '条件によって答えが変わると分かる', form: '「どんなときに」「違いは」' },
    { level: 4, name: '予測',   ask: '具体例の結末を当てられる',        form: '「このコードは」「この場合どうなる」' },
    { level: 5, name: '判断',   ask: 'トレードオフや背景を語れる',   form: '「どちらが正しいか、何を壊すか」' }
  ];

  const banks = [];
  const byId = new Map();

  function register(bank) {
    if (byId.has(bank.id)) throw new Error('問題集idの重複: ' + bank.id);
    byId.set(bank.id, bank);
    banks.push(bank);
    return bank;
  }

  const all = () => banks.slice();
  const get = (id) => byId.get(id) || banks[0];
  const unit = (bank, unitId) => bank.units.find((u) => u.id === unitId) || null;
  const questionsOf = (bank, unitId) => bank.questions.filter((q) => q.unit === unitId);

  /** 単元 × レベルの充足表。画面の「レベルの品揃え」と lint の両方が使う。 */
  function coverage(bank) {
    return bank.units.map((u) => {
      const qs = questionsOf(bank, u.id);
      const levels = {};
      for (let L = 1; L <= 5; L++) levels[L] = qs.filter((q) => q.level === L).length;
      return { unit: u, total: qs.length, levels };
    });
  }

  RR.Banks = { register, all, get, unit, questionsOf, coverage, LEVELS, MAX_LEVEL: 5, MIN_LEVEL: 1 };
})(typeof window !== 'undefined' ? window : globalThis);
