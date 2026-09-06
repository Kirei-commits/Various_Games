/**
 * Canvas 描画。ゲームの状態を受け取って絵にするだけで、状態は持たない
 * （持つのは見た目のためのアニメーション用の内部時刻と粒子のみ）。
 *
 * テンション／取り込みのゲージは Canvas ではなく DOM 側に置いている。
 * 数値をそのまま検証でき、拡大表示や読み上げにも素直に乗るため。
 */
(function (global) {
  'use strict';

  var SKY = {
    dawn:  ['#ffd9a8', '#ffb0b8', '#8fd3f4'],
    day:   ['#8fe3ff', '#c9f2ff', '#eafcff'],
    dusk:  ['#ff9e6d', '#ff7fa5', '#5b6fd6'],
    night: ['#10184a', '#243b8f', '#3f6bb5']
  };
  var SEA = {
    dawn:  ['#3fa9d8', '#0f5f96'],
    day:   ['#37c2e8', '#0e6ea8'],
    dusk:  ['#3a6fb5', '#123a6e'],
    night: ['#12285e', '#050f2e']
  };

  var drops = [];
  var splashes = [];

  function resize(canvas) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g: g, w: w, h: h };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function skyOf(phaseId) { return SKY[phaseId] || SKY.day; }
  function seaOf(phaseId) { return SEA[phaseId] || SEA.day; }

  function drawSky(g, w, hz, colors, view) {
    var grad = g.createLinearGradient(0, 0, 0, hz);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.6, colors[1]);
    grad.addColorStop(1, colors[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, hz);

    // 太陽 / 月
    var night = view.timePhase === 'night';
    var cx = w * (view.timePhase === 'dawn' ? 0.22 : view.timePhase === 'dusk' ? 0.78 : 0.5);
    var cy = hz * (view.timePhase === 'day' ? 0.28 : 0.55);
    var r = hz * 0.11;
    g.save();
    g.globalAlpha = view.weather === 'storm' ? 0.25 : view.weather === 'rain' ? 0.5 : 1;
    g.fillStyle = night ? '#fdf6d8' : '#fff2a8';
    g.shadowColor = night ? 'rgba(253,246,216,0.8)' : 'rgba(255,214,102,0.9)';
    g.shadowBlur = 28;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    if (night) { // 月を欠けさせる
      g.shadowBlur = 0;
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(cx + r * 0.42, cy - r * 0.22, r * 0.92, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();

    // 星（夜のみ）
    if (night) {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (var i = 0; i < 40; i++) {
        var sx = ((i * 97) % 100) / 100 * w;
        var sy = ((i * 61) % 100) / 100 * hz * 0.8;
        var tw = 0.5 + 0.5 * Math.sin(view.time / 600 + i);
        g.globalAlpha = 0.25 + tw * 0.6;
        g.fillRect(sx, sy, 2, 2);
      }
      g.globalAlpha = 1;
    }

    // 雲
    var cloudAlpha = view.weather === 'sunny' ? 0.55 : view.weather === 'cloudy' ? 0.85 : 0.95;
    var cloudColor = view.weather === 'storm' ? 'rgba(70,74,102,0.95)'
      : view.weather === 'rain' ? 'rgba(150,160,180,0.9)' : 'rgba(255,255,255,0.9)';
    g.fillStyle = cloudColor;
    g.globalAlpha = cloudAlpha;
    for (var c = 0; c < 3; c++) {
      var base = (view.time / (60 + c * 25)) % (w + 240) - 120;
      var y = hz * (0.18 + c * 0.16);
      var s = hz * (0.09 + c * 0.02);
      g.beginPath();
      g.arc(base, y, s, 0, Math.PI * 2);
      g.arc(base + s * 1.0, y - s * 0.35, s * 0.85, 0, Math.PI * 2);
      g.arc(base + s * 2.0, y, s * 0.7, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function drawWeather(g, w, h, view, dt) {
    if (view.weather !== 'rain' && view.weather !== 'storm') { drops.length = 0; return; }
    var want = view.weather === 'storm' ? 130 : 70;
    while (drops.length < want) {
      drops.push({ x: Math.random() * w, y: Math.random() * h, v: 380 + Math.random() * 260, l: 8 + Math.random() * 12 });
    }
    if (drops.length > want) drops.length = want;
    g.strokeStyle = view.weather === 'storm' ? 'rgba(210,230,255,0.75)' : 'rgba(200,225,255,0.55)';
    g.lineWidth = 1.4;
    g.beginPath();
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      d.y += d.v * dt / 1000;
      d.x += (view.weather === 'storm' ? 90 : 30) * dt / 1000;
      if (d.y > h) { d.y = -20; d.x = Math.random() * w; }
      if (d.x > w) d.x = 0;
      g.moveTo(d.x, d.y);
      g.lineTo(d.x - (view.weather === 'storm' ? 5 : 2), d.y + d.l);
    }
    g.stroke();

    if (view.weather === 'storm') {
      var flash = Math.sin(view.time / 1900);
      if (flash > 0.985) {
        g.fillStyle = 'rgba(255,255,255,' + ((flash - 0.985) / 0.015 * 0.5).toFixed(3) + ')';
        g.fillRect(0, 0, w, h);
      }
    }
  }

  function drawSea(g, w, h, hz, colors, view) {
    var grad = g.createLinearGradient(0, hz, 0, h);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    g.fillStyle = grad;
    g.fillRect(0, hz, w, h - hz);

    // 波（水平の帯を上下に揺らす）
    g.save();
    g.globalAlpha = 0.18;
    g.fillStyle = '#ffffff';
    for (var i = 0; i < 5; i++) {
      var y = hz + (h - hz) * (0.08 + i * 0.17);
      var amp = 3 + i * 1.6;
      g.beginPath();
      g.moveTo(0, y);
      for (var x = 0; x <= w; x += 12) {
        g.lineTo(x, y + Math.sin((x / 70) + view.time / (420 - i * 40) + i) * amp);
      }
      g.lineTo(w, y + 3.5);
      for (var x2 = w; x2 >= 0; x2 -= 12) {
        g.lineTo(x2, y + 3.5 + Math.sin((x2 / 70) + view.time / (420 - i * 40) + i) * amp);
      }
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  /** 横向きの魚。fish の配色を使う。 */
  function drawFish(g, x, y, len, dir, fish, wag) {
    var h = len * 0.42;
    g.save();
    g.translate(x, y);
    g.scale(dir, 1);
    g.rotate(Math.sin(wag) * 0.08);

    g.fillStyle = fish.color;
    g.beginPath();
    g.moveTo(len * 0.5, 0);
    g.quadraticCurveTo(len * 0.05, -h * 0.62, -len * 0.34, 0);
    g.quadraticCurveTo(len * 0.05, h * 0.62, len * 0.5, 0);
    g.fill();

    g.fillStyle = fish.belly;
    g.globalAlpha = 0.65;
    g.beginPath();
    g.moveTo(len * 0.44, h * 0.06);
    g.quadraticCurveTo(len * 0.05, h * 0.5, -len * 0.28, h * 0.04);
    g.quadraticCurveTo(len * 0.05, h * 0.22, len * 0.44, h * 0.06);
    g.fill();
    g.globalAlpha = 1;

    // 尾
    g.fillStyle = fish.accent;
    var t = Math.sin(wag * 1.6) * h * 0.16;
    g.beginPath();
    g.moveTo(-len * 0.30, 0);
    g.lineTo(-len * 0.52, -h * 0.42 + t);
    g.lineTo(-len * 0.46, 0);
    g.lineTo(-len * 0.52, h * 0.42 + t);
    g.closePath();
    g.fill();

    // 背びれ
    g.beginPath();
    g.moveTo(len * 0.12, -h * 0.40);
    g.lineTo(-len * 0.06, -h * 0.72);
    g.lineTo(-len * 0.18, -h * 0.30);
    g.closePath();
    g.fill();

    // 目
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(len * 0.30, -h * 0.16, h * 0.15, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#20232e';
    g.beginPath(); g.arc(len * 0.32, -h * 0.16, h * 0.08, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function addSplash(x, y, n) {
    for (var i = 0; i < (n || 10); i++) {
      splashes.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 180,
        vy: -60 - Math.random() * 200,
        life: 600 + Math.random() * 400, age: 0
      });
    }
  }

  function drawSplashes(g, dt) {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = splashes.length - 1; i >= 0; i--) {
      var p = splashes[i];
      p.age += dt;
      if (p.age > p.life) { splashes.splice(i, 1); continue; }
      var t = p.age / 1000;
      var x = p.x + p.vx * t;
      var y = p.y + p.vy * t + 380 * t * t;
      g.globalAlpha = 1 - p.age / p.life;
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  /**
   * view = {
   *   time, timePhase, weather, gamePhase, phaseT, waitRatio,
   *   tension, progress, fish, size, result
   * }
   */
  function draw(canvas, view, dt) {
    var r = resize(canvas);
    var g = r.g, w = r.w, h = r.h;
    var hz = h * 0.42;

    drawSky(g, w, hz, skyOf(view.timePhase), view);
    drawSea(g, w, h, hz, seaOf(view.timePhase), view);

    var gp = view.gamePhase;
    var bob = Math.sin(view.time / 380) * 4;
    var floatX = w * 0.5;
    var floatY = hz + (h - hz) * 0.30 + bob;

    // 竿と道糸（右下から）
    var rodX = w * 0.94, rodY = h * 0.99;
    var tipX = w * 0.70, tipY = h * 0.10;
    if (gp === 'fight') {
      var bend = 0.12 + (view.tension || 0) * 0.30;
      tipX = w * (0.70 - bend * 0.5);
      tipY = h * (0.10 + bend * 0.35);
    }
    g.strokeStyle = '#5b3a24';
    g.lineWidth = Math.max(4, w * 0.012);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(rodX, rodY);
    g.quadraticCurveTo(w * 0.90, h * 0.45, tipX, tipY);
    g.stroke();

    if (gp !== 'idle' && gp !== 'casting') {
      g.strokeStyle = (view.tension || 0) > 0.6 ? 'rgba(255,120,120,0.95)' : 'rgba(255,255,255,0.75)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(tipX, tipY);
      g.lineTo(floatX, floatY);
      g.stroke();
    }

    // キャスト中は仕掛けが飛ぶ
    if (gp === 'casting') {
      var t = Math.min(1, view.phaseT / 700);
      var px = lerp(tipX, floatX, t);
      var py = lerp(tipY, floatY, t) - Math.sin(t * Math.PI) * h * 0.22;
      g.strokeStyle = 'rgba(255,255,255,0.65)';
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(px, py); g.stroke();
      g.fillStyle = '#ff5f6d';
      g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill();
    }

    // 水中の魚影（当たりが近いほど寄ってくる）
    if ((gp === 'waiting' || gp === 'bite') && view.fish) {
      var approach = Math.min(1, view.waitRatio || 0);
      var fx = lerp(-w * 0.15, floatX - w * 0.06, approach);
      var fy = floatY + (h - floatY) * 0.35;
      g.save();
      g.globalAlpha = 0.18 + approach * 0.35;
      g.fillStyle = '#04182f';
      g.beginPath();
      g.ellipse(fx, fy, w * 0.09, h * 0.028, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // ウキ
    if (gp !== 'idle' && gp !== 'casting') {
      var dip = gp === 'bite' ? Math.abs(Math.sin(view.time / 70)) * 14 : 0;
      var fyF = floatY + dip;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(floatX, fyF - 8, 7, Math.PI, 0); g.fill();
      g.fillStyle = '#ff5f6d';
      g.beginPath(); g.arc(floatX, fyF - 8, 7, 0, Math.PI); g.fill();
      g.strokeStyle = '#ffb703';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(floatX, fyF - 15); g.lineTo(floatX, fyF - 26); g.stroke();

      // 波紋
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 1.5;
      for (var ri = 0; ri < 2; ri++) {
        var rr = ((view.time / 12 + ri * 60) % 120) / 120;
        g.globalAlpha = 0.5 * (1 - rr);
        g.beginPath();
        g.ellipse(floatX, fyF, 8 + rr * 46, (8 + rr * 46) * 0.28, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // ファイト中の魚
    if (gp === 'fight' && view.fish) {
      // 下端はゲージのオーバーレイに重なるので、そこまで潜らせない
      var depth = lerp(0.45, 0.08, view.progress || 0);
      var fyy = floatY + (h - floatY) * depth;
      var sway = Math.sin(view.time / 260) * w * 0.10;
      var len = Math.max(40, Math.min(w * 0.36, w * 0.12 + (view.size || 30) * 0.9));
      g.save();
      g.globalAlpha = 0.55 + (view.progress || 0) * 0.45;
      drawFish(g, floatX + sway, fyy, len, sway > 0 ? -1 : 1, view.fish, view.time / 90);
      g.restore();
      if ((view.progress || 0) > 0.92) addSplash(floatX + sway, floatY, 2);
    }

    // 釣果の表示
    if (gp === 'result' && view.result && view.result.ok && view.fish) {
      var rise = Math.min(1, view.phaseT / 420);
      var y = lerp(floatY, hz * 0.62, rise);
      var len2 = Math.max(60, Math.min(w * 0.55, w * 0.18 + (view.size || 30) * 1.1));
      g.save();
      g.globalAlpha = 1;
      drawFish(g, floatX, y, len2, -1, view.fish, view.time / 70);
      g.restore();
      if (view.phaseT < 60) addSplash(floatX, floatY, 16);
    }

    drawSplashes(g, dt);
    drawWeather(g, w, h, view, dt);
  }

  global.FQ = global.FQ || {};
  global.FQ.Render = {
    draw: draw,
    resize: resize,
    drawFish: drawFish,
    addSplash: addSplash,
    reset: function () { drops.length = 0; splashes.length = 0; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
