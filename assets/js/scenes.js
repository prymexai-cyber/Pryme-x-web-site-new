/* ==========================================================================
   PRYME X AI — Real-time 3D scenes (Three.js, built 100% in code)
   Every model here is procedural geometry: no generated images, no watermarks.
   A scene mounts on any element with  data-scene="<name>".
   Names: pointer, bust, full, join, arm, drone, sentinel, ravana, mahasona,
          kashyapa, xray
   ========================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/addons/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/addons/RoundedBoxGeometry.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';

const COARSE = matchMedia('(pointer: coarse)').matches;
const SMALL = matchMedia('(max-width: 860px)').matches;
const DPR = Math.min(window.devicePixelRatio || 1, SMALL ? 1.5 : 1.85);
const SEG = SMALL ? 0.6 : 1;               // geometry detail multiplier
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BRAND_BLUE = 0x081b2c;

/* ---------- pointer (with automatic idle motion) ---------- */
const P = { cx: innerWidth / 2, cy: innerHeight * 0.4, last: -1e9, ax: 0, ay: 0 };
addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; P.cx = e.clientX; P.cy = e.clientY; P.last = performance.now(); }, { passive: true });
function pointerNow(t) {
  const idle = performance.now() - P.last > 2600;
  const ax = innerWidth * (0.5 + 0.34 * Math.sin(t * 0.45)), ay = innerHeight * (0.42 + 0.22 * Math.sin(t * 0.31 + 1));
  const k = idle ? 0.02 : 0.25;
  P.ax += ((idle ? ax : P.cx) - P.ax) * k; P.ay += ((idle ? ay : P.cy) - P.ay) * k;
  return [P.ax, P.ay];
}

/* ---------- helpers ---------- */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * Math.max(0, dt)));
const seg = (n) => Math.max(6, Math.round(n * SEG));

function mats() {
  return {
    white: new THREE.MeshPhysicalMaterial({ color: 0xf3f4f7, roughness: 0.36, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.22, sheen: 0.4, sheenColor: new THREE.Color(0xdfe6ff) }),
    ceramic: new THREE.MeshPhysicalMaterial({ color: 0xf1f1ee, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
    seam: new THREE.MeshStandardMaterial({ color: 0xb9bdc8, roughness: 0.6 }),
    black: new THREE.MeshPhysicalMaterial({ color: 0x040509, roughness: 0.05, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.45, metalness: 0.55 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe3e7ee, roughness: 0.14, metalness: 1 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xd4d8e0, roughness: 0.24, metalness: 0.92 }),
    blue: new THREE.MeshPhysicalMaterial({ color: BRAND_BLUE, roughness: 0.25, metalness: 0.3, clearcoat: 1, emissive: 0x081b2c, emissiveIntensity: 0.25 }),
    glow: new THREE.MeshBasicMaterial({ color: 0x9fc6e8, toneMapped: false }),
    glowWhite: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  };
}
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; }
function lathe(pts, n = 64) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([r, y]) => V(r, y, 0)));
  const p = curve.getPoints(48).map((v) => new THREE.Vector2(Math.max(0.0005, v.x), v.y));
  return new THREE.LatheGeometry(p, seg(n));
}
function tube(points, r, mat, parent, segs = 40) {
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => V(...p))), segs, r, 8, false);
  return mesh(g, mat, 0, 0, 0, parent);
}
function shadowBlob(size = 1.6, o = 0.35) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, `rgba(10,14,40,${o})`); gr.addColorStop(1, 'rgba(10,14,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; return m;
}
function lookYawPitch(obj, target, maxYaw = 0.9, maxPitch = 0.55) {
  const p = new THREE.Vector3(); obj.getWorldPosition(p);
  const d = target.clone().sub(p);
  const parentQ = new THREE.Quaternion(); obj.parent.getWorldQuaternion(parentQ); d.applyQuaternion(parentQ.invert());
  const yaw = clamp(Math.atan2(d.x, d.z), -maxYaw, maxYaw);
  const pitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -maxPitch, maxPitch);
  return [yaw, pitch];
}

/* ---------- visor HUD (canvas texture painted every frame) ---------- */
function makeHud(mode = 'ring') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 470;
  const g = c.getContext('2d'); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const state = { open: 0, t: 0 };
  function draw(t) {
    g.clearRect(0, 0, 512, 470);
    const cx = 256, cy = 228;
    g.save(); g.shadowColor = '#9fd0ff'; g.shadowBlur = 22; g.strokeStyle = '#ffffff'; g.lineCap = 'round';
    const showWord = mode === 'join' && state.open > 0.65;
    const rr = showWord ? 112 : 78;
    g.lineWidth = 9; g.beginPath(); g.arc(cx, cy, rr, t * 1.4, t * 1.4 + Math.PI * 1.55); g.stroke();
    g.lineWidth = 2; g.globalAlpha = 0.55; g.beginPath(); g.arc(cx, cy, rr - 18, -t, -t + Math.PI * 1.2); g.stroke();
    g.globalAlpha = 0.5; g.lineWidth = 2;
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2 + t * 0.2; const r1 = rr + 22, r2 = r1 + (i % 4 ? 6 : 14); g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke(); }
    g.restore();
    g.fillStyle = 'rgba(220,228,255,.75)'; g.font = '600 15px Archivo, Arial'; g.textAlign = 'left';
    g.fillText('PX-01', 110, 96); g.fillText('CORE · AI', 330, 96);
    g.fillText(`SYS ${String(Math.floor((t * 37) % 100)).padStart(2, '0')}`, 120, 372);
    if (showWord) {
      const word = 'JOIN US'; const k = clamp((state.open - 0.65) / 0.3, 0, 1); const n = Math.ceil(word.length * k);
      g.save(); g.shadowColor = '#9fd0ff'; g.shadowBlur = 18; g.fillStyle = '#fff'; g.font = '800 52px Archivo, Arial'; g.textAlign = 'center';
      g.fillText(word.slice(0, n), cx, cy + 18); g.restore();
    }
    tex.needsUpdate = true;
  }
  return { tex, state, draw };
}

/* ======================================================================
   Humanoid robot (white suit, black glass helmet, HUD visor)
   ====================================================================== */
function torsoRadius(y, pts) { for (let i = 0; i < pts.length - 1; i++) { const [r0, y0] = pts[i], [r1, y1] = pts[i + 1]; if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0)); } return 0; }

function buildArm(M, s, hand = 'point', X = {}) {
  const shell = X.shell || M.white, joint = X.joint || M.white, seamM = X.seam || M.seam, cuffM = X.cuff || M.ink;
  const sh = new THREE.Group(); sh.position.set(s * 0.238, 1.405, 0);
  mesh(new THREE.SphereGeometry(0.066, seg(32), seg(24)), joint, 0, 0, 0, sh);
  mesh(new THREE.CapsuleGeometry(X.thin ? 0.04 : 0.052, 0.19, 8, seg(28)), shell, 0, -0.13, 0, sh);
  const band = mesh(new THREE.TorusGeometry(X.thin ? 0.041 : 0.053, 0.004, 6, seg(40)), seamM, 0, -0.06, 0, sh); band.rotation.x = Math.PI / 2;
  if (X.plate) { const pl = new THREE.SphereGeometry(0.062, seg(24), seg(16), 0, Math.PI * 2, 0, Math.PI / 2); mesh(pl, X.plate, 0, -0.02, 0, sh).scale.set(1.1, 1.3, 1.1); }
  const elbow = new THREE.Group(); elbow.position.y = -0.272; sh.add(elbow);
  mesh(new THREE.SphereGeometry(0.048, seg(24), seg(18)), joint, 0, 0, 0, elbow);
  mesh(new THREE.CapsuleGeometry(X.thin ? 0.036 : 0.046, 0.18, 8, seg(28)), X.fore || shell, 0, -0.12, 0, elbow);
  const cuff = mesh(new THREE.TorusGeometry(X.thin ? 0.036 : 0.044, 0.008, 8, seg(32)), cuffM, 0, -0.225, 0, elbow); cuff.rotation.x = Math.PI / 2;
  const wrist = new THREE.Group(); wrist.position.y = -0.245; elbow.add(wrist);
  const h = buildHand(M, s, hand, X.hand); wrist.add(h.group);
  return { sh, elbow, wrist, hand: h };
}
function buildHand(M, s, pose, HM) {
  const handM = HM || M.silver; const group = new THREE.Group();
  mesh(new RoundedBoxGeometry(0.072, 0.085, 0.034, 3, 0.013), handM, 0, -0.052, 0, group);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group(); f.position.set((i - 1.5) * 0.018 * -s, -0.094, 0); group.add(f);
    mesh(new THREE.CapsuleGeometry(0.0085, i === 0 || i === 3 ? 0.038 : 0.048, 4, 10), handM, 0, -0.03, 0, f);
    fingers.push(f);
  }
  const thumb = new THREE.Group(); thumb.position.set(s * 0.036, -0.05, 0.012); group.add(thumb);
  mesh(new THREE.CapsuleGeometry(0.0095, 0.035, 4, 10), handM, 0, -0.022, 0, thumb);
  thumb.rotation.z = s * 0.6; thumb.rotation.x = -0.4;
  function setPose(p) {
    fingers.forEach((f, i) => { const curl = p === 'point' ? (i === 1 ? 0 : 1.9) : p === 'open' ? 0.08 : 0.5; f.rotation.x = -curl; f.rotation.z = p === 'open' ? (i - 1.5) * 0.12 * s : 0; });
    fingers[1].position.x = (1 - 1.5) * 0.018 * -s;
  }
  setPose(pose);
  return { group, setPose };
}

