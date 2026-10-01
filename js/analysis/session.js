// 연습 1회분의 수집기 — 카메라 영상·음량·음성 인식을 동시에 기록해 원시 타임라인(raw)을 만듭니다.
import { loadModels } from './vision.js';
import { readFace, isLookingAtCamera } from './face.js';
import { readPose } from './pose.js';
import { createAudioMeter } from './audio.js';
import { createSpeech, speechSupported } from './speech.js';

const TICK_MS = 100; // 10fps — 얼굴/자세 모델을 번갈아 실행(각 5fps)

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function pickMime() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

export class Capture {
  /**
   * @param {HTMLVideoElement} video 미리보기 영상 요소
   * @param {MediaStream|null} stream 카메라·마이크 스트림 (디버그용 파일 입력이면 null)
   * @param {object} detect thresholds.json 의 detect 설정
   */
  constructor(video, stream, detect) {
    this.video = video;
    this.stream = stream;
    this.detect = detect;
    this.isFile = !stream;
    this.baseline = null;
    this.noiseFloor = 0.005;
    this.recording = false;
    this.live = { face: { present: false }, pose: { present: false }, level: 0, gazeOn: false };
    this.tick = 0;
    this.lastTs = 0;
  }

  async init() {
    this.models = await loadModels();
    this.audio = createAudioMeter(this.stream || this.video);
    await this.audio.resume();
  }

  now() {
    return this.isFile ? this.video.currentTime * 1000 : performance.now();
  }

  startLoop(onFrame) {
    this.onFrame = onFrame;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const t = performance.now();
      if (t - this.lastTs < TICK_MS || this.video.readyState < 2) return;
      this.lastTs = t;
      this.step(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  step(ts) {
    const { video, detect } = this;
    const aspect = (video.videoWidth || 4) / (video.videoHeight || 3);
    const level = this.audio.level();
    this.live.level = level;
    this.tick++;

    try {
      if (this.tick % 2 === 0) {
        const f = readFace(this.models.face.detectForVideo(video, ts));
        this.live.face = f;
        this.live.gazeOn = this.baseline ? isLookingAtCamera(f, this.baseline, detect) : f.present;
        this.calib?.face.push(f);
        if (this.recording) this.raw.face.push({ t: this.elapsed(), ...strip(f) });
      } else {
        const p = readPose(this.models.pose.detectForVideo(video, ts), aspect, detect);
        this.live.pose = p;
        if (this.recording) this.raw.pose.push({ t: this.elapsed(), ...strip(p) });
      }
    } catch (err) {
      console.warn('프레임 분석 오류', err);
    }

    this.calib?.audio.push(level);
    if (this.recording) this.raw.audio.push({ t: this.elapsed(), rms: level });
    this.onFrame?.(this.live);
  }

  elapsed() {
    return (this.now() - this.t0) / 1000;
  }

  // 카메라를 보며 조용히 있는 동안 기준 시선과 주변 소음을 측정
  calibrate(ms = 3000) {
    this.calib = { face: [], audio: [] };
    return new Promise((resolve) => {
      setTimeout(() => {
        const faces = this.calib.face.filter((f) => f.present);
        const pick = (k) => median(faces.map((f) => f[k]));
        this.baseline = faces.length
          ? { yaw: pick('yaw'), pitch: pick('pitch'), eyeH: pick('eyeH'), eyeV: pick('eyeV'), noseX: pick('noseX'), noseY: pick('noseY') }
          : { yaw: 0, pitch: 0, eyeH: 0, eyeV: 0, noseX: 0.5, noseY: 0.45 };
        this.noiseFloor = median(this.calib.audio) || 0.005;
        const ok = faces.length >= 3;
        this.calib = null;
        resolve(ok);
      }, ms);
    });
  }

  startRecording({ onInterim, onFinal } = {}) {
    this.t0 = this.now();
    this.raw = {
      version: 1,
      aspect: (this.video.videoWidth || 4) / (this.video.videoHeight || 3),
      baseline: this.baseline,
      noiseFloor: this.noiseFloor,
      face: [], pose: [], audio: [],
      speech: { supported: speechSupported() && !this.isFile, error: null, finals: [] },
    };

    if (this.stream && window.MediaRecorder) {
      this.chunks = [];
      try {
        const mimeType = pickMime();
        this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType, videoBitsPerSecond: 1_000_000 } : undefined);
        this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
        this.recorder.start(1000);
      } catch (err) {
        console.warn('녹화를 시작하지 못했습니다(다시보기 없이 진행).', err);
        this.recorder = null;
      }
    }

    if (this.raw.speech.supported) {
      this.speech = createSpeech({
        onInterim,
        onFinal: (text) => {
          if (!text) return;
          this.raw.speech.finals.push({ t: this.elapsed(), text });
          onFinal?.(text);
        },
        onError: (e) => { this.raw.speech.error = e; },
      });
      this.speech.start();
    }
    this.recording = true;
  }

  async stopRecording() {
    this.recording = false;
    this.raw.duration = this.elapsed();
    if (this.speech) {
      this.speech.stop();
      await new Promise((r) => setTimeout(r, 600)); // 마지막 인식 결과 대기
    }
    let replayUrl = null;
    if (this.recorder && this.recorder.state !== 'inactive') {
      await new Promise((resolve) => {
        this.recorder.onstop = resolve;
        this.recorder.stop();
      });
      const blob = new Blob(this.chunks, { type: this.recorder.mimeType || 'video/webm' });
      replayUrl = URL.createObjectURL(blob);
    } else if (this.isFile) {
      replayUrl = this.video.currentSrc || this.video.src;
    }
    return { raw: this.raw, replayUrl };
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.recording = false;
    this.speech?.stop();
    try { if (this.recorder?.state === 'recording') this.recorder.stop(); } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audio?.close();
  }
}

// 타임라인에는 숫자 지표만 남기고 그리기용 좌표는 버립니다.
function strip(frame) {
  const { box, pts, lw, rw, ...rest } = frame;
  if (lw) { rest.lwx = lw.x; rest.lwy = lw.y; rest.lwin = lw.in; }
  if (rw) { rest.rwx = rw.x; rest.rwy = rw.y; rest.rwin = rw.in; }
  return rest;
}
