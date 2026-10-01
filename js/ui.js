// 화면 공통 도우미
import { getSession, listSessions } from './storage.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function scoreColor(score) {
  if (score == null) return 'var(--border)';
  if (score >= 80) return 'var(--good)';
  if (score >= 60) return 'var(--warn)';
  return 'var(--bad)';
}

export function scoreClass(score) {
  if (score == null) return '';
  return score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad';
}

// 데모(demo-*) 기록과 내 기록을 같은 방식으로 조회
export function findSession(id, cfg) {
  if (id?.startsWith('demo-')) return cfg.demo.find((s) => s.id === id) || null;
  return getSession(id);
}

export function sessionsFor(cfg, { demo = false } = {}) {
  return demo ? cfg.demo : listSessions();
}

export function html(el, markup) {
  el.innerHTML = markup;
  return el;
}
