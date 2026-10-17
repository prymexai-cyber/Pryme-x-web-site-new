/* ==========================================================================
   PRYME X AI — interactions
   ========================================================================== */
(() => {
  const html = document.documentElement;
  const S = window.SITE || {};
  const store = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };

  /* ---- 0. snapshot the untouched page (used by Edit Mode to save clean HTML) ---- */
  const EDIT_SEL = 'main h1, main h2, main h3, main h4, main p, main li, main blockquote, main .label, main .lead, main .btn, main small, main b, main .num, main .chip, main .status, main .title-lg, main .big-quote, main .tags span, main .marquee-track span, footer p, footer a, footer h4, footer .label, .nav-links a, .brand span';
  const pristine = html.cloneNode(true);
  const liveEditables = [...document.querySelectorAll(EDIT_SEL)];
  const pristineEditables = [...pristine.querySelectorAll(EDIT_SEL)];
  liveEditables.forEach((el, i) => (el.dataset.e = i));
  const liveImgs = [...document.querySelectorAll('main img, footer img')];
  const pristineImgs = [...pristine.querySelectorAll('main img, footer img')];
  liveImgs.forEach((el, i) => (el.dataset.ei = i));

  /* ---- 1. apply site-config ---- */
  if (S.logo) document.querySelectorAll('[data-logo]').forEach((i) => (i.src = S.logo));
  if (S.favicon || S.logo) { const l = document.querySelector('link[rel="icon"][type="image/svg+xml"]') || document.querySelector('link[rel="icon"]'); if (l) { l.href = S.favicon || S.logo; } }
  if (S.heroImage) document.querySelectorAll('.banner').forEach((b) => b.style.setProperty('--hero-img', `url("${S.heroImage}")`));
  if (S.founderPhoto) document.querySelectorAll('[data-founder]').forEach((i) => { i.onerror = () => { i.onerror = null; i.src = 'assets/img/founder.svg'; }; if (!i.src.endsWith(S.founderPhoto)) i.src = S.founderPhoto; });
  if (S.signature) document.querySelectorAll('[data-signature]').forEach((i) => (i.src = S.signature));
  document.querySelectorAll('[data-phone-us]').forEach((a) => { a.href = S.phoneUSLink || a.href; const b = a.querySelector('b') || a; if (S.phoneUS) b.textContent = S.phoneUS; });
  document.querySelectorAll('[data-wa]').forEach((a) => { a.href = S.whatsappLink || a.href; const b = a.querySelector('b'); if (b && S.whatsappLK) b.textContent = S.whatsappLK; });
  document.querySelectorAll('[data-email]').forEach((a) => { if (!S.email) { a.style.display = 'none'; return; } a.href = 'mailto:' + S.email; const b = a.querySelector('b'); if (b) b.textContent = S.email; });
  document.querySelectorAll('[data-year]').forEach((e) => (e.textContent = new Date().getFullYear()));
  const clocks = document.querySelectorAll('[data-clock]');
  if (clocks.length) { const fmt = () => { let t; try { t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Colombo' }).format(new Date()); } catch (e) { t = new Date().toLocaleTimeString(); } clocks.forEach((c) => (c.textContent = 'Colombo ' + t)); }; fmt(); setInterval(fmt, 1000); }

  /* ---- 2. loading screen (first visit per session) ---- */
  const loader = document.querySelector('.loader');
  if (loader) {
    if (store.get('px-seen')) loader.remove();
    else {
      store.set('px-seen', 1); document.documentElement.style.overflow = 'hidden';
      const pct = loader.querySelector('.pct'), bar = loader.querySelector('.ld-bar i'), ring = loader.querySelector('.ld-prog'), status = loader.querySelector('.ld-status');
      const ticks = loader.querySelector('.ld-ticks');
      if (ticks) { let t = ''; for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, r1 = 97, r2 = i % 5 ? 99 : 102; t += `<line x1="${100 + Math.cos(a) * r1}" y1="${100 + Math.sin(a) * r1}" x2="${100 + Math.cos(a) * r2}" y2="${100 + Math.sin(a) * r2}"/>`; } ticks.innerHTML = t; }
      loader.querySelectorAll('.ld-word span').forEach((s, i) => (s.style.animationDelay = 0.15 + i * 0.06 + 's'));
      const msgs = ['Initialising core', 'Loading 3D engine', 'Calibrating sensors', 'Securing connection', 'Ready'];
      let n = 0, loaded = document.readyState === 'complete'; const t0 = performance.now();
      addEventListener('load', () => (loaded = true));
      const tick = () => {
        const el = performance.now() - t0; const cap = loaded && el > 1400 ? 100 : 92;
        n = Math.min(cap, n + (cap - n) * 0.06 + 0.4);
        const v = Math.floor(n); if (pct) pct.textContent = String(v).padStart(3, '0'); if (bar) bar.style.width = v + '%'; if (ring) ring.style.strokeDashoffset = 578 * (1 - v / 100);
        if (status) status.textContent = msgs[Math.min(msgs.length - 1, Math.floor(v / 100 * (msgs.length - 1)))];
        if (v >= 100 || el > 6000) { loader.classList.add('done'); document.documentElement.style.overflow = ''; setTimeout(() => loader.remove(), 1500); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  /* ---- 3. liquid-glass refraction (Chromium supports SVG backdrop filters) ---- */
  const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  if (brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand))) html.classList.add('liquid-on');

  /* ---- 4. nav ---- */
  const nav = document.querySelector('.nav');
  const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
  document.querySelectorAll('[data-page]').forEach((a) => { if (a.dataset.page === page) a.classList.add('active'); });
  let lastY = scrollY;
  addEventListener('scroll', () => { const y = scrollY; if (nav && !document.querySelector('.mnav.open')) nav.classList.toggle('hide', y > 300 && y > lastY + 4); if (y < lastY - 4) nav && nav.classList.remove('hide'); lastY = y; }, { passive: true });
  const burger = document.querySelector('.burger'), mnav = document.querySelector('.mnav');
  if (burger && mnav) {
    burger.addEventListener('click', () => { const o = mnav.classList.toggle('open'); burger.setAttribute('aria-expanded', o); document.body.style.overflow = o ? 'hidden' : ''; });
    mnav.querySelectorAll('a').forEach((a, i) => (a.style.transitionDelay = i * 0.04 + 's'));
  }

  /* ---- 5. scope cursor ---- */
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine) {
    html.classList.add('has-scope');
    const ring = document.createElement('div'); ring.className = 'scope';
    ring.innerHTML = `<svg viewBox="0 0 64 64"><g class="ring"><circle cx="32" cy="32" r="29" fill="none" stroke="#0A0C16" stroke-width="1.2" stroke-dasharray="40 5.5"/></g>
      <circle cx="32" cy="32" r="20" fill="none" stroke="#0A0C16" stroke-opacity=".35" stroke-width=".8"/>
      <path d="M32 0v9M32 55v9M0 32h9M55 32h9" stroke="#0A0C16" stroke-width="1.3"/>
      <path d="M32 14v4M32 46v4M14 32h4M46 32h4" stroke="#081B2C" stroke-width="1"/></svg>`;
    const x = document.createElement('div'); x.className = 'scope-x';
    x.innerHTML = `<svg viewBox="0 0 18 18"><path d="M3 3l12 12M15 3L3 15" stroke="#081B2C" stroke-width="2.2" stroke-linecap="round"/><circle cx="9" cy="9" r="1.3" fill="#0A0C16"/></svg>`;
    document.body.append(ring, x);
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; x.style.transform = `translate3d(${mx}px,${my}px,0)`; }, { passive: true });
    (function loop() { rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18; ring.style.transform = `translate3d(${rx}px,${ry}px,0)`; requestAnimationFrame(loop); })();
    addEventListener('pointerdown', () => ring.classList.add('down')); addEventListener('pointerup', () => ring.classList.remove('down'));
    document.addEventListener('pointerover', (e) => { ring.classList.toggle('hot', !!e.target.closest('a, button, input, select, textarea, [data-tilt]')); });
    document.addEventListener('pointerleave', () => { ring.style.opacity = x.style.opacity = 0; });
    document.addEventListener('pointerenter', () => { ring.style.opacity = x.style.opacity = 1; });
  }

  /* ---- 6. reveal on scroll ---- */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); if (e.target.matches('[data-scramble]')) scramble(e.target); if (e.target.matches('[data-count]')) count(e.target); } }), { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  const pending = new Set(document.querySelectorAll('[data-reveal], .split-line, [data-scramble], [data-count], .rbox, .founder, .sig-wrap'));
  pending.forEach((el) => io.observe(el));
  const reveal = (el) => { pending.delete(el); if (el.classList.contains('in')) return; el.classList.add('in'); io.unobserve(el); if (el.matches('[data-scramble]')) scramble(el); if (el.matches('[data-count]')) count(el); };
  // safety net: anything already scrolled past (fast scroll, anchor jump, End key) is revealed too
  let sweepQueued = false;
  const sweep = () => { sweepQueued = false; const vh = innerHeight; pending.forEach((el) => { if (el.classList.contains('in')) { pending.delete(el); return; } if (el.getBoundingClientRect().top < vh * 0.92) reveal(el); }); };
  addEventListener('scroll', () => { if (!sweepQueued) { sweepQueued = true; requestAnimationFrame(sweep); } }, { passive: true });
  addEventListener('load', sweep); setTimeout(sweep, 600);

  /* glitch-scramble text (keeps the final text exactly as written) */
  const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/<>✕#';
  function scramble(el) {
    if (el.dataset.done) return; el.dataset.done = 1;
    const final = el.textContent; const len = final.length; const t0 = performance.now(), dur = 900;
    const tick = (now) => {
      const k = Math.min(1, (performance.now() - t0) / dur); let out = '';
      for (let i = 0; i < len; i++) { const ch = final[i]; out += ch === ' ' || k > i / len * 0.85 + 0.1 ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
      el.textContent = k >= 1 ? final : out; if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick); setTimeout(() => (el.textContent = final), dur + 400);
  }
  function count(el) {
    const end = parseFloat(el.dataset.count); const dec = (el.dataset.count.split('.')[1] || '').length; const t0 = performance.now(), dur = 1800;
    const tick = (now) => { const k = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - k, 4); el.textContent = (end * e).toFixed(dec); if (k < 1) requestAnimationFrame(tick); else el.textContent = el.dataset.count; };
    requestAnimationFrame(tick);
  }

  /* ---- 7. 3D tilt + glare on glass cards ---- */
  if (fine) document.querySelectorAll('[data-tilt]').forEach((card) => {
    const max = parseFloat(card.dataset.tilt) || 6;
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.transform = `perspective(1100px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) translateZ(0)`;
      card.style.setProperty('--gx', px * 100 + '%'); card.style.setProperty('--gy', py * 100 + '%');
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });

  /* ---- 8. marquee: duplicate content for a seamless loop ---- */
  document.querySelectorAll('.marquee-track').forEach((t) => { t.innerHTML += t.innerHTML; t.querySelectorAll('span').forEach((s, i, all) => { if (i >= all.length / 2) s.setAttribute('aria-hidden', 'true'); }); });

  /* ---- 9. service filters ---- */
  document.querySelectorAll('.filters').forEach((bar) => {
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      bar.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      const f = b.dataset.f; document.querySelectorAll('[data-cat]').forEach((c) => c.classList.toggle('out', f !== 'all' && c.dataset.cat !== f));
    });
  });

  /* ---- 10. Join-us robot: big word appears when the arms open ---- */
  document.addEventListener('robot:open', (e) => { document.querySelectorAll('.join-word').forEach((w) => w.classList.toggle('show', e.detail)); });
  document.querySelectorAll('.join-word').forEach((w) => { const t = w.textContent.trim(); w.innerHTML = [...t].map((c, i) => `<span style="transition-delay:${i * 0.06}s">${c === ' ' ? '&nbsp;' : c}</span>`).join(''); });

  /* ---- 11. contact form → Netlify Forms, with WhatsApp option ---- */
  document.querySelectorAll('form[data-wa-form]').forEach((form) => {
    form.querySelector('[data-send-wa]')?.addEventListener('click', () => {
      const d = new FormData(form); const msg = `Hello Pryme X AI,%0A%0AName: ${d.get('name') || ''}%0AEmail: ${d.get('email') || ''}%0AInterest: ${d.get('interest') || ''}%0A%0A${encodeURIComponent(d.get('message') || '')}`;
      open((S.whatsappLink || 'https://wa.me/94740875089') + '?text=' + msg, '_blank', 'noopener');
    });
  });

  /* ---- 12. smooth page transitions ---- */
  const fade = document.querySelector('.page-fade');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a'); if (!a || !fade || html.classList.contains('editing')) return;
    const href = a.getAttribute('href') || '';
    if (a.target === '_blank' || e.metaKey || e.ctrlKey || !/\.html(#.*)?$/.test(href) || href.startsWith('http')) return;
    e.preventDefault(); fade.classList.add('on'); setTimeout(() => (location.href = href), 380);
  });
  addEventListener('pageshow', () => fade && fade.classList.remove('on'));

  /* ---- 13. EDIT MODE — open any page with  ?edit  in the address bar ----
     Click any text to change it; click any image to swap its file.
     Then press "Download page" and replace that .html file in your folder. */
  function startEdit() {
    if (html.classList.contains('editing')) return;
    html.classList.add('editing');
    const changed = new Set(), imgChanged = new Map();
    liveEditables.forEach((el) => { el.contentEditable = 'true'; el.spellcheck = false; el.addEventListener('input', () => changed.add(el)); el.addEventListener('click', (ev) => { if (el.closest('a')) ev.preventDefault(); }); });
    liveImgs.forEach((img) => img.addEventListener('click', (ev) => {
      ev.preventDefault();
      const v = prompt('Image file path or URL (put new images in assets/img/):', img.getAttribute('src'));
      if (v) { img.src = v; imgChanged.set(img, v); }
    }));
    const bar = document.createElement('div'); bar.className = 'edit-bar';
    bar.innerHTML = `<span>EDIT MODE · click text or images</span><button class="p" data-a="save">Download page</button><button data-a="exit">Exit</button>`;
    document.body.append(bar);
    bar.addEventListener('click', (e) => {
      const a = e.target.dataset.a;
      if (a === 'exit') { location.href = location.pathname; }
      if (a === 'save') {
        changed.forEach((el) => { const p = pristineEditables[+el.dataset.e]; if (p) p.innerHTML = el.innerHTML; });
        imgChanged.forEach((v, img) => { const p = pristineImgs[+img.dataset.ei]; if (p) p.setAttribute('src', v); });
        const out = '<!DOCTYPE html>\n' + pristine.outerHTML;
        const blob = new Blob([out], { type: 'text/html' }); const link = document.createElement('a');
        link.href = URL.createObjectURL(blob); link.download = (location.pathname.split('/').pop() || 'index.html'); link.click();
      }
    });
  }
  if (/[?&]edit\b/.test(location.search)) startEdit();
  addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') startEdit(); });
})();
