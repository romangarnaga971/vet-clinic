import * as THREE from 'three';

// Builds a textured 3D model from one 2x2 turnaround sheet: front, side, back and a spare view.
// The shape comes from the silhouettes, the surface from projecting the photos back onto it.
// The heavy work runs in a background thread, and the model fades in when it's done.

const vertexShader = `
  uniform float uInflate;
  varying vec3 vLocal;
  varying vec3 vNormalLocal;
  varying vec3 vNormalWorld;
  void main() {
    vLocal = position;
    vNormalLocal = normal;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vec3 p = position + normal * uInflate;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  }`;

const fragmentShader = `
  uniform sampler2D uMap;
  uniform vec4 uFront, uBack, uSide;
  uniform vec3 uLight, uTint;
  uniform float uRecolor, uGloss, uGlow, uCutAbove, uCutBelow, uAppear;
  varying vec3 vLocal;
  varying vec3 vNormalLocal;
  varying vec3 vNormalWorld;

  void main() {
    if (vLocal.y > uCutAbove || vLocal.y < uCutBelow) discard;
    vec3 n = normalize(vNormalLocal);
    vec3 w = pow(abs(n), vec3(5.));
    // Faces pointing up or down take the front or back photo, whichever side of the model they are on
    float frontSide = step(0., vLocal.z);
    float front = (n.z > 0. ? w.z : 0.) + w.y * frontSide;
    float back = (n.z < 0. ? w.z : 0.) + w.y * (1. - frontSide);
    float side = w.x;
    float sum = front + back + side + 1e-4;

    // Each view maps the model's own position straight onto its place in the sheet
    vec2 f = uFront.xy + vec2(vLocal.x, vLocal.y) * uFront.zw;
    vec2 b = uBack.xy + vec2(-vLocal.x, vLocal.y) * uBack.zw;
    vec2 s = uSide.xy + vec2(vLocal.z, vLocal.y) * uSide.zw;
    vec3 color = (texture2D(uMap, f).rgb * front + texture2D(uMap, b).rgb * back + texture2D(uMap, s).rgb * side) / sum;

    if (uRecolor > .5) {
      float lum = dot(color, vec3(.3, .59, .11));
      color = mix(uTint * pow(lum, 1.15) * 3., vec3(1.), smoothstep(.5, .95, lum) * .75);
    }

    // The photo already has soft studio light, so this only adds a little movement as it turns
    vec3 nw = normalize(vNormalWorld);
    float lit = .86 + max(dot(nw, uLight), 0.) * .26;
    vec3 view = normalize(cameraPosition);
    float rim = pow(1. - max(dot(nw, view), 0.), 3.);
    // uGlow lights up the darkest parts, for carved faces with a candle inside
    float dark = 1. - smoothstep(.006, .05, dot(color, vec3(.3, .59, .11)));
    color = color * lit + vec3(rim * uGloss) + vec3(1., .62, .25) * uGlow * dark;
    gl_FragColor = vec4(color, uAppear);
    #include <colorspace_fragment>
  }`;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * options:
 *   src        sheet image
 *   height     world height of the model (default 2)
 *   sideFacesRight  true if the front of the object points right in the side view
 *   tolerance  how sharp a change must be to count as the object's edge
 *   power      2 is a round section, higher is boxier
 *   limbDepth  how deep a narrow part is compared with its width
 *   step       grid size, smaller is finer
 */
export async function buildSheetModel(options) {
  const { src, ...shape } = options;
  const img = await loadImage(src);
  const size = img.naturalWidth;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, size, size).data.buffer;

  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sheet.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      resolve(data);
    };
    worker.onerror = reject;
    worker.postMessage({ pixels, size, options: shape }, [pixels]);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(result.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(result.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    uniforms: {
      uMap: { value: texture },
      uFront: { value: new THREE.Vector4(...result.front) },
      uBack: { value: new THREE.Vector4(...result.back) },
      uSide: { value: new THREE.Vector4(...result.side) },
      uLight: { value: new THREE.Vector3(-0.4, 0.7, 0.6).normalize() },
      uTint: { value: new THREE.Color(0xffffff) },
      uRecolor: { value: 0 },
      uGloss: { value: 0.05 },
      uGlow: { value: 0 },
      uInflate: { value: 0 },
      uCutAbove: { value: 99 },
      uCutBelow: { value: -99 },
      uAppear: { value: 0 },
    },
  });
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (window.gsap && !calm) window.gsap.to(material.uniforms.uAppear, { value: 1, duration: 0.7, ease: 'power2.out' });
  else material.uniforms.uAppear.value = 1;

  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, material, halfWidth: result.halfWidth, halfDepth: result.halfDepth };
}