function buildHumanoid(M, { from = 1.05, arms = true, hud = 'ring', hand = 'point', style = 'suit' } = {}) {
  const root = new THREE.Group();
  const suit = style === 'suit', mech = style === 'mech', android = style === 'android';
  // style palettes — each robot on the site looks different
  const gun = new THREE.MeshPhysicalMaterial({ color: 0x1c1f29, roughness: 0.32, metalness: 0.75, clearcoat: 0.6 });
  const piano = new THREE.MeshPhysicalMaterial({ color: 0x07080d, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
  const bodyM = suit ? M.white : mech ? gun : piano;
  const PTS = mech
    ? [[0.001, 0.80], [0.13, 0.80], [0.15, 0.86], [0.15, 0.95], [0.13, 1.05], [0.14, 1.12], [0.19, 1.22], [0.22, 1.31], [0.228, 1.38], [0.21, 1.44], [0.17, 1.475], [0.09, 1.50], [0.001, 1.505]]
    : android
    ? [[0.001, 0.80], [0.14, 0.80], [0.158, 0.86], [0.16, 0.95], [0.14, 1.05], [0.145, 1.12], [0.172, 1.22], [0.19, 1.31], [0.198, 1.38], [0.186, 1.44], [0.15, 1.475], [0.085, 1.50], [0.001, 1.505]]
    : [[0.001, 0.80], [0.15, 0.80], [0.168, 0.86], [0.172, 0.95], [0.158, 1.05], [0.162, 1.12], [0.186, 1.22], [0.205, 1.31], [0.213, 1.38], [0.199, 1.44], [0.16, 1.475], [0.092, 1.50], [0.001, 1.505]];
  const pts = PTS.filter(([, y]) => y >= from - 0.001); if (from > 0.8) pts.unshift([0.001, from]);
  const torsoG = lathe(pts, 72); torsoG.scale(1, 1, mech ? 0.66 : 0.62);
  const chest = new THREE.Group(); root.add(chest);
  mesh(torsoG, bodyM, 0, 0, 0, chest);
  if (suit) {
    const zip = []; for (let y = from + 0.01; y <= 1.49; y += 0.02) zip.push([0, y, torsoRadius(y, PTS) * 0.62 + 0.0025]);
    tube(zip, 0.0032, M.seam, chest, 60);
    const cs = mesh(new THREE.TorusGeometry(0.21, 0.0022, 6, seg(90)), M.seam, 0, 1.335, 0, chest); cs.rotation.x = Math.PI / 2; cs.scale.set(1, 0.62, 1);
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.016), new THREE.MeshBasicMaterial({ map: textTexture('PRYME X', 256, 58, '#1a1d2b'), transparent: true }));
    patch.position.set(-0.1, 1.36, 0.124); patch.rotation.y = -0.42; chest.add(patch);
    mesh(new THREE.CylinderGeometry(0.08, 0.092, 0.085, seg(48), 1, true), M.collar || new THREE.MeshPhysicalMaterial({ color: 0xf0f1f4, roughness: 0.4, clearcoat: 0.5, side: THREE.DoubleSide }), 0, 1.53, 0, chest);
  }
  if (mech) {
    // white armour plates over a gunmetal frame, segmented abdomen, glowing core
    const plate = new THREE.SphereGeometry(0.2, seg(48), seg(24), Math.PI / 2 - 0.95, 1.9, 0.55, 0.85); plate.scale(1.12, 1.15, 0.72);
    mesh(plate, M.white, 0, 1.19, 0.012, chest);
    for (let i = 0; i < 4; i++) { const r = mesh(new THREE.TorusGeometry(0.142 + (i % 2) * 0.004, 0.011, 8, seg(60)), i % 2 ? M.chrome : M.ink, 0, 1.0 + i * 0.035, 0, chest); r.rotation.x = Math.PI / 2; r.scale.set(1, 0.68, 1); }
    const core = mesh(new THREE.CircleGeometry(0.03, seg(32)), M.glow, 0, 1.3, 0.152, chest);
    const coreR = mesh(new THREE.TorusGeometry(0.04, 0.006, 8, seg(40)), M.chrome, 0, 1.3, 0.15, chest);
    [-1, 1].forEach((sd) => { tube([[sd * 0.03, 1.5, 0.02], [sd * 0.045, 1.56, 0.03], [sd * 0.04, 1.62, 0.02]], 0.007, M.chrome, chest, 10); });
    mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.04, seg(40)), M.ink, 0, 1.5, 0, chest);
  }
  if (android) {
    [-1, 1].forEach((sd) => tube([[sd * 0.02, 1.49, 0.09], [sd * 0.1, 1.33, 0.11], [sd * 0.08, 1.12, 0.09], [sd * 0.05, 0.95, 0.09]], 0.0022, M.chrome, chest, 40));
    const ring = mesh(new THREE.TorusGeometry(0.07, 0.01, 10, seg(48)), M.chrome, 0, 1.51, 0, chest); ring.rotation.x = Math.PI / 2;
    mesh(new THREE.CircleGeometry(0.012, 20), M.glow, 0, 1.32, 0.122, chest);
  }
  mesh(new THREE.CylinderGeometry(0.048, 0.05, 0.12, seg(24)), mech ? M.chrome : M.ink, 0, 1.56, 0, chest);
  const neck = new THREE.Group(); neck.position.y = 1.585; chest.add(neck);
  const head = new THREE.Group(); neck.add(head);
  const out = { root, chest, neck, head, arms: [], style };
  if (suit) {
    const hg = new THREE.SphereGeometry(0.136, seg(72), seg(56)); hg.scale(0.86, 1.13, 0.96);
    mesh(hg, M.black, 0, 0.13, 0, head);
    const hudObj = makeHud(hud);
    const vg = new THREE.SphereGeometry(0.1375, seg(64), seg(40), Math.PI / 2 - 0.85, 1.7, 0.95, 1.2); vg.scale(0.86, 1.13, 0.96);
    const visor = mesh(vg, new THREE.MeshBasicMaterial({ map: hudObj.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 0, 0.13, 0, head);
    visor.renderOrder = 2;
    const ear = (sd) => { const e = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.016, seg(28)), M.white, sd * 0.117, 0.125, 0, head); e.rotation.z = Math.PI / 2; const r = mesh(new THREE.TorusGeometry(0.02, 0.0035, 6, 24), M.glow, sd * 0.126, 0.125, 0, head); r.rotation.y = Math.PI / 2; };
    ear(1); ear(-1); out.hud = hudObj;
  } else if (mech) {
    // boxy helmet with a scanning LED visor slit
    mesh(new RoundedBoxGeometry(0.21, 0.2, 0.22, 5, 0.07), M.white, 0, 0.12, 0, head);
    mesh(new RoundedBoxGeometry(0.19, 0.07, 0.03, 4, 0.025), M.black, 0, 0.13, 0.1, head);
    const slit = mesh(new THREE.PlaneGeometry(0.05, 0.012), M.glow, 0, 0.13, 0.1155, head);
    mesh(new RoundedBoxGeometry(0.16, 0.035, 0.2, 3, 0.012), gun, 0, 0.225, -0.01, head);
    [-1, 1].forEach((sd) => { const e = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, seg(28)), gun, sd * 0.112, 0.12, -0.01, head); e.rotation.z = Math.PI / 2; const r = mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 24), M.glow, sd * 0.128, 0.12, -0.01, head); r.rotation.y = Math.PI / 2; });
    mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09), M.chrome, 0.06, 0.28, -0.04, head); mesh(new THREE.SphereGeometry(0.009, 10, 10), M.glow, 0.06, 0.33, -0.04, head);
    out.tick = (t) => { slit.position.x = Math.sin(t * 2.4) * 0.065; };
  } else {
    // android: chrome skull with a white ceramic face mask and glowing eye slits
    const back = new THREE.SphereGeometry(0.128, seg(64), seg(48)); back.scale(0.85, 1.1, 0.95); mesh(back, M.chrome, 0, 0.13, -0.006, head);
    const faceG = new THREE.SphereGeometry(0.13, seg(64), seg(48), Math.PI / 2 - 1.05, 2.1, 0.25, 2.35); faceG.scale(0.86, 1.12, 0.98);
    mesh(faceG, M.white, 0, 0.13, 0.002, head);
    const nose = new RoundedBoxGeometry(0.014, 0.05, 0.02, 2, 0.006); mesh(nose, M.white, 0, 0.12, 0.124, head);
    const eyes = [-1, 1].map((sd) => { const e = mesh(new THREE.CircleGeometry(0.018, 24), M.glow, sd * 0.04, 0.155, 0.118, head); e.scale.set(1.5, 0.32, 1); e.rotation.y = sd * 0.32; return e; });
    const mouth = mesh(new THREE.PlaneGeometry(0.035, 0.0025), M.ink, 0, 0.065, 0.118, head);
    [-1, 1].forEach((sd) => { const e = mesh(new THREE.TorusGeometry(0.03, 0.005, 8, 28), M.chrome, sd * 0.105, 0.13, 0, head); e.rotation.y = Math.PI / 2; });
    out.tick = (t) => { const b = (t % 4.2) < 0.12 ? 0.05 : 0.32; eyes.forEach((e) => (e.scale.y = b)); };
  }
  if (arms) {
    const X = suit ? {} : mech ? { shell: gun, joint: M.chrome, plate: M.white, fore: M.white, cuff: M.glow, hand: gun } : { shell: piano, joint: M.chrome, seam: M.chrome, cuff: M.chrome, hand: M.white, thin: true };
    [-1, 1].forEach((sd) => { const a = buildArm(M, sd, hand, X); chest.add(a.sh); a.s = sd; a.q = new THREE.Quaternion(); a.bend = 0.25; out.arms.push(a); });
  }
  return out;
}
function textTexture(text, w, h, color) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = color; g.font = `800 ${Math.round(h * 0.62)}px Archivo, Arial`; g.textBaseline = 'middle'; g.fillText(text, 4, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const DOWN = V(0, -1, 0);
function aimArm(a, dirWorld, bend, dt, k = 5) {
  const pq = new THREE.Quaternion(); a.sh.parent.getWorldQuaternion(pq);
  const d = dirWorld.clone().normalize().applyQuaternion(pq.invert());
  const q = new THREE.Quaternion().setFromUnitVectors(DOWN, d);
  a.sh.quaternion.slerp(q, 1 - Math.exp(-k * dt));
  a.bend = damp(a.bend, bend, k, dt); a.elbow.rotation.x = -a.bend;
}

/* ======================================================================
   Stage: one renderer per container, paused when off-screen
   ====================================================================== */
const stages = [];
class Stage {
  constructor(el, opts = {}) {
    this.el = el; this.opts = opts;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(DPR); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = opts.exposure || 1.05;
    el.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    if (opts.env !== false) { const pm = new THREE.PMREMGenerator(r); this.scene.environment = pm.fromScene(new RoomEnvironment(r), 0.04).texture; pm.dispose(); }
    this.camera = new THREE.PerspectiveCamera(opts.fov || 30, 1, 0.01, 50);
    this.M = mats();
    if (opts.lights !== false) {
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9deea, 0.5));
      const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2.5, 4, 3.5); this.scene.add(key);
      const rim = new THREE.DirectionalLight(0x8fb2d4, 2.2); rim.position.set(-3.5, 2.5, -3); this.scene.add(rim);
      const rim2 = new THREE.DirectionalLight(0xffffff, 0.8); rim2.position.set(3.5, 1.5, -2.5); this.scene.add(rim2);
    }
    this.focus = opts.focus || V(0, 1.3, 0); this.height = opts.height || 1.2; this.offset = opts.offset || 0; this.planeZ = opts.planeZ ?? 0.9;
    this.ray = new THREE.Raycaster(); this.target = V(0, 1.4, 1); this.updates = []; this.visible = true; this.t = 0;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { rootMargin: '120px' }); this.io.observe(el);
    this.resize(); stages.push(this);
  }
  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1; this.w = w; this.h = h;
    this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    const cam = this.camera; cam.aspect = w / h;
    const narrow = cam.aspect < 0.95;
    const H = this.height * (narrow ? Math.max(1.5, this.opts.mobileZoom || 1.5) : 1);
    const dist = (H / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const f = narrow && this.opts.mobileFocus ? this.opts.mobileFocus : this.focus;
    const off = narrow ? 0 : this.offset * (H * cam.aspect) / 2;
    const elev = this.opts.elev || 0.08;
    cam.position.set(f.x - off, f.y + dist * elev, f.z + dist);
    cam.lookAt(f.x - off, f.y, f.z);
    cam.updateProjectionMatrix();
  }
  pointerTarget(px, py) {
    const rc = this.el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px - rc.left) / rc.width) * 2 - 1, -((py - rc.top) / rc.height) * 2 + 1);
    ndc.x = clamp(ndc.x, -2.2, 2.2); ndc.y = clamp(ndc.y, -2.2, 2.2);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(new THREE.Plane(V(0, 0, 1), -this.planeZ), hit)) this.target.copy(hit);
    return this.target;
  }
  frame(dt, t, px, py) {
    if (!this.visible) return;
    this.t += dt; const tg = this.pointerTarget(px, py);
    this.scene.updateMatrixWorld();
    for (const u of this.updates) u(dt, this.t, tg);
    this.renderer.render(this.scene, this.camera);
  }
}

/* ======================================================================
   Scene builders
   ====================================================================== */
