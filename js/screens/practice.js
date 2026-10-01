// 화면 2 · 연습 — 질문 선택 → 카메라 점검 → 3초 보정 → 녹화 → 분석
import { Capture } from '../analysis/session.js';
import { computeMetrics } from '../analysis/metrics.js';
import { speechSupported } from '../analysis/speech.js';
import { findQuestion } from '../config.js';
import { listSessions, saveSession, setReplay } from '../storage.js';
import { esc, fmtTime } from '../ui.js';

function hashId(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}

export function render(el, { arg, params, cfg }) {
  const debugVideo = params.debug === 'video';
  const counts = listSessions().reduce((m, s) => ((m[s.questionId] = (m[s.questionId] || 0) + 1), m), {});
  const free = cfg.questions.free;
  let selected = arg && arg.startsWith('free-')
    ? (() => { const prev = listSessions().find((s) => s.questionId === arg); return prev ? { id: arg, text: prev.questionText, timeLimit: free.timeLimit, category: free.label, tip: free.tip } : null; })()
    : arg ? findQuestion(cfg.questions, arg) : null;
  let capture = null;
  const timers = new Set();
  let disposed = false;

  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const cleanup = () => {
    disposed = true;
    timers.forEach(clearTimeout);
    timers.forEach(clearInterval);
    capture?.destroy();
    capture = null;
  };

  // ── 1단계: 질문 선택 ──
  function showSelect() {
    el.innerHTML = `
      <h1 style="font-size:1.5rem">어떤 질문으로 연습할까요?</h1>
      <p class="muted">같은 질문을 반복해서 연습하면 성장 기록에서 회차별 변화를 비교할 수 있어요.</p>
      ${cfg.questions.categories.map((cat) => `
        <div class="q-cat">
          <h3>${esc(cat.label)}</h3>
          <div class="q-list">
            ${cat.questions.map((q) => `
              <button class="q-item ${selected?.id === q.id ? 'selected' : ''}" data-q="${esc(q.id)}">
                <div><div>${esc(q.text)}</div><div class="meta">⏱ ${fmtTime(q.timeLimit)} · ${esc(q.tip)}</div></div>
                ${counts[q.id] ? `<span class="badge accent count">${counts[q.id]}회</span>` : ''}
              </button>`).join('')}
          </div>
        </div>`).join('')}
      <div class="q-cat">
        <h3>${esc(free.label)} <span class="small muted">최대 ${fmtTime(free.timeLimit)}</span></h3>
        <input class="input" id="freeTitle" maxlength="60" placeholder="발표 제목을 입력하세요 (예: 신사업 제안 PT)" value="${selected?.id?.startsWith('free-') ? esc(selected.text) : ''}" />
        <p class="small muted" style="margin-top:6px">${esc(free.tip)}</p>
      </div>
      <div class="row" style="justify-content:flex-end;position:sticky;bottom:12px">
        <button class="btn lg" id="next" ${selected ? '' : 'disabled'}>다음: 카메라 맞추기 →</button>
      </div>
    `;
    const next = el.querySelector('#next');
    const freeInput = el.querySelector('#freeTitle');
    el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      selected = findQuestion(cfg.questions, b.dataset.q);
      freeInput.value = '';
      el.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('selected', x === b));
      next.disabled = false;
    }));
    freeInput.addEventListener('input', () => {
      const title = freeInput.value.trim();
      el.querySelectorAll('[data-q]').forEach((x) => x.classList.remove('selected'));
      selected = title ? { id: `free-${hashId(title)}`, text: title, timeLimit: free.timeLimit, category: free.label, tip: free.tip } : null;
      next.disabled = !selected;
    });
    next.addEventListener('click', showSetup);
  }

  // ── 2단계: 카메라·마이크 점검 ──
  async function showSetup() {
    const q = selected;
    el.innerHTML = `
      <div class="practice-layout">
        <div class="stack">
          <div class="stage" id="stage">
            <video id="video" class="mirror" playsinline muted></video>
            <canvas id="overlay" class="mirror"></canvas>
            <div class="hud" id="hud"></div>
            <div class="caption" id="caption"></div>
            <div class="overlay" id="cover"><div><div style="font-size:2rem">📷</div><p id="coverText" style="margin:8px 0 0">카메라와 마이크 권한을 요청하고 있어요…</p></div></div>
          </div>
          <div class="progress hidden" id="progress"><i></i></div>
        </div>
        <div class="stack">
          <div class="question-box">Q. ${esc(q.text)}</div>
          <div class="card stack" id="panel">
            <div class="spread"><h3 style="margin:0">시작 전 점검</h3><span class="badge" id="limit">⏱ ${fmtTime(q.timeLimit)}</span></div>
            <ul class="checklist" id="checks">
              <li data-k="cam"><span class="dot">1</span>카메라 연결</li>
              <li data-k="model"><span class="dot">2</span>AI 분석 모델 준비 <span class="small muted" id="modelNote"></span></li>
              <li data-k="face"><span class="dot">3</span>얼굴이 화면 가운데에 보여요</li>
              <li data-k="pose"><span class="dot">4</span>양쪽 어깨가 보여요 <span class="small muted">(자세·제스처)</span></li>
              <li data-k="mic"><span class="dot">5</span>마이크 소리 <span class="meter" style="flex:1"><i id="mic"></i></span></li>
              <li data-k="speech"><span class="dot">6</span>음성 인식 <span class="small muted" id="speechNote"></span></li>
            </ul>
            <p class="small muted" style="margin:0">💡 ${esc(q.tip || '')}</p>
            <div id="setupMsg"></div>
            <div class="row">
              <button class="btn lg" id="start" disabled style="flex:1">녹화 시작</button>
              <button class="btn secondary" id="back">질문 바꾸기</button>
            </div>
          </div>
        </div>
      </div>`;

    const $ = (s) => el.querySelector(s);
    const video = $('#video');
    const setCheck = (k, state, note) => {
      const li = $(`#checks [data-k="${k}"]`);
      li.classList.remove('ok', 'fail', 'warn');
      if (state) li.classList.add(state);
      li.querySelector('.dot').textContent = state === 'ok' ? '✓' : state === 'fail' ? '✕' : state === 'warn' ? '!' : li.querySelector('.dot').textContent;
      if (note != null && k === 'model') $('#modelNote').textContent = note;
      if (note != null && k === 'speech') $('#speechNote').textContent = note;
    };
    $('#back').addEventListener('click', () => { cleanup(); disposed = false; showSelect(); });

    if (speechSupported() && !debugVideo) setCheck('speech', 'ok', '지원됨');
    else setCheck('speech', 'warn', debugVideo ? '파일 입력은 음성 인식 불가' : '미지원 — 말 속도·추임새 제외 (크롬 권장)');

    // 입력 준비 (카메라 또는 디버그용 영상 파일)
    let stream = null;
    try {
      if (debugVideo) {
        $('#coverText').innerHTML = '디버그: 분석할 영상 파일을 선택하세요<br/><input type="file" accept="video/*" id="file" style="margin-top:8px" />';
        const file = await new Promise((resolve) => $('#file').addEventListener('change', (e) => resolve(e.target.files[0])));
        video.src = URL.createObjectURL(file);
        video.muted = false;
        video.classList.remove('mirror'); $('#overlay').classList.remove('mirror');
        await new Promise((r) => (video.onloadeddata = r));
      } else {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('insecure'), { name: 'InsecureError' });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (disposed) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
      }
      setCheck('cam', 'ok');
    } catch (err) {
      setCheck('cam', 'fail');
      const msg = {
        NotAllowedError: '카메라·마이크 권한이 거부됐어요. 주소창 왼쪽 자물쇠 아이콘에서 권한을 "허용"으로 바꾼 뒤 새로고침해주세요.',
        NotFoundError: '카메라 또는 마이크를 찾을 수 없어요. 장치가 연결되어 있는지 확인해주세요.',
        NotReadableError: '다른 프로그램(화상회의 등)이 카메라를 사용 중이에요. 종료 후 다시 시도해주세요.',
        InsecureError: '이 주소에서는 카메라를 쓸 수 없어요. https 주소로 접속해주세요.',
      }[err.name] || `카메라를 시작하지 못했어요 (${err.name || err.message}).`;
      $('#coverText').textContent = msg;
      $('#setupMsg').innerHTML = `<div class="banner bad">${esc(msg)}</div><p class="small muted" style="margin-top:8px">카메라 없이 둘러보려면 <a href="#/result/demo-5">샘플 결과</a>를 확인해보세요.</p>`;
      return;
    }

    // AI 모델 로드
    $('#coverText').textContent = 'AI 분석 모델을 불러오는 중이에요… (처음 한 번 약 30MB)';
    setCheck('model', null, '불러오는 중…');
    capture = new Capture(video, stream, cfg.thresholds.detect);
    try {
      await capture.init();
      if (disposed) return;
      setCheck('model', 'ok', '');
    } catch (err) {
      console.error(err);
      setCheck('model', 'fail', '');
      $('#coverText').textContent = 'AI 모델을 불러오지 못했어요. 새로고침 후 다시 시도해주세요.';
      $('#setupMsg').innerHTML = `<div class="banner bad">AI 모델 로드 실패: ${esc(err.message || err)}</div>`;
      return;
    }
    $('#cover').classList.add('hidden');
    if (debugVideo) video.play();

    // 실시간 점검
    const canvas = $('#overlay');
    const ctx = canvas.getContext('2d');
    let faceSeen = 0, poseSeen = 0;
    const hud = $('#hud');
    capture.startLoop((live) => {
      faceSeen = live.face.present ? Math.min(faceSeen + 1, 10) : Math.max(faceSeen - 1, 0);
      poseSeen = live.pose.present ? Math.min(poseSeen + 1, 10) : Math.max(poseSeen - 1, 0);
      if (!capture.recording) {
        setCheck('face', faceSeen > 2 ? 'ok' : 'fail');
        setCheck('pose', poseSeen > 2 ? 'ok' : 'warn');
        $('#start').disabled = faceSeen <= 2;
      }
      $('#mic').style.width = `${Math.min(100, live.level * 600)}%`;
      if (live.level > 0.02) setCheck('mic', 'ok');
      hud.innerHTML = `
        <span class="badge ${live.face.present ? 'on' : 'off'}">얼굴</span>
        <span class="badge ${live.pose.present ? 'on' : 'off'}">어깨</span>
        ${capture.baseline ? `<span class="badge ${live.gazeOn ? 'on' : 'off'}">시선 ${live.gazeOn ? '👀' : '↗'}</span>` : ''}
        ${live.pose.present ? `<span class="badge ${live.pose.hands ? 'on' : ''}">손 ${live.pose.hands}</span>` : ''}`;
      drawOverlay(ctx, canvas, video, live);
    });

    $('#start').addEventListener('click', () => startCalibration(q));
  }

  function drawOverlay(ctx, canvas, video, live) {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w) return;
    if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 3;
    if (live.face.present && live.face.box) {
      const b = live.face.box;
      ctx.strokeStyle = live.gazeOn ? 'rgba(24,160,88,.9)' : 'rgba(255,255,255,.7)';
      ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
    }
    if (live.pose.present && live.pose.pts) {
      const { ls, rs, lw, rw } = live.pose.pts;
      ctx.strokeStyle = 'rgba(47,91,234,.9)';
      ctx.beginPath(); ctx.moveTo(ls.x * w, ls.y * h); ctx.lineTo(rs.x * w, rs.y * h); ctx.stroke();
      ctx.fillStyle = 'rgba(224,138,0,.95)';
      [[lw, live.pose.lw.in], [rw, live.pose.rw.in]].forEach(([p, ok]) => {
        if (!ok) return;
        ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 9, 0, Math.PI * 2); ctx.fill();
      });
    }
  }

  // ── 3단계: 3초 보정 ──
  async function startCalibration(q) {
    const $ = (s) => el.querySelector(s);
    $('#start').disabled = true;
    $('#back').disabled = true;
    const cover = $('#cover');
    cover.classList.remove('hidden');
    let n = 3;
    cover.innerHTML = `<div><div class="count" id="cnt">${n}</div><p style="margin:8px 0 0">카메라 렌즈를 바라보고 <b>조용히</b> 있어주세요<br/><span class="small">기준 시선과 주변 소음을 측정해요</span></p></div>`;
    const iv = setInterval(() => { n -= 1; const c = $('#cnt'); if (c && n > 0) c.textContent = n; }, 1000);
    timers.add(iv);
    const ok = await capture.calibrate(3000);
    clearInterval(iv); timers.delete(iv);
    if (disposed) return;
    if (!ok) {
      cover.innerHTML = `<div><p>얼굴을 충분히 인식하지 못했어요.<br/>밝은 곳에서 얼굴이 화면 가운데 오도록 맞춰주세요.</p><button class="btn" id="retry">다시 보정</button></div>`;
      $('#retry').addEventListener('click', () => startCalibration(q));
      return;
    }
    cover.innerHTML = '<div><div class="count">시작!</div></div>';
    later(() => { cover.classList.add('hidden'); startRecording(q); }, 600);
  }

  // ── 4단계: 녹화 ──
  function startRecording(q) {
    const $ = (s) => el.querySelector(s);
    const panel = $('#panel');
    panel.innerHTML = `
      <div class="spread"><span class="small muted">남은 시간</span><span class="badge bad">● 녹화 중</span></div>
      <div class="timer" id="timer">${fmtTime(q.timeLimit)}</div>
      <p class="small muted" style="margin:0">답변이 끝나면 정지 버튼을 누르세요. 시간이 다 되면 자동으로 끝나요.</p>
      <div class="banner small" id="liveTip">카메라 렌즈를 보며 말해보세요.</div>
      <button class="btn lg danger" id="stop">■ 정지하고 분석하기</button>`;
    const stage = $('#stage');
    const rec = document.createElement('div');
    rec.className = 'rec';
    rec.id = 'rec';
    rec.textContent = '0:00';
    stage.appendChild(rec);
    const progress = $('#progress');
    progress.classList.remove('hidden');

    capture.startRecording({
      onInterim: (text) => { const c = $('#caption'); if (c) c.textContent = text.slice(-60); },
      onFinal: (text) => { const c = $('#caption'); if (c) c.textContent = text.slice(-60); },
    });

    const started = Date.now();
    let awayTicks = 0;
    const iv = setInterval(() => {
      const sec = (Date.now() - started) / 1000;
      $('#timer').textContent = fmtTime(q.timeLimit - sec);
      $('#rec').textContent = fmtTime(sec);
      progress.querySelector('i').style.width = `${Math.min(100, (sec / q.timeLimit) * 100)}%`;
      awayTicks = capture.live.gazeOn ? 0 : awayTicks + 1;
      $('#liveTip').textContent = awayTicks >= 4 ? '👀 시선이 카메라를 벗어났어요' : capture.live.level < 0.01 && sec > 3 ? '🎤 목소리가 잘 들리지 않아요' : '좋아요, 계속 이어가세요.';
      if (sec >= q.timeLimit) finish();
    }, 500);
    timers.add(iv);

    let finishing = false;
    async function finish() {
      if (finishing) return;
      finishing = true;
      clearInterval(iv); timers.delete(iv);
      const cover = $('#cover');
      cover.classList.remove('hidden');
      cover.innerHTML = '<div><div style="font-size:2rem">🧠</div><p>발표를 분석하고 있어요…</p></div>';
      $('#rec')?.remove();
      const { raw, replayUrl } = await capture.stopRecording();
      if (disposed) return;
      const minSec = cfg.thresholds.detect.minDurationSec;
      if (raw.duration < minSec) {
        cover.innerHTML = `<div><p>녹화가 너무 짧아요 (${Math.round(raw.duration)}초).<br/>최소 ${minSec}초 이상 말해야 분석할 수 있어요.</p><button class="btn" id="again">다시 하기</button></div>`;
        $('#again').addEventListener('click', () => { cleanup(); disposed = false; showSetup(); });
        return;
      }
      const { metrics, markers, transcript } = computeMetrics(raw, cfg.thresholds);
      const session = {
        id: `s-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        questionId: q.id,
        questionText: q.text,
        category: q.category,
        durationSec: Math.round(raw.duration),
        metrics, markers, transcript,
      };
      saveSession(session);
      if (replayUrl) setReplay(session.id, replayUrl);
      capture.destroy();
      capture = null;
      location.hash = `#/result/${session.id}`;
    }
    $('#stop').addEventListener('click', finish);
  }

  if (selected) showSetup();
  else showSelect();
  return cleanup;
}
