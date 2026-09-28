import { test } from "node:test";
import assert from "node:assert/strict";
import { usableVoices, pickVoices, voiceGender, baseName } from "../../src/voices.js";

const v = (name, lang = "en-US") => ({ name, lang, voiceURI: `uri:${name}`, localService: true });

// iPhone の英語の声（おもしろ音声・旧式の声を多く含む実際の並び）
const IPHONE = [
  "Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Eddy (English (US))",
  "Flo (English (US))", "Fred", "Good News", "Grandma (English (US))", "Jester", "Junior", "Kathy",
  "Organ", "Ralph", "Samantha", "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox",
].map((n) => v(n)).concat([v("Daniel", "en-GB"), v("Karen", "en-AU"), v("Rishi", "en-IN")]);

test("おもしろ音声・旧式の声は一覧から外す", () => {
  const names = usableVoices(IPHONE).map((x) => x.name);
  assert.deepEqual(names.sort(), ["Daniel", "Karen", "Rishi", "Samantha"].sort());
});

test("iPhone: A役は Samantha（女性）、B役は男性の Daniel", () => {
  const voices = usableVoices(IPHONE);
  const { a, b, sameVoice } = pickVoices(voices);
  assert.equal(a.name, "Samantha");
  assert.equal(b.name, "Daniel");
  assert.equal(sameVoice, false);
});

test("同じ地域の異性の声があればそれを優先する", () => {
  const voices = usableVoices([v("Samantha"), v("Daniel", "en-GB"), v("Aaron"), v("Karen", "en-AU")]);
  assert.equal(pickVoices(voices).b.name, "Aaron");
});

test("A役に男性を選べば、B役は女性になる", () => {
  const voices = usableVoices([v("Samantha"), v("Aaron"), v("Karen", "en-AU")]);
  assert.equal(pickVoices(voices, { aURI: "uri:Aaron" }).b.name, "Samantha");
});

test("B役を自分で選んだらそれを使う", () => {
  const voices = usableVoices([v("Samantha"), v("Aaron"), v("Karen", "en-AU")]);
  assert.equal(pickVoices(voices, { bURI: "uri:Karen" }).b.name, "Karen");
});

test("性別の分かる別の声がなければ同じ声（高さで区別）。声を分けない設定でも同じ声", () => {
  const android = usableVoices([v("English United States"), v("English United Kingdom", "en-GB")]);
  const r = pickVoices(android);
  assert.equal(r.sameVoice, true);
  assert.equal(r.a, r.b);
  const r2 = pickVoices(usableVoices([v("Samantha"), v("Aaron")]), { twoVoices: false });
  assert.equal(r2.sameVoice, true);
});

test("名前から性別を判定する（Enhanced や Microsoft の長い名前も）", () => {
  assert.equal(baseName("Samantha (Enhanced)"), "Samantha");
  assert.equal(voiceGender(v("Ava (Premium)")), "female");
  assert.equal(voiceGender(v("Microsoft Guy Online (Natural) - English (United States)")), "male");
  assert.equal(voiceGender(v("Google UK English Male", "en-GB")), "male");
  assert.equal(voiceGender(v("English United States")), null);
});
