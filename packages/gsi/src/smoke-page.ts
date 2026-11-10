import type { GameState } from './types.js';

/** Minimal local page so a POST from CS2 can be checked without another tool. */
export function renderSmokePage(state: GameState | null): string {
  const status = state
    ? escapeHtml(
        `Round phase / 回合阶段: ${state.round.phase}    Score / 比分: CT ${state.score.ct} - ${state.score.t} T`,
      )
    : 'Waiting for CS2 POST… / 等待 CS2 推送…';
  const body = escapeHtml(JSON.stringify(state, null, 2));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RoundMind GSI</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      background: #0b0b0b;
      color: #f3e6c4;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    header, main { padding: 1.25rem 1.5rem; }
    h1 { margin: 0 0 0.25rem; color: #d4af37; font-size: 1.4rem; }
    p { margin: 0.25rem 0; color: #e7d7a8; }
    .muted { color: #9a8b63; }
    pre {
      margin: 1rem 0 0;
      padding: 1rem;
      background: #111;
      border: 1px solid #d4af37;
      color: #f6e7b4;
      overflow: auto;
      min-height: 12rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <header>
    <h1>RoundMind GSI <span class="muted">/ 游戏状态</span></h1>
    <p>Latest GameState / 最新对局状态</p>
    <p class="muted" id="status">${status}</p>
  </header>
  <main>
    <pre id="out">${body}</pre>
  </main>
  <script>
    const out = document.getElementById('out');
    const status = document.getElementById('status');
    async function tick() {
      try {
        const res = await fetch('/state', { cache: 'no-store' });
        const body = await res.json();
        if (!body) {
          status.textContent = 'Waiting for CS2 POST… / 等待 CS2 推送…';
          out.textContent = 'null';
          return;
        }
        const phase = body.round && body.round.phase ? body.round.phase : 'unknown';
        const ct = body.score ? body.score.ct : 0;
        const t = body.score ? body.score.t : 0;
        status.textContent = 'Round phase / 回合阶段: ' + phase + '    Score / 比分: CT ' + ct + ' - ' + t + ' T';
        out.textContent = JSON.stringify(body, null, 2);
      } catch (error) {
        status.textContent = 'Listener error / 监听失败';
        out.textContent = String(error);
      }
    }
    tick();
    setInterval(tick, 500);
  </script>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
