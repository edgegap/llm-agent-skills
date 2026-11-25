# `assets/client/ui.css`

Template file. Write the content of the code block below, without the fences, to `ui.css`.

```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: #10141f; color: #eef1f8;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
canvas { display: block; }
.ui { position: fixed; inset: 0; pointer-events: none; }
.ui [hidden] { display: none !important; }

.menu { pointer-events: auto; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(440px, calc(100% - 32px)); padding: 28px; border-radius: 16px;
  background: rgba(16, 20, 31, .86); backdrop-filter: blur(6px); box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.menu h1 { margin: 4px 0 6px; font-size: 32px; }
.menu .tagline { margin: 0 0 18px; color: #aab3c8; }
.menu label { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
.menu input { flex: 1; padding: 9px 12px; border-radius: 8px; border: 1px solid #39425a; background: #1a2030; color: inherit; font-size: 16px; }
.menu .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.menu button { padding: 10px 16px; border: 0; border-radius: 8px; font-size: 15px; cursor: pointer; background: #2b3348; color: inherit; }
.menu button.primary { background: #ff5a5f; color: #fff; font-weight: 700; }
.menu button:disabled { opacity: .45; cursor: not-allowed; }
.menu .status { min-height: 1.3em; color: #ffd166; }
.menu .help { margin: 0; color: #8892a8; font-size: 13px; }
.menu .back { color: #8892a8; font-size: 13px; text-decoration: none; }

.hud .board { position: absolute; left: 16px; top: 16px; margin: 0; padding: 10px 14px; list-style: none;
  background: rgba(0,0,0,.45); border-radius: 10px; min-width: 190px; font-size: 14px; }
.hud .board li { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; border-left: 4px solid var(--c); padding-left: 8px; margin: 3px 0; }
.hud .board li.me { font-weight: 700; }
.hud .banner { position: absolute; left: 50%; top: 16px; transform: translateX(-50%); padding: 8px 16px;
  background: rgba(0,0,0,.45); border-radius: 10px; font-size: 18px; font-weight: 600; white-space: pre; }
.hud .big { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); font-size: clamp(32px, 7vw, 72px);
  font-weight: 800; text-align: center; text-shadow: 0 4px 20px rgba(0,0,0,.7); }
.hud .keys { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); color: #c4cbe0;
  background: rgba(0,0,0,.4); padding: 6px 12px; border-radius: 8px; font-size: 13px; text-align: center; }
@media (max-width: 600px) { .hud .board { font-size: 12px; min-width: 140px; } .hud .banner { top: auto; bottom: 48px; } }
```
