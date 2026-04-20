import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

const MIN_HEIGHT_PX = 500;
const BG_HEX = 0x050a18;

/** Fixed diagram geometry — ignore LLM positions/sizes for rendering (text/tooltips only use LLM). */
export const SOLAR_SYSTEM_PLANETS = [
  { name: "Sun", radius: 14, distance: 0, color: "#FDB813", emissive: "#FF6000" },
  { name: "Mercury", radius: 1.2, distance: 28, color: "#B5B5B5", emissive: "#555555" },
  { name: "Venus", radius: 2.0, distance: 40, color: "#E8C56B", emissive: "#8B6B00" },
  { name: "Earth", radius: 2.2, distance: 54, color: "#4B9CD3", emissive: "#004488" },
  { name: "Mars", radius: 1.6, distance: 70, color: "#C1440E", emissive: "#7A1500" },
  { name: "Jupiter", radius: 6.0, distance: 100, color: "#C88B3A", emissive: "#7A4500" },
  { name: "Saturn", radius: 5.0, distance: 132, color: "#E4D191", emissive: "#8B7500" },
  { name: "Uranus", radius: 3.5, distance: 162, color: "#7DE8E8", emissive: "#007777" },
  { name: "Neptune", radius: 3.2, distance: 192, color: "#3F54BA", emissive: "#001A7A" },
];

/** Orbital animation angular speed (rad/frame baseline; scaled by pause). */
export const ORBITAL_SPEEDS = {
  Mercury: 0.04,
  Venus: 0.015,
  Earth: 0.01,
  Mars: 0.008,
  Jupiter: 0.004,
  Saturn: 0.002,
  Uranus: 0.001,
  Neptune: 0.0005,
};

/** Matches `makeDiagramOrbitRing` semi-minor axis scale for consistent motion on the ellipse. */
const SOLAR_ORBIT_Z_SCALE = 0.985;

const SOLAR_TEXTURE_KEYS = [
  "sun",
  "mercury",
  "venus",
  "earth",
  "earth_clouds",
  "mars",
  "jupiter",
  "saturn",
  "saturn_ring",
  "uranus",
  "neptune",
];

function solarTextureKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function findLlmObject(objects, planetName) {
  const target = String(planetName || "")
    .trim()
    .toLowerCase();
  if (!Array.isArray(objects)) return { name: planetName, type: "planet" };
  const hit = objects.find((o) => String(o?.name || "")
    .trim()
    .toLowerCase() === target);
  return hit || { name: planetName, type: planetName === "Sun" ? "star" : "planet" };
}

/** Solar System Scope — illustrative textures (community assets). */
const PLANET_TEXTURE_URLS = {
  sun: "https://www.solarsystemscope.com/textures/download/2k_sun.jpg",
  mercury: "https://www.solarsystemscope.com/textures/download/2k_mercury.jpg",
  venus: "https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg",
  earth: "https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg",
  earth_clouds: "https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg",
  mars: "https://www.solarsystemscope.com/textures/download/2k_mars.jpg",
  jupiter: "https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg",
  saturn: "https://www.solarsystemscope.com/textures/download/2k_saturn.jpg",
  saturn_ring: "https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png",
  uranus: "https://www.solarsystemscope.com/textures/download/2k_uranus.jpg",
  neptune: "https://www.solarsystemscope.com/textures/download/2k_neptune.jpg",
  moon: "https://www.solarsystemscope.com/textures/download/2k_moon.jpg",
  milky_way: "https://www.solarsystemscope.com/textures/download/2k_stars_milky_way.jpg",
};

function cssColorToHex(css) {
  const s = String(css || "").trim();
  if (!s) return 0xaabbcc;
  if (s.startsWith("#")) {
    const h = s.slice(1);
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return Number.isFinite(n) ? n : 0xaabbcc;
  }
  return 0xaabbcc;
}

function solarEmissiveHex(row) {
  if (row && typeof row.emissive === "string") return cssColorToHex(row.emissive);
  return cssColorToHex(row?.color);
}

function buildStarfield(count, spread) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread * 2;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread * 2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.06,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

/** Deep-navy sky with blue-white tinted stars (reference diagram style). */
function buildSolarStarfield(count, spread) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread * 2;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.55;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
    const bright = 0.5 + Math.random() * 0.5;
    colors[i * 3] = bright * 0.75;
    colors[i * 3 + 1] = bright * 0.88;
    colors[i * 3 + 2] = Math.min(1, bright * 1.05);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.052,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    vertexColors: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -3;
  return pts;
}

