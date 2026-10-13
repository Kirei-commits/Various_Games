// Node で DOMParser を使えるようにする（ブラウザでは標準で使える）
import { JSDOM } from "jsdom";

globalThis.DOMParser ??= new JSDOM("").window.DOMParser;
