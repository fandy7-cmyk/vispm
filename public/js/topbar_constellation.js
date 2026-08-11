/* ═══════════════════════════════════════════════════════════════════════════
   Topbar Constellation Drift
   Partikel teal melayang bebas di ruang antara logo & profil topbar,
   sesekali kekoneksi garis tipis saat saling berdekatan ("jaringan hidup").
   Warna disamakan dengan partikel orbit logo (.sbpp) di sidebar-header.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const container = document.getElementById('topbarConstellation');
  const canvas = document.getElementById('topbarConstellationCanvas');
  if (!container || !canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PALETTE = ['#2dd4bf', '#5eead4', '#14b8a6', '#0d9488', '#ffffff'];
  const LINK_DIST = 85;       // jarak maksimum buat garis penghubung antar partikel
  const PARTICLE_GAP = 42;    // makin lebar area, makin banyak partikel
  const MIN_PARTICLES = 6;
  const MAX_PARTICLES = 24;

  let w = 0, h = 0, dpr = Math.max(1, window.devicePixelRatio || 1);
  let particles = [];
  let rafId = null;
  let running = false;

  function rand(min, max) { return min + Math.random() * (max - min); }

  function makeParticle() {
    return {
      x: rand(0, w),
      y: rand(0, h),
      vx: rand(-0.09, 0.09),
      vy: rand(-0.06, 0.06),
      r: rand(1, 2.1),
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      phase: rand(0, Math.PI * 2),
      speed: rand(0.6, 1.4)
    };
  }

  function buildParticles() {
    const count = Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, Math.round(w / PARTICLE_GAP)));
    particles = Array.from({ length: count }, makeParticle);
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    const newW = Math.max(0, Math.round(rect.width));
    const newH = Math.max(0, Math.round(rect.height));
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, newW * dpr);
    canvas.height = Math.max(1, newH * dpr);
    canvas.style.width = newW + 'px';
    canvas.style.height = newH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const prevW = w, prevH = h;
    const hadParticles = particles.length > 0;
    w = newW;
    h = newH;

    if (!hadParticles) {
      buildParticles();
      return;
    }

    // Skala ulang posisi partikel yang SUDAH ADA biar polanya tetap nyambung —
    // jangan di-random ulang total, itu penyebab konstelasi "loncat"/reset
    // tiap pindah menu (lebar topbar sering geser dikit gara-gara scrollbar
    // muncul/ilang saat konten halaman ganti).
    if (prevW > 0 && prevH > 0 && (prevW !== w || prevH !== h)) {
      const sx = w / prevW, sy = h / prevH;
      for (const p of particles) {
        p.x *= sx;
        p.y *= sy;
      }
    }

    // Jumlah partikel cuma disesuaikan seperlunya (nambah/kurang dikit),
    // bukan rebuild total array.
    const targetCount = Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, Math.round(w / PARTICLE_GAP)));
    while (particles.length < targetCount) particles.push(makeParticle());
    if (particles.length > targetCount) particles.length = targetCount;
  }

  function drawLinks(alphaMul) {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST) {
          const alpha = (1 - dist / LINK_DIST) * alphaMul;
          ctx.strokeStyle = `rgba(94, 234, 212, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }

  function step(t) {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
      if (p.y < -4) p.y = h + 4; else if (p.y > h + 4) p.y = -4;
    }

    drawLinks(0.35);

    for (const p of particles) {
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.001 * p.speed + p.phase));
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = twinkle;
      ctx.shadowBlur = 6;
      ctx.shadowColor = p.color;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    rafId = requestAnimationFrame(step);
  }

  function drawStaticFrame() {
    ctx.clearRect(0, 0, w, h);
    drawLinks(0.22);
    for (const p of particles) {
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.55;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function start() {
    if (running || w === 0 || h === 0) return;
    running = true;
    rafId = requestAnimationFrame(step);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function handleResize() {
    resize();
    if (prefersReducedMotion) drawStaticFrame();
  }

  let resizeTimer = null;
  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, 150);
  }
  window.addEventListener('resize', scheduleResize);
  if (window.ResizeObserver) {
    new ResizeObserver(scheduleResize).observe(container);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (!prefersReducedMotion) start();
  });

  // init
  resize();
  if (prefersReducedMotion) {
    drawStaticFrame();
  } else {
    start();
  }

  // Container tersembunyi (display:none) saat halaman pertama dimuat (masih di
  // layar login), jadi resize() di atas dapat w/h = 0 dan animasi belum start.
  // Expose hook ini biar app-core.js bisa langsung "nyalain ulang" persis saat
  // appLayout ditampilkan (bukan nunggu ResizeObserver, yang suka telat kena
  // antre di belakang kerjaan render dashboard yang berat).
  window.__topbarConstellationKick = function () {
    resize();
    if (prefersReducedMotion) drawStaticFrame(); else start();
  };
})();