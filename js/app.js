// 해시 라우터 — #/ (홈), #/practice, #/result/:id, #/history
import { loadConfig } from './config.js';
import * as home from './screens/home.js';
import * as practice from './screens/practice.js';
import * as result from './screens/result.js';
import * as history from './screens/history.js';

const routes = [
  { pattern: /^#?\/?$/, screen: home, nav: 'home' },
  { pattern: /^#\/practice(?:\/([\w-]+))?$/, screen: practice, nav: 'practice' },
  { pattern: /^#\/result\/([\w-]+)$/, screen: result, nav: 'history' },
  { pattern: /^#\/history(?:\/([\w-]+))?$/, screen: history, nav: 'history' },
];

const app = document.getElementById('app');
let cleanup = null;

async function route() {
  const [path, query = ''] = location.hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || location.search.slice(1)));
  const match = routes.find((r) => r.pattern.test(path || '#/')) || routes[0];
  const arg = (path || '').match(match.pattern)?.[1];

  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.warn(e); } }
  cleanup = null;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === match.nav));
  window.scrollTo(0, 0);

  try {
    const cfg = await loadConfig();
    app.innerHTML = '';
    cleanup = await match.screen.render(app, { arg, params, cfg });
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="card empty"><h2>화면을 불러오지 못했어요</h2><p class="muted">${String(err.message || err)}</p><a class="btn" href="#/">홈으로</a></div>`;
  }
}

window.addEventListener('hashchange', route);
route();
