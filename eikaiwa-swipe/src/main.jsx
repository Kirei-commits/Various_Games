import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { detectInAppBrowser, lineExternalUrl } from "./env.js";

// LINE のアプリ内ブラウザでは Google ログインも音声認識も使えないので、Safari / Chrome で開き直す
const redirect = detectInAppBrowser(navigator.userAgent) === "LINE" ? lineExternalUrl(location.href) : null;
if (redirect) location.replace(redirect);

createRoot(document.getElementById("root")).render(<App />);
