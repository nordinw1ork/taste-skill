/* Paezma Maison theme.js */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const overlay = () => $('[data-overlay]');

  const money = (cents) => {
    const fmt = (window.theme && theme.moneyFormat) || '{{amount_with_comma_separator}} €';
    const v = (cents / 100);
    const withComma = v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const noDec = Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return fmt.replace(/\{\{\s*(\w+)\s*\}\}/, (_, k) => {
      if (k === 'amount_no_decimals' || k === 'amount_no_decimals_with_comma_separator') return noDec;
      if (k === 'amount') return v.toFixed(2);
      return withComma;
    });
  };
  window.themeMoney = money;

  /* ---------- Drawers ---------- */
  let openDrawer = null;
  const open = (el) => {
    if (!el) return;
    close();
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    overlay() && overlay().classList.add('is-active');
    document.documentElement.style.overflow = 'hidden';
    openDrawer = el;
    const f = el.querySelector('input,button,a');
    f && setTimeout(() => f.focus({ preventScroll: true }), 50);
  };
  const close = () => {
    if (!openDrawer) return;
    openDrawer.classList.remove('is-open');
    openDrawer.setAttribute('aria-hidden', 'true');
    overlay() && overlay().classList.remove('is-active');
    document.documentElement.style.overflow = '';
    openDrawer = null;
  };
  window.themeDrawer = { open, close };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open]');
    if (t) {
      const target = document.getElementById(t.dataset.open);
      if (t.dataset.open === 'CartDrawer' && document.body.dataset.cartType === 'page') return;
      if (target) { e.preventDefault(); open(target); if (t.dataset.open === 'CartDrawer') refreshCart(); }
    }
    if (e.target.closest('[data-close]') || e.target.matches('[data-overlay]')) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); closeLightbox(); } });

  /* ---------- Header ---------- */
  const header = $('[data-header]');
  if (header) {
    const transparent = header.classList.contains('is-transparent');
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
    if (transparent) { onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); }
    $$('.has-mega', header).forEach((li) => {
      li.addEventListener('mouseenter', () => header.classList.add('menu-open'));
      li.addEventListener('mouseleave', () => header.classList.remove('menu-open'));
    });
  }

  /* ---------- Announcement rotator ---------- */
  $$('[data-announcement]').forEach((bar) => {
    const track = $('.announcement__track', bar);
    const n = track ? track.children.length : 0;
    if (n < 2) return;
    let i = 0;
    setInterval(() => { i = (i + 1) % n; track.style.transform = `translateX(-${i * 100}%)`; }, 4500);
  });

  /* ---------- Reveal ---------- */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('[data-reveal]').forEach((el) => io.observe(el));
  } else { $$('[data-reveal]').forEach((el) => el.classList.add('is-visible')); }

  /* ---------- Product row arrows ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-row-nav]');
    if (!b) return;
    const track = b.closest('[data-row]').querySelector('[data-row-track]');
    const card = track.firstElementChild;
    const step = card ? card.getBoundingClientRect().width + 6 : 300;
    track.scrollBy({ left: b.dataset.rowNav === 'next' ? step * 2 : -step * 2, behavior: 'smooth' });
  });

  /* ---------- Cart ---------- */
  const cartDrawer = () => document.getElementById('CartDrawer');
  const updateCount = (count) => $$('[data-cart-count]').forEach((el) => (el.textContent = count));

  async function refreshCart() {
    const d = cartDrawer();
    if (!d) return;
    try {
      const res = await fetch(`${theme.routes.root}?section_id=cart-drawer-content`.replace('//?', '/?'));
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const fresh = doc.querySelector('[data-cart-inner]');
      const cur = d.querySelector('[data-cart-inner]');
      if (fresh && cur) cur.replaceWith(fresh);
      const c = doc.querySelector('[data-cart-count-src]');
      if (c) updateCount(c.dataset.cartCountSrc);
    } catch (err) { console.error(err); }
  }
  window.refreshCart = refreshCart;

  async function addToCart(items, btn) {
    btn && btn.classList.add('is-loading');
    try {
      const res = await fetch(theme.routes.cart_add_url + '.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (data.status) throw new Error(data.description || data.message);
      if (document.body.dataset.cartType === 'page') { window.location.href = theme.routes.cart_url; return; }
      await refreshCart();
      open(cartDrawer());
    } catch (err) {
      alert(err.message || 'Error');
    } finally { btn && btn.classList.remove('is-loading'); }
  }
  window.themeAddToCart = addToCart;

  // quick add from cards
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quick-add]');
    if (!b) return;
    e.preventDefault();
    addToCart([{ id: Number(b.dataset.quickAdd), quantity: 1 }], b);
  });

  // product form submit
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-product-form]');
    if (!form || document.body.dataset.cartType === 'page') return;
    e.preventDefault();
    const fd = new FormData(form);
    const item = { id: Number(fd.get('id')), quantity: Number(fd.get('quantity') || 1) };
    const props = {};
    for (const [k, v] of fd.entries()) { const m = k.match(/^properties\[(.+)\]$/); if (m && v) props[m[1]] = v; }
    if (Object.keys(props).length) item.properties = props;
    if (fd.get('selling_plan')) item.selling_plan = Number(fd.get('selling_plan'));
    addToCart([item], form.querySelector('[type=submit]'));
  });

  // cart qty change (drawer + page)
  async function changeLine(key, quantity) {
    const wrap = $('[data-cart-inner]') || document.body;
    wrap.classList.add('cart-is-loading');
    try {
      await fetch(theme.routes.cart_change_url + '.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: key, quantity })
      });
      if (document.body.classList.contains('template-cart')) { window.location.reload(); return; }
      await refreshCart();
    } finally { wrap.classList.remove('cart-is-loading'); }
  }
  document.addEventListener('click', (e) => {
    const q = e.target.closest('[data-line-qty]');
    if (q) {
      e.preventDefault();
      const input = q.parentElement.querySelector('input');
      const next = Math.max(0, Number(input.value) + Number(q.dataset.lineQty));
      if (q.dataset.key) changeLine(q.dataset.key, next); else input.value = Math.max(1, next);
    }
    const r = e.target.closest('[data-line-remove]');
    if (r) { e.preventDefault(); changeLine(r.dataset.lineRemove, 0); }
  });
  document.addEventListener('change', (e) => {
    const i = e.target.closest('[data-line-input]');
    if (i) changeLine(i.dataset.lineInput, Math.max(0, Number(i.value)));
  });

  /* ---------- Variant picker ---------- */
  $$('[data-product]').forEach((root) => {
    const json = $('[data-product-json]', root);
    if (!json) return;
    const product = JSON.parse(json.textContent);
    const form = $('[data-product-form]', root);
    const idInput = form && $('input[name="id"]', form);
    const priceEl = $('[data-price]', root);
    const btn = form && $('[type=submit]', form);
    const selects = () => $$('[data-option-index]', root);

    const current = () => {
      const opts = [];
      selects().forEach((fs) => {
        const idx = Number(fs.dataset.optionIndex);
        const c = $('input:checked', fs) || $('select', fs);
        if (c) opts[idx] = c.value;
      });
      return opts;
    };
    const markAvailability = (sel) => {
      selects().forEach((fs) => {
        const idx = Number(fs.dataset.optionIndex);
        $$('input', fs).forEach((inp) => {
          const test = sel.slice(); test[idx] = inp.value;
          const v = product.variants.find((vv) => vv.options.every((o, i) => o === test[i]));
          inp.classList.toggle('is-unavailable', !v || !v.available);
        });
        const label = $('[data-selected-value]', fs); if (label) label.textContent = sel[idx] || '';
      });
    };
    const update = () => {
      const sel = current();
      const v = product.variants.find((vv) => vv.options.every((o, i) => o === sel[i]));
      markAvailability(sel);
      if (!v) { if (btn) { btn.disabled = true; btn.textContent = theme.strings.soldOut; } return; }
      if (idInput) idInput.value = v.id;
      if (priceEl) {
        priceEl.innerHTML = v.compare_at_price > v.price
          ? `<s>${money(v.compare_at_price)}</s><span class="sale">${money(v.price)}</span>`
          : `<span>${money(v.price)}</span>`;
      }
      if (btn) { btn.disabled = !v.available; btn.textContent = v.available ? theme.strings.addToCart : theme.strings.soldOut; }
      if (v.featured_media && root.dataset.updateUrl !== 'false') {
        const m = root.querySelector(`[data-media-id="${v.featured_media.id}"]`);
        const gallery = m && m.parentElement;
        if (m && gallery && gallery.firstElementChild !== m) {
          if (window.innerWidth < 990) gallery.scrollTo({ left: m.offsetLeft, behavior: 'smooth' });
          else gallery.prepend(m);
        }
      }
      const url = new URL(window.location.href);
      url.searchParams.set('variant', v.id);
      if (root.dataset.updateUrl !== 'false') window.history.replaceState({}, '', url.toString());
    };
    root.addEventListener('change', (e) => { if (e.target.closest('[data-option-index]')) update(); });
    markAvailability(current());
  });

  /* ---------- Lightbox ---------- */
  const lb = () => document.getElementById('Lightbox');
  function closeLightbox() { const l = lb(); if (l && l.classList.contains('is-open')) { l.classList.remove('is-open'); document.documentElement.style.overflow = ''; } }
  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-zoom]');
    const l = lb();
    if (m && l && window.innerWidth >= 990) {
      l.innerHTML = $$('[data-zoom] img', m.parentElement).map((i) => `<img src="${i.dataset.full || i.currentSrc}" alt="">`).join('');
      l.classList.add('is-open'); document.documentElement.style.overflow = 'hidden';
      const idx = $$('[data-zoom]', m.parentElement).indexOf(m);
      setTimeout(() => { const img = l.children[idx]; img && img.scrollIntoView(); }, 30);
      return;
    }
    if (e.target.closest('#Lightbox')) closeLightbox();
  });

  /* ---------- Predictive search ---------- */
  const sInput = $('[data-predictive-input]');
  const sOut = $('[data-predictive-results]');
  if (sInput && sOut) {
    let t;
    sInput.addEventListener('input', () => {
      clearTimeout(t);
      const q = sInput.value.trim();
      if (q.length < 2) { sOut.innerHTML = ''; return; }
      t = setTimeout(async () => {
        try {
          const r = await fetch(`${theme.routes.root}search/suggest?q=${encodeURIComponent(q)}&section_id=predictive-search`.replace('//search', '/search'));
          const html = await r.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const res = doc.querySelector('[data-predictive]');
          sOut.innerHTML = res ? res.outerHTML : '';
        } catch (_) {}
      }, 220);
    });
  }

  /* ---------- Collection grid toggle & sort ---------- */
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-grid-cols]');
    if (!g) return;
    const grid = $('[data-product-grid]');
    if (!grid) return;
    const mobile = window.innerWidth < 768;
    grid.style.setProperty(mobile ? '--cols-m' : '--cols', g.dataset.gridCols);
    $$('[data-grid-cols]').forEach((x) => x.classList.toggle('is-active', x === g));
  });
  document.addEventListener('change', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) { const u = new URL(window.location.href); u.searchParams.set('sort_by', s.value); window.location.href = u.toString(); }
    const f = e.target.closest('[data-facet-auto]');
    if (f && window.innerWidth >= 990) f.form.submit();
  });
})();
