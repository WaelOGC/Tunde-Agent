import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

const MIN_HEIGHT_PX = 500;
const BG_HEX = 0x050a18;

/** CPK — H white, C dark gray, O red, N blue, S yellow, P orange */
const ELEMENT_HEX = {
  H: 0xffffff,
  C: 0x404040,
  O: 0xff4444,
  N: 0x4444ff,
  S: 0xffff44,
  P: 0xff8800,
  F: 0x66ee66,
  Cl: 0x33dd55,
  Br: 0x884411,
  I: 0x6600aa,
  Na: 0xaa88ff,
  K: 0x8866cc,
};

const ELEMENT_RADIUS_SCALE = {
  H: 0.62,
  C: 1,
  O: 0.96,
  N: 0.94,
  S: 1.08,
  P: 1.05,
  F: 0.72,
  Cl: 1.05,
  Br: 1.15,
};

function canonSymbol(symbol) {
  const k = String(symbol || "")
    .trim()
    .replace(/\s+/g, "");
  if (!k) return "C";
  return k.charAt(0).toUpperCase() + k.slice(1).toLowerCase();
}

function elementColor(symbol) {
  const k = String(symbol || "").trim().replace(/\s+/g, "");
  if (!k) return 0x9966cc;
  const canon = canonSymbol(symbol);
  if (ELEMENT_HEX[canon] != null) return ELEMENT_HEX[canon];
  const first = k.charAt(0).toUpperCase();
  if (first === "H") return ELEMENT_HEX.H;
  if (first === "C") return ELEMENT_HEX.C;
  if (first === "O") return ELEMENT_HEX.O;
  if (first === "N") return ELEMENT_HEX.N;
  if (first === "S") return ELEMENT_HEX.S;
  if (first === "P") return ELEMENT_HEX.P;
  return 0x9966cc;
}

function radiusScaleForElement(symbol) {
  const c = canonSymbol(symbol);
  if (ELEMENT_RADIUS_SCALE[c] != null) return ELEMENT_RADIUS_SCALE[c];
  const first = String(symbol || "").trim().charAt(0).toUpperCase();
  if (first === "H") return ELEMENT_RADIUS_SCALE.H;
  return 1;
}

function normalizeMolecule(atoms, bonds) {
  const list = Array.isArray(atoms) ? atoms : [];
  if (!list.length) return { positions: [], bondPairs: [], baseSphereR: 0.26, bondR: 0.11 };

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const a of list) {
    const x = Number(a.x) || 0;
    const y = Number(a.y) || 0;
    const z = Number(a.z) || 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const scale = 2.4 / span;

  const positions = list.map((a) => ({
    element: String(a.element || "C"),
    x: ((Number(a.x) || 0) - cx) * scale,
    y: ((Number(a.y) || 0) - cy) * scale,
    z: ((Number(a.z) || 0) - cz) * scale,
  }));

  const bondPairs = [];
  const n = positions.length;
  if (Array.isArray(bonds)) {
    for (const b of bonds) {
      if (!Array.isArray(b) || b.length < 2) continue;
      const i = Number(b[0]);
      const j = Number(b[1]);
      if (Number.isFinite(i) && Number.isFinite(j) && i >= 0 && j >= 0 && i < n && j < n && i !== j) {
        bondPairs.push([i, j]);
      }
    }
  }

  return { positions, bondPairs, baseSphereR: 0.26, bondR: 0.11 };
}

