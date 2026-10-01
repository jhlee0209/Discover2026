// 화면 1 · 홈 — 서비스 소개와 시작 버튼
import { listSessions } from '../storage.js';
import { speechSupported } from '../analysis/speech.js';
import { scoreSession } from '../analysis/scoring.js';

export function render(el, { cfg }) {
  const mine = listSessions();
  const latest = mine[mine.length - 1];
  const supportNote = speechSupported()
    ? ''
    : `<div class="banner warn">이 브라우저는 음성 인식을 지원하지 않아 <b>말 속도·추임새</b>는 측정되지 않아요. 크롬(PC)에서 열면 모든 항목을 분석할 수 있어요.</div>`;

  // 소개 카드 숫자는 샘플 데이터(첫 회차 → 마지막 회차)에서 계산
  const demoFirst = scoreSession(cfg.demo[0].metrics, cfg.thresholds);
  const demoLast = scoreSession(cfg.demo[cfg.demo.length - 1].metrics, cfg.thresholds);
  const heroBars = ['gaze', 'speed', 'filler', 'gesture'].map((k) => [cfg.thresholds.items[k].label, demoLast.scores[k]]);

  el.innerHTML = `
    <section class="hero">
      <div>
        <span class="badge accent">취준생 · 사회초년생을 위한 면접·PT 연습</span>
        <h1 style="margin-top:12px">혼자 하는 발표 연습,<br />이제 <span style="color:var(--accent)">점수</span>로 확인하세요</h1>
        <p class="lead">카메라 앞에서 면접 질문에 답하면 AI가 <b>말 속도 · 침묵 · 추임새 · 시선 · 표정 · 자세 · 제스처</b>를 동시에 분석해 무엇을 고쳐야 하는지 알려드려요.</p>
        <div class="row" style="margin-top:20px">
          <a class="btn lg" href="#/practice">🎥 연습 시작하기</a>
          <a class="btn lg secondary" href="#/result/demo-5">샘플 결과 보기</a>
        </div>
        <p class="small muted" style="margin-top:12px">카메라가 없어도 <a href="#/history?demo=1">샘플 성장 기록</a>으로 기능을 둘러볼 수 있어요.</p>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="small" style="opacity:.85">샘플 · ${cfg.demo.length}회차 연습 · 1분 자기소개</div>
        <div class="row" style="align-items:flex-end;gap:12px;margin-top:6px">
          <span class="big">${demoLast.overall}</span><span style="padding-bottom:6px">점 · 첫 회차보다 <b>+${demoLast.overall - demoFirst.overall}</b></span>
        </div>
        <div class="bars">
          ${heroBars.map(([k, v]) => `
            <div><div class="spread small"><span>${k}</span><span>${v}</span></div><div class="bar"><i style="width:${v}%"></i></div></div>`).join('')}
        </div>
      </div>
    </section>

    ${supportNote}
    ${latest ? `<div class="banner" style="margin-top:12px">최근 연습: <b>${latest.questionText}</b> — <a href="#/result/${latest.id}">결과 다시 보기</a> · <a href="#/history">성장 기록</a></div>` : ''}

    <section style="margin-top:32px">
      <h2>무엇을 해주나요?</h2>
      <div class="grid grid-3">
        <div class="card feature"><div class="icon">📊</div><h3>AI 발표 분석 · 점수화</h3><p class="muted small">음성과 영상을 동시에 분석해 7개 항목 점수와 종합 점수를 보여줘요.</p></div>
        <div class="card feature"><div class="icon">🎯</div><h3>맞춤형 개선 피드백</h3><p class="muted small">"말이 너무 빨라요", "시선이 아래쪽에 머물러요"처럼 구체적인 개선점과 연습 팁을 알려줘요. 영상의 문제 구간으로 바로 이동할 수 있어요.</p></div>
        <div class="card feature"><div class="icon">📈</div><h3>반복 연습 · 성장 추적</h3><p class="muted small">같은 질문을 반복하면 회차별 점수 변화를 그래프로 보여줘요.</p></div>
      </div>
    </section>

    <section style="margin-top:32px">
      <h2>이렇게 사용해요</h2>
      <ol class="steps">
        <li><b>질문 고르기</b><p class="small muted">면접 질문 ${cfg.questions.categories.reduce((n, c) => n + c.questions.length, 0)}개 또는 자유 발표</p></li>
        <li><b>카메라 맞추기</b><p class="small muted">얼굴과 어깨가 보이게 앉고 3초간 카메라 보기</p></li>
        <li><b>답변 녹화</b><p class="small muted">질문별 60~90초, 자유 발표 최대 3분</p></li>
        <li><b>결과 · 반복</b><p class="small muted">피드백을 보고 같은 질문으로 다시 도전</p></li>
      </ol>
    </section>

    <section class="card" style="margin-top:32px">
      <h3>🔒 내 영상은 어디에도 올라가지 않아요</h3>
      <p class="small muted" style="margin:0">얼굴·자세 분석은 브라우저 안의 AI 모델(MediaPipe)이 처리하고, 영상은 저장하지 않아요. 기록에는 점수만 이 기기에 남아요. 음성 인식(말 속도·추임새)은 브라우저 내장 기능을 쓰며, 크롬에서는 음성이 구글 음성 인식 서버로 전송돼요.</p>
    </section>
  `;
}
