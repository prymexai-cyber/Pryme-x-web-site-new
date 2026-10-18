/* ==========================================================================
   King Ravana — 3D painting (Pryme X AI)
   The original painting, unchanged, given real depth: the heads, face, armour
   and sword sit at their own distances and the whole scene tilts with the
   mouse (or gently on its own on phones).

   Use:  <div data-ravana3d style="height:700px"></div>
         <script type="module" src="ravana3d/ravana3d.js"></script>
   Options (data- attributes, all optional):
     data-tilt="0.24"    how far it turns with the mouse
     data-depth="0.32"   how deep the 3D effect is
     data-light="0.16"   moving light on the armour (0 = off)
     data-embers="on"    floating fire embers ("off" to hide)
     data-fit="contain"  "contain" shows the whole painting, "cover" fills the box
     data-offset="0"     move the painting left/right (-0.5 … 0.5 of the box width)
     data-fade="0.12"    soft fade at the edges (0 = hard edges)
   ========================================================================== */
import * as THREE from 'three';

const HERE = new URL('.', import.meta.url).href;
const IMG = HERE + 'ravana.jpg', DEPTH = HERE + 'ravana-depth.png';
const COARSE = matchMedia('(pointer: coarse)').matches;

const vert = `
  uniform sampler2D depthMap; uniform float depthScale;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    float d = texture2D(depthMap, uv).r;
    vec3 p = position + vec3(0.0, 0.0, (d - 0.35) * depthScale);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const frag = `
  uniform sampler2D map; uniform sampler2D depthMap; uniform vec2 texel; uniform vec3 lightDir;
  uniform float light; uniform float fade; uniform float time;
  varying vec2 vUv;
  void main(){
    vec4 c = texture2D(map, vUv);
    float dx = texture2D(depthMap, vUv + vec2(texel.x, 0.0)).r - texture2D(depthMap, vUv - vec2(texel.x, 0.0)).r;
    float dy = texture2D(depthMap, vUv + vec2(0.0, texel.y)).r - texture2D(depthMap, vUv - vec2(0.0, texel.y)).r;
    vec3 n = normalize(vec3(-dx * 6.0, -dy * 6.0, 1.0));
    float diff = dot(n, normalize(lightDir));
    float spec = pow(max(dot(reflect(-normalize(lightDir), n), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);
    vec3 col = c.rgb * (1.0 + light * (diff - 0.85)) + vec3(1.0, 0.72, 0.38) * spec * light * 0.9;
    float e = 1.0;
    if (fade > 0.0) {
      vec2 q = min(vUv, 1.0 - vUv);
      e = smoothstep(0.0, fade, q.x) * smoothstep(0.0, fade * 0.7, q.y);
    }
    gl_FragColor = vec4(col, e);
    #include <colorspace_fragment>
  }`;

function emberField(count, w, h) {
  const g = new THREE.BufferGeometry(); const p = new Float32Array(count * 3); const s = new Float32Array(count);
  for (let i = 0; i < count; i++) { p[i * 3] = (Math.random() - 0.5) * w; p[i * 3 + 1] = (Math.random() - 0.5) * h; p[i * 3 + 2] = 0.05 + Math.random() * 0.35; s[i] = Math.random(); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, h: { value: h }, px: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: `attribute float seed; uniform float time; uniform float h; uniform float px; varying float vA;
      void main(){ vec3 p = position; float t = fract(seed + time * (0.04 + seed * 0.05));
        p.y = -h * 0.5 + t * h; p.x += sin(time * 0.8 + seed * 40.0) * 0.03;
        vA = sin(t * 3.14159) * (0.4 + seed * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + seed * 4.0) * px * (1.0 / -mv.z) * 2.2; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * 1.4, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(g, m);
}

export function mountRavana3D(el, o = {}) {
  const ds = el.dataset;
  const opt = {
    tilt: +(o.tilt ?? ds.tilt ?? 0.24), depth: +(o.depth ?? ds.depth ?? 0.32), light: +(o.light ?? ds.light ?? 0.16),
    embers: (o.embers ?? ds.embers ?? 'on') !== 'off', fit: o.fit ?? ds.fit ?? 'contain', offset: +(o.offset ?? ds.offset ?? 0), fade: +(o.fade ?? ds.fade ?? 0.12),
  };
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.5 : 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const loader = new THREE.TextureLoader();
  const map = loader.load(IMG); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const depthMap = loader.load(DEPTH);
  const ASPECT = 860 / 1275, PH = 2, PW = PH * ASPECT;
  const segX = COARSE ? 180 : 300, segY = Math.round(segX / ASPECT);
  const uniforms = { map: { value: map }, depthMap: { value: depthMap }, depthScale: { value: opt.depth }, texel: { value: new THREE.Vector2(1 / 860, 1 / 1275) },
    lightDir: { value: new THREE.Vector3(0.3, 0.5, 1) }, light: { value: opt.light }, fade: { value: opt.fade }, time: { value: 0 } };
  const art = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH, segX, segY), new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, transparent: true }));
  const group = new THREE.Group(); group.add(art); scene.add(group);
  let embers = null; if (opt.embers) { embers = emberField(COARSE ? 70 : 140, PW * 1.1, PH); group.add(embers); }

  let w = 1, h = 1;
  function resize() {
    w = el.clientWidth || 1; h = el.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h;
    const fitH = opt.fit === 'cover' ? Math.min(PH, PW / camera.aspect) : Math.max(PH, PW / camera.aspect);
    const dist = (fitH * 1.08 / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const off = opt.offset * (fitH * camera.aspect);
    camera.position.set(-off, 0, dist); camera.lookAt(-off, 0, 0); camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(el); resize();

  let visible = true; new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: '100px' }).observe(el);
  const ptr = { x: 0, y: 0, last: -1e9 };
  addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; const r = el.getBoundingClientRect(); ptr.x = Math.max(-1.5, Math.min(1.5, ((e.clientX - r.left) / r.width) * 2 - 1)); ptr.y = Math.max(-1.5, Math.min(1.5, -(((e.clientY - r.top) / r.height) * 2 - 1))); ptr.last = performance.now(); }, { passive: true });
  let rx = 0, ry = 0, last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop); if (!visible) { last = now; return; }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; const t = now / 1000;
    const idle = now - ptr.last > 2500;
    const tx = idle ? Math.sin(t * 0.35) * 0.6 : ptr.x, ty = idle ? Math.sin(t * 0.27) * 0.35 : ptr.y;
    const k = 1 - Math.exp(-3 * dt);
    ry += (tx * opt.tilt - ry) * k; rx += (-ty * opt.tilt * 0.6 - rx) * k;
    group.rotation.set(rx, ry, 0); group.position.y = Math.sin(t * 0.8) * 0.006;
    uniforms.lightDir.value.set(tx * 0.8, ty * 0.6 + 0.3, 1); uniforms.time.value = t;
    if (embers) embers.material.uniforms.time.value = t;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
  return { renderer, scene, camera };
}

function boot() { document.querySelectorAll('[data-ravana3d]').forEach((el) => { if (!el.__r3d) { el.__r3d = true; try { mountRavana3D(el); } catch (e) { console.error('Ravana 3D', e); } } }); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