const SCENES = {
  /* Home: robot that points at your cursor with whichever hand is closer */
  pointer(el) {
    const S = new Stage(el, { focus: V(0, 1.42, 0), height: 1.25, offset: el.dataset.offset ? +el.dataset.offset : 0.4, planeZ: 0.75, mobileFocus: V(0, 1.55, 0), mobileZoom: 1.45 });
    const R = buildHumanoid(S.M, { from: 0.95 }); S.scene.add(R.root);
    humanoidUpdate(S, R, { point: true });
    return S;
  },
  /* About: calm bust, head follows cursor, arms relaxed */
  bust(el) {
    const S = new Stage(el, { focus: V(0, 1.47, 0), height: 1.32, offset: el.dataset.offset ? +el.dataset.offset : 0.4, planeZ: 0.7, mobileFocus: V(0, 1.55, 0) });
    const R = buildHumanoid(S.M, { from: 1.05, hand: 'relax', style: 'android' }); S.scene.add(R.root);
    humanoidUpdate(S, R, { point: false });
    return S;
  },
  /* Research: tall robot, arm + face follow cursor */
  full(el) {
    const S = new Stage(el, { focus: V(0, 1.3, 0), height: 1.45, offset: el.dataset.offset ? +el.dataset.offset : 0.35, planeZ: 0.8, mobileZoom: 1.3 });
    const R = buildHumanoid(S.M, { from: 0.8, style: 'mech' }); S.scene.add(R.root);
    humanoidUpdate(S, R, { point: true, single: true });
    return S;
  },
  /* Join us: opens both arms, visor writes JOIN US */
  join(el) {
    const S = new Stage(el, { focus: V(0, 1.32, 0), height: 1.5, offset: 0, planeZ: 0.8, mobileZoom: 1.25 });
    const R = buildHumanoid(S.M, { from: 0.8, hud: 'join', hand: 'open' }); S.scene.add(R.root);
    let wasOpen = false;
    S.updates.push((dt, t, tg) => {
      const cyc = (t % 9) / 9; // 9s loop: close → open → hold → close
      const open = cyc < 0.15 ? 0 : cyc < 0.3 ? (cyc - 0.15) / 0.15 : cyc < 0.85 ? 1 : 1 - (cyc - 0.85) / 0.15;
      const e = open * open * (3 - 2 * open);
      R.hud.state.open = e;
      R.arms.forEach((a) => {
        const rest = V(a.s * 0.2, -1, 0.06), wide = V(a.s * 1, 0.12, 0.42);
        aimArm(a, rest.lerp(wide, e), 0.25 + e * 0.35, dt, 8);
        a.hand.setPose(e > 0.4 ? 'open' : 'relax');
      });
      const isOpen = e > 0.75; if (isOpen !== wasOpen) { wasOpen = isOpen; el.dispatchEvent(new CustomEvent('robot:open', { bubbles: true, detail: isOpen })); }
      headFollow(R, tg, dt);
      R.chest.rotation.y = damp(R.chest.rotation.y, (tg.x) * 0.12, 3, dt);
      R.chest.position.y = Math.sin(t * 1.6) * 0.004;
      R.hud.draw(t);
    });
    return S;
  },
  /* Services: industrial robot arm, gripper reaches for the cursor */
  arm(el) {
    const S = new Stage(el, { focus: V(0, 0.72, 0), height: 1.85, offset: el.dataset.offset ? +el.dataset.offset : 0.4, planeZ: 0.25, elev: 0.18 });
    const M = S.M, root = new THREE.Group(); S.scene.add(root);
    root.add(shadowBlob(1.4, 0.3));
    mesh(new THREE.CylinderGeometry(0.34, 0.37, 0.06, seg(64)), M.ink, 0, 0.03, 0, root);
    mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.12, seg(64)), M.white, 0, 0.12, 0, root);
    const ringB = mesh(new THREE.TorusGeometry(0.3, 0.006, 8, seg(80)), M.glow, 0, 0.065, 0, root); ringB.rotation.x = Math.PI / 2;
    const turret = new THREE.Group(); turret.position.y = 0.18; root.add(turret);
    mesh(new RoundedBoxGeometry(0.32, 0.2, 0.3, 4, 0.06), M.white, 0, 0.1, 0, turret);
    const sJ = new THREE.Group(); sJ.position.y = 0.2; turret.add(sJ);
    const capG = new THREE.CylinderGeometry(0.11, 0.11, 0.36, seg(40)); capG.rotateZ(Math.PI / 2);
    mesh(capG, M.ink, 0, 0, 0, sJ);
    [-1, 1].forEach((s) => { const c = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, seg(32)), M.glow, s * 0.182, 0, 0, sJ); c.rotation.z = Math.PI / 2; });
    const L1 = 0.62, L2 = 0.5, LG = 0.14;
    mesh(new RoundedBoxGeometry(0.17, L1, 0.17, 4, 0.05), M.white, 0, L1 / 2, 0, sJ);
    tube([[0.09, 0.08, 0.02], [0.1, 0.3, 0.05], [0.09, 0.54, 0.02]], 0.012, M.ink, sJ);
    const eJ = new THREE.Group(); eJ.position.y = L1; sJ.add(eJ);
    const capE = new THREE.CylinderGeometry(0.085, 0.085, 0.24, seg(36)); capE.rotateZ(Math.PI / 2); mesh(capE, M.ink, 0, 0, 0, eJ);
    mesh(new RoundedBoxGeometry(0.12, L2, 0.12, 4, 0.04), M.white, 0, L2 / 2, 0, eJ);
    const wJ = new THREE.Group(); wJ.position.y = L2; eJ.add(wJ);
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, seg(32)), M.chrome, 0, 0.02, 0, wJ);
    const ringW = mesh(new THREE.TorusGeometry(0.062, 0.008, 8, seg(40)), M.glow, 0, 0.05, 0, wJ); ringW.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.05, seg(32)), M.black, 0, 0.08, 0, wJ);
    const fingers = [-1, 1].map((s) => { const f = mesh(new RoundedBoxGeometry(0.022, 0.09, 0.05, 2, 0.008), M.silver, s * 0.03, 0.14, 0, wJ); return f; });
    S.updates.push((dt, t, tg) => {
      const T = tg.clone(); root.worldToLocal(T); T.y = clamp(T.y, 0.2, 1.45); T.z = clamp(T.z, 0.12, 0.45);
      const yaw = Math.atan2(T.x, T.z);
      turret.rotation.y = damp(turret.rotation.y, yaw, 4, dt);
      const d = Math.hypot(T.x, T.z), h = T.y - 0.38; let D = Math.hypot(d, h); const Lb = L2 + LG; D = clamp(D, 0.25, L1 + Lb - 0.03);
      const e = Math.atan2(h, d); const A = Math.acos(clamp((L1 * L1 + D * D - Lb * Lb) / (2 * L1 * D), -1, 1));
      const B = Math.acos(clamp((L1 * L1 + Lb * Lb - D * D) / (2 * L1 * Lb), -1, 1));
      sJ.rotation.x = damp(sJ.rotation.x, Math.PI / 2 - (e + A), 4, dt);
      eJ.rotation.x = damp(eJ.rotation.x, Math.PI - B, 4, dt);
      const g = 0.03 + Math.sin(t * 2.2) * 0.012; fingers[0].position.x = -g; fingers[1].position.x = g;
      ringB.material.color.setHSL(0.64, 1, 0.68 + Math.sin(t * 3) * 0.06);
    });
    return S;
  },
  /* Social: hovering drone, lens-eye watches the cursor */
  drone(el) {
    const S = new Stage(el, { focus: V(0, 0.95, 0), height: 2.0, offset: el.dataset.offset ? +el.dataset.offset : 0.42, planeZ: 0.9, elev: 0.06 });
    const M = S.M, body = new THREE.Group(); body.position.y = 1; S.scene.add(body);
    const sh = shadowBlob(1, 0.22); sh.position.y = 0.2; S.scene.add(sh);
    mesh(new THREE.SphereGeometry(0.3, seg(72), seg(56)), M.white, 0, 0, 0, body);
    const eq = mesh(new THREE.TorusGeometry(0.301, 0.004, 8, seg(100)), M.seam, 0, 0, 0, body); eq.rotation.x = Math.PI / 2;
    const eye = new THREE.Group(); body.add(eye);
    const lensG = new THREE.SphereGeometry(0.303, seg(64), seg(24), 0, Math.PI * 2, 0, 0.62); lensG.rotateX(Math.PI / 2); mesh(lensG, M.black, 0, 0, 0, eye);
    const iris = mesh(new THREE.TorusGeometry(0.075, 0.012, 12, seg(60)), M.glow, 0, 0, 0.29, eye);
    mesh(new THREE.CircleGeometry(0.05, seg(40)), M.glowWhite, 0, 0, 0.297, eye).scale.setScalar(0.5);
    const ringsG = new THREE.Group(); body.add(ringsG);
    const r1 = mesh(new THREE.TorusGeometry(0.44, 0.016, 12, seg(120)), M.white, 0, 0, 0, ringsG);
    const r2 = mesh(new THREE.TorusGeometry(0.5, 0.006, 8, seg(120)), M.glow, 0, 0, 0, ringsG);
    [-1, 1].forEach((s) => { const pod = mesh(new THREE.CapsuleGeometry(0.05, 0.08, 6, 20), M.ink, s * 0.42, 0, 0, body); pod.rotation.z = Math.PI / 2; });
    const antenna = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16), M.ink, 0, 0.36, 0, body); mesh(new THREE.SphereGeometry(0.015, 12, 12), M.glow, 0, 0.45, 0, body);
    S.updates.push((dt, t, tg) => {
      body.position.y = 1 + Math.sin(t * 1.3) * 0.04;
      const [yaw, pitch] = lookYawPitch(eye, tg, 0.95, 0.6);
      eye.rotation.y = damp(eye.rotation.y, yaw, 6, dt); eye.rotation.x = damp(eye.rotation.x, -pitch, 6, dt);
      body.rotation.z = damp(body.rotation.z, -yaw * 0.12, 2, dt);
      ringsG.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.25; ringsG.rotation.y = t * 0.4;
      r2.rotation.z = -t * 0.8; iris.scale.setScalar(1 + Math.sin(t * 2.5) * 0.06);
    });
    return S;
  },
  /* News: sentinel turret scanning, locks on cursor */
  sentinel(el) {
    const S = new Stage(el, { focus: V(0, 0.82, 0), height: 2.05, offset: el.dataset.offset ? +el.dataset.offset : 0.42, planeZ: 0.9, elev: 0.1 });
    const M = S.M, root = new THREE.Group(); S.scene.add(root); root.add(shadowBlob(1.3, 0.28));
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.3; tube([[0, 0.72, 0], [Math.sin(a) * 0.18, 0.4, Math.cos(a) * 0.18], [Math.sin(a) * 0.38, 0.01, Math.cos(a) * 0.38]], 0.014, M.ink, root, 20); mesh(new THREE.SphereGeometry(0.022, 12, 12), M.ink, Math.sin(a) * 0.38, 0.015, Math.cos(a) * 0.38, root); }
    mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.1, seg(24)), M.ink, 0, 0.74, 0, root);
    mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, seg(20)), M.silver, 0, 1.05, 0, root);
    const pan = new THREE.Group(); pan.position.y = 1.34; root.add(pan);
    mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, seg(32)), M.ink, 0, 0, 0, pan);
    const yoke = new THREE.Group(); yoke.position.y = 0.12; pan.add(yoke);
    [-1, 1].forEach((s) => mesh(new RoundedBoxGeometry(0.03, 0.18, 0.08, 2, 0.01), M.white, s * 0.21, -0.03, 0, pan));
    mesh(new RoundedBoxGeometry(0.36, 0.2, 0.26, 4, 0.05), M.white, 0, 0, 0, yoke);
    mesh(new RoundedBoxGeometry(0.3, 0.14, 0.01, 2, 0.004), M.black, 0, 0, 0.13, yoke);
    const lens = new THREE.CylinderGeometry(0.06, 0.07, 0.07, seg(40)); lens.rotateX(Math.PI / 2); mesh(lens, M.ink, -0.06, 0, 0.16, yoke);
    mesh(new THREE.CircleGeometry(0.045, seg(40)), M.black, -0.06, 0, 0.196, yoke);
    const led = mesh(new THREE.TorusGeometry(0.05, 0.005, 8, seg(40)), M.glow, -0.06, 0, 0.197, yoke);
    mesh(new THREE.CircleGeometry(0.012, 16), M.glow, 0.07, 0.03, 0.137, yoke); mesh(new THREE.CircleGeometry(0.012, 16), M.glowWhite, 0.1, 0.03, 0.137, yoke);
    const radar = new THREE.Group(); radar.position.y = 0.13; yoke.add(radar);
    mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.06), M.ink, 0, 0.02, 0, radar);
    mesh(new RoundedBoxGeometry(0.24, 0.06, 0.012, 2, 0.006), M.ink, 0, 0.07, 0, radar);
    S.updates.push((dt, t, tg) => {
      const [yaw, pitch] = lookYawPitch(pan, tg, 1.3, 0.6);
      pan.rotation.y = damp(pan.rotation.y, yaw, 5, dt); yoke.rotation.x = damp(yoke.rotation.x, -pitch, 5, dt);
      radar.rotation.y = t * 2.2; led.material.color.setHSL(0.64, 1, 0.6 + Math.sin(t * 6) * 0.15);
    });
    return S;
  },
  ravana(el) { return heritage(el, buildRavana); },
  mahasona(el) { return heritage(el, buildMahasona); },
  kashyapa(el) { return heritage(el, buildKashyapa); },
  xray(el) { return xrayScene(el); },
  sketch(el) { return sketchScene(el); },
};

function headFollow(R, tg, dt, k = 5) {
  const [yaw, pitch] = lookYawPitch(R.neck, tg, 0.85, 0.5);
  R.neck.rotation.y = damp(R.neck.rotation.y, yaw, k, dt);
  R.neck.rotation.x = damp(R.neck.rotation.x, -pitch, k, dt);
}
function humanoidUpdate(S, R, { point, single }) {
  S.updates.push((dt, t, tg) => {
    headFollow(R, tg, dt);
    R.chest.rotation.y = damp(R.chest.rotation.y, clamp(tg.x, -1, 1) * 0.16, 2.5, dt);
    R.chest.position.y = Math.sin(t * 1.6) * 0.004;
    R.arms.forEach((a) => {
      const shp = new THREE.Vector3(); a.sh.getWorldPosition(shp);
      const active = point && (single ? a.s === -1 : Math.sign(tg.x - R.root.position.x || -1) === a.s);
      if (active) {
        const dir = tg.clone().sub(shp); dir.z = Math.max(dir.z, 0.25); dir.y = Math.max(dir.y, -0.6 * dir.length());
        aimArm(a, dir, 0.08, dt, 4.5); a.hand.setPose('point');
      } else {
        aimArm(a, V(a.s * 0.18, -1, 0.07 + Math.sin(t * 1.2 + a.s) * 0.02), 0.28, dt, 3); a.hand.setPose('relax');
      }
    });
    R.hud && R.hud.draw(t); R.tick && R.tick(t);
  });
}

/* ======================================================================
   Heritage sculptures (procedural, ceramic + chrome + blue)
   ====================================================================== */
