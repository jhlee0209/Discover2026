// 얼굴 분석 — 시선(머리 방향 + 눈동자)과 미소를 한 프레임 단위로 읽습니다.
const DEG = 180 / Math.PI;

function blend(categories, name) {
  const c = categories.find((c) => c.categoryName === name);
  return c ? c.score : 0;
}

export function readFace(result) {
  const lm = result.faceLandmarks?.[0];
  if (!lm) return { present: false };

  // 머리 회전(yaw/pitch) — 변환 행렬에서 추출 (보정값과의 차이만 사용하므로 부호 규약은 상관없음)
  let yaw = 0, pitch = 0;
  const m = result.facialTransformationMatrixes?.[0]?.data;
  if (m) {
    const r = (i, j) => m[j * 4 + i];
    yaw = Math.atan2(r(0, 2), r(2, 2)) * DEG;
    pitch = Math.atan2(-r(1, 2), Math.hypot(r(0, 2), r(2, 2))) * DEG;
  }

  // 방향 판단용: 코끝(1)의 양 볼(234, 454) 사이 가로 위치, 눈(33, 263)~턱(152) 사이 세로 위치
  const nose = lm[1], a = lm[234], b = lm[454], eyeL = lm[33], eyeR = lm[263], chin = lm[152];
  const minX = Math.min(a.x, b.x), width = Math.abs(b.x - a.x) || 1e-6;
  const eyeY = (eyeL.y + eyeR.y) / 2;
  const noseX = (nose.x - minX) / width;
  const noseY = (nose.y - eyeY) / ((chin.y - eyeY) || 1e-6);

  const bs = result.faceBlendshapes?.[0]?.categories || [];
  const eyeH = ((blend(bs, 'eyeLookOutLeft') - blend(bs, 'eyeLookInLeft')) - (blend(bs, 'eyeLookOutRight') - blend(bs, 'eyeLookInRight'))) / 2;
  const eyeV = (blend(bs, 'eyeLookUpLeft') + blend(bs, 'eyeLookUpRight') - blend(bs, 'eyeLookDownLeft') - blend(bs, 'eyeLookDownRight')) / 2;
  const smile = (blend(bs, 'mouthSmileLeft') + blend(bs, 'mouthSmileRight')) / 2;

  return {
    present: true, yaw, pitch, noseX, noseY, eyeH, eyeV, smile,
    box: { x: minX, y: Math.min(...lm.map((p) => p.y)), w: width, h: chin.y - Math.min(...lm.map((p) => p.y)) },
  };
}

// 보정값(카메라를 보고 있을 때) 대비 카메라를 보고 있는지 판정
export function isLookingAtCamera(f, base, detect) {
  if (!f.present) return false;
  const dyaw = Math.abs(f.yaw - base.yaw);
  const dpitch = Math.abs(f.pitch - base.pitch);
  const deye = Math.hypot(f.eyeH - base.eyeH, f.eyeV - base.eyeV);
  return dyaw < detect.gazeYawDeg && dpitch < detect.gazePitchDeg && deye < detect.gazeEyeDev;
}

// 시선이 벗어났을 때 어느 쪽인지 (사용자 기준)
export function awayDirection(f, base) {
  const dx = f.noseX - base.noseX; // 카메라 영상에서 코가 왼쪽(작은 x)으로 가면 사용자는 자기 오른쪽을 봄
  const dy = f.noseY - base.noseY; // 코가 턱 쪽으로 내려가면 아래를 봄
  if (Math.abs(dy) * 1.5 > Math.abs(dx)) return dy > 0 ? 'down' : 'up';
  return dx < 0 ? 'right' : 'left';
}
