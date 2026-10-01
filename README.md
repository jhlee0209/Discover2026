# AI 발표 코치 (B-4조)

혼자 면접·PT를 연습하는 취준생·사회초년생을 위해, 카메라 앞 답변을 분석해
**말 속도 · 침묵 · 추임새 · 시선 · 표정 · 자세 · 제스처**를 점수로 보여주고 회차별 성장을 추적하는 웹앱입니다.

- 바닐라 HTML/JS, 빌드 없음, 정적 배포(Vercel)
- 로그인·DB·외부 API 없음 — 기록은 브라우저 localStorage, 영상은 저장하지 않음
- 얼굴·자세 분석: MediaPipe(브라우저 안에서 실행, 모델 파일은 `vendor/`에 포함)
- 음성 인식: 브라우저 내장 Web Speech API (크롬 권장)

## 실행 방법 (로컬)

```bash
python3 -m http.server 8000
```
브라우저에서 http://localhost:8000 접속. (파일을 더블클릭해 `file://`로 열면 동작하지 않아요.)

## 심사위원 실행 가이드 (재현 경로 3단계)

1. 첫 화면에서 **샘플 결과 보기** → 5회차 연습의 점수·피드백·문제 구간을 확인 (카메라 불필요)
2. **연습 시작하기** → "1분 동안 자기소개" 선택 → 카메라·마이크 허용 → 3초 보정 후 답변 → 정지
3. 결과 화면에서 피드백과 다시보기 구간을 확인하고 **같은 질문 다시 연습** → **성장 기록**에서 회차 비교

제약: 말 속도·추임새는 크롬/엣지(PC)에서만 측정돼요. 추임새는 음성 인식 결과 기반이라 추정치예요. 발음 평가는 미구현.

## 폴더 구조

```
index.html                 # 앱 진입점 (해시 라우팅: #/, #/practice, #/result/:id, #/history)
css/tokens.css             # 색·폰트 디자인 토큰 ← 디자인 바꿀 때 여기만
css/app.css                # 화면 스타일
js/app.js                  # 라우터
js/screens/                # 화면 4개 (home, practice, result, history)
js/analysis/               # 분석 엔진
  session.js               #   녹화 중 카메라·음량·음성 동시 수집
  face.js / pose.js        #   얼굴(시선·미소) / 상체(자세·손) 프레임 분석
  audio.js / speech.js     #   음량(침묵) / 음성 인식(말 속도·추임새)
  metrics.js               #   타임라인 → 측정값 + 문제 구간
  scoring.js               #   측정값 → 점수
  feedback.js              #   점수 → 맞춤 피드백
js/storage.js              # 기록 저장(localStorage)
data/questions.json        # 연습 질문 ← 콘텐츠팀
data/thresholds.json       # 점수 기준값·가중치·추임새 목록 ← 콘텐츠팀
data/feedback-rules.json   # 피드백 문구 ← 콘텐츠팀
data/demo-sessions.json    # 샘플(데모) 기록 ← 콘텐츠팀
vendor/                    # MediaPipe·Chart.js·AI 모델 (수정 금지)
docs/                      # 역할 분담, 프롬프트 기록
```

## 디버그

- `http://localhost:8000/?debug=video#/practice` — 카메라 대신 영상 파일로 얼굴·자세 분석을 시험 (음성 인식은 불가)
