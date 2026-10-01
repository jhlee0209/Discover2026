// 상체 자세 분석 — 어깨 기울기, 몸 중심 이동, 손 노출을 한 프레임 단위로 읽습니다.
const DEG = 180 / Math.PI;
const L_SHOULDER = 11, R_SHOULDER = 12, L_WRIST = 15, R_WRIST = 16;

export function readPose(result, aspect, detect) {
  const lm = result.landmarks?.[0];
  if (!lm) return { present: false };
  const ls = lm[L_SHOULDER], rs = lm[R_SHOULDER];
  const shouldersOk = (ls.visibility ?? 1) > 0.5 && (rs.visibility ?? 1) > 0.5;
  if (!shouldersOk) return { present: false };

  const dx = (ls.x - rs.x) * aspect, dy = ls.y - rs.y;
  const angle = Math.abs(Math.atan2(dy, dx) * DEG);
  const tilt = Math.min(angle, 180 - angle);
  const sw = Math.hypot(dx, dy); // 어깨너비(세로 기준 정규화)

  const handIn = (w) => (w.visibility ?? 0) >= detect.handVisibility && w.y < 1 && w.y > 0 && w.x > 0 && w.x < 1;
  const lw = lm[L_WRIST], rw = lm[R_WRIST];

  return {
    present: true,
    tilt,
    cx: ((ls.x + rs.x) / 2) * aspect,
    cy: (ls.y + rs.y) / 2,
    sw,
    hands: (handIn(lw) ? 1 : 0) + (handIn(rw) ? 1 : 0),
    lw: { x: lw.x * aspect, y: lw.y, in: handIn(lw) },
    rw: { x: rw.x * aspect, y: rw.y, in: handIn(rw) },
    pts: { ls, rs, lw, rw },
  };
}
