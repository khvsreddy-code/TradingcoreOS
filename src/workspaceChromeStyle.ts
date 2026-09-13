(() => {
  const id = 'tco-workspace-chrome-style';
  if (document.getElementById(id)) return;
  const style = document.createElement('style'); style.id = id;
  style.textContent = `
  .tco-q2{display:flex;flex-direction:column;gap:8px;font-family:JetBrains Mono,monospace}
  .tco-q2-title{display:flex;justify-content:space-between;align-items:center;gap:8px;padding-bottom:2px;color:#64748b;font-size:8px;letter-spacing:.12em;text-transform:uppercase}
  .tco-q2-title b{color:#d1d5db;font-size:9px;letter-spacing:.04em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tco-q2-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
  .tco-q2-control{width:100%;box-sizing:border-box;min-width:0;height:30px;padding:0 8px;border:1px solid #252b39;border-radius:6px;background:#090c12;color:#d1d5db;outline:none;font:10px JetBrains Mono,monospace}
  .tco-q2-control:focus{border-color:#10b98166;box-shadow:0 0 0 1px #10b98122}
  .tco-q2-premium{padding:8px;border:1px solid #17342d;border-radius:6px;background:#08120f;color:#10b981;font:700 9px JetBrains Mono,monospace;text-align:center}
  .tco-q2-riskhead{margin-top:2px;color:#64748b;font:700 8px JetBrains Mono,monospace;letter-spacing:.13em}
  .tco-q2-contract{padding:7px 8px;border:1px solid #222636;border-radius:6px;background:#090c12;color:#8c93a6;font:9px JetBrains Mono,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tco-q2-status{min-height:12px;color:#94a3b8;font:8px JetBrains Mono,monospace;line-height:12px}
  .tco-q2-submit{width:100%;height:32px;border:1px solid #10b98155;border-radius:6px;background:#10b981;color:#06110d;font:800 9px JetBrains Mono,monospace;letter-spacing:.06em;cursor:pointer}
  .tco-q2-submit:hover{filter:brightness(1.08)} .tco-q2-submit:disabled{opacity:.55;cursor:wait}
  `;
  document.head.appendChild(style);
})();
