// 연습 기록 저장소. 브라우저(localStorage)에만 저장하며 영상은 저장하지 않습니다.
const KEY = 'apc.sessions.v1';
let memory = []; // localStorage를 쓸 수 없는 환경(시크릿 창 제한 등)용 대체 저장소

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return memory;
  }
}

function write(list) {
  memory = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 저장 실패 시 이번 방문 동안만 메모리에 유지 */
  }
}

export function listSessions() {
  return read().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getSession(id) {
  return read().find((s) => s.id === id) || null;
}

export function saveSession(session) {
  const list = read().filter((s) => s.id !== session.id);
  list.push(session);
  write(list);
}

export function deleteSession(id) {
  write(read().filter((s) => s.id !== id));
}

export function clearSessions() {
  write([]);
}

// 녹화 영상은 새로고침 전까지 메모리에서만 재생합니다.
const replays = new Map();
export function setReplay(id, url) { replays.set(id, url); }
export function getReplay(id) { return replays.get(id) || null; }
