// data/*.json 설정 파일을 한 번만 불러와서 공유합니다.
let cache = null;

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} 를 불러오지 못했습니다 (${res.status})`);
  return res.json();
}

export async function loadConfig() {
  if (cache) return cache;
  const [questions, thresholds, rules, demo] = await Promise.all([
    loadJson('data/questions.json'),
    loadJson('data/thresholds.json'),
    loadJson('data/feedback-rules.json'),
    loadJson('data/demo-sessions.json'),
  ]);
  cache = { questions, thresholds, rules: rules.rules, demo: demo.sessions };
  return cache;
}

export function findQuestion(questions, id) {
  for (const cat of questions.categories) {
    const q = cat.questions.find((q) => q.id === id);
    if (q) return { ...q, category: cat.label };
  }
  return null;
}
