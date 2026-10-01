// 원시 타임라인(raw) → 항목별 측정값(metrics)과 다시보기용 문제 구간(markers)
import { isLookingAtCamera, awayDirection } from './face.js';

const SIDE_TEXT = { left: '왼쪽', right: '오른쪽', up: '위쪽', down: '아래쪽(메모·화면)' };

function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function std(a) { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); }
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// 조건이 연속으로 minSec 이상 유지된 구간 찾기
function runs(frames, test, minSec) {
  const out = [];
  let start = null, last = null;
  for (const f of frames) {
    if (test(f)) { if (start == null) start = f.t; last = f.t; }
    else if (start != null) { if (last - start >= minSec) out.push({ start, end: last }); start = null; }
  }
  if (start != null && last - start >= minSec) out.push({ start, end: last });
  return out;
}

export function countSyllables(text) {
  return (text.match(/[가-힣]/g) || []).length + (text.match(/[A-Za-z]+|\d/g) || []).length;
}

export function findFillers(text, fillerWords) {
  const set = new Set(fillerWords);
  return text
    .split(/\s+/)
    .map((w) => w.replace(/[.,!?~…·"'()]/g, ''))
    .filter((w) => w && set.has(w));
}

export function computeMetrics(raw, cfg) {
  const d = cfg.detect;
  const duration = raw.duration || 0;
  const minutes = Math.max(duration / 60, 1 / 60);
  const markers = [];

  // ── 음성: 침묵 (음량 기반) ──
  const thr = Math.max(d.silenceRmsMin, raw.noiseFloor * d.silenceNoiseMultiplier);
  const voiced = raw.audio.filter((a) => a.rms >= thr);
  const first = voiced[0]?.t ?? 0;
  const lastVoice = voiced[voiced.length - 1]?.t ?? duration;
  const inSpeech = raw.audio.filter((a) => a.t >= first && a.t <= lastVoice);
  const silences = runs(inSpeech, (a) => a.rms < thr, d.silenceSec);
  silences.forEach((s) => markers.push({ t: s.start, end: s.end, type: 'silence', label: `${round(s.end - s.start, 1)}초 침묵` }));
  const speakingSpan = Math.max(lastVoice - first, 1);

  // ── 음성: 말 속도·추임새 (음성 인식 기반) ──
  const finals = raw.speech?.finals || [];
  const transcript = finals.map((f) => f.text).join(' ');
  const speechOk = raw.speech?.supported && !raw.speech?.error && finals.length > 0;
  const syllables = countSyllables(transcript);
  const speed = speechOk && syllables >= 10 ? (syllables / speakingSpan) * 60 : null;

  const fillerCounts = {};
  let fillerTotal = 0;
  finals.forEach((f) => {
    const found = findFillers(f.text, cfg.fillerWords);
    found.forEach((w) => { fillerCounts[w] = (fillerCounts[w] || 0) + 1; });
    fillerTotal += found.length;
    if (found.length) markers.push({ t: Math.max(0, f.t - 2), type: 'filler', label: `추임새 '${found.join(', ')}'` });
  });

  // ── 시선·표정 (얼굴) ──
  const faces = raw.face || [];
  const present = faces.filter((f) => f.present);
  let gaze = null, expression = null, gazeSide = null;
  if (present.length >= 5 && raw.baseline) {
    const flagged = faces.map((f) => ({ ...f, on: isLookingAtCamera(f, raw.baseline, d) }));
    gaze = (flagged.filter((f) => f.on).length / faces.length) * 100;
    runs(flagged, (f) => !f.on, d.gazeAwayMarkerSec).forEach((r) =>
      markers.push({ t: r.start, end: r.end, type: 'gaze', label: `${round(r.end - r.start, 1)}초 시선 이탈` }));

    const away = flagged.filter((f) => f.present && !f.on);
    if (away.length >= 5) {
      const counts = {};
      away.forEach((f) => { const k = awayDirection(f, raw.baseline); counts[k] = (counts[k] || 0) + 1; });
      const [side, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (n / away.length >= 0.6) gazeSide = side;
    }
    expression = (present.filter((f) => f.smile >= d.smileThreshold).length / present.length) * 100;
  }

  // ── 자세·제스처 (상체) ──
  const poses = (raw.pose || []).filter((p) => p.present);
  let shoulderTilt = null, sway = null, gesture = null, gestureActivity = null;
  if (poses.length >= 5) {
    shoulderTilt = mean(poses.map((p) => p.tilt));
    const sw = mean(poses.map((p) => p.sw)) || 1;
    sway = Math.hypot(std(poses.map((p) => p.cx)), std(poses.map((p) => p.cy))) / sw;
    gesture = (poses.filter((p) => p.hands > 0).length / poses.length) * 100;

    let move = 0, span = 0;
    for (let i = 1; i < poses.length; i++) {
      const a = poses[i - 1], b = poses[i];
      const dt = b.t - a.t;
      if (dt <= 0 || dt > 1) continue;
      if (a.lwin && b.lwin) move += Math.hypot(b.lwx - a.lwx, b.lwy - a.lwy) / sw;
      if (a.rwin && b.rwin) move += Math.hypot(b.rwx - a.rwx, b.rwy - a.rwy) / sw;
      span += dt;
    }
    gestureActivity = span ? move / span : 0;

    runs(raw.pose.filter((p) => p.present), (p) => p.tilt >= d.tiltMarkerDeg, 2).forEach((r) =>
      markers.push({ t: r.start, end: r.end, type: 'posture', label: '어깨 기울어짐' }));
  }

  markers.sort((a, b) => a.t - b.t);

  return {
    metrics: {
      speed: round(speed),
      silence: round(silences.length / minutes, 1),
      filler: speechOk ? round(fillerTotal / minutes, 1) : null,
      gaze: round(gaze),
      expression: round(expression),
      shoulderTilt: round(shoulderTilt, 1),
      sway: round(sway, 3),
      gesture: round(gesture),
      gestureActivity: round(gestureActivity, 2),
      fillerCounts,
      gazeSide,
      gazeSideText: gazeSide ? SIDE_TEXT[gazeSide] : null,
      syllables,
      speechError: raw.speech?.error || (raw.speech?.supported ? null : 'unsupported'),
    },
    markers,
    transcript,
  };
}