function hexToCss(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function buildLegendEntries(atoms) {
  const list = Array.isArray(atoms) ? atoms : [];
  const seen = new Map();
  for (const a of list) {
    const el = String(a.element || "C").trim() || "C";
    const key = canonSymbol(el);
    if (!seen.has(key)) seen.set(key, elementColor(el));
  }
  return Array.from(seen.entries()).map(([sym, hex]) => ({
    symbol: sym,
    css: hexToCss(hex),
  }));
}

function makeAxisLabel(text, color) {
  const div = document.createElement("div");
  div.textContent = text;
  div.style.color = color;
  div.style.fontFamily = "system-ui, sans-serif";
  div.style.fontSize = "11px";
  div.style.fontWeight = "700";
  div.style.padding = "2px 6px";
  div.style.background = "rgba(5,10,24,0.82)";
  div.style.borderRadius = "4px";
  div.style.border = `1px solid ${color}`;
  div.style.pointerEvents = "none";
  return new CSS2DObject(div);
}

/**
 * CAD-style 3D molecule viewer — grid floor, XYZ labels, studio lighting, full-width viewport.
 */
export default function MoleculeHologram({ name, formula, atoms, bonds }) {
  const shellRef = useRef(null);
  const canvasMountRef = useRef(null);
  const threeRef = useRef(null);
  const apiRef = useRef({
    resetView: null,
    zoomIn: null,
    zoomOut: null,
    setAutoRotate: null,
  });
  const initialCamRef = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    target: new THREE.Vector3(),
  });

  const [autoPaused, setAutoPaused] = useState(false);
  const autoPausedRef = useRef(false);
  autoPausedRef.current = autoPaused;

  const legend = useMemo(() => buildLegendEntries(atoms), [atoms]);
  const hasAtoms = Array.isArray(atoms) && atoms.length > 0;

  const resizeCanvasToShell = useCallback(() => {
    const t = threeRef.current;
    const shell = shellRef.current;
    if (!t || !shell) return;
    const w = Math.max(280, shell.clientWidth || shell.offsetWidth || 640);
    const h = Math.max(MIN_HEIGHT_PX, Math.round(w * 0.52));
    t.camera.aspect = w / h;
    t.camera.updateProjectionMatrix();
    t.renderer.setSize(w, h);
    t.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    t.labelRenderer.setSize(w, h);
  }, []);

  useLayoutEffect(() => {
    resizeCanvasToShell();
  }, [resizeCanvasToShell, hasAtoms]);

  useEffect(() => {
    const canvasMount = canvasMountRef.current;
    if (!canvasMount || !hasAtoms) return undefined;

    const shell = shellRef.current;
    const width = Math.max(280, shell?.clientWidth || 640);
    const height = Math.max(MIN_HEIGHT_PX, Math.round(width * 0.52));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_HEX);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.08, 200);
    camera.position.set(5.2, 3.6, 6.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    canvasMount.innerHTML = "";
    canvasMount.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    canvasMount.appendChild(labelRenderer.domElement);

    scene.add(new THREE.HemisphereLight(0x6a8cbb, 0x050a18, 0.35));
    scene.add(new THREE.AmbientLight(0xd4e8ff, 0.42));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
    keyLight.position.set(8, 12, 10);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.38);
    fillLight.position.set(-10, 4, -8);
    scene.add(fillLight);

    const rim = new THREE.PointLight(0x66aaff, 0.65, 40);
    rim.position.set(-4, 6, 8);
    scene.add(rim);

    const moleculeGroup = new THREE.Group();
    const { positions, bondPairs, baseSphereR, bondR } = normalizeMolecule(atoms, bonds);

    const box = new THREE.Box3();
    for (const p of positions) {
      box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z));
    }
    const gridY = box.isEmpty() ? -1.4 : box.min.y - 0.12;
    const grid = new THREE.GridHelper(12, 48, 0x3a5688, 0x1c2840);
    grid.position.y = gridY;
    const gm = grid.material;
    if (Array.isArray(gm)) {
      gm.forEach((m) => {
        m.opacity = 0.48;
        m.transparent = true;
      });
    } else {
      gm.opacity = 0.48;
      gm.transparent = true;
    }
    scene.add(grid);

    const axesLen = 2.4;
    scene.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, gridY + 0.02, 0), axesLen, 0xff3344, 0.18, 0.1));
    scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, gridY + 0.02, 0), axesLen, 0x44dd66, 0.18, 0.1));
    scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, gridY + 0.02, 0), axesLen, 0x4488ff, 0.18, 0.1));

    const lx = makeAxisLabel("X", "#ff3344");
    lx.position.set(axesLen + 0.42, gridY + 0.02, 0);
    scene.add(lx);

    const ly = makeAxisLabel("Y", "#44dd66");
    ly.position.set(0, axesLen + gridY + 0.48, 0);
    scene.add(ly);

    const lz = makeAxisLabel("Z", "#4488ff");
    lz.position.set(0, gridY + 0.02, axesLen + 0.42);
    scene.add(lz);

    const sphereGeo = new THREE.SphereGeometry(1, 56, 56);
    for (const p of positions) {
      const r = baseSphereR * radiusScaleForElement(p.element);
      const mat = new THREE.MeshStandardMaterial({
        color: elementColor(p.element),
        metalness: 0.2,
        roughness: 0.34,
        envMapIntensity: 1,
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.scale.setScalar(r);
      mesh.position.set(p.x, p.y, p.z);
      moleculeGroup.add(mesh);
    }

    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 28);
    const bondMatProto = new THREE.MeshStandardMaterial({
      color: 0x9aaab8,
      metalness: 0.38,
      roughness: 0.42,
    });

    for (const [i, j] of bondPairs) {
      const a = positions[i];
      const b = positions[j];
      if (!a || !b) continue;
      const va = new THREE.Vector3(a.x, a.y, a.z);
      const vb = new THREE.Vector3(b.x, b.y, b.z);
      const mid = va.clone().add(vb).multiplyScalar(0.5);
      const dirVec = vb.clone().sub(va);
      const len = dirVec.length();
      if (len < 1e-6) continue;
      const ri = baseSphereR * radiusScaleForElement(a.element);
      const rj = baseSphereR * radiusScaleForElement(b.element);
      const cylR = Math.max(bondR, (ri + rj) * 0.24);
      const mesh = new THREE.Mesh(cylGeo, bondMatProto.clone());
      mesh.position.copy(mid);
      mesh.scale.set(cylR, len, cylR);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec.clone().normalize());
      moleculeGroup.add(mesh);
    }

    scene.add(moleculeGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    const centerY = box.isEmpty() ? 0 : (box.min.y + box.max.y) / 2;
    controls.target.set(0, centerY, 0);
    camera.lookAt(controls.target);
    controls.autoRotate = !autoPausedRef.current;
    controls.autoRotateSpeed = 0.85;
    controls.minDistance = 2.2;
    controls.maxDistance = 28;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.update();

    initialCamRef.current.position.copy(camera.position);
    initialCamRef.current.quaternion.copy(camera.quaternion);
    initialCamRef.current.target.copy(controls.target);

    function dolly(factor) {
      const off = camera.position.clone().sub(controls.target);
      off.multiplyScalar(factor);
      const next = controls.target.clone().add(off);
      const dist = next.distanceTo(controls.target);
      if (dist < controls.minDistance || dist > controls.maxDistance) return;
      camera.position.copy(next);
      controls.update();
    }

    apiRef.current.resetView = () => {
      camera.position.copy(initialCamRef.current.position);
      camera.quaternion.copy(initialCamRef.current.quaternion);
      controls.target.copy(initialCamRef.current.target);
      controls.update();
    };
    apiRef.current.zoomIn = () => dolly(0.88);
    apiRef.current.zoomOut = () => dolly(1.14);
    apiRef.current.setAutoRotate = (on) => {
      controls.autoRotate = on;
    };

    threeRef.current = { scene, camera, renderer, labelRenderer, controls };

    let raf = 0;
    function tick() {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    }
    tick();

    resizeCanvasToShell();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resizeCanvasToShell()) : null;
    if (ro && shellRef.current) ro.observe(shellRef.current);

    function onWinResize() {
      resizeCanvasToShell();
    }
    window.addEventListener("resize", onWinResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWinResize);
      ro?.disconnect();
      threeRef.current = null;
      apiRef.current.resetView = null;
      apiRef.current.zoomIn = null;
      apiRef.current.zoomOut = null;
      apiRef.current.setAutoRotate = null;
      controls.dispose();
      labelRenderer.domElement.remove();
      renderer.dispose();
      sphereGeo.dispose();
      cylGeo.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
          else m.dispose?.();
        }
      });
      canvasMount.innerHTML = "";
    };
  }, [atoms, bonds, hasAtoms, resizeCanvasToShell]);

  useEffect(() => {
    apiRef.current.setAutoRotate?.(!autoPaused);
  }, [autoPaused]);

  const onReset = () => apiRef.current.resetView?.();
  const onZoomIn = () => apiRef.current.zoomIn?.();
  const onZoomOut = () => apiRef.current.zoomOut?.();
  const onTogglePause = () => setAutoPaused((p) => !p);

  return (
    <div
      className="w-full max-w-full rounded-lg border border-cyan-500/15 bg-[#050a18]"
      style={{ boxShadow: "0 0 20px rgba(0, 150, 255, 0.2)" }}
    >
      <div className="border-b border-cyan-900/40 bg-gradient-to-r from-slate-950/95 via-[#070f22] to-[#0a1428] px-3 py-2.5">
        <p className="text-center text-[12px] font-semibold tracking-tight text-slate-100">
          {name || "Molecule"}
          {formula ? <span className="ml-2 font-mono text-[11px] text-cyan-400/95">{formula}</span> : null}
        </p>
      </div>

      <div ref={shellRef} className="relative w-full min-h-[500px]">
        <div
          ref={canvasMountRef}
          className="relative h-full min-h-[500px] w-full overflow-hidden"
          role="img"
          aria-label={hasAtoms ? `3D molecule: ${name || formula || "structure"}` : "No atomic coordinates"}
        />
      </div>

      {hasAtoms ? (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-cyan-900/35 bg-[#060d1a] px-2 py-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-slate-600/60 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:border-cyan-600/45 hover:bg-slate-800"
          >
            🔄 Reset rotation
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            className="rounded-md border border-slate-600/60 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:border-cyan-600/45 hover:bg-slate-800"
          >
            ➕ Zoom in
          </button>
          <button
            type="button"
            onClick={onZoomOut}
            className="rounded-md border border-slate-600/60 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:border-cyan-600/45 hover:bg-slate-800"
          >
            ➖ Zoom out
          </button>
          <button
            type="button"
            onClick={onTogglePause}
            className="rounded-md border border-slate-600/60 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:border-cyan-600/45 hover:bg-slate-800"
          >
            {autoPaused ? "▶ Resume auto-rotation" : "⏸ Pause auto-rotation"}
          </button>
        </div>
      ) : null}

      {hasAtoms && legend.length > 0 ? (
        <div className="border-t border-cyan-900/25 bg-[#050a18] px-3 py-2.5">
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Atom legend</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {legend.map(({ symbol, css }) => (
              <span key={symbol} className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full shadow-inner ring-1 ring-white/15"
                  style={{ backgroundColor: css }}
                />
                <span className="font-mono text-[10px]">{symbol}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {!hasAtoms ? (
        <p className="border-t border-cyan-900/25 px-3 py-3 text-center text-[11px] text-slate-500">
          No 3D coordinates returned for this molecule.
        </p>
      ) : (
        <p className="border-t border-cyan-900/15 px-2 py-1.5 text-center text-[10px] text-slate-500">
          Drag to orbit · scroll to zoom · CAD-style preview
        </p>
      )}
    </div>
  );
}
