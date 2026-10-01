# 포함된 오픈소스

| 파일 | 출처 | 라이선스 |
|---|---|---|
| `mediapipe/vision_bundle.mjs`, `mediapipe/wasm/*` | npm `@mediapipe/tasks-vision@1.0.1` (Google) | Apache-2.0 |
| `models/face_landmarker.task` | storage.googleapis.com/mediapipe-models (Google 공식) | Apache-2.0 |
| `models/pose_landmarker_lite.task` | storage.googleapis.com/mediapipe-models (Google 공식) | Apache-2.0 |
| `chart.umd.min.js` | npm `chart.js@4.5.1` | MIT (`LICENSE-chartjs.md`) |

실행 중 외부 서버에서 내려받지 않도록 모두 저장소에 포함했습니다.

## 참고: MediaPipe 사용 통계 전송 차단
`@mediapipe/tasks-vision` 1.0.x는 약 60초마다 `odml.pa.googleapis.com/v1/log`로 사용 통계(성능 수치)를 보냅니다.
"외부 호출 없음" 원칙을 지키기 위해 `index.html`의 Content-Security-Policy(`connect-src 'self'`)로 차단했습니다.
콘솔에 보이는 "violates the following Content Security Policy" 오류는 이 차단 때문이며 정상입니다.
