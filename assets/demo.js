// デモサイトの操作：目次の現在位置、Evidence IDから根拠台帳への移動、台帳の開閉。分析データは変更しない。
(() => {
  const ids = new Set(window.__V13__.data.evidence.map(e => e.id));
  const re = new RegExp('(^|[^A-Za-z0-9-])(' + [...ids].sort((a, b) => b.length - a.length).map(s => s.replace(/[-]/g, '\\-')).join('|') + ')(?![A-Za-z0-9-])', 'g');
  const app = document.getElementById('app');
  function linkify() {
    const walker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT, { acceptNode: n => {
      const p = n.parentElement; if (!p || p.closest('a,button,select,option,svg,script,style')) return NodeFilter.FILTER_REJECT;
      re.lastIndex = 0; return re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const frag = document.createDocumentFragment(); let last = 0; const s = n.nodeValue; re.lastIndex = 0; let m;
      while ((m = re.exec(s))) { const start = m.index + m[1].length; frag.append(s.slice(last, start));
        const a = document.createElement('a'); a.href = '#ev-' + m[2]; a.className = 'evlink'; a.textContent = m[2]; frag.append(a); last = start + m[2].length; }
      frag.append(s.slice(last)); n.replaceWith(frag);
    }
  }
  const mo = new MutationObserver(() => { mo.disconnect(); linkify(); mo.observe(app, { childList: true, subtree: true }); });
  linkify(); mo.observe(app, { childList: true, subtree: true });
  function reveal(hash) {
    const el = hash && document.getElementById(decodeURIComponent(hash.slice(1))); if (!el) return false;
    const d = el.closest('details'); if (d) d.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (el.classList.contains('ev')) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    return true;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'); if (a) { if (reveal(a.getAttribute('href'))) { e.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); } return; }
    const b = e.target.closest('[data-ledger]'); if (b) document.querySelectorAll('.ledger-group').forEach(d => d.open = b.dataset.ledger === 'open');
  });
  if (location.hash) setTimeout(() => reveal(location.hash), 50);
  const links = [...document.querySelectorAll('.demo-nav a')];
  const targets = links.map(a => document.querySelector(a.getAttribute('href')));
  const onScroll = () => { const y = window.scrollY + 90; let k = 0; targets.forEach((t, i) => { if (t && t.offsetTop <= y) k = i; }); links.forEach((a, i) => a.classList.toggle('on', i === k)); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
})();