function face(M, g, { r = 0.14, mustache = false, serene = false } = {}) {
  const hg = new THREE.SphereGeometry(r, seg(64), seg(48)); hg.scale(0.84, 1.06, 0.92); mesh(hg, M.ceramic, 0, 0, 0, g);
  const jaw = new THREE.SphereGeometry(r * 0.72, seg(40), seg(30)); jaw.scale(0.95, 0.7, 0.9); mesh(jaw, M.ceramic, 0, -r * 0.42, r * 0.12, g);
  const nose = new THREE.ConeGeometry(r * 0.13, r * 0.42, 16); nose.rotateX(Math.PI / 2 + 0.35); mesh(nose, M.ceramic, 0, -r * 0.08, r * 0.86, g);
  const eyes = [-1, 1].map((s) => {
    const sock = new THREE.SphereGeometry(r * 0.15, 24, 16); sock.scale(1.25, 0.62, 0.42); mesh(sock, M.ceramic, s * r * 0.33, r * 0.07, r * 0.72, g);
    const lid = mesh(new THREE.TorusGeometry(r * 0.13, r * 0.018, 8, 28, Math.PI), M.ceramic, s * r * 0.33, r * 0.065, r * 0.77, g); lid.scale.set(1.2, serene ? 0.35 : 0.6, 1); lid.rotation.z = s * 0.12;
    const iris = mesh(new THREE.SphereGeometry(r * 0.045, 16, 12), serene ? M.ceramic : M.silver, s * r * 0.33, r * 0.055, r * 0.79, g); iris.scale.set(1, serene ? 0.4 : 1, 0.6);
    const b = mesh(new RoundedBoxGeometry(r * 0.42, r * 0.06, r * 0.08, 2, r * 0.025), M.ceramic, s * r * 0.33, r * 0.25, r * 0.78, g); b.rotation.z = s * (serene ? -0.08 : -0.28);
    return iris; });
  const lipU = new THREE.SphereGeometry(r * 0.17, 20, 12); lipU.scale(1, 0.22, 0.4); mesh(lipU, M.ceramic, 0, -r * 0.4, r * 0.8, g);
  const lipL = new THREE.SphereGeometry(r * 0.14, 20, 12); lipL.scale(1, 0.26, 0.42); mesh(lipL, M.ceramic, 0, -r * 0.5, r * 0.78, g);
  mesh(new THREE.SphereGeometry(r * 0.04, 12, 10), M.blue, 0, r * 0.38, r * 0.82, g).scale.set(0.7, 1.4, 0.5);
  [-1, 1].forEach((s) => { const ear = new THREE.SphereGeometry(r * 0.3, 16, 16); ear.scale(0.35, 0.8, 0.55); mesh(ear, M.ceramic, s * r * 0.84, 0, 0, g); const ring = mesh(new THREE.TorusGeometry(r * 0.17, r * 0.035, 10, 32), M.chrome, s * r * 0.88, -r * 0.42, 0, g); ring.rotation.y = Math.PI / 2; mesh(new THREE.SphereGeometry(r * 0.06, 12, 12), M.blue, s * r * 0.88, -r * 0.58, 0, g); });
  if (mustache) [-1, 1].forEach((s) => { tube([[0, -r * 0.29, r * 0.86], [s * r * 0.22, -r * 0.33, r * 0.84], [s * r * 0.46, -r * 0.33, r * 0.7], [s * r * 0.6, -r * 0.2, r * 0.56], [s * r * 0.56, -r * 0.08, r * 0.55]], r * 0.04, M.chrome, g, 32); });
  return eyes;
}
function bustBody(M, g, y = 0) {
  const PTS = [[0.001, -0.62], [0.24, -0.62], [0.27, -0.5], [0.3, -0.38], [0.29, -0.3], [0.22, -0.24], [0.1, -0.2], [0.07, -0.13], [0.001, -0.1]];
  const geo = lathe(PTS, 72); geo.scale(1.05, 1, 0.6); mesh(geo, M.ceramic, 0, y, 0, g);
  const neck = new THREE.CylinderGeometry(0.06, 0.07, 0.16, seg(32)); mesh(neck, M.ceramic, 0, y - 0.12, 0, g);
  const torc = mesh(new THREE.TorusGeometry(0.115, 0.014, 12, seg(64)), M.chrome, 0, y - 0.2, 0.01, g); torc.rotation.x = Math.PI / 2 - 0.25; torc.scale.set(1.1, 0.8, 1);
  for (let i = 0; i < 13; i++) { const a = -1.2 + i * 0.2; mesh(new THREE.SphereGeometry(0.014, 12, 12), i % 3 ? M.chrome : M.blue, Math.sin(a) * 0.16, y - 0.27 - Math.cos(a) * 0.02 + Math.abs(a) * 0.05, Math.cos(a) * 0.1 + 0.03, g); }
  [-1, 1].forEach((s) => { const pd = new THREE.SphereGeometry(0.11, seg(40), seg(20), 0, Math.PI * 2, 0, Math.PI / 2); const p = mesh(pd, M.chrome, s * 0.27, y - 0.33, 0, g); p.scale.set(1, 0.55, 0.85); p.rotation.z = -s * 0.5; });
}
function crown(M, profile, spikes = 12) {
  const g = new THREE.Group(); mesh(lathe(profile, 64), M.chrome, 0, 0, 0, g);
  const band = mesh(new THREE.TorusGeometry(profile[0][0] + 0.004, 0.009, 10, seg(64)), M.blue, 0, 0.012, 0, g); band.rotation.x = Math.PI / 2;
  for (let i = 0; i < spikes; i++) { const a = i / spikes * Math.PI * 2; const c = mesh(new THREE.ConeGeometry(0.016, 0.07, 8), M.chrome, Math.sin(a) * profile[0][0] * 0.98, 0.06, Math.cos(a) * profile[0][0] * 0.98, g); c.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25); }
  mesh(new THREE.SphereGeometry(0.018, 12, 12), M.blue, 0, 0.04, profile[0][0] + 0.01, g);
  return g;
}
const RAVANA_CROWN = [[0.112, 0], [0.12, 0.02], [0.1, 0.045], [0.106, 0.07], [0.082, 0.1], [0.088, 0.13], [0.058, 0.17], [0.063, 0.2], [0.032, 0.25], [0.012, 0.31], [0.001, 0.335]];
function buildRavana(M, root) {
  bustBody(M, root, 0);
  const headPivot = new THREE.Group(); headPivot.position.y = -0.02; root.add(headPivot);
  const main = new THREE.Group(); main.position.y = 0.13; headPivot.add(main);
  const eyes = face(M, main, { mustache: true });
  const c = crown(M, RAVANA_CROWN); c.position.y = 0.11; main.add(c);
  const halo = new THREE.Group(); halo.position.set(0, 0.13, -0.1); headPivot.add(halo);
  const heads = [];
  const SLOTS = [[-1, 1], [-1, 2], [-1, 3], [-1, 4], [1, 1], [1, 2], [1, 3], [1, 4], [0, 0]];
  for (let i = 0; i < 9; i++) {
    const [sd, k] = SLOTS[i]; const hgp = new THREE.Group();
    if (sd === 0) { hgp.position.set(0, 0.36, -0.08); hgp.scale.setScalar(0.5); } else { hgp.position.set(sd * (0.08 + k * 0.105), 0.03 - k * 0.012, -0.02 - k * 0.03); hgp.scale.setScalar(0.62 - k * 0.04); }
    halo.add(hgp);
    face(M, hgp, { mustache: true }); const cc = crown(M, RAVANA_CROWN, 8); cc.position.y = 0.11; hgp.add(cc); heads.push(hgp);
  }
  const ring = mesh(new THREE.TorusGeometry(0.52, 0.0025, 8, seg(140)), M.glow, 0, 0.05, -0.1, halo);
  return { headPivot, heads, eyes, extra: (dt, t, yaw) => { heads.forEach((h, i) => { h.rotation.y = damp(h.rotation.y, yaw * 0.6 + Math.sin(t + i) * 0.05, 3, dt); }); ring.rotation.z = t * 0.2; } };
}
function buildMahasona(M, root) {
  bustBody(M, root, 0);
  const headPivot = new THREE.Group(); headPivot.position.y = -0.02; root.add(headPivot);
  const h = new THREE.Group(); h.position.y = 0.15; headPivot.add(h);
  const hg = new THREE.SphereGeometry(0.17, seg(64), seg(48)); hg.scale(1.08, 1, 0.86); mesh(hg, M.ceramic, 0, 0, 0, h);
  const cheeks = [-1, 1].map((s) => { const c = new THREE.SphereGeometry(0.07, 24, 18); return mesh(c, M.ceramic, s * 0.1, -0.06, 0.1, h); });
  const eyes = [], pupils = [];
  [-1, 1].forEach((s) => {
    const eg = new THREE.Group(); eg.position.set(s * 0.075, 0.035, 0.125); h.add(eg);
    mesh(new THREE.SphereGeometry(0.048, 28, 22), M.white, 0, 0, 0, eg);
    const rim = mesh(new THREE.TorusGeometry(0.049, 0.005, 10, 32), M.chrome, 0, 0, 0.01, eg);
    const pupil = mesh(new THREE.SphereGeometry(0.017, 20, 16), M.black, 0, 0, 0.036, eg); mesh(new THREE.SphereGeometry(0.006, 8, 8), M.glow, 0.006, 0.006, 0.05, eg); pupils.push(pupil); eyes.push(eg);
    for (let k = 0; k < 5; k++) { const f = mesh(new THREE.ConeGeometry(0.018, 0.09 - k * 0.008, 8), M.ink, s * (0.03 + k * 0.025), 0.1 + Math.sin(k * 0.6) * 0.02, 0.12 - k * 0.012, h); f.rotation.z = -s * (0.6 + k * 0.18); }
  });
  const nose = new THREE.SphereGeometry(0.04, 20, 16); nose.scale(1.4, 0.8, 0.9); mesh(nose, M.ceramic, 0, -0.035, 0.155, h);
  const mouth = new THREE.SphereGeometry(0.075, 28, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); const mo = mesh(mouth, M.black, 0, -0.085, 0.12, h); mo.scale.set(1.25, 0.6, 0.6); mo.rotation.x = Math.PI;
  for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 0.024; const f = mesh(new THREE.ConeGeometry(0.009, i === 0 || i === 5 ? 0.05 : 0.026, 8), M.white, x, -0.1, 0.16 - Math.abs(x) * 0.25, h); f.rotation.x = Math.PI; }
  [-1, 1].forEach((s) => tube([[s * 0.075, -0.12, 0.13], [s * 0.12, -0.11, 0.15], [s * 0.15, -0.04, 0.15], [s * 0.14, 0.01, 0.13]], 0.009, M.white, h, 20));
  [-1, 1].forEach((s) => { const e = new THREE.ConeGeometry(0.06, 0.16, 16); const em = mesh(e, M.ceramic, s * 0.2, 0.02, -0.01, h); em.rotation.z = -s * 1.25; em.scale.set(1, 1, 0.35); });
  const crownG = new THREE.Group(); crownG.position.y = 0.14; h.add(crownG);
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.5; const cg = new THREE.Group(); cg.position.set(Math.sin(a) * 0.15, 0, Math.cos(a) * 0.04 - 0.02); cg.rotation.z = -a * 0.55; crownG.add(cg);
    tube([[0, 0, 0], [0.02, 0.06, 0.01], [-0.01, 0.12, 0.02], [0, 0.17, 0.03]], 0.013, M.ink, cg, 20);
    const hood = new THREE.SphereGeometry(0.045, 20, 16); hood.scale(1, 1.3, 0.28); mesh(hood, M.black, 0, 0.19, 0.02, cg);
    [-1, 1].forEach((s) => mesh(new THREE.SphereGeometry(0.006, 8, 8), M.glow, s * 0.012, 0.2, 0.034, cg));
  }
  const band = mesh(new THREE.TorusGeometry(0.16, 0.012, 10, seg(60), Math.PI), M.chrome, 0, 0.11, 0, h); band.rotation.x = -Math.PI / 2 + 0.3; band.rotation.z = Math.PI;
  for (let i = 0; i < 7; i++) { const a = -1 + i / 6 * 2; const sk = new THREE.Group(); sk.position.set(Math.sin(a) * 0.2, -0.33 + Math.abs(a) * 0.05, Math.cos(a) * 0.12 + 0.02); root.add(sk); mesh(new THREE.SphereGeometry(0.022, 14, 12), M.ceramic, 0, 0, 0, sk); [-1, 1].forEach((s) => mesh(new THREE.SphereGeometry(0.006, 8, 8), M.black, s * 0.008, 0.002, 0.019, sk)); }
  return { headPivot, eyes, extra: (dt, t, yaw, pitch) => { pupils.forEach((p) => { p.position.x = damp(p.position.x, yaw * 0.02, 8, dt); p.position.y = damp(p.position.y, pitch * 0.02, 8, dt); }); } };
}
function buildKashyapa(M, root) {
  bustBody(M, root, 0);
  const headPivot = new THREE.Group(); headPivot.position.y = -0.02; root.add(headPivot);
  const main = new THREE.Group(); main.position.y = 0.13; headPivot.add(main);
  const eyes = face(M, main, { serene: true });
  const prof = [[0.114, 0], [0.12, 0.025], [0.098, 0.055], [0.104, 0.075], [0.078, 0.125], [0.083, 0.145], [0.052, 0.215], [0.056, 0.235], [0.026, 0.31], [0.009, 0.37], [0.001, 0.39]];
  const c = crown(M, prof, 10); c.position.y = 0.11; main.add(c);
  const halo = mesh(new THREE.TorusGeometry(0.3, 0.006, 10, seg(120)), M.glow, 0, 0.17, -0.16, headPivot);
  const halo2 = mesh(new THREE.TorusGeometry(0.26, 0.002, 6, seg(120)), M.chrome, 0, 0.17, -0.15, headPivot);
  const plinth = mesh(new RoundedBoxGeometry(0.9, 0.08, 0.36, 3, 0.02), M.ink, 0, -0.66, 0.08, root);
  [-1, 1].forEach((s) => {
    const paw = new THREE.Group(); paw.position.set(s * 0.3, -0.58, 0.16); root.add(paw);
    const pb = new RoundedBoxGeometry(0.2, 0.1, 0.28, 4, 0.045); mesh(pb, M.ceramic, 0, 0, 0, paw);
    for (let k = 0; k < 3; k++) { const x = (k - 1) * 0.06; mesh(new THREE.SphereGeometry(0.035, 16, 12), M.ceramic, x, -0.005, 0.14, paw); const cl = tube([[x, 0.01, 0.16], [x, 0.0, 0.2], [x, -0.04, 0.215]], 0.008, M.chrome, paw, 12); }
  });
  return { headPivot, eyes, extra: (dt, t) => { halo.rotation.z = t * 0.25; halo2.rotation.z = -t * 0.15; } };
}
function heritage(el, builder) {
  const hero = el.dataset.mode === 'hero';
  const S = new Stage(el, { focus: V(0, hero ? 0 : -0.2, 0), height: hero ? 1.45 : 1.5, offset: hero ? (el.dataset.offset ? +el.dataset.offset : 0.38) : 0, planeZ: 0.6, elev: 0.05, mobileZoom: 1.15 });
  const root = new THREE.Group(); S.scene.add(root);
  const B = builder(S.M, root);
  S.updates.push((dt, t, tg) => {
    const [yaw, pitch] = lookYawPitch(B.headPivot, tg, 0.7, 0.4);
    B.headPivot.rotation.y = damp(B.headPivot.rotation.y, yaw, 4, dt); B.headPivot.rotation.x = damp(B.headPivot.rotation.x, -pitch, 4, dt);
    root.rotation.y = damp(root.rotation.y, yaw * 0.25 + Math.sin(t * 0.4) * 0.06, 2, dt);
    root.position.y = Math.sin(t * 1.1) * 0.006;
    B.extra && B.extra(dt, t, yaw, pitch);
  });
  return S;
}

