// 규칙 기반 맞춤 피드백 — data/feedback-rules.json 의 문구를 측정값으로 채웁니다.
import { ITEM_ORDER, itemValue, judge } from './scoring.js';

const MAX_WARN = 3, MAX_GOOD = 2;

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

export function buildFeedback(metrics, result, cfg, rules) {
  const top = Object.entries(metrics.fillerCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w).join("', '") || '음';
  const tiltBad = metrics.shoulderTilt != null && metrics.shoulderTilt > cfg.sub.shoulderTilt.ideal[1];
  const swayBad = metrics.sway != null && metrics.sway > cfg.sub.sway.ideal[1];
  const postureDetail = [
    tiltBad ? `어깨가 평균 ${metrics.shoulderTilt}° 기울어져 있었어요.` : '',
    swayBad ? '몸이 좌우·앞뒤로 자주 움직였어요.' : '',
  ].join(' ').trim() || '자세 점수가 기준보다 낮아요.';

  const items = [];
  for (const key of ITEM_ORDER) {
    const spec = cfg.items[key];
    const value = itemValue(metrics, key, cfg);
    let when = judge(value, spec);
    if (!when) continue;
    let rule = rules.find((r) => r.item === key && r.when === when);
    if (!rule && when !== 'good') rule = rules.find((r) => r.item === key && r.when !== 'good');
    if (!rule) continue;
    const vars = {
      value: value, unit: spec.unit, top, postureDetail,
      side: metrics.gazeSideText ? `주로 ${metrics.gazeSideText}을 보는 경향이 있어요.` : '',
    };
    items.push({
      item: key, label: spec.label, level: when === 'good' ? 'good' : 'warn',
      score: result.scores[key],
      title: fill(rule.title, vars), detail: fill(rule.detail, vars), tip: fill(rule.tip, vars),
    });
  }
  const warns = items.filter((i) => i.level === 'warn').sort((a, b) => a.score - b.score).slice(0, MAX_WARN);
  const goods = items.filter((i) => i.level === 'good').sort((a, b) => cfg.items[b.item].weight - cfg.items[a.item].weight).slice(0, MAX_GOOD);
  return [...warns, ...goods];
}
