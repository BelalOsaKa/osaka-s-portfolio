/* Osaka portfolio — shared motion system for the home page and case studies.
   One easing curve everywhere: cubic-bezier(0.22, 1, 0.36, 1). */
(() => {
  "use strict";
  const BASE_DELAY = 1.0;          // s — home hero waits for the preloader
  const CASE_DELAY = 0.35;         // s — case pages wait for the curtain
  const PRELOAD_COUNT_MS = 800;
  const PRELOAD_HOLD_MS = 120;
  const CURTAIN_MS = 600;
  const CURTAIN_EASE = "cubic-bezier(0.76, 0, 0.24, 1)";
  const EASE_OUT = t => 1 - Math.pow(1 - t, 3);

  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
  const store = {
    get: (k, ses) => safe(() => (ses ? sessionStorage : localStorage).getItem(k)),
    set: (k, v, ses) => safe(() => (ses ? sessionStorage : localStorage).setItem(k, v))
  };
  const isHome = !!$(".preloader");
  const yearEl = $("#year"); if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Spring engine: one rAF loop drives every spring ---------- */
  const springs = new Set(), ticks = new Set();
  class Spring {
    constructor(stiffness, damping, value = 0, onUpdate) {
      Object.assign(this, { k: stiffness, c: damping, x: value, v: 0, target: value, onUpdate });
      springs.add(this);
    }
    set(t) { this.target = t; }
    jump(t) { this.x = this.target = t; this.v = 0; this.onUpdate && this.onUpdate(this.x); }
    step(dt) {
      const f = -this.k * (this.x - this.target) - this.c * this.v;
      this.v += f * dt; this.x += this.v * dt;
      if (Math.abs(this.v) < 1e-4 && Math.abs(this.x - this.target) < 1e-4) this.x = this.target;
      this.onUpdate && this.onUpdate(this.x);
    }
  }
  let last = performance.now();
  (function frame(now) {
    const dt = Math.min(0.032, (now - last) / 1000); last = now;
    for (const s of springs) { s.step(dt / 2); s.step(dt / 2); }
    for (const fn of ticks) fn(now);
    requestAnimationFrame(frame);
  })(last);

  /* ---------- Smooth scroll (Lenis when it loads, native otherwise) ---------- */
  let lenis = null;
  const NAV_OFFSET = -72;
  function startLenis() {
    if (reduce || !window.Lenis || lenis) return;
    lenis = new window.Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    ticks.add(t => lenis.raf(t));
    if (root.classList.contains("lock") || root.classList.contains("menu-open")) lenis.stop();
    if (location.hash) { const t = safe(() => $(location.hash)); t && setTimeout(() => lenis.scrollTo(t, { offset: NAV_OFFSET, immediate: true }), 0); }
  }
  window.addEventListener("load", startLenis);
  const getScroll = () => (lenis ? lenis.scroll : scrollY);
  function scrollToTarget(target) {
    if (lenis) return lenis.scrollTo(target, { offset: NAV_OFFSET });
    const y = typeof target === "number" ? target : target.getBoundingClientRect().top + scrollY + NAV_OFFSET;
    scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
  }

  /* ---------- Curtain page transitions ---------- */
  const curtain = $(".curtain");
  function liftCurtain() {
    if (!curtain || !curtain.classList.contains("cover")) return;
    if (reduce) { curtain.classList.remove("cover"); root.classList.remove("revisit"); return; }
    curtain.animate([{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }],
      { duration: CURTAIN_MS, easing: CURTAIN_EASE, fill: "forwards" })
      .finished.then(() => { curtain.classList.remove("cover"); root.classList.remove("revisit"); curtain.getAnimations().forEach(a => a.cancel()); });
  }
  function leaveTo(href) {
    if (reduce || !curtain) { location.href = href; return; }
    closeMenu(); curtain.classList.add("moving");
    curtain.animate([{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
      { duration: CURTAIN_MS, easing: CURTAIN_EASE, fill: "forwards" })
      .finished.then(() => { location.href = href; });
  }
  // Coming back with the browser's back button can restore a covered page
  addEventListener("pageshow", e => {
    if (e.persisted && curtain) { curtain.getAnimations().forEach(a => a.cancel()); curtain.classList.remove("cover", "moving"); root.classList.remove("revisit"); }
  });

  document.addEventListener("click", e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]"); if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    const samePage = url.pathname === location.pathname && url.origin === location.origin;
    if (samePage && url.hash) {                         // in-page anchor → smooth scroll
      const el = url.hash === "#top" ? 0 : safe(() => $(url.hash)); if (el === null || el === undefined) return;
      e.preventDefault(); closeMenu(); scrollToTarget(el);
      history.replaceState(null, "", url.hash === "#top" ? location.pathname : url.hash);
      if (el !== 0) { el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
      return;
    }
    if (url.origin === location.origin && /\.html$|\/$/.test(url.pathname)) {   // another page of this site
      e.preventDefault(); store.set("osaka-visited", "1", true); leaveTo(url.href);
    }
  });
  $$(".to-top").forEach(b => b.addEventListener("click", () => scrollToTarget(0)));

  /* ---------- RevealText: wrap words for the per-word mask ---------- */
  $$(".rt").forEach(el => {
    el.setAttribute("aria-label", el.textContent.trim().replace(/\s+/g, " "));
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const w = document.createElement("span"); w.className = "w"; w.setAttribute("aria-hidden", "true");
          const i = document.createElement("span"); i.textContent = part; w.append(i); frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
    walk(el);
    $$(".w > span", el).forEach((s, i) => (s.style.transitionDelay = i * 0.045 + "s"));
  });

  /* ---------- Intro sequence (preloader on home, curtain on case pages) ---------- */
  const heroLines = $$(".hero .mask, .case-hero .mask");
  const heroFades = $$(".hero-fade");
  heroFades.forEach(el => el.classList.add("fade"));
  const nav = $("#nav");
  function playHero() {
    heroLines.forEach((el, i) => setTimeout(() => el.classList.add("in"), i * 120));
    heroFades.forEach(el => setTimeout(() => el.classList.add("in"), parseFloat(el.dataset.at || 0) * 1000 + 150));
    setTimeout(() => nav && nav.classList.add("in"), 200);
    $$(".portrait, .deco-ring").forEach(el => setTimeout(() => el.classList.add("in"), parseFloat(el.dataset.at || 0) * 1000));
  }
  if (reduce) {
    $$(".mask, .rt, .fade, .t-item, .case-cover, .portrait, .deco-ring").forEach(el => el.classList.add("in"));
    nav && nav.classList.add("in");
    const pl = $(".preloader"); pl && pl.remove();
    curtain && curtain.classList.remove("cover");
  } else if (isHome && !store.get("osaka-visited", true)) {
    // First visit this session: the short preloader
    store.set("osaka-visited", "1", true);
    root.classList.add("lock");
    const pl = $(".preloader"), num = $(".pl-num"), bar = $(".pl-bar i");
    const start = performance.now();
    (function count(now) {
      const p = Math.min(1, (now - start) / PRELOAD_COUNT_MS), e = EASE_OUT(p);
      num.textContent = Math.round(e * 100); bar.style.transform = `scaleX(${e})`;
      if (p < 1) requestAnimationFrame(count);
    })(start);
    setTimeout(() => {
      pl.animate([{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }],
        { duration: CURTAIN_MS, easing: CURTAIN_EASE, fill: "forwards" }).finished.then(() => pl.remove());
      root.classList.remove("lock"); lenis && lenis.start();
    }, PRELOAD_COUNT_MS + PRELOAD_HOLD_MS);
    setTimeout(playHero, BASE_DELAY * 1000 - 100);
  } else {
    // Arriving from another page of the site: curtain lifts, content follows
    const pl = $(".preloader"); pl && pl.remove();
    if (curtain) curtain.classList.add("cover");
    requestAnimationFrame(() => liftCurtain());
    setTimeout(playHero, CASE_DELAY * 1000);
  }

  /* ---------- Scroll-triggered entrances ---------- */
  if (!reduce) {
    const once = (els, opts) => {
      const io = new IntersectionObserver(entries => entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      }), opts);
      els.forEach(el => io.observe(el));
    };
    const notIntro = el => !el.closest(".hero, .case-hero");
    once($$(".fade").filter(notIntro), { rootMargin: "0px 0px -60px 0px" });
    once($$(".rt"), { threshold: 0.2 });
    once($$(".mask").filter(notIntro), { threshold: 0.2 });
    once($$(".case-cover"), { threshold: 0.1 });
    $$(".work-grid > .fade, .services > .fade").forEach((el, i) => (el.style.transitionDelay = (i % 2) * 0.08 + "s"));
  }

  /* ---------- Hero parallax fade, nav state, progress bar ---------- */
  const heroInner = $(".hero-inner"), progress = $(".progress");
  const progSpring = progress && new Spring(120, 22, 0, v => (progress.style.transform = `scaleX(${Math.max(0, v)})`));
  ticks.add(() => {
    const y = getScroll(), h = innerHeight;
    if (heroInner && !reduce) {
      const p = Math.min(1, Math.max(0, y / h));
      heroInner.style.transform = `translate3d(0, ${p * 130}px, 0)`;
      heroInner.style.opacity = String(1 - p * 1.1);
    }
    nav && nav.classList.toggle("scrolled", y > 24);
    if (progSpring) { const max = document.documentElement.scrollHeight - h; progSpring.set(max > 0 ? y / max : 0); }
  });

  /* ---------- Hollow headline: size the SVG so its capitals match the other lines ---------- */
  const SHADE = 6;                                   // inner shade offset, in 1/100 em
  function fitHollow() {
    $$("svg.hollow").forEach(svg => {
      const line = svg.querySelector(".hollow-line"); if (!line) return;
      const cs = getComputedStyle(line);
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
      const m = ctx.measureText(line.textContent);
      const cap = m.actualBoundingBoxAscent || 72;
      const w = safe(() => line.getComputedTextLength(), m.width) || m.width;
      const pad = 3;
      const vw = w + SHADE + pad * 2, vh = cap + SHADE + pad * 2;
      svg.setAttribute("viewBox", `${-pad} ${-cap - pad} ${vw} ${vh}`);
      svg.style.width = vw / 100 + "em";
      svg.style.height = vh / 100 + "em";
      svg.style.marginBottom = (0.86 - vh / 100) + "em";  // keep the line box at the headline's line-height
      $$(".ht-off", svg).forEach(t => { t.setAttribute("x", SHADE); t.setAttribute("y", SHADE); });
    });
  }
  fitHollow();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHollow);

  /* ---------- Portrait parallax (scroll + a gentle lean toward the cursor) ---------- */
  const portrait = $(".portrait");
  const decoRings = $$(".deco-ring");
  if (portrait && !reduce) {
    const px = new Spring(60, 14, 0), py = new Spring(60, 14, 0);
    if (finePointer) addEventListener("pointermove", e => {
      px.set((e.clientX / innerWidth - 0.5) * -14); py.set((e.clientY / innerHeight - 0.5) * -8);
    }, { passive: true });
    ticks.add(() => {
      const y = Math.min(getScroll(), innerHeight * 1.2);
      portrait.style.transform = `translate3d(${px.x}px, ${y * 0.18 + py.x}px, 0)`;
      // rings drift at their own depth (uses the independent `translate` property, so CSS transforms still animate)
      decoRings.forEach(r => { const d = parseFloat(r.dataset.depth) || 0; r.style.translate = `${px.x * d * 2}px ${y * d * 0.25 + py.x * d * 2}px`; });
    });
  }

  /* ---------- Timeline line grows with scroll ---------- */
  const timeline = $(".timeline"), railFill = $(".rail i");
  if (timeline && railFill) {
    const railSpring = new Spring(90, 20, 0, v => (railFill.style.transform = `scaleY(${Math.min(1, Math.max(0, v))})`));
    if (reduce) railSpring.jump(1);
    else ticks.add(() => { const r = timeline.getBoundingClientRect(); railSpring.set((innerHeight * 0.6 - r.top) / r.height); });
  }

  /* ---------- Nav: scroll-spy + sliding underline (home only) ---------- */
  const links = $$(".links a[data-spy]"), underline = $(".links .underline");
  function moveUnderline(a) {
    if (!underline) return;
    if (!a) { underline.style.opacity = "0"; return; }
    underline.style.opacity = "1";
    underline.style.width = a.offsetWidth - 28 + "px";
    underline.style.transform = `translateX(${a.offsetLeft + 14}px)`;
  }
  const spyTargets = links.map(a => document.getElementById(a.dataset.spy)).filter(Boolean);
  if (spyTargets.length) {
    const band = { rootMargin: "-35% 0px -55% 0px" };
    const spy = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      links.forEach(a => a.classList.toggle("active", a.dataset.spy === en.target.id));
      moveUnderline(links.find(a => a.dataset.spy === en.target.id));
    }), band);
    spyTargets.forEach(s => spy.observe(s));
    const hero = $(".hero");
    hero && new IntersectionObserver(([en]) => {
      if (en.isIntersecting) { links.forEach(a => a.classList.remove("active")); moveUnderline(null); }
    }, band).observe(hero);
    addEventListener("resize", () => moveUnderline($(".links a.active")));
  }

  /* ---------- Mobile menu (circle reveal from the button) ---------- */
  const menuBtn = $(".menu-btn"), menu = $("#mobile-menu");
  function openMenu() {
    const r = menuBtn.getBoundingClientRect();
    menu.style.setProperty("--mx", r.left + r.width / 2 + "px");
    menu.style.setProperty("--my", r.top + r.height / 2 + "px");
    menu.classList.add("open"); root.classList.add("menu-open"); menu.removeAttribute("inert");
    menu.setAttribute("aria-hidden", "false"); menuBtn.setAttribute("aria-expanded", "true"); menuBtn.setAttribute("aria-label", "Close menu");
    lenis && lenis.stop();
  }
  function closeMenu() {
    if (!menu || !menu.classList.contains("open")) return;
    menu.classList.remove("open"); root.classList.remove("menu-open"); menu.setAttribute("inert", "");
    menu.setAttribute("aria-hidden", "true"); menuBtn.setAttribute("aria-expanded", "false"); menuBtn.setAttribute("aria-label", "Open menu");
    lenis && lenis.start();
  }
  if (menuBtn && menu) {
    menu.setAttribute("inert", "");
    menuBtn.addEventListener("click", () => (menu.classList.contains("open") ? closeMenu() : openMenu()));
    addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
  }

  /* ---------- Theme toggle (icon spins out, the next spins in) ---------- */
  const themeBtn = $(".theme-btn");
  const sysDark = matchMedia("(prefers-color-scheme: dark)");
  const saved = store.get("osaka-theme");
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;
  const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : sysDark.matches);
  function paintIcon() {
    const show = isDark() ? "sun" : "moon";
    $$(".theme-btn .ic").forEach(ic => {
      if (ic.dataset.ic === show) ic.classList.remove("pre", "out");
      else if (!ic.classList.contains("pre")) ic.classList.add("out");
    });
    setTimeout(() => $$(".theme-btn .ic.out").forEach(ic => {
      ic.style.transition = "none"; ic.classList.replace("out", "pre"); void ic.offsetWidth; ic.style.transition = "";
    }), 300);
  }
  if (themeBtn) {
    paintIcon();
    themeBtn.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      root.dataset.theme = next; store.set("osaka-theme", next); paintIcon();
    });
    sysDark.addEventListener && sysDark.addEventListener("change", () => { if (!root.dataset.theme) paintIcon(); });
  }

  /* ---------- Mouse-only: custom cursor, magnetic buttons, tilt cards ---------- */
  if (finePointer && !reduce) {
    root.classList.add("has-cursor");
    const dot = $(".cursor-dot"), ring = $(".cursor-ring"), ringLabel = $(".cursor-ring b");
    let mx = -100, my = -100;
    const rx = new Spring(320, 28, mx), ry = new Spring(320, 28, my);
    ticks.add(() => {
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      ring.style.transform = `translate3d(${rx.x - ring.offsetWidth / 2}px, ${ry.x - ring.offsetHeight / 2}px, 0)`;
    });
    let first = true;
    addEventListener("pointermove", e => {
      mx = e.clientX; my = e.clientY;
      if (first) { rx.jump(mx); ry.jump(my); first = false; } else { rx.set(mx); ry.set(my); }
    }, { passive: true });
    document.addEventListener("pointerleave", () => { dot.classList.add("hide"); ring.classList.add("hide"); });
    document.addEventListener("pointerenter", () => { dot.classList.remove("hide"); ring.classList.remove("hide"); });
    document.addEventListener("pointerover", e => {
      const labelled = e.target.closest("[data-cursor-label]");
      const linkish = e.target.closest("a, button");
      const innerLink = linkish && labelled && labelled !== linkish && labelled.contains(linkish) && linkish.closest(".card-links");
      if (labelled && !innerLink) { ring.className = "cursor-ring label"; ringLabel.textContent = labelled.dataset.cursorLabel; }
      else if (linkish) ring.className = "cursor-ring link";
      else ring.className = "cursor-ring";
    });

    $$("[data-magnetic]").forEach(el => {
      const strength = parseFloat(el.dataset.magnetic) || 0.3;
      const sx = new Spring(220, 18, 0), sy = new Spring(220, 18, 0);
      sx.onUpdate = sy.onUpdate = () => (el.style.transform = `translate3d(${sx.x}px, ${sy.x}px, 0)`);
      el.addEventListener("pointermove", e => {
        const r = el.getBoundingClientRect();
        sx.set((e.clientX - (r.left + r.width / 2)) * strength);
        sy.set((e.clientY - (r.top + r.height / 2)) * strength);
      });
      el.addEventListener("pointerleave", () => { sx.set(0); sy.set(0); });
    });

    $$("[data-tilt]").forEach(card => {
      const MAX = 9;
      const tx = new Spring(170, 20, 0), ty = new Spring(170, 20, 0);
      tx.onUpdate = ty.onUpdate = () => (card.style.transform = `rotateX(${tx.x}deg) rotateY(${ty.x}deg)`);
      card.addEventListener("pointermove", e => {
        const r = card.getBoundingClientRect();
        ty.set(((e.clientX - r.left) / r.width - 0.5) * MAX * 2);
        tx.set(-((e.clientY - r.top) / r.height - 0.5) * MAX * 2);
      });
      card.addEventListener("pointerleave", () => { tx.set(0); ty.set(0); });
    });
  }

  /* ---------- Marquee: repeat the row, then add a twin for a seamless loop ---------- */
  $$(".marquee .track").forEach(track => {
    const row = track.firstElementChild;
    const html = row.innerHTML;
    while (row.scrollWidth < innerWidth * 1.1 && row.children.length < 200) row.insertAdjacentHTML("beforeend", html);
    track.append(row.cloneNode(true));
  });
})();
