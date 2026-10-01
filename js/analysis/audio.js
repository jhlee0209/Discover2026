// 마이크 음량(RMS) 측정 — Web Audio API, 기기 안에서만 처리됩니다.
export function createAudioMeter(source) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const node = source instanceof MediaStream
    ? ctx.createMediaStreamSource(source)
    : ctx.createMediaElementSource(source); // 디버그: 영상 파일 입력
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  node.connect(analyser);
  if (!(source instanceof MediaStream)) analyser.connect(ctx.destination); // 파일 재생 소리 유지
  const buf = new Float32Array(analyser.fftSize);

  return {
    level() {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    },
    resume() { return ctx.resume(); },
    close() { ctx.close().catch(() => {}); },
  };
}
