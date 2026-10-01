// 화면 4 · 성장 기록 — 질문별 회차 점수 변화 그래프와 개선/약점 요약
import { ITEM_ORDER, scoreSession } from '../analysis/scoring.js';
import { clearSessions } from '../storage.js';
import { esc, fmtDate, scoreColor, sessionsFor } from '../ui.js';

const SERIES_COLORS = ['#2f5bea', '#18a058', '#e08a00', '#7a5af8', '#d63c3c', '#0ea5b7', '#8a5a2b'];

export function render(el, { arg, params, cfg }) {
  const demo = params.demo === '1';
  const t = cfg.thresholds;
  const all = sessionsFor(cfg, { demo }).map((s) => ({ ...s, result: scoreSession(s.metrics, t) }));

  if (!all.length) {
    el.innerHTML = `
      <div class="card empty">
        <h2>아직 연습 기록이 없어요</h2>
        <p class="muted">같은 질문을 여러 번 연습하면 회차별 점수 변화를 그래프로 보여드려요.</p>
        <div class="row" style="justify-content:center">
          <a class="btn" href="#/practice">첫 연습 시작하기</a>
          <a class="btn secondary" href="#/history?demo=1">샘플 성장 기록 보기</a>
        </div>
      </div>`;
    return;
  }

  // 질문별 묶음 (기록이 많은 순)
  const groups = new Map();
  all.forEach((s) => {
    if (!groups.has(s.questionId)) groups.set(s.questionId, { id: s.questionId, text: s.questionText, list: [] });
    groups.get(s.questionId).list.push(s);
  });
  const ordered = [...groups.values()].sort((a, b) => b.list.length - a.list.length);
  const current = groups.get(arg) || ordered[0];
  const list = current.list;
  const first = list[0].result, last = list[list.length - 1].result;

  // 가장 많이 좋아진 항목 / 아직 약한 항목
  const deltas = ITEM_ORDER
    .map((k) => ({ k, d: last.scores[k] != null && first.scores[k] != null ? last.scores[k] - first.scores[k] : null }))
    .filter((x) => x.d != null).sort((a, b) => b.d - a.d);
  const weakest = ITEM_ORDER.filter((k) => last.scores[k] != null).sort((a, b) => last.scores[a] - last.scores[b])[0];
  const best = list.reduce((m, s) => Math.max(m, s.result.overall ?? 0), 0);
  const q = demo ? '?demo=1' : '';

  el.innerHTML = `
    <div class="spread" style="margin-bottom:16px">
      <div>
        <h1 style="font-size:1.5rem;margin:0">성장 기록 ${demo ? '<span class="badge warn">샘플 데이터</span>' : ''}</h1>
        <p class="muted small" style="margin:4px 0 0">같은 질문끼리 회차를 비교해요.</p>
      </div>
      <div class="row">
        ${demo ? '<a class="btn sm secondary" href="#/history">내 기록 보기</a>' : '<a class="btn sm secondary" href="#/history?demo=1">샘플 기록 보기</a>'}
        <a class="btn sm" href="#/practice/${esc(current.id)}">이 질문 다시 연습</a>
      </div>
    </div>

    <div class="chips" style="margin-bottom:16px">
      ${ordered.map((g) => `<a class="chip ${g.id === current.id ? 'active' : ''}" href="#/history/${esc(g.id)}${q}" style="text-decoration:none">${esc(g.text.length > 22 ? g.text.slice(0, 22) + '…' : g.text)} (${g.list.length})</a>`).join('')}
    </div>

    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="card stat"><div class="small muted">연습 횟수</div><div class="num">${list.length}회</div></div>
      <div class="card stat"><div class="small muted">첫 회차 → 최근</div><div class="num">${first.overall ?? '-'} → <span style="color:${scoreColor(last.overall)}">${last.overall ?? '-'}</span></div><div class="small muted">최고 ${best}점</div></div>
      <div class="card stat"><div class="small muted">가장 많이 좋아진 항목</div><div class="num">${deltas[0] && deltas[0].d > 0 ? `${esc(t.items[deltas[0].k].label)} <span class="delta up">+${deltas[0].d}</span>` : '-'}</div><div class="small muted">${weakest ? `다음 목표: <b>${esc(t.items[weakest].label)}</b> (${last.scores[weakest]}점)` : ''}</div></div>
    </div>

    <section class="card">
      <div class="spread"><h2 style="margin:0">회차별 점수</h2><span class="small muted">범례를 누르면 항목을 켜고 끌 수 있어요</span></div>
      <div class="chart-box" style="margin-top:12px"><canvas id="chart" aria-label="회차별 점수 그래프"></canvas></div>
      ${list.length < 2 ? '<p class="small muted">한 번 더 연습하면 변화 그래프가 그려져요.</p>' : ''}
    </section>

    <section class="card" style="margin-top:16px">
      <h2>회차 목록</h2>
      <ul class="sess-list">
        ${[...list].reverse().map((s, i) => `
          <li><a href="#/result/${esc(s.id)}">
            <span><b>${list.length - i}회차</b> <span class="muted small">${fmtDate(s.createdAt)}</span></span>
            <span class="score" style="color:${scoreColor(s.result.overall)}">${s.result.overall ?? '-'}</span>
            <span class="small muted">${ITEM_ORDER.filter((k) => s.result.scores[k] != null).map((k) => `${t.items[k].label} ${s.result.scores[k]}`).join(' · ')}</span>
          </a></li>`).join('')}
      </ul>
      ${demo ? '' : '<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn sm secondary" id="clear">내 기록 전체 삭제</button></div>'}
    </section>
  `;

  let chart = null;
  if (window.Chart) {
    const labels = list.map((_, i) => `${i + 1}회차`);
    const datasets = [
      { label: '종합', data: list.map((s) => s.result.overall), borderColor: '#182033', backgroundColor: '#182033', borderWidth: 3, tension: 0.3 },
      ...ITEM_ORDER.map((k, i) => ({
        label: t.items[k].label, data: list.map((s) => s.result.scores[k]),
        borderColor: SERIES_COLORS[i], backgroundColor: SERIES_COLORS[i], borderWidth: 1.5, tension: 0.3, borderDash: [4, 3], pointRadius: 2,
      })),
    ];
    chart = new window.Chart(el.querySelector('#chart'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, spanGaps: true,
        interaction: { mode: 'index', intersect: false },
        scales: { y: { min: 0, max: 100, ticks: { stepSize: 20 } } },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } },
      },
    });
  } else {
    el.querySelector('.chart-box').innerHTML = '<p class="muted">그래프 라이브러리를 불러오지 못했어요.</p>';
  }

  el.querySelector('#clear')?.addEventListener('click', () => {
    if (confirm('이 기기에 저장된 내 연습 기록을 모두 삭제할까요? 되돌릴 수 없어요.')) { clearSessions(); location.reload(); }
  });

  return () => chart?.destroy();
}
