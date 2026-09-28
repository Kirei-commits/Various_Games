/*
 * 開いているブラウザの判定（純粋関数。Node でテストできる）。
 *
 * LINE・Instagram などのアプリ内ブラウザでは、Google がログインを拒否し
 * （disallowed_useragent）、音声認識も使えない。LINE は URL に
 * openExternalBrowser=1 を付けると Safari / Chrome で開き直してくれるので自動で付ける。
 * それ以外のアプリは、ブラウザで開き直す方法を案内する。
 */

const IN_APP = [
  ["LINE", /\bLine\//i],
  ["Instagram", /Instagram/i],
  ["Facebook", /FBAN|FBAV|FB_IAB|FBIOS/i],
  ["X", /Twitter/i],
  ["TikTok", /musical_ly|BytedanceWebview|TikTok/i],
  ["KakaoTalk", /KAKAOTALK/i],
];

/** アプリ内ブラウザならアプリ名、普通のブラウザなら null */
export function detectInAppBrowser(userAgent = "") {
  for (const [name, re] of IN_APP) if (re.test(userAgent)) return name;
  return null;
}

/** LINE で開かれたときに、外部ブラウザで開き直すための URL（すでに付いていれば null） */
export function lineExternalUrl(href) {
  const url = new URL(href);
  if (url.searchParams.has("openExternalBrowser")) return null;
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}
