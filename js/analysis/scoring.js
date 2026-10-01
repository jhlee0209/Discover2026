// 측정값 → 항목 점수(0~100)와 종합 점수. 기준값은 data/thresholds.json 에서 조정합니다.
export const ITEM_ORDER = ['speed', 'silence', 'filler', 'gaze', 'expression', 'posture', 'gesture'];

// ideal 범위 안이면 100점, zero 쪽으로 멀어질수록 0점까지 선형 감점
export function scoreValue(value, spec) {
  if (value == null || Number.isNaN(value)) return null;
  const [lo, hi] = spec.ideal;
  const [zlo, zhi] = spec.zero;
  if (value >= lo && value <= hi) return 100;
  if (value < lo) return lo === zlo ? 100 : clamp(((value - zlo) / (lo - zlo)) * 100);
  return hi === zhi ? 100 : clamp(((zhi - value) / (zhi - hi)) * 100);
}

const clamp = (v) => Math.round(Math.max(0, Math.min(100, v)));

// 자세는 어깨 기울기·몸 흔들림 두 하위 지표의 평균
export function postureValue(metrics, cfg) {
  const t = scoreValue(metrics.shoulderTilt, cfg.sub.shoulderTilt);
  const s = scoreValue(metrics.sway, cfg.sub.sway);
  const parts = [t, s].filter((v) => v != null);
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
}

export function itemValue(metrics, key, cfg) {
  return key === 'posture' ? postureValue(metrics, cfg) : metrics[key];
}

export function scoreSession(metrics, cfg) {
  const scores = {};
  let sum = 0, weight = 0;
  for (const key of ITEM_ORDER) {
    const spec = cfg.items[key];
    const s = scoreValue(itemValue(metrics, key, cfg), spec);
    scores[key] = s;
    if (s != null) { sum += s * spec.weight; weight += spec.weight; }
  }
  const overall = weight ? Math.round(sum / weight) : null;
  return { scores, overall, grade: gradeOf(overall, cfg) };
}

export function gradeOf(score, cfg) {
  if (score == null) return { label: '-', text: '측정 불가' };
  return cfg.grades.find((g) => score >= g.min) || cfg.grades[cfg.grades.length - 1];
}

// 기준 대비 높음/낮음/적정
export function judge(value, spec) {
  if (value == null) return null;
  if (value < spec.ideal[0]) return 'low';
  if (value > spec.ideal[1]) return 'high';
  return 'good';
}
