import { surfaceArrays } from './mesh.js';

// Turns one 2x2 turnaround sheet into a mesh, off the main thread so the page never freezes.

// Reads one sheet cell and separates the object from its backdrop. The backdrop is grown in from
// the cell's edges through pixels that change only gently, which also swallows soft shadows and vignettes.
function readCell(ctx, cx, cy, size, tolerance) {
  const margin = Math.round(size * 0.035);
  const s = size - margin * 2;
  const { data } = ctx.getImageData(cx + margin, cy + margin, s, s);
  const isBackdrop = new Uint8Array(s * s);
  const queue = new Int32Array(s * s);
  let head = 0;
  let tail = 0;
  const seed = (p) => {
    if (!isBackdrop[p]) {
      isBackdrop[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let i = 0; i < s; i++) {
    seed(i);
    seed(i + (s - 1) * s);
    seed(i * s);
    seed(s - 1 + i * s);
  }
  const close = (p, q) => {
    const a = p * 4;
    const b = q * 4;
    return Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]) < tolerance;
  };
  while (head < tail) {
    const p = queue[head++];
    const x = p % s;
    const y = (p - x) / s;
    if (x > 0 && close(p, p - 1)) seed(p - 1);
    if (x < s - 1 && close(p, p + 1)) seed(p + 1);
    if (y > 0 && close(p, p - s)) seed(p - s);
    if (y < s - 1 && close(p, p + s)) seed(p + s);
  }

  // Keep only the biggest solid piece, so stray shadow islands drop out
  const label = new Int32Array(s * s);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < s * s; start++) {
    if (isBackdrop[start] || label[start]) continue;
    next++;
    head = 0;
    tail = 0;
    queue[tail++] = start;
    label[start] = next;
    while (head < tail) {
      const p = queue[head++];
      const x = p % s;
      const y = (p - x) / s;
      for (const q of [x > 0 ? p - 1 : -1, x < s - 1 ? p + 1 : -1, y > 0 ? p - s : -1, y < s - 1 ? p + s : -1]) {
        if (q >= 0 && !isBackdrop[q] && !label[q]) {
          label[q] = next;
          queue[tail++] = q;
        }
      }
    }
    if (tail > bestSize) {
      bestSize = tail;
      best = next;
    }
  }

  // Shrink a little, so the photo never gets sampled from the backdrop at the very edge
  const mask = new Uint8Array(s * s);
  const r = 2;
  let x0 = s;
  let x1 = 0;
  let y0 = s;
  let y1 = 0;
  for (let y = r; y < s - r; y++) {
    for (let x = r; x < s - r; x++) {
      const p = x + y * s;
      if (label[p] === best && label[p - r] === best && label[p + r] === best && label[p - r * s] === best && label[p + r * s] === best) {
        mask[p] = 1;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  return { mask, s, margin, cx, cy, x0, x1, y0, y1 };
}

// Solid runs in one row of a mask, as [{ c: centre, r: half width }] in pixels from the box centre
function spansAt(cell, row, gap) {
  const mid = (cell.x0 + cell.x1) / 2;
  const spans = [];
  let start = -1;
  let lastOn = -1;
  for (let x = cell.x0; x <= cell.x1; x++) {
    if (cell.mask[x + row * cell.s]) {
      if (start < 0) start = x;
      else if (x - lastOn > gap) {
        spans.push([start, lastOn]);
        start = x;
      }
      lastOn = x;
    }
  }
  if (start >= 0) spans.push([start, lastOn]);
  return spans.map(([a, b]) => ({ c: (a + b) / 2 - mid, r: (b - a + 1) / 2 }));
}

function blur3D(field, nx, ny, nz, passes) {
  const tmp = new Float32Array(field.length);
  let src = field;
  let dst = tmp;
  const steps = [1, nx, nx * ny];
  const dims = [nx, ny, nz];
  for (let p = 0; p < passes; p++) {
    for (let axis = 0; axis < 3; axis++) {
      const step = steps[axis];
      for (let i = 0; i < src.length; i++) {
        const pos = axis === 0 ? i % nx : axis === 1 ? Math.floor(i / nx) % ny : Math.floor(i / (nx * ny));
        const a = pos > 0 ? src[i - step] : src[i];
        const b = pos < dims[axis] - 1 ? src[i + step] : src[i];
        dst[i] = (a + src[i] * 2 + b) / 4;
      }
      [src, dst] = [dst, src];
    }
  }
  if (src !== field) field.set(src);
}

self.onmessage = ({ data: { pixels, size, options } }) => {
  const {
    height = 2, sideFacesRight = true, tolerance = 12, power = 2.4, limbDepth = 1.1, step = 0.024, gap = 3, blur = 2,
  } = options;

  // Small stand-in for the canvas calls the cell reader needs
  const rgba = new Uint8ClampedArray(pixels);
  const ctx = {
    getImageData(x, y, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row++) {
        const from = ((y + row) * size + x) * 4;
        data.set(rgba.subarray(from, from + w * 4), row * w * 4);
      }
      return { data };
    },
  };

  const cellSize = size / 2;
  const front = readCell(ctx, 0, 0, cellSize, tolerance);
  const side = readCell(ctx, cellSize, 0, cellSize, tolerance);
  const back = readCell(ctx, 0, cellSize, cellSize, tolerance);

  const unit = (cell) => height / (cell.y1 - cell.y0 + 1);
  const uF = unit(front);
  const uS = unit(side);
  const halfW = ((front.x1 - front.x0 + 1) / 2) * uF;
  const halfD = ((side.x1 - side.x0 + 1) / 2) * uS;
  const min = [-halfW - 0.08, -height / 2 - 0.08, -halfD - 0.08];
  const max = [halfW + 0.08, height / 2 + 0.08, halfD + 0.08];

  // Sample "how far inside" on a grid
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const field = new Float32Array(nx * ny * nz);
  const zSign = sideFacesRight ? 1 : -1;
  for (let j = 0; j < ny; j++) {
    const y = min[1] + j * step;
    const t = 0.5 - y / height;
    if (t < 0 || t > 1) {
      continue;
    }
    const rowF = Math.min(front.y1, Math.round(front.y0 + t * (front.y1 - front.y0)));
    const rowS = Math.min(side.y1, Math.round(side.y0 + t * (side.y1 - side.y0)));
    const fSpans = spansAt(front, rowF, gap).map((s) => ({ c: s.c * uF, r: s.r * uF }));
    const sSpans = spansAt(side, rowS, gap).map((s) => ({ c: s.c * uS * zSign, r: s.r * uS }));
    for (const fs of fSpans) {
      for (const ss of sSpans) {
        const depth = Math.min(ss.r, fs.r * limbDepth);
        for (let k = 0; k < nz; k++) {
          const z = min[2] + k * step;
          const dz = Math.abs((z - ss.c) / depth);
          if (dz >= 1) continue;
          for (let i = 0; i < nx; i++) {
            const x = min[0] + i * step;
            const dx = Math.abs((x - fs.c) / fs.r);
            if (dx >= 1) continue;
            const v = 1 - (dx ** power + dz ** power);
            if (v > 0) field[i + j * nx + k * nx * ny] = 1;
          }
        }
      }
    }
  }
  blur3D(field, nx, ny, nz, blur);

  const at = (x, y, z) => {
    const i = Math.round((x - min[0]) / step);
    const j = Math.round((y - min[1]) / step);
    const k = Math.round((z - min[2]) / step);
    return 0.5 - field[i + j * nx + k * nx * ny];
  };
  const { positions, normals, indices } = surfaceArrays(at, min, max, step);

  // Position in the model -> place in the sheet (v runs up, image rows run down)
  const mapping = (cell, u, flip = 1) => {
    const centreX = cell.cx + cell.margin + (cell.x0 + cell.x1) / 2;
    const centreY = cell.cy + cell.margin + (cell.y0 + cell.y1) / 2;
    return [centreX / size, 1 - centreY / size, (flip / u) / size, (1 / u) / size];
  };

  self.postMessage({
    positions, normals, indices,
    front: mapping(front, uF),
    back: mapping(back, unit(back)),
    side: mapping(side, uS, zSign),
    halfWidth: halfW,
    halfDepth: halfD,
  }, [positions.buffer, normals.buffer, indices.buffer]);
};
