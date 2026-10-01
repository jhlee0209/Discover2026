// 화면 3 · 결과 — 종합/항목 점수, 맞춤 피드백, 영상 다시보기 + 문제 구간 타임라인
import { ITEM_ORDER, scoreSession, itemValue } from '../analysis/scoring.js';
import { buildFeedback } from '../analysis/feedback.js';
import { getReplay, deleteSession } from '../storage.js';
import { esc, fmtTime, fmtDate, scoreColor, findSession, sessionsFor } from '../ui.js';

const MARKER_TEXT = { gaze: '시선 이탈', silence: '긴 침묵', filler: '추임새', posture: '자세' };

function displayValue(key, metrics, cfg) {
  const v = itemValue(metrics, key, cfg);
  if (v == null) return '측정 불가';
  const unit = cfg.items[key].unit;
  if (key === 'posture') return `기울기 ${metrics.shoulderTilt}° · 흔들림 ${metrics.sway}`;
  if (key === 'gesture') return `손 노출 ${v}%`;
  return `${v}${unit === '%' ? '%' : ' ' + unit}`;
}

function unavailableReason(key, metrics) {
  if (['speed', 'filler'].includes(key)) {
    if (metrics.speechError === 'unsupported') return '이 브라우저는 음성 인식 미지원 (크롬 권장)';
    if (metrics.speechError === 'network') return '음성 인식 서버 연결 실패';
    if (metrics.speechError === 'not-allowed') return '음성 인식 권한 거부';
    return '인식된 말이 너무 적어요';
  }
  if (['gaze', 'expression'].includes(key)) return '얼굴이 충분히 인식되지 않았어요';
  return '어깨가 화면에 충분히 보이지 않았어요';
}

function highlightFillers(text, words) {
  const set = new Set(words);
  return text.split(/(\s+)/).map((w) => (set.has(w.replace(/[.,!?~…]/g, '')) ? `<mark>${esc(w)}</mark>` : esc(w))).join('');
}

