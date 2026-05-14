/* ═══════════════════════════════════════════════════════════════
   MFX-FLOW · landing · interactions
═══════════════════════════════════════════════════════════════ */

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 720px)').matches;
  // Pixel ratio optimalizace — na mobilu vždy 1 (šetří GPU & baterku)
  const optimalPixelRatio = () => isMobile ? 1 : Math.min(window.devicePixelRatio, 2);

  /* ─── Hero scroll progress meter ─── */
  const heroFill = document.getElementById('hero-meter');
  const heroNum  = document.getElementById('hero-meter-num');
  function updateHeroMeter() {
    const hero = document.getElementById('hero');
    if (!hero) return;
    const h = hero.offsetHeight;
    const y = Math.min(Math.max(window.scrollY / h, 0), 1);
    if (heroFill) heroFill.style.width = (y * 100).toFixed(1) + '%';
    if (heroNum)  heroNum.textContent  = String(Math.round(y * 100)).padStart(3, '0');
  }
  window.addEventListener('scroll', updateHeroMeter, { passive: true });
  updateHeroMeter();

  /* ═══════════════════════════════════════════════════════════════
     HERO — Three.js scroll-scrubbed wave / ribbon
     A plane mesh whose vertices are pushed by layered noise.
     Scroll drives camera dolly + wave amplitude + color shift.
  ═══════════════════════════════════════════════════════════════ */
  function initHeroCanvas() {
    if (!window.THREE) return;
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: !isMobile, alpha: true,
      powerPreference: isMobile ? 'low-power' : 'high-performance'
    });
    renderer.setPixelRatio(optimalPixelRatio());

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 1.4, 4.6);
    camera.lookAt(0, 0, 0);

    // Custom shader plane — flowing horizontal ribbons
    // Na mobilu menší segmentace = méně vertexů = méně práce GPU
    const W = 14, H = 8;
    const SEG_W = isMobile ? 90 : 220;
    const SEG_H = isMobile ? 50 : 120;
    const geom = new THREE.PlaneGeometry(W, H, SEG_W, SEG_H);

    const uniforms = {
      uTime:     { value: 0 },
      uScroll:   { value: 0 },
      uMouse:    { value: new THREE.Vector2(0, 0) },
      uColorA:   { value: new THREE.Color('#7CC8FF') },
      uColorB:   { value: new THREE.Color('#3568D4') },
      uColorC:   { value: new THREE.Color('#0B1628') },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: `
        uniform float uTime;
        uniform float uScroll;
        uniform vec2  uMouse;
        varying vec2  vUv;
        varying float vHeight;

        // 2D noise (cheap)
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float noise(vec2 p){
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f*f*(3.0 - 2.0*f);
          return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
        }

        void main(){
          vUv = uv;
          vec3 pos = position;

          float t = uTime * 0.18;
          float scr = uScroll;

          // Layered horizontal waves
          float wave1 = sin(pos.x * 1.3 + t * 1.6) * 0.25;
          float wave2 = sin(pos.x * 0.6 - t * 0.9 + pos.y * 0.4) * 0.45;
          float n = noise(vec2(pos.x * 0.4 + t, pos.y * 0.5 - t * 0.3)) - 0.5;

          float amp = mix(0.55, 1.4, scr);
          float disp = (wave1 + wave2 * 1.1 + n * 1.6) * amp;

          // Mouse parallax — push surface toward cursor
          float md = length(pos.xy - uMouse * 3.0);
          disp += smoothstep(2.6, 0.0, md) * 0.5;

          pos.z += disp;
          vHeight = disp;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        uniform float uScroll;
        varying vec2 vUv;
        varying float vHeight;

        void main(){
          float h = clamp(vHeight * 0.6 + 0.5, 0.0, 1.0);

          // Iridescent gradient driven by height + uv
          vec3 col = mix(uColorC, uColorB, smoothstep(0.0, 0.6, h));
          col = mix(col, uColorA, smoothstep(0.55, 1.0, h));

          // Horizontal scan lines for ribbon feel
          float lines = sin(vUv.y * 220.0) * 0.5 + 0.5;
          col *= mix(0.78, 1.04, lines);

          // Vignette / falloff toward edges so it merges into bg
          float vig = smoothstep(1.0, 0.18, length(vUv - 0.5) * 1.4);
          col *= vig * (0.7 + uScroll * 0.6);

          float alpha = vig;
          gl_FragColor = vec4(col, alpha);
        }
      `
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI * 0.42;
    mesh.position.y = -0.4;
    scene.add(mesh);

    // Resize
    function resize() {
      const r = canvas.getBoundingClientRect();
      const w = r.width, h = r.height;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    // Mouse
    const mouse = new THREE.Vector2(0, 0);
    const targetMouse = new THREE.Vector2(0, 0);
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      targetMouse.x =  ((e.clientX - r.left) / r.width  - 0.5) * 2;
      targetMouse.y = -((e.clientY - r.top)  / r.height - 0.5) * 2;
    });

    // Render loop
    let scrollProg = 0;
    function getScrollProg() {
      const hero = document.getElementById('hero');
      if (!hero) return 0;
      return Math.min(Math.max(window.scrollY / hero.offsetHeight, 0), 1);
    }

    let raf = 0;
    function tick(t) {
      uniforms.uTime.value = t * 0.001;

      // Smooth mouse
      mouse.lerp(targetMouse, 0.08);
      uniforms.uMouse.value.copy(mouse);

      // Smooth scroll
      const target = getScrollProg();
      scrollProg += (target - scrollProg) * 0.08;
      uniforms.uScroll.value = scrollProg;

      // Camera dolly on scroll
      camera.position.z = 4.6 - scrollProg * 1.6;
      camera.position.y = 1.4 - scrollProg * 0.7;
      camera.rotation.x = -scrollProg * 0.18;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    // Pause when offscreen
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          if (!raf) raf = requestAnimationFrame(tick);
        } else {
          cancelAnimationFrame(raf); raf = 0;
        }
      }
    }, { threshold: 0 });
    io.observe(canvas);
  }
  initHeroCanvas();

  /* ═══════════════════════════════════════════════════════════════
     SOLUTION — iridescent glass orb
     Sphere with custom shader (fresnel + flowing color),
     reacts to cursor + scroll
  ═══════════════════════════════════════════════════════════════ */
  function initOrb() {
    if (!window.THREE) return;
    const canvas = document.getElementById('orb-canvas');
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true });
    renderer.setPixelRatio(optimalPixelRatio());
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 4.5);

    const geom = new THREE.IcosahedronGeometry(1.4, 64);

    const uniforms = {
      uTime:   { value: 0 },
      uMouse:  { value: new THREE.Vector2(0,0) },
      uScroll: { value: 0 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: `
        uniform float uTime;
        uniform vec2  uMouse;
        varying vec3 vNormal;
        varying vec3 vPos;

        // simplex-ish noise
        vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
        vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
        vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
        float snoise(vec3 v){
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0*floor(p*ns.z*ns.z);
          vec4 x_ = floor(j*ns.z);
          vec4 y_ = floor(j - 7.0*x_);
          vec4 x = x_*ns.x + ns.yyyy;
          vec4 y = y_*ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m*m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main(){
          vec3 p = position;
          float t = uTime * 0.4;
          float n = snoise(p * 1.4 + vec3(t, t*0.6, -t));
          float n2 = snoise(p * 2.6 - vec3(t*0.4));
          float disp = n * 0.18 + n2 * 0.06;
          // mouse pull
          disp += (uMouse.x * 0.05) * p.x;
          p += normal * disp;

          vNormal = normalize(normalMatrix * normal);
          vPos = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uScroll;
        varying vec3 vNormal;
        varying vec3 vPos;
        void main(){
          vec3 viewDir = normalize(-vPos);
          float fres = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.4);
          float t = uTime * 0.2;

          // iridescent palette
          vec3 a = vec3(0.49, 0.78, 1.00); // ocean
          vec3 b = vec3(0.21, 0.41, 0.83); // ocean-deep
          vec3 c = vec3(0.94, 0.91, 0.84); // bone
          vec3 d = vec3(0.04, 0.06, 0.12); // ink

          float angle = atan(vNormal.y, vNormal.x) + t;
          float k = 0.5 + 0.5 * sin(angle * 2.0 + vNormal.z * 3.0);

          vec3 base = mix(d, b, smoothstep(0.0, 0.4, k));
          base = mix(base, a, smoothstep(0.4, 0.85, k));
          base = mix(base, c, fres * 0.85);

          float alpha = mix(0.55, 0.9, fres);
          gl_FragColor = vec4(base, alpha);
        }
      `
    });

    const orb = new THREE.Mesh(geom, mat);
    scene.add(orb);

    // Halo ring
    const ringGeo = new THREE.RingGeometry(1.7, 1.78, 128);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x7CC8FF, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.4;
    scene.add(ring);

    function resize() {
      const r = canvas.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    const mouseT = new THREE.Vector2(0,0);
    const mouseS = new THREE.Vector2(0,0);
    window.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      mouseT.x = ((e.clientX - r.left) / r.width  - 0.5) * 2;
      mouseT.y = -((e.clientY - r.top) / r.height - 0.5) * 2;
    });

    function getSectionScrollProg() {
      const sec = document.getElementById('reseni');
      if (!sec) return 0;
      const r = sec.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(Math.max((vh - r.top) / (vh + r.height), 0), 1);
    }

    let raf = 0;
    let active = false;
    function tick(t) {
      uniforms.uTime.value = t * 0.001;
      mouseS.lerp(mouseT, 0.06);
      uniforms.uMouse.value.copy(mouseS);

      const sp = getSectionScrollProg();
      uniforms.uScroll.value = sp;

      orb.rotation.y = t * 0.0001 + mouseS.x * 0.4;
      orb.rotation.x = mouseS.y * 0.3 + sp * 0.4;

      ring.rotation.z = t * 0.00015;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          if (!active) { active = true; raf = requestAnimationFrame(tick); }
        } else {
          active = false;
          cancelAnimationFrame(raf); raf = 0;
        }
      }
    }, { threshold: 0 });
    io.observe(canvas);
  }
  initOrb();

  /* ═══════════════════════════════════════════════════════════════
     LOSS section — static; no JS counter needed (numbers are fixed).
  ═══════════════════════════════════════════════════════════════ */
  function initLossCounter() {
    // Static section now — no animation required.
    return;
  }
  initLossCounter();

  /* ═══════════════════════════════════════════════════════════════
     OPPS DOTS — 312 lights, 24 ember (without web), 218 blue (with),
     70 mute (other channels). Animate in waves on view.
  ═══════════════════════════════════════════════════════════════ */
  function initDots() {
    const grid = document.getElementById('dots-grid');
    if (!grid) return;
    const TOTAL = 312;

    // Build assignment array
    const arr = [];
    for (let i = 0; i < 24;  i++) arr.push('ember');
    for (let i = 0; i < 218; i++) arr.push('blue');
    for (let i = 0; i < 70;  i++) arr.push('mute');
    // shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    const frag = document.createDocumentFragment();
    for (let i = 0; i < TOTAL; i++) {
      const el = document.createElement('i');
      el.dataset.kind = arr[i];
      frag.appendChild(el);
    }
    grid.appendChild(frag);

    let lit = false;
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting && !lit) {
          lit = true;
          const items = [...grid.children];
          // First, light blue + mute together (the helpful background)
          items.forEach((el, i) => {
            const k = el.dataset.kind;
            if (k === 'ember') return;
            const cls = k === 'blue' ? 'is-blue' : 'is-mute';
            setTimeout(() => el.classList.add(cls), 8 * i);
          });
          // Then highlight the 24 ember dots dramatically last
          setTimeout(() => {
            items.forEach((el) => {
              if (el.dataset.kind === 'ember') {
                setTimeout(() => el.classList.add('is-ember'), Math.random() * 600);
              }
            });
          }, 8 * items.length);
        }
      }
    }, { threshold: 0.2 });
    io.observe(grid);
  }
  initDots();

  /* ═══════════════════════════════════════════════════════════════
     Portfolio cards — pointer-driven 3D tilt
  ═══════════════════════════════════════════════════════════════ */
  function initTilt() {
    if (reduceMotion) return;
    const cards = document.querySelectorAll('[data-tilt]');
    cards.forEach((card) => {
      let raf = 0;
      let tx = 0, ty = 0, cx = 0, cy = 0;

      function onMove(e) {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width  - 0.5;
        const py = (e.clientY - r.top)  / r.height - 0.5;
        tx = py * -12; // rotateX
        ty = px *  16; // rotateY
        if (!raf) raf = requestAnimationFrame(loop);
      }
      function onLeave() {
        tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(loop);
      }
      function loop() {
        cx += (tx - cx) * 0.12;
        cy += (ty - cy) * 0.12;
        card.style.transform = `perspective(1400px) rotateX(${cx.toFixed(2)}deg) rotateY(${cy.toFixed(2)}deg) translateZ(0)`;
        if (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) {
          raf = requestAnimationFrame(loop);
        } else { raf = 0; }
      }
      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerleave', onLeave);
    });
  }
  initTilt();

  /* ═══════════════════════════════════════════════════════════════
     PROCESS — 3D laptop with sections flying onto screen
  ═══════════════════════════════════════════════════════════════ */
  function initLaptop(){
    if (!window.THREE) return;
    const canvas = document.getElementById('laptop-canvas');
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true });
    renderer.setPixelRatio(optimalPixelRatio());
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0.6, 0.9, 4.2);
    camera.lookAt(0, 0.1, 0);

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dl = new THREE.DirectionalLight(0xffffff, 1.1);
    dl.position.set(2, 4, 3); scene.add(dl);
    const rim = new THREE.DirectionalLight(0x7CC8FF, 0.7);
    rim.position.set(-3, 2, -2); scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);

    // base / keyboard deck
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a2235, metalness: 0.6, roughness: 0.4 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.7), baseMat);
    base.position.y = -0.04; group.add(base);
    // keyboard stripe
    const kb = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.005, 1.3), new THREE.MeshStandardMaterial({ color: 0x0c1322, metalness: 0.2, roughness: 0.7 }));
    kb.position.y = 0.005; group.add(kb);

    // screen
    const screenGroup = new THREE.Group();
    const screenBack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.65, 0.06), baseMat);
    screenGroup.add(screenBack);
    const screenFace = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 1.5), new THREE.MeshBasicMaterial({ color: 0x07101F }));
    screenFace.position.z = 0.031; screenGroup.add(screenFace);
    screenGroup.position.set(0, 0.85, -0.83);
    screenGroup.rotation.x = -0.18;
    group.add(screenGroup);

    // animated UI blocks on screen
    const blocks = [];
    const colors = [0x7CC8FF, 0x3568D4, 0xF2A24A, 0x6FE3B0, 0xF2EEE5];
    const layout = [
      { x: -0.8, y:  0.55, w: 2.1, h: 0.16, c: 0 }, // header
      { x: -0.8, y:  0.18, w: 1.1, h: 0.42, c: 4 }, // hero text
      { x:  0.5, y:  0.18, w: 0.8, h: 0.42, c: 1 }, // hero image
      { x: -0.8, y: -0.30, w: 0.65, h: 0.30, c: 2 }, // card 1
      { x: -0.05, y: -0.30, w: 0.65, h: 0.30, c: 3 }, // card 2
      { x:  0.65, y: -0.30, w: 0.65, h: 0.30, c: 0 }, // card 3
    ];
    layout.forEach((b, i) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(b.w, b.h),
        new THREE.MeshBasicMaterial({ color: colors[b.c], transparent: true, opacity: 0 })
      );
      m.position.set(b.x + b.w/2, b.y + b.h/2, 0.04);
      screenGroup.add(m);
      blocks.push({ mesh: m, target: 0, delay: i * 280 });
    });

    function resize() {
      const r = canvas.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    // mouse parallax
    const mt = { x:0, y:0 }; const ms = { x:0, y:0 };
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      mt.x = ((e.clientX - r.left) / r.width  - 0.5) * 2;
      mt.y = ((e.clientY - r.top)  / r.height - 0.5) * 2;
    });
    canvas.addEventListener('pointerleave', () => { mt.x = 0; mt.y = 0; });

    let started = 0;
    let raf = 0; let active = false;

    function tick(t) {
      if (!started) started = t;
      const elapsed = t - started;

      ms.x += (mt.x - ms.x) * 0.06;
      ms.y += (mt.y - ms.y) * 0.06;
      group.rotation.y = ms.x * 0.25;
      group.rotation.x = ms.y * 0.10;

      // animate blocks in
      blocks.forEach((b) => {
        const target = elapsed > b.delay ? 1 : 0;
        b.target += (target - b.target) * 0.06;
        b.mesh.material.opacity = b.target * 0.85;
        b.mesh.scale.x = 0.3 + b.target * 0.7;
        b.mesh.scale.y = 0.3 + b.target * 0.7;
      });

      // restart after 5.5s for replay
      if (elapsed > 5500) { started = t + 800; blocks.forEach(b => { b.target = 0; b.mesh.material.opacity = 0; }); }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting && !active) { active = true; started = 0; raf = requestAnimationFrame(tick); }
        else if (!en.isIntersecting && active) { active = false; cancelAnimationFrame(raf); raf = 0; }
      }
    }, { threshold: 0.2 });
    io.observe(canvas);
  }
  initLaptop();

  /* ═══════════════════════════════════════════════════════════════
     PROOF — 3D globe with pulsing locations
  ═══════════════════════════════════════════════════════════════ */
  function initGlobe(){
    if (!window.THREE) return;
    const canvas = document.getElementById('globe-canvas');
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true });
    renderer.setPixelRatio(optimalPixelRatio());
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0.5, 3.2);

    const globeG = new THREE.Group();
    scene.add(globeG);

    // sphere base — point cloud "earth"
    // Na mobilu menší segmentace sféry (32×24 místo 64×48)
    const radius = 1.1;
    const segW = isMobile ? 32 : 64;
    const segH = isMobile ? 24 : 48;
    const sphereGeom = new THREE.SphereGeometry(radius, segW, segH);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x1c2c4a, wireframe: true, transparent: true, opacity: 0.55 });
    const wireSphere = new THREE.Mesh(sphereGeom, wireMat);
    globeG.add(wireSphere);

    // glow shader sphere
    const glowGeom = new THREE.SphereGeometry(radius * 1.06, segW, segH);
    const glowMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {},
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vN;
        void main(){
          float f = pow(1.0 - max(vN.z, 0.0), 2.5);
          gl_FragColor = vec4(0.49, 0.78, 1.0, f * 0.5);
        }`
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    globeG.add(glow);

    // 14 locations roughly clustered on Czech / Slovak coords
    const locations = [
      [49.19, 16.61], // Brno
      [50.08, 14.43], // Praha
      [49.83, 18.28], // Ostrava
      [49.59, 17.25], // Olomouc
      [50.66, 14.06], // Decin
      [49.74, 13.38], // Plzen
      [49.42, 14.04], // Strakonice
      [48.97, 14.47], // Ceske Budejovice
      [50.20, 15.83], // Hradec
      [49.34, 18.74], // Vsetin
      [48.17, 17.10], // Bratislava
      [48.30, 18.08], // Nitra
      [49.30, 19.30], // Liptov
      [49.06, 20.30], // Poprad
    ];

    function latLonToVec3(lat, lon, r){
      const phi   = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      const x = -(r * Math.sin(phi) * Math.cos(theta));
      const z =   r * Math.sin(phi) * Math.sin(theta);
      const y =   r * Math.cos(phi);
      return new THREE.Vector3(x, y, z);
    }

    const pinGroup = new THREE.Group();
    globeG.add(pinGroup);
    const pins = [];

    locations.forEach((loc, i) => {
      const pos = latLonToVec3(loc[0], loc[1], radius);
      // pin core
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x7CC8FF })
      );
      core.position.copy(pos);
      pinGroup.add(core);
      // beam
      const beamGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.18, 6);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0x7CC8FF, transparent: true, opacity: 0.55 });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.copy(pos.clone().multiplyScalar(1.08));
      beam.lookAt(0, 0, 0);
      beam.rotateX(Math.PI / 2);
      pinGroup.add(beam);
      // ring (pulses)
      const ringGeo = new THREE.RingGeometry(0.025, 0.028, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x7CC8FF, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos.clone().multiplyScalar(1.001));
      ring.lookAt(pos.clone().multiplyScalar(2));
      pinGroup.add(ring);
      pins.push({ ring, ringMat, phase: i * 0.45 });
    });

    function resize() {
      const r = canvas.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    let raf = 0; let active = false;
    function tick(t) {
      const sec = t * 0.001;
      globeG.rotation.y = sec * 0.22;
      globeG.rotation.x = -0.25 + Math.sin(sec * 0.3) * 0.05;

      pins.forEach(p => {
        const phase = (sec + p.phase) % 2;
        const k = phase / 2;
        p.ring.scale.setScalar(1 + k * 4);
        p.ringMat.opacity = (1 - k) * 0.7;
      });

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting && !active) { active = true; raf = requestAnimationFrame(tick); }
        else if (!en.isIntersecting && active) { active = false; cancelAnimationFrame(raf); raf = 0; }
      }
    }, { threshold: 0.1 });
    io.observe(canvas);
  }
  initGlobe();

  /* ═══════════════════════════════════════════════════════════════
     CTA + FOOTER clocks (Europe/Prague)
  ═══════════════════════════════════════════════════════════════ */
  function tickClocks() {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('cs-CZ', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Europe/Prague', hour12: false
    });
    const fmtShort = new Intl.DateTimeFormat('cs-CZ', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Prague', hour12: false
    });
    const f = document.getElementById('footer-clock');
    const t = document.getElementById('cta-time');
    if (f) f.textContent = fmt.format(now) + ' · ZLÍN';
    if (t) t.textContent = fmtShort.format(now);
  }
  tickClocks();
  setInterval(tickClocks, 1000);

  /* ═══════════════════════════════════════════════════════════════
     Reveal-on-scroll for sections (subtle)
  ═══════════════════════════════════════════════════════════════ */
  const revealEls = document.querySelectorAll('.section-head, .vs__col, .opp, .pkg, .step, .testi, .proof-stat, .counter');
  revealEls.forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity .9s var(--ease-out, cubic-bezier(.2,.8,.2,1)), transform .9s var(--ease-out, cubic-bezier(.2,.8,.2,1))';
  });
  const revIO = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.style.opacity = '1';
        en.target.style.transform = 'translateY(0)';
        revIO.unobserve(en.target);
      }
    }
  }, { threshold: 0.12 });
  revealEls.forEach((el) => revIO.observe(el));

  // ═══ Hero Infinite Grid ════════════════════════════════════
  (function initHeroGrid() {
    const hero = document.getElementById('hero');
    if (!hero) return;
    const CELL = 40, SPEED = 0.5;
    let ox = 0, oy = 0;

    function makeGrid(id) {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      const defs = document.createElementNS(NS, 'defs');
      const pat  = document.createElementNS(NS, 'pattern');
      pat.setAttribute('id', id);
      pat.setAttribute('width', CELL);
      pat.setAttribute('height', CELL);
      pat.setAttribute('patternUnits', 'userSpaceOnUse');
      pat.setAttribute('x', 0);
      pat.setAttribute('y', 0);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', 'M ' + CELL + ' 0 L 0 0 0 ' + CELL);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'white');
      path.setAttribute('stroke-width', '1');
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('width', '100%');
      rect.setAttribute('height', '100%');
      rect.setAttribute('fill', 'url(#' + id + ')');
      pat.appendChild(path); defs.appendChild(pat);
      svg.appendChild(defs); svg.appendChild(rect);
      return { svg, pat };
    }

    const sDiv = document.createElement('div');
    sDiv.className = 'hero__grid-static';
    const { svg: sA, pat: pA } = makeGrid('hg-static');
    sDiv.appendChild(sA);

    const rDiv = document.createElement('div');
    rDiv.className = 'hero__grid-reveal';
    const { svg: sB, pat: pB } = makeGrid('hg-reveal');
    rDiv.appendChild(sB);

    const veil = hero.querySelector('.hero__veil');
    if (veil) { veil.after(sDiv, rDiv); } else { hero.prepend(sDiv, rDiv); }

    hero.addEventListener('mousemove', function(e) {
      const r = hero.getBoundingClientRect();
      const g = 'radial-gradient(300px circle at ' + (e.clientX - r.left) + 'px ' + (e.clientY - r.top) + 'px, black, transparent)';
      rDiv.style.webkitMaskImage = g;
      rDiv.style.maskImage = g;
    });
    hero.addEventListener('mouseleave', function() {
      const g = 'radial-gradient(0px circle, transparent, transparent)';
      rDiv.style.webkitMaskImage = g;
      rDiv.style.maskImage = g;
    });

    (function tick() {
      ox = (ox + SPEED) % CELL;
      oy = (oy + SPEED) % CELL;
      pA.setAttribute('x', ox); pA.setAttribute('y', oy);
      pB.setAttribute('x', ox); pB.setAttribute('y', oy);
      requestAnimationFrame(tick);
    })();
  })();

})();