/* ======================================================================
   X-RAY — King Ravana: shell + skeleton, fresnel shader, scanning beam
   ====================================================================== */
function xrayMat(color, power, strength, base) {
  return new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, p: { value: power }, k: { value: strength }, b: { value: base }, scan: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 w = modelMatrix*vec4(position,1.); vY = w.y; vec4 mv = viewMatrix*w; vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 c; uniform float p; uniform float k; uniform float b; uniform float scan; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), p); float s = smoothstep(0.09, 0.0, abs(vY - scan)); gl_FragColor = vec4(c * (f * k + b + s * 0.9), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
function xrayScene(el) {
  const S = new Stage(el, { focus: V(0, 1.42, 0), height: 1.75, offset: 0, planeZ: 0.8, env: false, lights: false, elev: 0.02, mobileZoom: 1.1, exposure: 1 });
  const shell = xrayMat(0x6f8fff, 2.4, 0.9, 0.012), bone = xrayMat(0xe6efff, 1.6, 1.1, 0.05), metal = xrayMat(0xffffff, 1.2, 1.4, 0.12);
  const blade = xrayMat(0xa9c0ff, 1.4, 1.5, 0.035);
  const M = { white: shell, ceramic: shell, seam: shell, black: shell, ink: shell, collar: shell, chrome: metal, silver: metal, blue: metal, glow: metal, glowWhite: metal };
  const root = new THREE.Group(); S.scene.add(root);
  // body shell
  const R = buildHumanoid(M, { from: 0.8, hand: 'relax' });
  R.head.children.slice(0).forEach((c) => { if (c.material && c.material.map) c.visible = false; });
  root.add(R.root);
  // replace helmet with king's head + crown + nine heads
  R.head.clear();
  const main = new THREE.Group(); main.position.y = 0.13; R.head.add(main);
  face(M, main, { mustache: true, r: 0.135 });
  const cr = crown(M, RAVANA_CROWN); cr.position.y = 0.105; main.add(cr);
  const skull = new THREE.SphereGeometry(0.1, 24, 20); skull.scale(0.85, 1, 0.95); mesh(skull, bone, 0, 0.02, 0, main);
  [-1, 1].forEach((s) => mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 20), bone, s * 0.04, 0.01, 0.085, main));
  const jawB = new THREE.TorusGeometry(0.06, 0.008, 8, 30, Math.PI); const jb = mesh(jawB, bone, 0, -0.05, 0.03, main); jb.rotation.x = Math.PI / 2 + 0.3; jb.rotation.z = Math.PI;
  for (let i = 0; i < 9; i++) {
    const SL = [[-1, 1], [-1, 2], [-1, 3], [-1, 4], [1, 1], [1, 2], [1, 3], [1, 4], [0, 0]][i]; const hg = new THREE.Group();
    if (SL[0] === 0) { hg.position.set(0, 0.5, -0.08); hg.scale.setScalar(0.5); } else { hg.position.set(SL[0] * (0.08 + SL[1] * 0.1), 0.15 - SL[1] * 0.012, -0.03 - SL[1] * 0.03); hg.scale.setScalar(0.6 - SL[1] * 0.04); } R.head.add(hg);
    face(M, hg, { mustache: true }); const cc = crown(M, RAVANA_CROWN, 8); cc.position.y = 0.11; hg.add(cc);
    const sk = new THREE.SphereGeometry(0.1, 16, 14); mesh(sk, bone, 0, 0.02, 0, hg);
  }
  // skeleton
  for (let y = 0.84; y < 1.58; y += 0.034) mesh(new RoundedBoxGeometry(0.028, 0.022, 0.026, 2, 0.006), bone, 0, y, -0.06, root);
  for (let i = 0; i < 10; i++) {
    const y = 1.42 - i * 0.03, r = 0.13 + Math.sin(i / 9 * Math.PI) * 0.045;
    const rg = new THREE.TorusGeometry(r, 0.0055, 6, 40, Math.PI * 1.6); rg.rotateZ(Math.PI / 2 + Math.PI * 0.2); rg.rotateX(Math.PI / 2);
    const rib = mesh(rg, bone, 0, y, -0.02, root); rib.rotation.x = 0.3; rib.scale.set(1, 1, 0.62);
  }
  mesh(new RoundedBoxGeometry(0.03, 0.17, 0.012, 2, 0.006), bone, 0, 1.34, 0.105, root);
  [-1, 1].forEach((s) => tube([[0, 1.46, 0.07], [s * 0.1, 1.475, 0.05], [s * 0.2, 1.45, 0.0]], 0.008, bone, root, 16));
  const pel = mesh(new THREE.TorusGeometry(0.12, 0.016, 8, 40), bone, 0, 0.86, -0.01, root); pel.rotation.x = Math.PI / 2 - 0.4; pel.scale.set(1, 0.6, 1);
  // arms: bones inside, right arm raises Chandrahas sword
  R.arms.forEach((a) => {
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 10), bone, 0, -0.13, 0, a.sh);
    mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.21, 10), bone, -0.012, -0.12, 0, a.elbow); mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.21, 10), bone, 0.012, -0.12, 0, a.elbow);
    mesh(new THREE.SphereGeometry(0.02, 12, 10), bone, 0, 0, 0, a.elbow);
  });
  const swordArm = R.arms[0];
  const bladeS = new THREE.Shape(); bladeS.moveTo(0, 0); bladeS.bezierCurveTo(0.09, 0.25, 0.16, 0.5, 0.05, 0.82); bladeS.bezierCurveTo(0.0, 0.92, -0.06, 0.95, -0.08, 0.9); bladeS.bezierCurveTo(0.02, 0.7, 0.03, 0.4, -0.04, 0.05); bladeS.lineTo(0, 0);
  const bg = new THREE.ExtrudeGeometry(bladeS, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 2, curveSegments: 40 });
  const sword = new THREE.Group(); swordArm.wrist.add(sword); sword.position.set(0, -0.09, 0); sword.rotation.set(0.15, Math.PI / 2, Math.PI); sword.scale.setScalar(0.62);
  mesh(bg, blade, 0, 0.05, 0, sword); mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 12), metal, 0, -0.01, 0, sword);
  mesh(new RoundedBoxGeometry(0.11, 0.02, 0.03, 2, 0.008), metal, 0, 0.05, 0, sword);
  R.root.updateMatrixWorld(true); aimArm(swordArm, V(-0.75, 0.55, 0.35), 1.2, 10, 3); aimArm(R.arms[1], V(0.28, -1, 0.25), 0.55, 10, 3);
  // scanning beam
  const beamC = document.createElement('canvas'); beamC.width = 4; beamC.height = 128; const bgc = beamC.getContext('2d'); const gr = bgc.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(120,150,255,0)'); gr.addColorStop(0.5, 'rgba(170,195,255,.55)'); gr.addColorStop(1, 'rgba(120,150,255,0)'); bgc.fillStyle = gr; bgc.fillRect(0, 0, 4, 128);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.08), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(beamC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.z = 0.3; S.scene.add(beam);
  const allMats = [shell, bone, metal];
  S.updates.push((dt, t, tg) => {
    const scanY = 0.75 + ((t * 0.28) % 1) * 1.5; beam.position.y = scanY; allMats.forEach((m) => (m.uniforms.scan.value = scanY));
    headFollow(R, tg, dt, 3);
    root.rotation.y = damp(root.rotation.y, clamp(tg.x, -1, 1) * 0.35 + Math.sin(t * 0.3) * 0.1, 2, dt);
    aimArm(swordArm, V(-0.75, 0.55, 0.35), 1.2, dt, 3);
    aimArm(R.arms[1], V(0.28, -1, 0.25), 0.55, dt, 3);
  });
  return S;
}


/* ======================================================================
   HAND-DRAWN — King Ravana as a living pencil drawing on paper
   (outline + cross-hatching shader; the drawing sketches itself in)
   ====================================================================== */