/** White / gray orbit path (diagram); slight ellipse reads as refined, not chaotic. */
function makeDiagramOrbitRing(semiMajor, segments = 160) {
  const semiMinor = semiMajor * 0.985;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * semiMajor, 0, Math.sin(a) * semiMinor));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: 0xf2f8ff,
    transparent: true,
    opacity: 0.72,
  });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = -1;
  return line;
}

/** Subtle asteroid belt between inner / outer orbital radii (diagram accent). */
function buildAsteroidBelt(innerRadius, outerRadius, count, zScale = SOLAR_ORBIT_Z_SCALE) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = innerRadius + Math.random() * (outerRadius - innerRadius);
    const theta = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(theta) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 1.1;
    positions[i * 3 + 2] = Math.sin(theta) * r * zScale;
    const g = 0.55 + Math.random() * 0.35;
    colors[i * 3] = g * 0.85;
    colors[i * 3 + 1] = g * 0.88;
    colors[i * 3 + 2] = g;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.028,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    vertexColors: true,
  });
  const belt = new THREE.Points(geo, mat);
  belt.renderOrder = -2;
  return belt;
}

function makePlanetNameLabel(text) {
  const div = document.createElement("div");
  div.textContent = text;
  div.style.color = "#f7fbff";
  div.style.fontFamily = "system-ui, Segoe UI, sans-serif";
  div.style.fontSize = "13px";
  div.style.fontWeight = "700";
  div.style.letterSpacing = "0.03em";
  div.style.textShadow =
    "0 1px 6px rgba(0,0,0,1), 0 0 18px rgba(120,190,255,0.55), 0 0 28px rgba(80,140,220,0.35)";
  div.style.pointerEvents = "none";
  div.style.whiteSpace = "nowrap";
  const lbl = new CSS2DObject(div);
  return lbl;
}

