// MediaPipe 비전 모델 로더. 라이브러리와 모델 파일은 저장소 vendor/ 에서 직접 불러옵니다(외부 호출 없음).
import { FilesetResolver, FaceLandmarker, PoseLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';

let filesetPromise = null;
let modelsPromise = null;

function fileset() {
  filesetPromise ??= FilesetResolver.forVisionTasks(new URL('../../vendor/mediapipe/wasm', import.meta.url).href);
  return filesetPromise;
}

async function create(Task, options) {
  const fs = await fileset();
  try {
    return await Task.createFromOptions(fs, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } });
  } catch (err) {
    console.warn('GPU 초기화 실패, CPU로 전환합니다.', err);
    return Task.createFromOptions(fs, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } });
  }
}

export function loadModels() {
  modelsPromise ??= (async () => {
    const face = await create(FaceLandmarker, {
      baseOptions: { modelAssetPath: new URL('../../vendor/models/face_landmarker.task', import.meta.url).href },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
    const pose = await create(PoseLandmarker, {
      baseOptions: { modelAssetPath: new URL('../../vendor/models/pose_landmarker_lite.task', import.meta.url).href },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
    return { face, pose };
  })().catch((err) => { modelsPromise = null; throw err; });
  return modelsPromise;
}