const PAPER = 'vec3(0.953, 0.937, 0.902)', GRAPHITE = 'vec3(0.13, 0.13, 0.16)';
function sketchMats(U) {
  const fill = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec3 vN; varying float vY; void main(){ vec4 w = modelMatrix*vec4(position,1.); vY = w.y; vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float prog; uniform float top; uniform float bot; uniform float px; uniform vec3 paperC; varying vec3 vN; varying float vY;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float line(float v, float sp, float w){ float f = abs(fract(v/sp) - 0.5); return smoothstep(w, 0.0, f); }
      void main(){
        vec3 paper = paperC; vec3 ink = ${GRAPHITE};
        vec3 L = normalize(vec3(-0.45, 0.75, 0.55)); float i = 0.18 + 0.82 * max(dot(normalize(vN), L), 0.0);
        vec2 p = gl_FragCoord.xy / px; float wob = sin(p.y * 0.06) * 1.6 + sin(p.x * 0.031) * 1.2;
        float h = 0.0;
        if (i < 0.82) h = max(h, line(p.x + p.y + wob, 7.0, 0.13) * 0.42);
        if (i < 0.58) h = max(h, line(p.x - p.y + wob, 6.0, 0.14) * 0.6);
        if (i < 0.36) h = max(h, line(p.x * 0.9 + wob * 0.5, 4.5, 0.16) * 0.78);
        if (i < 0.2)  h = max(h, 0.55);
        h *= 0.7 + 0.3 * hash(floor(p * 0.5));
        float edgeY = top - prog * (top - bot); float rev = smoothstep(edgeY - 0.03, edgeY + 0.03, vY); if (vY < edgeY - 0.03) discard;
        gl_FragColor = vec4(mix(paper, ink, h * rev), 1.0);
      }`,
  });
  const line = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide,
    vertexShader: `uniform float thick; varying float vY; void main(){ float j = 0.7 + 0.6 * abs(sin(position.y * 70.0 + position.x * 45.0)); vec3 p = position + normal * thick * j; vec4 w = modelMatrix*vec4(p,1.); vY = w.y; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float prog; uniform float top; uniform float bot; varying float vY; void main(){ float edgeY = top - prog * (top - bot) - 0.08; if (vY < edgeY) discard; gl_FragColor = vec4(${GRAPHITE}, 1.0); }`,
  });
  return { fill, line };
}
function addOutlines(root, lineMat) {
  const list = []; root.traverse((o) => { if (o.isMesh) list.push(o); });
  list.forEach((m) => { if (m.userData.noOutline) return; const o = new THREE.Mesh(m.geometry, lineMat); o.renderOrder = -1; m.add(o); });
}
function buildKing(M, root) {
  // body
  const torso = lathe([[0.001, 0.92], [0.15, 0.92], [0.165, 0.98], [0.16, 1.06], [0.17, 1.14], [0.2, 1.24], [0.222, 1.33], [0.228, 1.4], [0.205, 1.46], [0.15, 1.495], [0.07, 1.52], [0.001, 1.525]], 64); torso.scale(1, 1, 0.6);
  mesh(torso, M.ceramic, 0, 0, 0, root);
  const plate = new THREE.SphereGeometry(0.2, 40, 20, Math.PI / 2 - 0.8, 1.6, 0.75, 0.75); plate.scale(1.05, 1.1, 0.66); mesh(plate, M.chrome, 0, 1.2, 0.012, root);
  const skirt = lathe([[0.001, 0.5], [0.24, 0.5], [0.2, 0.62], [0.175, 0.76], [0.165, 0.88], [0.16, 0.95], [0.001, 0.95]], 48); skirt.scale(1, 1, 0.68); mesh(skirt, M.ceramic, 0, 0, 0, root);
  const belt = mesh(new THREE.TorusGeometry(0.163, 0.016, 10, 48), M.chrome, 0, 0.94, 0, root); belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.62, 1);
  mesh(new THREE.SphereGeometry(0.03, 16, 12), M.blue, 0, 0.94, 0.105, root);
  for (let k = 0; k < 3; k++) { const n = mesh(new THREE.TorusGeometry(0.1 + k * 0.032, 0.008, 8, 40, Math.PI), M.chrome, 0, 1.47 - k * 0.035, 0.05, root); n.rotation.x = Math.PI / 2 + 0.55; n.rotation.z = Math.PI; n.scale.set(1.15, 0.7, 1); }
  mesh(new THREE.ConeGeometry(0.025, 0.05, 4), M.blue, 0, 1.33, 0.125, root).rotation.x = Math.PI;
  mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 24), M.ceramic, 0, 1.56, 0, root);
  [-1, 1].forEach((sd) => { const pd = new THREE.SphereGeometry(0.1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2); const p2 = mesh(pd, M.chrome, sd * 0.235, 1.43, 0, root); p2.scale.set(1, 0.6, 0.9); p2.rotation.z = -sd * 0.45; });
  // arms
  const arms = [-1, 1].map((sd) => { const a = buildArm(M, sd, sd < 0 ? 'relax' : 'open', { shell: M.ceramic, joint: M.ceramic, seam: M.chrome, cuff: M.chrome, hand: M.ceramic }); a.sh.position.set(sd * 0.25, 1.42, 0); root.add(a.sh); a.s = sd; a.bend = 0.3; return a; });
  // head with crown and nine more heads
  const neck = new THREE.Group(); neck.position.y = 1.62; root.add(neck);
  const main = new THREE.Group(); main.position.y = 0.1; neck.add(main);
  face(M, main, { mustache: true, r: 0.135 });
  const cr = crown(M, RAVANA_CROWN); cr.position.y = 0.105; main.add(cr);
  const SL = [[-1, 1], [-1, 2], [-1, 3], [-1, 4], [1, 1], [1, 2], [1, 3], [1, 4], [0, 0]];
  SL.forEach(([sd, k]) => { const hg = new THREE.Group(); if (sd === 0) { hg.position.set(0, 0.47, -0.08); hg.scale.setScalar(0.5); } else { hg.position.set(sd * (0.08 + k * 0.1), 0.12 - k * 0.012, -0.03 - k * 0.03); hg.scale.setScalar(0.6 - k * 0.04); } neck.add(hg); face(M, hg, { mustache: true }); const cc = crown(M, RAVANA_CROWN, 8); cc.position.y = 0.11; hg.add(cc); });
  // Chandrahas sword in the raised right hand
  const bladeS = new THREE.Shape(); bladeS.moveTo(0, 0); bladeS.bezierCurveTo(0.09, 0.25, 0.16, 0.5, 0.05, 0.82); bladeS.bezierCurveTo(0.0, 0.92, -0.06, 0.95, -0.08, 0.9); bladeS.bezierCurveTo(0.02, 0.7, 0.03, 0.4, -0.04, 0.05); bladeS.lineTo(0, 0);
  const sword = new THREE.Group(); arms[0].wrist.add(sword); sword.position.set(0, -0.09, 0); sword.rotation.set(0.15, Math.PI / 2, Math.PI); sword.scale.setScalar(0.62);
  mesh(new THREE.ExtrudeGeometry(bladeS, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 2, curveSegments: 40 }), M.chrome, 0, 0.05, 0, sword);
  mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 12), M.chrome, 0, -0.01, 0, sword);
  mesh(new RoundedBoxGeometry(0.11, 0.02, 0.03, 2, 0.008), M.chrome, 0, 0.05, 0, sword);
  return { neck, arms };
}
function sketchScene(el) {
  const S = new Stage(el, { focus: V(0, 1.5, 0), height: 2.15, offset: 0, planeZ: 0.8, env: false, lights: false, elev: 0.02, mobileZoom: 1.1 });
  S.renderer.toneMapping = THREE.NoToneMapping;
  const U = { prog: { value: 0 }, top: { value: 2.25 }, bot: { value: 0.45 }, px: { value: S.renderer.getPixelRatio() }, thick: { value: 0.0075 }, paperC: { value: new THREE.Vector3(0.953, 0.937, 0.902) } };
  const { fill, line } = sketchMats(U);
  const M = { white: fill, ceramic: fill, seam: fill, black: fill, ink: fill, collar: fill, chrome: fill, silver: fill, blue: fill, glow: fill, glowWhite: fill };
  const root = new THREE.Group(); S.scene.add(root);
  const K = buildKing(M, root);
  addOutlines(root, line);
  root.updateMatrixWorld(true);
  aimArm(K.arms[0], V(-0.75, 0.55, 0.35), 1.2, 10, 3); aimArm(K.arms[1], V(0.35, -1, 0.3), 0.6, 10, 3);
  let started = false; const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) started = true; }, { threshold: 0.35 }); io.observe(el);
  S.updates.push((dt, t, tg) => {
    if (REDUCED) U.prog.value = 1.05; else if (started && U.prog.value < 1.05) U.prog.value = Math.min(1.05, U.prog.value + dt * 0.32);
    const [yaw, pitch] = lookYawPitch(K.neck, tg, 0.6, 0.35);
    K.neck.rotation.y = damp(K.neck.rotation.y, yaw, 2.5, dt); K.neck.rotation.x = damp(K.neck.rotation.x, -pitch, 2.5, dt);
    root.rotation.y = damp(root.rotation.y, clamp(tg.x, -1, 1) * 0.3 + Math.sin(t * 0.3) * 0.08, 1.5, dt);
    aimArm(K.arms[0], V(-0.75, 0.55, 0.35), 1.2, dt, 3);
    aimArm(K.arms[1], V(0.35, -1, 0.3), 0.6, dt, 3);
  });
  return S;
}


/* ======================================================================
   ROUND 3 — five distinct, realistic robots (one per page) + sketch Ravana
   ====================================================================== */
function proMats(M) {
  return {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xf2f3f5, roughness: 0.3, clearcoat: 0.85, clearcoatRoughness: 0.12 }),
    gloss: new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.04, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02 }),
    matte: new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.85, metalness: 0.05 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.95 }),
    charcoal: new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.55, metalness: 0.35 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x202329, roughness: 0.35, metalness: 0.8 }),
    chrome: M.chrome, silver: M.silver,
    led: new THREE.MeshBasicMaterial({ color: 0xcfe9ff, toneMapped: false }),
    ledDim: new THREE.MeshBasicMaterial({ color: 0x6fa8d6, toneMapped: false }),
  };
}
function label(text, w, h, color, parent, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(text, 512, 64, color), transparent: true, depthWrite: false }));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}
function gripper(P, n = 3) {
  const g = new THREE.Group(); const fingers = [];
  mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.05, seg(24)), P.joint, 0, -0.025, 0, g);
  mesh(new THREE.TorusGeometry(0.036, 0.004, 6, 24), P.chrome, 0, -0.05, 0, g).rotation.x = Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2; const f = new THREE.Group(); f.position.set(Math.sin(a) * 0.024, -0.055, Math.cos(a) * 0.024); f.rotation.y = a; g.add(f);
    const k1 = new THREE.Group(); f.add(k1); mesh(new RoundedBoxGeometry(0.014, 0.05, 0.016, 2, 0.005), P.silver, 0, -0.025, 0, k1);
    const k2 = new THREE.Group(); k2.position.y = -0.05; k1.add(k2); mesh(new RoundedBoxGeometry(0.012, 0.04, 0.014, 2, 0.004), P.joint, 0, -0.02, 0, k2);
    fingers.push([k1, k2]);
  }
  const setPose = (p) => fingers.forEach(([k1, k2]) => { const c = p === 'open' ? 0.45 : p === 'point' ? 0.15 : 0.3; k1.rotation.x = c; k2.rotation.x = -c * 1.6; });
  setPose('relax'); return { group: g, setPose };
}
function proArm(M, P, s, kind) {
  const sh = new THREE.Group(); const hz = kind === 'hmnd';
  let elbow, wrist, hand;
  if (kind === 'optimus') {
    sh.position.set(s * 0.245, 1.4, 0);
    mesh(new THREE.SphereGeometry(0.085, seg(40), seg(28)), P.shell, 0, 0, 0, sh).scale.set(1, 0.92, 1);
    mesh(new THREE.CapsuleGeometry(0.05, 0.17, 8, seg(28)), P.shell, 0, -0.14, 0, sh);
    mesh(new RoundedBoxGeometry(0.03, 0.12, 0.06, 2, 0.012), P.matte, s * 0.045, -0.15, 0, sh);
    elbow = new THREE.Group(); elbow.position.y = -0.275; sh.add(elbow);
    mesh(new THREE.SphereGeometry(0.044, seg(24), seg(18)), P.matte, 0, 0, 0, elbow);
    mesh(new THREE.CylinderGeometry(0.047, 0.036, 0.21, seg(28)), P.shell, 0, -0.12, 0, elbow);
    mesh(new RoundedBoxGeometry(0.026, 0.13, 0.05, 2, 0.01), P.matte, s * 0.04, -0.11, 0, elbow);
    wrist = new THREE.Group(); wrist.position.y = -0.245; elbow.add(wrist);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, seg(20)), P.joint, 0, 0, 0, wrist);
    hand = buildHand(M, s, 'relax', P.charcoal); wrist.add(hand.group);
  } else if (kind === 'robby') {
    sh.position.set(s * 0.25, 1.39, 0);
    mesh(new THREE.SphereGeometry(0.06, seg(28), seg(20)), P.joint, 0, 0, 0, sh);
    mesh(new THREE.CapsuleGeometry(0.047, 0.17, 8, seg(28)), P.shell, 0, -0.14, 0, sh);
    mesh(new THREE.TorusGeometry(0.048, 0.004, 6, 32), P.chrome, 0, -0.2, 0, sh).rotation.x = Math.PI / 2;
    elbow = new THREE.Group(); elbow.position.y = -0.275; sh.add(elbow);
    mesh(new THREE.SphereGeometry(0.05, seg(28), seg(20)), P.shell, 0, 0, 0, elbow);
    mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 32), P.charcoal, 0, 0, 0, elbow).rotation.y = Math.PI / 2;
    mesh(new THREE.CapsuleGeometry(0.042, 0.16, 8, seg(28)), P.shell, 0, -0.12, 0, elbow);
    wrist = new THREE.Group(); wrist.position.y = -0.24; elbow.add(wrist);
    hand = buildHand(M, s, 'relax', P.shell); wrist.add(hand.group);
  } else { // hmnd — industrial white arms with actuators + gripper
    sh.position.set(s * 0.255, 1.39, 0);
    const act = new THREE.CylinderGeometry(0.068, 0.068, 0.11, seg(36)); act.rotateZ(Math.PI / 2);
    mesh(act, P.shell, 0, 0, 0, sh); mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.005, seg(32)), P.chrome, s * 0.058, 0, 0, sh).rotation.z = Math.PI / 2;
    mesh(new RoundedBoxGeometry(0.085, 0.2, 0.085, 3, 0.02), P.shell, 0, -0.14, 0, sh);
    tube([[s * 0.04, -0.03, -0.03], [s * 0.06, -0.14, -0.05], [s * 0.04, -0.26, -0.03]], 0.008, P.fabric, sh, 12);
    mesh(new THREE.BoxGeometry(0.06, 0.018, 0.02), new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.5 }), 0, -0.2, 0.044, sh);
    elbow = new THREE.Group(); elbow.position.y = -0.27; sh.add(elbow);
    const ea = new THREE.CylinderGeometry(0.055, 0.055, 0.1, seg(32)); ea.rotateZ(Math.PI / 2); mesh(ea, P.shell, 0, 0, 0, elbow);
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, seg(24)), P.joint, s * 0.055, 0, 0, elbow).rotation.z = Math.PI / 2;
    mesh(new RoundedBoxGeometry(0.075, 0.19, 0.075, 3, 0.02), P.shell, 0, -0.12, 0, elbow);
    mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 16), P.joint, s * 0.04, -0.1, 0.02, elbow);
    wrist = new THREE.Group(); wrist.position.y = -0.235; elbow.add(wrist);
    hand = gripper(P, 3); wrist.add(hand.group);
  }
  return { sh, elbow, wrist, hand, s, bend: 0.25 };
}
/* Robot A — "Orbit" (About): rounded black face-screen head, white shoulder shells, charcoal body */
function buildRobby(M, P) {
  const root = new THREE.Group(), chest = new THREE.Group(); root.add(chest);
  const t = lathe([[0.001, 1.0], [0.15, 1.0], [0.16, 1.08], [0.18, 1.2], [0.2, 1.32], [0.205, 1.4], [0.18, 1.46], [0.1, 1.5], [0.001, 1.505]], 64); t.scale(1, 1, 0.66);
  mesh(t, P.charcoal, 0, 0, 0, chest);
  [-1, 1].forEach((sd) => { const shG = new THREE.SphereGeometry(0.15, seg(48), seg(32), 0, Math.PI * 2, 0, Math.PI * 0.62); const m = mesh(shG, P.shell, sd * 0.13, 1.33, 0, chest); m.scale.set(0.95, 0.85, 0.95); m.rotation.z = -sd * 0.35; });
  const badge = mesh(new THREE.TorusGeometry(0.055, 0.004, 8, 48), P.chrome, 0, 1.24, 0.135, chest);
  label('PRYME X', 0.075, 0.0095, '#e9edf2', chest, 0.002, 1.24, 0.136);
  mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, seg(24)), P.joint, 0, 1.53, 0, chest);
  const neck = new THREE.Group(); neck.position.y = 1.57; chest.add(neck); const head = new THREE.Group(); neck.add(head);
  const hg = new THREE.SphereGeometry(0.12, seg(64), seg(48)); hg.scale(0.88, 1.22, 0.92); mesh(hg, P.gloss, 0, 0.13, 0, head);
  const scr = new THREE.SphereGeometry(0.1215, seg(48), seg(24), Math.PI / 2 - 0.62, 1.24, 0.75, 0.75); scr.scale(0.88, 1.22, 0.92); mesh(scr, P.matte, 0, 0.13, 0, head);
  const eyes = [-1, 1].map((sd) => mesh(new THREE.CircleGeometry(0.006, 16), P.led, sd * 0.022, 0.2, 0.104, head));
  const arms = [-1, 1].map((sd) => { const a = proArm(M, P, sd, 'robby'); chest.add(a.sh); return a; });
  return { root, chest, neck, head, arms, tick: (tt) => { const b = (tt % 3.6) < 0.1 ? 0.2 : 1; eyes.forEach((e) => (e.scale.y = b)); } };
}
/* Robot B — "Vector" (News bust / Join full body): glossy black head with light strip, white chest plate */
function buildOptimus(M, P, { legs = false } = {}) {
  const root = new THREE.Group(), chest = new THREE.Group(); root.add(chest);
  const t = lathe([[0.001, 0.86], [0.13, 0.86], [0.14, 0.95], [0.13, 1.05], [0.15, 1.15], [0.19, 1.26], [0.205, 1.36], [0.19, 1.45], [0.12, 1.5], [0.001, 1.505]], 64); t.scale(1, 1, 0.66);
  mesh(t, P.matte, 0, 0, 0, chest);
  const plate = new RoundedBoxGeometry(0.42, 0.3, 0.24, 6, 0.06); mesh(plate, P.shell, 0, 1.3, 0.005, chest);
  label('P R Y M E   X', 0.12, 0.012, '#30343c', chest, 0, 1.39, 0.126);
  [-1, 1].forEach((sd) => mesh(new RoundedBoxGeometry(0.05, 0.04, 0.2, 2, 0.015), P.matte, sd * 0.13, 1.46, 0, chest));
  mesh(new RoundedBoxGeometry(0.3, 0.07, 0.2, 3, 0.03), P.shell, 0, 0.9, 0, chest);
  mesh(new THREE.CylinderGeometry(0.038, 0.045, 0.12, seg(24)), P.matte, 0, 1.54, 0, chest);
  const neck = new THREE.Group(); neck.position.y = 1.585; chest.add(neck); const head = new THREE.Group(); neck.add(head);
  const hg = new THREE.SphereGeometry(0.118, seg(72), seg(56)); hg.scale(0.82, 1.2, 0.98); mesh(hg, P.gloss, 0, 0.12, 0, head);
  [-1, 1].forEach((sd) => { const pts = []; for (let i = 0; i <= 24; i++) { const th = 0.35 + (i / 24) * 2.3; const ph = sd * (1.25 - 0.55 * Math.sin((i / 24) * Math.PI)); const r = 0.1195; pts.push([Math.sin(th) * Math.sin(ph) * r * 0.82, 0.12 + Math.cos(th) * r * 1.2, Math.sin(th) * Math.cos(ph) * r * 0.98]); } tube(pts, 0.0028, P.led, head, 60); });
  const arms = [-1, 1].map((sd) => { const a = proArm(M, P, sd, 'optimus'); chest.add(a.sh); return a; });
  const out = { root, chest, neck, head, arms, legs: [] };
  if (legs) {
    mesh(new RoundedBoxGeometry(0.26, 0.12, 0.16, 3, 0.04), P.matte, 0, 0.82, 0, root);
    [-1, 1].forEach((sd) => {
      const hip = new THREE.Group(); hip.position.set(sd * 0.095, 0.8, 0); root.add(hip);
      mesh(new THREE.SphereGeometry(0.06, 20, 16), P.joint, 0, 0, 0, hip);
      mesh(new THREE.CapsuleGeometry(0.062, 0.26, 8, seg(28)), P.shell, 0, -0.19, 0, hip);
      const knee = new THREE.Group(); knee.position.y = -0.38; hip.add(knee);
      mesh(new THREE.SphereGeometry(0.05, 20, 16), P.matte, 0, 0, 0, knee); mesh(new RoundedBoxGeometry(0.07, 0.08, 0.04, 2, 0.015), P.matte, 0, 0, 0.045, knee);
      mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.3, seg(28)), P.shell, 0, -0.17, 0, knee);
      mesh(new RoundedBoxGeometry(0.06, 0.18, 0.04, 2, 0.015), P.matte, 0, -0.15, -0.04, knee);
      mesh(new RoundedBoxGeometry(0.095, 0.05, 0.2, 3, 0.02), P.gloss, 0, -0.36, 0.04, knee);
      out.legs.push({ hip, knee });
    });
  }
  return out;
}
/* Robot C — "Forge" (Research): black glass helmet with LED matrix, black vest, industrial white arms */
function buildHmnd(M, P) {
  const root = new THREE.Group(), chest = new THREE.Group(); root.add(chest);
  mesh(new RoundedBoxGeometry(0.42, 0.46, 0.25, 6, 0.08), P.fabric, 0, 1.22, 0, chest);
  mesh(new RoundedBoxGeometry(0.44, 0.05, 0.27, 3, 0.022), P.fabric, 0, 1.43, 0, chest);
  label('P R Y M E   X', 0.1, 0.011, '#cfd6df', chest, 0.06, 1.33, 0.136);
  mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.12, seg(32)), P.joint, 0, 0.9, 0, chest);
  mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.09, seg(28)), P.fabric, 0, 1.5, 0, chest);
  const neck = new THREE.Group(); neck.position.y = 1.555; chest.add(neck); const head = new THREE.Group(); neck.add(head);
  const hg = new THREE.SphereGeometry(0.13, seg(72), seg(56)); hg.scale(0.85, 1.08, 0.96); mesh(hg, P.gloss, 0, 0.13, 0, head);
  const dots = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) { const x = (c - 4) * 0.013, y = 0.15 - r * 0.012; const z = Math.sqrt(Math.max(0, 1 - (x / (0.13 * 0.85)) ** 2 - ((y - 0.13) / (0.13 * 1.08)) ** 2)) * 0.13 * 0.96 + 0.001; const d = mesh(new THREE.CircleGeometry(0.0032, 8), P.led, x, y, z, head); d.lookAt(d.position.clone().multiplyScalar(2)); dots.push(d); }
  [-1, 1].forEach((sd) => { const pts = []; for (let i = 0; i <= 12; i++) { const yy = 0.06 + i * 0.012; pts.push([sd * 0.108, yy, 0.03 - i * 0.002]); } tube(pts, 0.003, P.ledDim, head, 16); });
  const arms = [-1, 1].map((sd) => { const a = proArm(M, P, sd, 'hmnd'); chest.add(a.sh); return a; });
  return { root, chest, neck, head, arms, tick: (tt) => { dots.forEach((d, i) => { const on = Math.sin(tt * 3 + i * 1.7) > -0.2; d.visible = on; }); } };
}
function proUpdate(S, R, { point = false, single = false, sway = 0.14 } = {}) {
  S.updates.push((dt, t, tg) => {
    headFollow(R, tg, dt);
    R.chest.rotation.y = damp(R.chest.rotation.y, clamp(tg.x, -1, 1) * sway, 2.5, dt);
    R.chest.position.y = Math.sin(t * 1.6) * 0.004;
    R.arms.forEach((a) => {
      const shp = new THREE.Vector3(); a.sh.getWorldPosition(shp);
      const active = point && (single ? a.s === -1 : Math.sign(tg.x || -1) === a.s);
      if (active) { const dir = tg.clone().sub(shp); dir.z = Math.max(dir.z, 0.25); dir.y = Math.max(dir.y, -0.6 * dir.length()); aimArm(a, dir, 0.1, dt, 4.5); a.hand.setPose('point'); }
      else { aimArm(a, V(a.s * 0.16, -1, 0.07 + Math.sin(t * 1.2 + a.s) * 0.02), 0.3, dt, 3); a.hand.setPose('relax'); }
    });
    R.tick && R.tick(t);
  });
}
function initPose(R, dirFn) { R.root.updateMatrixWorld(true); R.arms.forEach((a) => aimArm(a, dirFn(a), 0.3, 10, 3)); }

/* Services arm — white industrial arm with motor drums and a mechanical hand */
function proArmScene(el) {
  const S = new Stage(el, { focus: V(0, 0.78, 0), height: 2.1, offset: el.dataset.offset ? +el.dataset.offset : 0.4, planeZ: 0.3, elev: 0.16 });
  const P = proMats(S.M), root = new THREE.Group(); S.scene.add(root); root.add(shadowBlob(1.4, 0.3));
  const drum = (r, w, parent, x = 0, y = 0) => { const g = new THREE.CylinderGeometry(r, r, w, seg(48)); g.rotateZ(Math.PI / 2); mesh(g, P.shell, x, y, 0, parent); [-1, 1].forEach((sd) => { const c = mesh(new THREE.TorusGeometry(r * 0.72, r * 0.08, 10, seg(40)), P.chrome, x + sd * w / 2, y, 0, parent); c.rotation.y = Math.PI / 2; const cap = new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.006, seg(32)); cap.rotateZ(Math.PI / 2); mesh(cap, P.joint, x + sd * (w / 2 + 0.002), y, 0, parent); mesh(new THREE.TorusGeometry(r * 0.3, r * 0.04, 6, 24), P.ledDim, x + sd * (w / 2 + 0.006), y, 0, parent).rotation.y = Math.PI / 2; }); };
  mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.05, seg(64)), P.joint, 0, 0.025, 0, root);
  mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.1, seg(64)), P.shell, 0, 0.1, 0, root);
  mesh(new THREE.TorusGeometry(0.27, 0.008, 8, seg(80)), P.chrome, 0, 0.15, 0, root).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 12), P.chrome, Math.sin(a) * 0.31, 0.055, Math.cos(a) * 0.31, root); }
  const turret = new THREE.Group(); turret.position.y = 0.16; root.add(turret);
  mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.18, seg(48)), P.shell, 0, 0.09, 0, turret);
  const sJ = new THREE.Group(); sJ.position.y = 0.28; turret.add(sJ); drum(0.12, 0.26, sJ);
  const L1 = 0.6, L2 = 0.5, LG = 0.16;
  mesh(new THREE.CapsuleGeometry(0.085, L1 - 0.17, 10, seg(36)), P.shell, 0, L1 / 2, 0, sJ);
  mesh(new RoundedBoxGeometry(0.05, L1 * 0.55, 0.012, 2, 0.005), P.joint, 0, L1 / 2, 0.084, sJ);
  tube([[0.09, 0.08, -0.03], [0.11, 0.3, -0.06], [0.09, 0.52, -0.03]], 0.01, P.joint, sJ);
  const eJ = new THREE.Group(); eJ.position.y = L1; sJ.add(eJ); drum(0.095, 0.2, eJ);
  mesh(new THREE.CapsuleGeometry(0.065, L2 - 0.14, 10, seg(32)), P.shell, 0, L2 / 2, 0, eJ);
  mesh(new RoundedBoxGeometry(0.035, L2 * 0.5, 0.01, 2, 0.004), P.joint, 0, L2 / 2, 0.065, eJ);
  const wJ = new THREE.Group(); wJ.position.y = L2; eJ.add(wJ); drum(0.06, 0.13, wJ);
  const palm = new THREE.Group(); palm.position.y = 0.06; wJ.add(palm);
  mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.06, seg(32)), P.joint, 0, 0.02, 0, palm);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4; const f = new THREE.Group(); f.position.set(Math.sin(a) * 0.035, 0.05, Math.cos(a) * 0.035); f.rotation.y = a; palm.add(f);
    let p = f; const segs = [];
    for (let k = 0; k < 3; k++) { const j = new THREE.Group(); j.position.y = k === 0 ? 0 : 0.04; p.add(j); mesh(new THREE.SphereGeometry(0.011, 10, 8), P.chrome, 0, 0, 0, j); mesh(new RoundedBoxGeometry(0.014, 0.036, 0.014, 2, 0.005), k === 1 ? P.joint : P.silver, 0, 0.02, 0, j); segs.push(j); p = j; }
    fingers.push(segs);
  }
  S.updates.push((dt, t, tg) => {
    const T = tg.clone(); root.worldToLocal(T); T.y = clamp(T.y, 0.25, 1.1); T.z = clamp(T.z, 0.2, 0.5);
    turret.rotation.y = damp(turret.rotation.y, Math.atan2(T.x, T.z), 4, dt);
    const d = Math.hypot(T.x, T.z), h = T.y - 0.44; const Lb = L2 + LG; const D = clamp(Math.hypot(d, h), 0.25, L1 + Lb - 0.03);
    const e = Math.atan2(h, d); const A = Math.acos(clamp((L1 * L1 + D * D - Lb * Lb) / (2 * L1 * D), -1, 1)); const B = Math.acos(clamp((L1 * L1 + Lb * Lb - D * D) / (2 * L1 * Lb), -1, 1));
    sJ.rotation.x = damp(sJ.rotation.x, Math.PI / 2 - (e + A), 4, dt); eJ.rotation.x = damp(eJ.rotation.x, Math.PI - B, 4, dt);
    const c = 0.35 + Math.sin(t * 1.8) * 0.3; fingers.forEach((segs) => { segs[0].rotation.x = c * 0.6; segs[1].rotation.x = c; segs[2].rotation.x = c * 0.8; });
    palm.rotation.y = t * 0.4;
  });
  return S;
}

/* ---------- Ravana: full-body 3D model drawn in pencil (from the sketch reference) ---------- */
function buildKing2(M, root) {
  mesh(new RoundedBoxGeometry(0.95, 0.07, 0.62, 3, 0.015), M.ceramic, 0, 0.035, 0.02, root);
  [-1, 1].forEach((sd) => {
    mesh(new RoundedBoxGeometry(0.1, 0.07, 0.24, 3, 0.03), M.ceramic, sd * 0.1, 0.105, 0.05, root);
    mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.33, 24), M.ceramic, sd * 0.1, 0.3, 0, root);
    for (let k = 0; k < 4; k++) { const r = mesh(new THREE.TorusGeometry(0.057, 0.006, 6, 24), M.chrome, sd * 0.1, 0.16 + k * 0.08, 0, root); r.rotation.x = Math.PI / 2; }
    const kn = mesh(new THREE.SphereGeometry(0.06, 18, 14), M.chrome, sd * 0.1, 0.5, 0.02, root); kn.scale.set(1, 0.9, 0.9);
  });
  const skirt = lathe([[0.001, 0.52], [0.23, 0.52], [0.21, 0.64], [0.185, 0.8], [0.172, 0.95], [0.165, 1.02], [0.001, 1.02]], 48); skirt.scale(1, 1, 0.7); mesh(skirt, M.ceramic, 0, 0, 0, root);
  const sash = new THREE.Shape(); sash.moveTo(-0.065, 0); sash.lineTo(0.065, 0); sash.lineTo(0.05, -0.42); sash.lineTo(0, -0.48); sash.lineTo(-0.05, -0.42); sash.lineTo(-0.065, 0);
  mesh(new THREE.ExtrudeGeometry(sash, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 1 }), M.chrome, 0, 0.98, 0.13, root);
  for (let k = 0; k < 3; k++) { const b = mesh(new THREE.TorusGeometry(0.168 + k * 0.004, 0.012, 8, 48), M.chrome, 0, 1.0 + k * 0.03, 0, root); b.rotation.x = Math.PI / 2; b.scale.set(1, 0.66, 1); }
  mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.018, 24), M.blue, 0, 1.03, 0.115, root).rotation.x = Math.PI / 2;
  const torso = lathe([[0.001, 1.04], [0.165, 1.04], [0.175, 1.12], [0.2, 1.22], [0.225, 1.32], [0.235, 1.4], [0.21, 1.47], [0.15, 1.51], [0.07, 1.535], [0.001, 1.54]], 64); torso.scale(1, 1, 0.62); mesh(torso, M.ceramic, 0, 0, 0, root);
  const bp = new THREE.SphereGeometry(0.21, 40, 22, Math.PI / 2 - 0.85, 1.7, 0.6, 0.9); bp.scale(1.06, 1.15, 0.66); mesh(bp, M.chrome, 0, 1.2, 0.01, root);
  for (let k = 0; k < 4; k++) { const ab = mesh(new THREE.TorusGeometry(0.16, 0.007, 6, 40, Math.PI * 0.8), M.chrome, 0, 1.08 + k * 0.035, 0, root); ab.rotation.x = Math.PI / 2; ab.rotation.z = Math.PI * 0.1 - Math.PI; ab.scale.set(1, 0.66, 1); }
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), M.blue, 0, 1.33, 0.14, root).rotation.x = Math.PI / 2 - 0.3;
  const gor = mesh(new THREE.TorusGeometry(0.085, 0.022, 10, 36), M.chrome, 0, 1.53, 0, root); gor.rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 24), M.ceramic, 0, 1.58, 0, root);
  [-1, 1].forEach((sd) => { for (let k = 0; k < 3; k++) { const pd = new THREE.SphereGeometry(0.11 - k * 0.012, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2); const m = mesh(pd, M.chrome, sd * (0.245 + k * 0.012), 1.44 - k * 0.055, 0, root); m.scale.set(1, 0.55, 0.92); m.rotation.z = -sd * (0.45 + k * 0.15); } });
  const cape = new THREE.CylinderGeometry(0.25, 0.46, 1.05, 32, 6, true, Math.PI * 0.55, Math.PI * 0.9); const capeM = M.ceramic.clone(); capeM.uniforms = M.ceramic.uniforms; capeM.side = THREE.DoubleSide; const cm = mesh(cape, capeM, 0, 0.98, -0.06, root); cm.userData.noOutline = true; cm.scale.set(1, 1, 0.6);
  const arms = [-1, 1].map((sd) => { const a = buildArm(M, sd, 'relax', { shell: M.ceramic, joint: M.chrome, seam: M.chrome, cuff: M.chrome, hand: M.ceramic }); a.sh.position.set(sd * 0.265, 1.42, 0); root.add(a.sh); a.s = sd; a.bend = 0.25;
    mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.13, 20), M.chrome, 0, -0.13, 0, a.elbow); mesh(new THREE.TorusGeometry(0.054, 0.009, 6, 24), M.chrome, 0, -0.14, 0, a.sh).rotation.x = Math.PI / 2; return a; });
  const neck = new THREE.Group(); neck.position.y = 1.64; root.add(neck);
  const main = new THREE.Group(); main.position.y = 0.1; neck.add(main);
  face(M, main, { mustache: true, r: 0.135 });
  const cr = crown(M, RAVANA_CROWN, 14); cr.position.y = 0.105; main.add(cr);
  const fan = new THREE.Group(); fan.position.set(0, 0.2, -0.05); main.add(fan);
  for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 2.2; const c = mesh(new THREE.ConeGeometry(0.02, 0.14, 6), M.chrome, Math.sin(a) * 0.16, Math.cos(a) * 0.16, 0, fan); c.rotation.z = -a; }
  mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 40, Math.PI * 1.1), M.chrome, 0, 0, 0, fan).rotation.z = -0.05 * Math.PI;
  for (let k = 1; k <= 4; k++) [-1, 1].forEach((sd) => {
    const hg = new THREE.Group(); hg.position.set(sd * (0.06 + k * 0.105), 0.1 - k * 0.006, -0.035 - k * 0.028); hg.rotation.y = sd * (0.12 + k * 0.07); hg.scale.setScalar(0.8 - k * 0.035); neck.add(hg);
    face(M, hg, { mustache: true }); const cc = crown(M, RAVANA_CROWN, 8); cc.position.y = 0.11; hg.add(cc);
  });
  return { neck, arms };
}
function kingScene(el, opts) {
  const paper = opts.paper;
  const S = new Stage(el, { focus: opts.focus, height: opts.height, offset: opts.offset || 0, planeZ: 0.8, env: false, lights: false, elev: 0.02, mobileZoom: 1.1 });
  S.renderer.toneMapping = THREE.NoToneMapping;
  const U = { prog: { value: 0 }, top: { value: 2.3 }, bot: { value: 0.0 }, px: { value: S.renderer.getPixelRatio() }, thick: { value: opts.thick || 0.0065 }, paperC: { value: new THREE.Vector3(...paper) } };
  const { fill, line } = sketchMats(U);
  const M = { white: fill, ceramic: fill, seam: fill, black: fill, ink: fill, collar: fill, chrome: fill, silver: fill, blue: fill, glow: fill, glowWhite: fill };
  const root = new THREE.Group(); S.scene.add(root);
  const SITE = window.SITE || {};
  let K = null;
  if (SITE.ravanaModel) {
    // your own 3D file (.glb / .gltf) — auto-centred and scaled to stand on the base
    new GLTFLoader().load(SITE.ravanaModel, (g) => {
      const m = g.scene; const box = new THREE.Box3().setFromObject(m); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
      const k = 2.15 / (size.y || 1); m.scale.setScalar(k); m.position.set(-c.x * k, -box.min.y * k, -c.z * k);
      if (SITE.ravanaStyle !== 'original') { m.traverse((o) => { if (o.isMesh) { o.material = fill; } }); }
      else { const pm = new THREE.PMREMGenerator(S.renderer); S.scene.environment = pm.fromScene(new RoomEnvironment(S.renderer), 0.04).texture; S.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9deea, 1.2)); U.prog.value = 1.05; }
      root.add(m); if (SITE.ravanaStyle !== 'original') addOutlines(m, line);
    }, undefined, (err) => { console.warn('Ravana model failed to load, using built-in model', err); K = buildKing2(M, root); addOutlines(root, line); });
  } else {
    K = buildKing2(M, root); addOutlines(root, line);
    root.updateMatrixWorld(true); K.arms.forEach((a) => aimArm(a, V(a.s * 0.3, -1, 0.12), 0.35, 10, 3));
  }
  let started = false; const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) started = true; }, { threshold: 0.3 }); io.observe(el);
  S.updates.push((dt, t, tg) => {
    if (REDUCED) U.prog.value = 1.05; else if (started && U.prog.value < 1.05) U.prog.value = Math.min(1.05, U.prog.value + dt * 0.3);
    root.rotation.y = damp(root.rotation.y, clamp(tg.x, -1, 1) * (K ? 0.28 : 0.5) + Math.sin(t * 0.3) * 0.06, 1.5, dt);
    if (!K) return;
    const [yaw, pitch] = lookYawPitch(K.neck, tg, 0.55, 0.3);
    K.neck.rotation.y = damp(K.neck.rotation.y, yaw, 2.5, dt); K.neck.rotation.x = damp(K.neck.rotation.x, -pitch, 2.5, dt);
    K.arms.forEach((a) => aimArm(a, V(a.s * 0.3, -1, 0.12 + Math.sin(t * 0.9 + a.s) * 0.03), 0.35, dt, 2));
  });
  return S;
}
const PAGE_PAPER = [0.961, 0.965, 0.973], STUDY_PAPER = [0.953, 0.937, 0.902];
Object.assign(SCENES, {
  bust(el) { const S = new Stage(el, { focus: V(0, 1.42, 0), height: 1.3, offset: el.dataset.offset ? +el.dataset.offset : 0.4, planeZ: 0.7, mobileFocus: V(0, 1.5, 0) }); const P = proMats(S.M); const R = buildRobby(S.M, P); S.scene.add(R.root); initPose(R, (a) => V(a.s * 0.16, -1, 0.07)); proUpdate(S, R, { point: false }); return S; },
  full(el) { const S = new Stage(el, { focus: V(0, 1.33, 0), height: 1.6, offset: el.dataset.offset ? +el.dataset.offset : 0.35, planeZ: 0.8, mobileZoom: 1.3 }); const P = proMats(S.M); const R = buildHmnd(S.M, P); S.scene.add(R.root); initPose(R, (a) => V(a.s * 0.16, -1, 0.07)); proUpdate(S, R, { point: true, single: true }); return S; },
  sentinel(el) { const S = new Stage(el, { focus: V(0, 1.36, 0), height: 1.5, offset: el.dataset.offset ? +el.dataset.offset : 0.4, planeZ: 0.75, mobileFocus: V(0, 1.45, 0) }); const P = proMats(S.M); const R = buildOptimus(S.M, P); S.scene.add(R.root); initPose(R, (a) => V(a.s * 0.16, -1, 0.07)); proUpdate(S, R, { point: true }); return S; },
  join(el) {
    const S = new Stage(el, { focus: V(0, 1.02, 0), height: 2.15, offset: 0, planeZ: 0.8, mobileZoom: 1.15 });
    const P = proMats(S.M); const R = buildOptimus(S.M, P, { legs: true }); S.scene.add(R.root); initPose(R, (a) => V(a.s * 0.2, -1, 0.06));
    const hud = makeHud('join'); const vg = new THREE.SphereGeometry(0.1205, seg(64), seg(40), Math.PI / 2 - 0.75, 1.5, 0.95, 1.15); vg.scale(0.82, 1.2, 0.98);
    const visor = mesh(vg, new THREE.MeshBasicMaterial({ map: hud.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 0, 0.12, 0, R.head); visor.renderOrder = 2;
    let wasOpen = false;
    S.updates.push((dt, t, tg) => {
      const cyc = (t % 9) / 9; const open = cyc < 0.15 ? 0 : cyc < 0.3 ? (cyc - 0.15) / 0.15 : cyc < 0.85 ? 1 : 1 - (cyc - 0.85) / 0.15; const e = open * open * (3 - 2 * open);
      hud.state.open = e; hud.draw(t);
      R.arms.forEach((a) => { aimArm(a, V(a.s * 0.2, -1, 0.06).lerp(V(a.s * 1, 0.12, 0.42), e), 0.25 + e * 0.35, dt, 8); a.hand.setPose(e > 0.4 ? 'open' : 'relax'); });
      const isOpen = e > 0.75; if (isOpen !== wasOpen) { wasOpen = isOpen; el.dispatchEvent(new CustomEvent('robot:open', { bubbles: true, detail: isOpen })); }
      headFollow(R, tg, dt); R.chest.rotation.y = damp(R.chest.rotation.y, tg.x * 0.1, 3, dt);
      R.root.position.y = Math.sin(t * 1.6) * 0.003; R.legs.forEach((l, i) => { l.hip.rotation.x = Math.sin(t * 0.8 + i * Math.PI) * 0.02; });
    });
    return S;
  },
  arm(el) { return proArmScene(el); },
  ravana(el) { const hero = el.dataset.mode === 'hero'; return kingScene(el, hero ? { paper: PAGE_PAPER, focus: V(0, 1.02, 0), height: 2.7, offset: el.dataset.offset ? +el.dataset.offset : 0.36 } : { paper: PAGE_PAPER, focus: V(0, 0.72, 0), height: 3.3, thick: 0.009 }); },
  sketch(el) { return kingScene(el, { paper: STUDY_PAPER, focus: V(0, 1.1, 0), height: 2.65 }); },
});

/* ---------- boot ---------- */
function boot() {
  let gl = false; try { const c = document.createElement('canvas'); gl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) {}
  if (!gl) { document.documentElement.classList.add('no-webgl'); return; }
  const lazy = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return; lazy.unobserve(e.target);
    const fn = SCENES[e.target.dataset.scene]; if (fn) { try { fn(e.target); } catch (err) { console.error('scene', e.target.dataset.scene, err); } }
  }), { rootMargin: '400px 0px' });
  document.querySelectorAll('[data-scene]').forEach((el) => lazy.observe(el));
  let last = performance.now();
  const loop = (now) => {
    const dt = clamp((now - last) / 1000, 0, 0.05); last = Math.max(now, last); const t = now / 1000;
    const [px, py] = pointerNow(t);
    for (const s of stages) s.frame(dt, t, px, py);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
