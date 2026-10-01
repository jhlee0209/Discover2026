// 음성 인식 — 브라우저 내장 Web Speech API(ko-KR).
// 크롬은 음성을 구글 서버로 보내 텍스트로 바꿉니다. API 키는 필요 없습니다.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function speechSupported() {
  return !!Recognition;
}

export function createSpeech({ onInterim, onFinal, onError } = {}) {
  if (!Recognition) return null;
  const rec = new Recognition();
  rec.lang = 'ko-KR';
  rec.continuous = true;
  rec.interimResults = true;
  let running = false;
  let failed = null;

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) onFinal?.(r[0].transcript.trim());
      else interim += r[0].transcript;
    }
    onInterim?.(interim);
  };
  rec.onerror = (e) => {
    // no-speech / aborted 는 정상 흐름에서도 발생하므로 무시
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    failed = e.error;
    onError?.(e.error);
  };
  // 크롬은 침묵이 길면 인식을 스스로 종료하므로 녹화 중에는 다시 시작
  rec.onend = () => {
    if (running && !failed) {
      try { rec.start(); } catch { /* 이미 시작됨 */ }
    }
  };

  return {
    start() { running = true; failed = null; try { rec.start(); } catch {} },
    stop() { running = false; try { rec.stop(); } catch {} },
    get error() { return failed; },
  };
}