export function render(el, { arg: id, cfg }) {
  const session = findSession(id, cfg);
  if (!session) {
    el.innerHTML = `<div class="card empty"><h2>기록을 찾을 수 없어요</h2><p class="muted">이 기기에 저장된 기록이 아니거나 삭제되었어요.</p><a class="btn" href="#/practice">연습하러 가기</a></div>`;
    return;
  }
  const t = cfg.thresholds;
  const result = scoreSession(session.metrics, t);
  const feedback = buildFeedback(session.metrics, result, t, cfg.rules);

  // 같은 질문의 직전 회차와 비교
  const same = sessionsFor(cfg, { demo: !!session.demo }).filter((s) => s.questionId === session.questionId);
  const idx = same.findIndex((s) => s.id === session.id);
  const prev = idx > 0 ? same[idx - 1] : null;
  const prevResult = prev ? scoreSession(prev.metrics, t) : null;
  const delta = prevResult && result.overall != null && prevResult.overall != null ? result.overall - prevResult.overall : null;

  const replayUrl = getReplay(session.id);
  const duration = session.durationSec || 60;

  el.innerHTML = `
    <div class="spread" style="margin-bottom:16px">
      <div>
        <div class="row"><span class="badge accent">${esc(session.category || '자유 발표')}</span>${session.demo ? '<span class="badge warn">샘플 데이터</span>' : ''}<span class="small muted">${fmtDate(session.createdAt)} · ${fmtTime(duration)} · ${idx + 1}회차</span></div>
        <h1 style="margin-top:8px;font-size:1.5rem">${esc(session.questionText)}</h1>
      </div>
      <div class="row">
        <a class="btn" href="#/practice/${esc(session.questionId)}">🔁 같은 질문 다시 연습</a>
        <a class="btn secondary" href="#/history/${esc(session.questionId)}${session.demo ? '?demo=1' : ''}">📈 성장 기록</a>
      </div>
    </div>

    <div class="grid grid-2">
      <section class="card">
        <div class="result-head">
          <div class="ring" style="--p:${result.overall ?? 0};--c:${scoreColor(result.overall)}"><div><div><div class="num">${result.overall ?? '-'}</div><div class="grade">종합 · ${esc(result.grade.label)}등급</div></div></div></div>
          <div>
            <h2 style="margin-bottom:4px">${esc(result.grade.text)}</h2>
            ${delta != null
              ? `<p>직전 회차보다 <span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}점</span> ${delta >= 0 ? '좋아졌어요' : '낮아졌어요'}</p>`
              : `<p class="muted">이 질문의 첫 기록이에요. 같은 질문으로 다시 연습하면 변화를 비교해 드려요.</p>`}
            <p class="small muted" style="margin:0">음성 ${ITEM_ORDER.filter((k) => t.items[k].group === 'voice').length}개 · 비언어 ${ITEM_ORDER.filter((k) => t.items[k].group === 'visual').length}개 항목의 가중 평균이에요.</p>
          </div>
        </div>
        <h3 style="margin-top:24px">항목별 점수</h3>
        <div class="bars">
          ${ITEM_ORDER.map((k) => {
            const s = result.scores[k];
            const ps = prevResult?.scores[k];
            const d = s != null && ps != null ? s - ps : null;
            return `
              <div class="bar-row" title="${esc(t.items[k].label)}">
                <span class="label">${esc(t.items[k].label)}</span>
                <span class="track"><i style="width:${s ?? 0}%;background:${scoreColor(s)}"></i></span>
                <span class="val">${s ?? '–'}</span>
                <span class="sub">${s == null ? esc(unavailableReason(k, session.metrics)) : esc(displayValue(k, session.metrics, t))}${d ? ` · <span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''}</span>
              </div>`;
          }).join('')}
        </div>
        ${['speed', 'filler'].some((k) => result.scores[k] != null) ? '<p class="small muted" style="margin:14px 0 0">※ 추임새는 음성 인식 결과에서 찾기 때문에 실제보다 적게 잡힐 수 있어요(추정치).</p>' : ''}
      </section>

      <section class="card stack">
        <h2 style="margin:0">개선 포인트</h2>
        ${feedback.length ? feedback.map((f) => `
          <div class="fb ${f.level}">
            <div class="title">${f.level === 'warn' ? '⚠️' : '👍'} ${esc(f.title)} <span class="badge">${esc(f.label)} ${f.score}</span></div>
            <div class="small">${esc(f.detail)}</div>
            <div class="tip">${esc(f.tip)}</div>
          </div>`).join('') : '<p class="muted">분석할 수 있는 항목이 부족해요. 얼굴과 어깨가 보이게 다시 녹화해보세요.</p>'}
      </section>
    </div>

    <section class="card replay" style="margin-top:16px">
      <div class="spread"><h2 style="margin:0">다시보기 · 문제 구간</h2><span class="small muted">구간을 누르면 그 장면으로 이동해요</span></div>
      <div class="grid grid-2" style="margin-top:12px">
        <div>
          ${replayUrl
            ? `<video id="replay" class="mirror" src="${esc(replayUrl)}" controls playsinline></video>`
            : `<div class="placeholder">${session.demo ? '샘플 데이터에는 영상이 없어요.<br/>직접 연습하면 내 영상으로 다시보기를 할 수 있어요.' : '영상은 기기 밖에 저장하지 않기 때문에<br/>페이지를 새로고침하면 다시보기가 사라져요.'}</div>`}
          <div class="timeline" id="timeline" aria-label="문제 구간 타임라인">
            ${session.markers.map((m, i) => {
              const left = Math.min(99, (m.t / duration) * 100);
              const width = m.end ? Math.max(1, ((m.end - m.t) / duration) * 100) : 1;
              return `<button class="mk ${m.type}" data-i="${i}" style="left:${left}%;width:${width}%" title="${fmtTime(m.t)} ${esc(m.label)}"></button>`;
            }).join('')}
            <div class="head" id="playhead" style="left:0"></div>
          </div>
          <div class="legend">${Object.entries(MARKER_TEXT).map(([k, v]) => `<span style="--c:var(--mk-${k})">${v} ${session.markers.filter((m) => m.type === k).length}</span>`).join('')}</div>
        </div>
        <div>
          <h3>구간 목록</h3>
          ${session.markers.length
            ? `<ul class="mk-list">${session.markers.map((m, i) => `<li><button data-i="${i}"><span class="time">${fmtTime(m.t)}</span><span class="mk ${m.type}" style="width:8px;border-radius:2px;position:static;flex:none"></span><span>${esc(m.label)}</span></button></li>`).join('')}</ul>`
            : '<p class="muted small">눈에 띄는 문제 구간이 없었어요. 훌륭해요!</p>'}
          <details style="margin-top:16px" ${session.transcript ? '' : 'hidden'}>
            <summary>인식된 발화 내용 보기</summary>
            <p class="transcript" style="margin-top:8px">${highlightFillers(session.transcript || '', t.fillerWords)}</p>
          </details>
        </div>
      </div>
    </section>

    ${session.demo ? '' : '<div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn sm secondary" id="del">이 기록 삭제</button></div>'}
  `;

  // 타임라인 → 영상 이동
  const video = el.querySelector('#replay');
  const seek = (i) => {
    const m = session.markers[i];
    if (!m) return;
    if (video) { video.currentTime = Math.max(0, m.t - 1); video.play().catch(() => {}); }
    el.querySelector('#playhead').style.left = `${(m.t / duration) * 100}%`;
  };
  el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); seek(+b.dataset.i); }));
  el.querySelector('#timeline').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tt = ((e.clientX - r.left) / r.width) * duration;
    if (video) video.currentTime = tt;
    el.querySelector('#playhead').style.left = `${(tt / duration) * 100}%`;
  });
  // MediaRecorder로 만든 webm은 길이 정보가 없어 탐색이 안 되는 경우가 있어 한 번 끝까지 이동시켜 길이를 계산
  video?.addEventListener('loadedmetadata', () => {
    if (video.duration === Infinity) {
      video.currentTime = 1e6;
      video.addEventListener('timeupdate', () => { video.currentTime = 0; }, { once: true });
    }
  });
  video?.addEventListener('timeupdate', () => {
    el.querySelector('#playhead').style.left = `${Math.min(100, (video.currentTime / duration) * 100)}%`;
  });
  el.querySelector('#del')?.addEventListener('click', () => {
    if (confirm('이 연습 기록을 삭제할까요?')) { deleteSession(session.id); location.hash = '#/history'; }
  });
}