/** Procedural radial gradient for accretion disk + shader sampling */
function createAccretionGradientTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 4;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, "rgba(60,15,8,0)");
  g.addColorStop(0.15, "rgba(180,55,22,0.95)");
  g.addColorStop(0.45, "rgba(255,120,40,1)");
  g.addColorStop(0.72, "rgba(255,200,140,0.85)");
  g.addColorStop(1, "rgba(255,240,220,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Large warm sun bloom (orange / yellow) for additive sprite — reference-style glow. */
function createSunGlowTexture() {
  const size = 384;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const cx = size / 2;
  const rg = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  rg.addColorStop(0, "rgba(255,255,235,0.92)");
  rg.addColorStop(0.18, "rgba(255,220,140,0.72)");
  rg.addColorStop(0.42, "rgba(255,160,55,0.38)");
  rg.addColorStop(0.68, "rgba(255,110,35,0.14)");
  rg.addColorStop(1, "rgba(255,70,15,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function disablePick(mesh) {
  mesh.raycast = () => {};
}

async function loadTextureOptional(loader, url) {
  if (!url) return null;
  try {
    const tex = await loader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  } catch {
    return null;
  }
}

function formatTooltipLines(obj) {
  const lines = [];
  const t = String(obj?.type || "").toLowerCase();
  if (t) lines.push(`Type: ${t}`);
  const moons = obj?.moons;
  if (Array.isArray(moons) && moons.length) lines.push(`Moons: ${moons.join(", ")}`);
  const sf = obj?.special_features;
  if (typeof sf === "string" && sf.trim()) lines.push(sf.trim());
  else if (Array.isArray(sf) && sf.length) lines.push(sf.join("; "));
  return lines;
}

export default function SpaceHologram({ visualization }) {
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

  const [tooltip, setTooltip] = useState(null);
  const [texturesLoading, setTexturesLoading] = useState(false);

  const vizType = String(visualization?.type || "solar_system").toLowerCase();
  const objects = Array.isArray(visualization?.objects) ? visualization.objects : [];
  const hasBodies = objects.length > 0;

  const vizMode = useMemo(() => {
    if (vizType === "black_hole") return "black_hole";
    if (vizType === "star") return "star";
    if (vizType === "galaxy") return "galaxy";
    if (vizType === "solar_system" || objects.length >= 2) return "solar_system";
    if (objects.length === 1) {
      const ot = String(objects[0]?.type || "").toLowerCase();
      if (ot.includes("black")) return "black_hole";
      if (ot.includes("star")) return "star";
    }
    return "solar_system";
  }, [vizType, objects]);

  const showScene = useMemo(
    () =>
      hasBodies ||
      vizMode === "galaxy" ||
      vizMode === "black_hole" ||
      vizMode === "star" ||
      vizMode === "solar_system",
    [hasBodies, vizMode]
  );

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
    if (t.labelRenderer) {
      t.labelRenderer.setSize(w, h);
    }
  }, []);

  useLayoutEffect(() => {
    resizeCanvasToShell();
  }, [resizeCanvasToShell, showScene, vizMode]);

  useEffect(() => {
    const canvasMount = canvasMountRef.current;
    if (!canvasMount || !showScene) {
      setTexturesLoading(false);
      return undefined;
    }

    setTooltip(null);
    setTexturesLoading(true);

    let disposed = false;
    /** Assigned once the WebGL scene is built; invoked from effect cleanup */
    let teardownScene = () => {};

    const texturesDisposeList = [];
    const touchTex = (tex) => {
      if (tex && !texturesDisposeList.includes(tex)) texturesDisposeList.push(tex);
    };

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    const shell = shellRef.current;
    const width = Math.max(280, shell?.clientWidth || 640);
    const height = Math.max(MIN_HEIGHT_PX, Math.round(width * 0.52));

    /** ---------- async scene init ---------- */
    (async () => {
      const texMap = {};

      if (vizMode === "solar_system") {
        await Promise.all(
          SOLAR_TEXTURE_KEYS.map(async (key) => {
            const url = PLANET_TEXTURE_URLS[key];
            texMap[key] = await loadTextureOptional(loader, url);
          })
        );
      } else if (vizMode === "galaxy" || vizMode === "star" || vizMode === "black_hole") {
        texMap.milky_way = await loadTextureOptional(loader, PLANET_TEXTURE_URLS.milky_way);
        if (vizMode === "star") {
          texMap.sun = await loadTextureOptional(loader, PLANET_TEXTURE_URLS.sun);
        }
      }

      if (disposed) return;
      setTexturesLoading(false);

      if (disposed) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(BG_HEX);

      const camera = new THREE.PerspectiveCamera(
        vizMode === "solar_system" ? 55 : 45,
        width / height,
        0.05,
        2800
      );
      camera.position.set(0, 26, 72);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      if (disposed) return;
      canvasMount.innerHTML = "";
      canvasMount.appendChild(renderer.domElement);

      let labelRenderer = null;

      const SKY_RADIUS = 480;
      if (vizMode === "solar_system") {
        scene.background = new THREE.Color(0x030d1a);
        const sf = buildSolarStarfield(4800, 560);
        scene.add(sf);
      } else if (texMap.milky_way) {
        touchTex(texMap.milky_way);
        const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 48, 48);
        const skyMat = new THREE.MeshBasicMaterial({
          map: texMap.milky_way,
          side: THREE.BackSide,
          depthWrite: false,
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        sky.renderOrder = -2;
        scene.add(sky);
      } else {
        const starfield = buildStarfield(2800, 220);
        starfield.renderOrder = -2;
        scene.add(starfield);
      }

      /* Solar: brighter fill + sky/ground hemisphere so Phong planets stay vivid without textures */
      if (vizMode === "solar_system") {
        scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        scene.add(new THREE.HemisphereLight(0x4488ff, 0x001133, 0.3));
      } else {
        scene.add(new THREE.AmbientLight(0xffffff, 0.04));
      }

      const pickMeshes = [];
      const animatables = [];
      const lensUniforms = [];
      const diskUniforms = [];

      const root = new THREE.Group();
      scene.add(root);

      /* ---------- Black hole ---------- */
      if (vizMode === "black_hole") {
        const primary = objects[0] || {};
        const bhRadius = Math.min(8, Math.max(1.5, Number(primary.radius) || 3));
        const diskInner = bhRadius * 1.25;
        const diskOuter = bhRadius * 3.4;

        const gradientTex = createAccretionGradientTexture();
        touchTex(gradientTex);

        const diskUniform = { uGradient: { value: gradientTex }, uTime: { value: 0 } };
        diskUniforms.push(diskUniform);

        const diskGeo = new THREE.RingGeometry(diskInner, diskOuter, 96, 1);
        const diskMat = new THREE.ShaderMaterial({
          uniforms: diskUniform,
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D uGradient;
            uniform float uTime;
            varying vec2 vUv;
            void main() {
              vec2 uv = vUv + 0.03 * vec2(sin(uTime * 1.4 + vUv.x * 25.0), cos(uTime * 0.9 + vUv.y * 18.0));
              vec4 g = texture2D(uGradient, vec2(uv.x, 0.5));
              float alpha = g.a * (0.85 + 0.15 * sin(uTime * 2.1 + length(vUv - 0.5) * 12.0));
              gl_FragColor = vec4(g.rgb * 1.35, alpha);
            }
          `,
          side: THREE.DoubleSide,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const disk = new THREE.Mesh(diskGeo, diskMat);
        disk.rotation.x = Math.PI / 2.24;
        root.add(disk);

        const bhMat = new THREE.MeshBasicMaterial({ color: 0x020204 });
        const bhGeo = new THREE.SphereGeometry(1, 56, 56);
        const bhMesh = new THREE.Mesh(bhGeo, bhMat);
        bhMesh.scale.setScalar(bhRadius);
        bhMesh.userData = { pick: primary, label: primary.name || "Black hole" };
        root.add(bhMesh);
        pickMeshes.push(bhMesh);

        /* Gravitational lens halo (view-dependent rim; illustrative) */
        const lensUniform = {
          uCameraPos: { value: new THREE.Vector3() },
          uTime: { value: 0 },
        };
        lensUniforms.push(lensUniform);

        const lensGeo = new THREE.SphereGeometry(1, 64, 64);
        const lensMat = new THREE.ShaderMaterial({
          uniforms: lensUniform,
          vertexShader: `
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorldPos = wp.xyz;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 uCameraPos;
            uniform float uTime;
            varying vec3 vNormal;
            varying vec3 vWorldPos;
            void main() {
              vec3 viewDir = normalize(uCameraPos - vWorldPos);
              vec3 n = normalize(vNormal);
              float cosTheta = clamp(abs(dot(viewDir, n)), 0.0, 1.0);
              float rim = pow(1.0 - cosTheta, 2.8);
              float swirl = sin(atan(vWorldPos.z, vWorldPos.x) * 14.0 + uTime * 2.5) * 0.5 + 0.5;
              vec3 warm = mix(vec3(1.0, 0.45, 0.2), vec3(1.0, 0.85, 0.55), rim);
              vec3 edge = warm * (0.6 + 0.4 * swirl);
              float alpha = rim * 0.42 + pow(rim, 3.0) * 0.55;
              gl_FragColor = vec4(edge, alpha * 0.92);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const lensShell = new THREE.Mesh(lensGeo, lensMat);
        lensShell.scale.setScalar(bhRadius * 1.28);
        root.add(lensShell);

        const rimLight = new THREE.PointLight(0xff6633, 1.8, bhRadius * 90);
        rimLight.position.set(bhRadius * 2.4, bhRadius * 0.35, bhRadius * 2.1);
        root.add(rimLight);

        animatables.push(() => {
          disk.rotation.z += 0.0035;
        });
      } else if (vizMode === "star") {
        const primary = objects[0] || {};
        const R = Math.min(14, Math.max(3, Number(primary.radius) || 8));
        const hex = cssColorToHex(primary.color);

        const starGeo = new THREE.SphereGeometry(1, 48, 48);
        let coreMat;
        if (texMap.sun) {
          touchTex(texMap.sun);
          coreMat = new THREE.MeshStandardMaterial({
            map: texMap.sun,
            emissiveMap: texMap.sun,
            emissive: new THREE.Color(0xffffff),
            emissiveIntensity: 1.2,
            roughness: 0.45,
            metalness: 0.02,
          });
        } else {
          coreMat = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
        }
        const core = new THREE.Mesh(starGeo, coreMat);
        core.scale.setScalar(R);
        core.userData = { pick: primary, label: primary.name || "Star" };
        root.add(core);
        pickMeshes.push(core);

        const corona = new THREE.Mesh(
          new THREE.SphereGeometry(1, 40, 40),
          new THREE.MeshBasicMaterial({
            color: hex,
            transparent: true,
            opacity: 0.26,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        corona.scale.setScalar(R * 1.38);
        root.add(corona);

        const glowTex = createSunGlowTexture();
        touchTex(glowTex);
        const spriteMat = new THREE.SpriteMaterial({
          map: glowTex,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          opacity: 0.85,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.setScalar(R * 10);
        root.add(sprite);

        const glow = new THREE.PointLight(hex, 4.5, R * 40);
        glow.position.set(0, 0, 0);
        root.add(glow);

        animatables.push(() => {
          corona.scale.setScalar(R * (1.35 + Math.sin(Date.now() * 0.0015) * 0.025));
        });
      } else if (vizMode === "galaxy") {
        const pts = new THREE.BufferGeometry();
        const n = 5200;
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const rr = Math.pow(Math.random(), 0.58) * 42;
          const ang = Math.random() * Math.PI * 2;
          pos[i * 3] = Math.cos(ang) * rr + (Math.random() - 0.5) * 1.2;
          pos[i * 3 + 1] = (Math.random() - 0.5) * 3.5;
          pos[i * 3 + 2] = Math.sin(ang) * rr + (Math.random() - 0.5) * 1.2;
        }
        pts.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const galMat = new THREE.PointsMaterial({
          color: 0xaaccff,
          size: 0.065,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        });
        const galaxyPts = new THREE.Points(pts, galMat);
        galaxyPts.rotation.x = Math.PI / 3.2;
        root.add(galaxyPts);

        animatables.push(() => {
          galaxyPts.rotation.z += 0.00065;
        });
      } else {
        /* ---------- Solar system diagram — fixed orbits (LLM ignored for layout) ---------- */

        labelRenderer = new CSS2DRenderer();
        labelRenderer.setSize(width, height);
        labelRenderer.domElement.style.position = "absolute";
        labelRenderer.domElement.style.top = "0";
        labelRenderer.domElement.style.left = "0";
        labelRenderer.domElement.style.pointerEvents = "none";
        canvasMount.appendChild(labelRenderer.domElement);

        const sunRow = SOLAR_SYSTEM_PLANETS[0];
        const sunRadius = sunRow.radius;
        const sunHex = cssColorToHex(sunRow.color);
        const llmSun = findLlmObject(objects, "Sun");

        const glowTexSun = createSunGlowTexture();
        touchTex(glowTexSun);
        const sunSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexSun,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            opacity: 0.92,
          })
        );
        sunSprite.renderOrder = -0.5;
        sunSprite.scale.setScalar(sunRadius * 32);
        sunSprite.center.set(0.5, 0.5);
        root.add(sunSprite);

        const sunGeo = new THREE.SphereGeometry(1, 72, 72);
        const sunEmissiveCol = new THREE.Color(solarEmissiveHex(sunRow));
        let sunMesh;
        if (texMap.sun) {
          touchTex(texMap.sun);
          sunMesh = new THREE.Mesh(
            sunGeo,
            new THREE.MeshPhongMaterial({
              map: texMap.sun,
              color: 0xffffff,
              emissive: sunEmissiveCol,
              emissiveMap: texMap.sun,
              emissiveIntensity: 0.55,
              shininess: 12,
              specular: new THREE.Color(0xffddaa),
            })
          );
        } else {
          sunMesh = new THREE.Mesh(
            sunGeo,
            new THREE.MeshPhongMaterial({
              color: sunHex,
              emissive: sunEmissiveCol,
              emissiveIntensity: 0.75,
              shininess: 18,
              specular: new THREE.Color(0xffaa66),
            })
          );
        }
        sunMesh.scale.setScalar(sunRadius);
        sunMesh.position.set(0, 0, 0);
        sunMesh.renderOrder = 1;
        sunMesh.userData = { pick: llmSun, label: "Sun" };
        root.add(sunMesh);
        pickMeshes.push(sunMesh);

        const sunLabel = makePlanetNameLabel("Sun");
        sunLabel.position.set(0, sunRadius * 1.32, 0);
        sunMesh.add(sunLabel);

        const sunlight = new THREE.PointLight(0xfff2dd, 340, 1600, 2);
        sunlight.position.copy(sunMesh.position);
        root.add(sunlight);

        const planetRows = SOLAR_SYSTEM_PLANETS.slice(1);
        const orbitPhaseStep = (Math.PI * 2) / planetRows.length;
        const orbitPhaseOffset = 0.38;

        planetRows.forEach((row, pIdx) => {
          const d = row.distance;
          const orbitRz = d * SOLAR_ORBIT_Z_SCALE;
          root.add(makeDiagramOrbitRing(d));

          const bodyR = row.radius;
          const bodyHex = cssColorToHex(row.color);
          const texKey = solarTextureKey(row.name);
          const texBody = texKey && texMap[texKey] ? texMap[texKey] : null;
          if (texBody) touchTex(texBody);

          const orbitSpeed = ORBITAL_SPEEDS[row.name] ?? 0.008;
          const phase0 = orbitPhaseOffset + pIdx * orbitPhaseStep;
          const llmPick = findLlmObject(objects, row.name);

          const spinRate = 0.003 + (bodyR > 3 ? 0.006 : 0);

          const attachLabel = (parent, yLift) => {
            const lbl = makePlanetNameLabel(row.name);
            lbl.position.set(0, yLift, 0);
            parent.add(lbl);
          };

          if (row.name === "Earth") {
            const earthGroup = new THREE.Group();
            earthGroup.userData = {
              pick: llmPick,
              label: row.name,
              orbitRadius: d,
              orbitRz,
              orbitSpeed,
              angle: phase0,
            };

            const emC = new THREE.Color(solarEmissiveHex(row));
            let earthMat;
            if (texMap.earth) {
              earthMat = new THREE.MeshPhongMaterial({
                map: texMap.earth,
                color: 0xffffff,
                emissive: emC,
                emissiveIntensity: 0.32,
                shininess: 22,
                specular: new THREE.Color(0x6699bb),
              });
            } else {
              earthMat = new THREE.MeshPhongMaterial({
                color: bodyHex,
                emissive: emC,
                emissiveIntensity: 0.52,
                shininess: 28,
                specular: new THREE.Color(0x88aacc),
              });
            }
            const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), earthMat);
            earthMesh.scale.setScalar(bodyR);
            earthGroup.add(earthMesh);
            attachLabel(earthGroup, bodyR * 1.55);

            if (texMap.earth_clouds) {
              touchTex(texMap.earth_clouds);
              const clouds = new THREE.Mesh(
                new THREE.SphereGeometry(1, 48, 48),
                new THREE.MeshPhongMaterial({
                  map: texMap.earth_clouds,
                  transparent: true,
                  opacity: 0.5,
                  depthWrite: false,
                  shininess: 5,
                  specular: 0x222222,
                })
              );
              clouds.scale.setScalar(bodyR * 1.02);
              disablePick(clouds);
              earthGroup.add(clouds);
              animatables.push(() => {
                if (autoPausedRef.current) return;
                clouds.rotation.y += 0.0014;
              });
            }

            earthGroup.position.set(Math.cos(phase0) * d, 0, Math.sin(phase0) * orbitRz);
            root.add(earthGroup);
            pickMeshes.push(earthGroup);

            animatables.push(() => {
              const g = earthGroup;
              g.userData.angle += g.userData.orbitSpeed * (autoPausedRef.current ? 0 : 1);
              const rx = g.userData.orbitRadius;
              const rz = g.userData.orbitRz;
              const a = g.userData.angle;
              g.position.set(Math.cos(a) * rx, 0, Math.sin(a) * rz);
              earthMesh.rotation.y += spinRate * (autoPausedRef.current ? 0 : 1);
            });
            return;
          }

          if (row.name === "Saturn") {
            const satGroup = new THREE.Group();
            satGroup.userData = {
              pick: llmPick,
              label: row.name,
              orbitRadius: d,
              orbitRz,
              orbitSpeed,
              angle: phase0,
            };

            const satEm = new THREE.Color(solarEmissiveHex(row));
            let satMat;
            if (texBody) {
              satMat = new THREE.MeshPhongMaterial({
                map: texBody,
                color: 0xffffff,
                emissive: satEm,
                emissiveIntensity: 0.35,
                shininess: 24,
                specular: new THREE.Color(0xc9b896),
              });
            } else {
              satMat = new THREE.MeshPhongMaterial({
                color: bodyHex,
                emissive: satEm,
                emissiveIntensity: 0.52,
                shininess: 26,
                specular: new THREE.Color(0xddcca0),
              });
            }
            const saturnMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), satMat);
            saturnMesh.scale.setScalar(bodyR);
            satGroup.add(saturnMesh);
            attachLabel(satGroup, bodyR * 1.65);

            const ringInner = bodyR * 1.18;
            const ringOuter = bodyR * 2.45;
            const ringGeo = new THREE.RingGeometry(ringInner, ringOuter, 112);
            let ringMat;
            if (texMap.saturn_ring) {
              ringMat = new THREE.MeshPhongMaterial({
                map: texMap.saturn_ring,
                transparent: true,
                side: THREE.DoubleSide,
                shininess: 12,
                specular: 0x444444,
                alphaTest: 0.02,
                depthWrite: false,
              });
            } else {
              ringMat = new THREE.MeshBasicMaterial({
                color: 0xc8a96e,
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide,
                depthWrite: false,
              });
            }
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.rotation.x = Math.PI / 2;
            satGroup.add(ringMesh);
            disablePick(ringMesh);

            satGroup.position.set(Math.cos(phase0) * d, 0, Math.sin(phase0) * orbitRz);
            root.add(satGroup);
            pickMeshes.push(satGroup);

            animatables.push(() => {
              const g = satGroup;
              g.userData.angle += g.userData.orbitSpeed * (autoPausedRef.current ? 0 : 1);
              const rx = g.userData.orbitRadius;
              const rz = g.userData.orbitRz;
              const a = g.userData.angle;
              g.position.set(Math.cos(a) * rx, 0, Math.sin(a) * rz);
              saturnMesh.rotation.y += spinRate * (autoPausedRef.current ? 0 : 1);
            });
            return;
          }

          const bodyGeo = new THREE.SphereGeometry(1, 56, 56);
          const bodyEm = new THREE.Color(solarEmissiveHex(row));
          let mat;
          if (texBody) {
            mat = new THREE.MeshPhongMaterial({
              map: texBody,
              color: 0xffffff,
              emissive: bodyEm,
              emissiveIntensity: 0.38,
              shininess: 22,
              specular: new THREE.Color(0x888888),
            });
          } else {
            mat = new THREE.MeshPhongMaterial({
              color: bodyHex,
              emissive: bodyEm,
              emissiveIntensity: 0.52,
              shininess: 28,
              specular: new THREE.Color(0xaaaaaa),
            });
          }
          const mesh = new THREE.Mesh(bodyGeo, mat);
          mesh.scale.setScalar(bodyR);
          mesh.userData = {
            pick: llmPick,
            label: row.name,
            orbitRadius: d,
            orbitRz,
            orbitSpeed,
            angle: phase0,
          };
          mesh.position.set(Math.cos(phase0) * d, 0, Math.sin(phase0) * orbitRz);
          attachLabel(mesh, bodyR * 1.55);
          root.add(mesh);
          pickMeshes.push(mesh);

          animatables.push(() => {
            const m = mesh;
            m.userData.angle += m.userData.orbitSpeed * (autoPausedRef.current ? 0 : 1);
            const rx = m.userData.orbitRadius;
            const rz = m.userData.orbitRz;
            const a = m.userData.angle;
            m.position.set(Math.cos(a) * rx, 0, Math.sin(a) * rz);
            m.rotation.y += spinRate * (autoPausedRef.current ? 0 : 1);
          });
        });

        root.add(buildAsteroidBelt(74, 96, 3400));
      }

      if (vizMode === "solar_system") {
        root.rotation.y = 0;
      } else {
        root.rotation.y = 0.35;
      }

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.target.set(0, 0, 0);

      if (vizMode === "solar_system") {
        camera.position.set(0, 120, 200);
        camera.lookAt(controls.target);
        controls.autoRotate = false;
        controls.minDistance = 72;
        controls.maxDistance = 540;
      } else {
        camera.position.set(0, 26, 72);
        camera.lookAt(controls.target);
        controls.autoRotate = !autoPausedRef.current;
        controls.autoRotateSpeed = 0.65;
        controls.minDistance = 12;
        controls.maxDistance = 220;
      }
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

      threeRef.current = { scene, camera, renderer, controls, labelRenderer };

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();

      function onPointerDown(ev) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(pickMeshes, true);
        if (!hits.length) {
          setTooltip(null);
          return;
        }

        let o = hits[0].object;
        while (o && !o.userData?.pick && o.parent) {
          o = o.parent;
        }
        const u = o?.userData || hits[0].object.userData;
        const title = u.label || u.pick?.name || "Object";
        const lines = formatTooltipLines(u.pick);
        setTooltip({
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
          title,
          lines,
        });
      }

      renderer.domElement.addEventListener("pointerdown", onPointerDown);

      let raf = 0;
      function tick() {
        raf = requestAnimationFrame(tick);
        lensUniforms.forEach((lu) => {
          lu.uCameraPos.value.copy(camera.position);
          lu.uTime.value += 0.016;
        });
        diskUniforms.forEach((du) => {
          du.uTime.value += 0.016;
        });
        animatables.forEach((fn) => fn());
        controls.update();
        renderer.render(scene, camera);
        if (labelRenderer) labelRenderer.render(scene, camera);
      }
      tick();

      resizeCanvasToShell();

      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resizeCanvasToShell()) : null;
      if (ro && shellRef.current) ro.observe(shellRef.current);

      function onWinResize() {
        resizeCanvasToShell();
      }
      window.addEventListener("resize", onWinResize);

      teardownScene = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onWinResize);
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        ro?.disconnect();
        threeRef.current = null;
        apiRef.current.resetView = null;
        apiRef.current.zoomIn = null;
        apiRef.current.zoomOut = null;
        apiRef.current.setAutoRotate = null;
        controls.dispose();
        renderer.dispose();
        texturesDisposeList.forEach((t) => t.dispose?.());
        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose?.();
          if (obj.material) {
            const m = obj.material;
            if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
            else m.dispose?.();
          }
        });
        canvasMount.innerHTML = "";
      };
    })();

    return () => {
      disposed = true;
      setTexturesLoading(false);
      teardownScene();
      threeRef.current = null;
      apiRef.current.resetView = null;
      apiRef.current.zoomIn = null;
      apiRef.current.zoomOut = null;
      apiRef.current.setAutoRotate = null;
      canvasMount.innerHTML = "";
    };
  }, [visualization, vizMode, showScene, resizeCanvasToShell, objects]);

  useEffect(() => {
    apiRef.current.setAutoRotate?.(!autoPaused);
  }, [autoPaused]);

  const onReset = () => apiRef.current.resetView?.();
  const onZoomIn = () => apiRef.current.zoomIn?.();
  const onZoomOut = () => apiRef.current.zoomOut?.();
  const onTogglePause = () => setAutoPaused((p) => !p);

  const headerTitle =
    vizMode === "black_hole"
      ? "Black hole (illustrative)"
      : vizMode === "star"
        ? "Star"
        : vizMode === "galaxy"
          ? "Galaxy (stylized)"
          : "Solar system";

  return (
    <div
      className="w-full max-w-full rounded-lg border border-cyan-500/15 bg-[#050a18]"
      style={{ boxShadow: "0 0 20px rgba(0, 150, 255, 0.2)" }}
    >
      <div className="border-b border-cyan-900/40 bg-gradient-to-r from-slate-950/95 via-[#070f22] to-[#0a1428] px-3 py-2.5">
        <p className="text-center text-[12px] font-semibold tracking-tight text-slate-100">{headerTitle}</p>
      </div>

      <div ref={shellRef} className="relative w-full min-h-[500px]">
        {texturesLoading ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#050a18]/92 backdrop-blur-[2px]">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" aria-hidden />
            <p className="text-[12px] font-medium text-slate-300">Loading textures…</p>
            <p className="max-w-xs px-4 text-center text-[10px] text-slate-500">
              Fetching planetary maps (falls back to solid colors if unavailable).
            </p>
          </div>
        ) : null}
        <div
          ref={canvasMountRef}
          className="relative h-full min-h-[500px] w-full cursor-crosshair overflow-hidden"
          role="img"
          aria-label="3D space visualization"
        />
        {tooltip ? (
          <div
            className="pointer-events-none absolute z-20 max-w-[min(18rem,calc(100%-1rem))] rounded-lg border border-cyan-600/40 bg-[#070d1c]/95 px-3 py-2 text-left shadow-lg shadow-black/40"
            style={{
              left: Math.min(Math.max(8, tooltip.x + 12), 600),
              top: Math.min(Math.max(8, tooltip.y - 8), 400),
            }}
          >
            <p className="text-[12px] font-semibold text-cyan-100">{tooltip.title}</p>
            {tooltip.lines.length ? (
              <ul className="mt-1 space-y-0.5 text-[10px] leading-snug text-slate-300">
                {tooltip.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {showScene ? (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-cyan-900/35 bg-[#060d1a] px-2 py-2">
          <button
            type="button"
            onClick={onReset}
            disabled={texturesLoading}
            className="rounded-md border border-slate-600/60 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:border-cyan-600/45 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            🔄 Reset rotation
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            disabled={texturesLoading}
            className="rounded-md border border-slate-600/60 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:border-cyan-600/45 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            ➕ Zoom in
          </button>
          <button
            type="button"
            onClick={onZoomOut}
            disabled={texturesLoading}
            className="rounded-md border border-slate-600/60 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:border-cyan-600/45 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            ➖ Zoom out
          </button>
          <button
            type="button"
            onClick={onTogglePause}
            disabled={texturesLoading}
            className="rounded-md border border-slate-600/60 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:border-cyan-600/45 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {autoPaused ? "▶ Resume auto-rotation" : "⏸ Pause auto-rotation"}
          </button>
        </div>
      ) : null}

      {!showScene ? (
        <p className="border-t border-cyan-900/25 px-3 py-3 text-center text-[11px] text-slate-500">
          No visualization data returned for this answer.
        </p>
      ) : (
        <p className="border-t border-cyan-900/15 px-2 py-1.5 text-center text-[10px] text-slate-500">
          Drag to orbit · scroll to zoom · click a body for details
        </p>
      )}
    </div>
  );
}
