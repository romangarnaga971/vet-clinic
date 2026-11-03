// Turns a signed distance function (negative inside) into a smooth mesh, using surface nets.
export function surfaceArrays(sdf, min, max, step) {
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const at = (i, j, k) => i + j * nx + k * nx * ny;

  const field = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        field[at(i, j, k)] = sdf(min[0] + i * step, min[1] + j * step, min[2] + k * step);
      }
    }
  }

  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cell = new Int32Array(field.length).fill(-1);
  const positions = [];

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const values = corners.map(([a, b, c]) => field[at(i + a, j + b, k + c)]);
        if (values.every((v) => v < 0) || values.every((v) => v >= 0)) continue;

        // The vertex sits at the average of where the surface crosses this cell's edges
        let x = 0;
        let y = 0;
        let z = 0;
        let n = 0;
        for (const [p, q] of edges) {
          if (values[p] < 0 === values[q] < 0) continue;
          const t = values[p] / (values[p] - values[q]);
          x += corners[p][0] + (corners[q][0] - corners[p][0]) * t;
          y += corners[p][1] + (corners[q][1] - corners[p][1]) * t;
          z += corners[p][2] + (corners[q][2] - corners[p][2]) * t;
          n++;
        }
        cell[at(i, j, k)] = positions.length / 3;
        positions.push(
          min[0] + (i + x / n) * step,
          min[1] + (j + y / n) * step,
          min[2] + (k + z / n) * step,
        );
      }
    }
  }

  const indices = [];
  const quad = (a, b, c, d, flip) => {
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v = field[at(i, j, k)];
        const flip = v >= 0;
        if (j > 0 && k > 0 && v < 0 !== field[at(i + 1, j, k)] < 0) {
          quad(cell[at(i, j - 1, k - 1)], cell[at(i, j, k - 1)], cell[at(i, j, k)], cell[at(i, j - 1, k)], flip);
        }
        if (i > 0 && k > 0 && v < 0 !== field[at(i, j + 1, k)] < 0) {
          quad(cell[at(i - 1, j, k - 1)], cell[at(i - 1, j, k)], cell[at(i, j, k)], cell[at(i, j, k - 1)], flip);
        }
        if (i > 0 && j > 0 && v < 0 !== field[at(i, j, k + 1)] < 0) {
          quad(cell[at(i - 1, j - 1, k)], cell[at(i, j - 1, k)], cell[at(i, j, k)], cell[at(i - 1, j, k)], flip);
        }
      }
    }
  }

  // Smooth normals: each vertex averages the faces around it
  const normals = new Float32Array(positions.length);
  const p = positions;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const ux = p[b] - p[a];
    const uy = p[b + 1] - p[a + 1];
    const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a];
    const vy = p[c + 1] - p[a + 1];
    const vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      normals[v] += nx;
      normals[v + 1] += ny;
      normals[v + 2] += nz;
    }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const len = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
    normals[v] /= len;
    normals[v + 1] /= len;
    normals[v + 2] /= len;
  }
  return { positions: new Float32Array(positions), normals, indices: new Uint32Array(indices) };
}
