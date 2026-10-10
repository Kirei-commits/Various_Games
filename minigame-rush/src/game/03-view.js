// 遠近法（ワールド座標 ↔ 画面座標）。奥（y が大きい）ほど小さく、上に描く
const View = (() => {
  const V = CFG.view;
  const cx = V.w / 2;
  const z = y => y + V.z0;
  return {
    W: V.w, H: V.h,
    sx: (x, y) => cx + (x - CFG.world.W / 2) * V.B / z(y),
    sy: y => V.horizon + V.A / z(y),
    /** その奥行きで、ワールド1単位が何ピクセルか */
    scale: y => V.B / z(y),
    /** 画面座標 → ワールド座標 */
    toWorld(px, py) {
      const zz = V.A / Math.max(1, py - V.horizon);
      return { x: (px - cx) * zz / V.B + CFG.world.W / 2, y: zz - V.z0 };
    }
  };
})();
