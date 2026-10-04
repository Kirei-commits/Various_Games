// =====================================================================
//  ステートマシン（スタック型）とタイムライン
// =====================================================================
class Timeline {
  constructor() { this.ev = []; this.i = 0; this.t = 0; }
  at(t, f) { let k = this.ev.length; while (k > this.i && this.ev[k - 1][0] > t) k--; this.ev.splice(k, 0, [t, f]); return this; }
  after(dt, f) { return this.at(this.t + dt, f); }
  update(dt, owner) { this.t += dt; while (this.i < this.ev.length && this.ev[this.i][0] <= this.t) { const f = this.ev[this.i++][1]; f(); if (!owner.active || owner.paused) break; } }
}
class State {
  constructor(name) { this.name = name; this.t = 0; this.tl = new Timeline(); this.active = false; this.paused = false; }
  enter() { } exit() { } tick() { } resume() { }
  update(dt) { this.t += dt; this.tl.update(dt, this); if (this.active && !this.paused) this.tick(dt); }
  onPush() { } onPushHeld() { } onPushRelease() { } onLever() { } onAttacker() { }
}
class FSM {
  constructor() { this.stack = []; }
  get top() { return this.stack[this.stack.length - 1]; }
  change(s) { const o = this.stack.pop(); if (o) { o.active = false; o.exit(); } this.stack.push(s); s.active = true; s.enter(); Bus.emit('state'); }
  push(s) { const tp = this.top; if (tp) tp.paused = true; this.stack.push(s); s.active = true; s.enter(); Bus.emit('state'); }
  pop() { const o = this.stack.pop(); if (o) { o.active = false; o.exit(); } const tp = this.top; if (tp) { tp.paused = false; tp.resume(); } Bus.emit('state'); }
  reset(s) { while (this.stack.length) { const o = this.stack.pop(); o.active = false; o.exit(); } this.stack.push(s); s.active = true; s.enter(); Bus.emit('state'); }
  update(dt) { const tp = this.top; if (tp) tp.update(dt); }
}
