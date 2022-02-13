!(function () {
  "use strict";
  class t {
    constructor(t = 0, e = 0, i = 0) {
      (this.x = t), (this.y = e), (this.z = i);
    }
    length() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }
    addVectors(t, e) {
      return (
        (this.x = t.x + e.x), (this.y = t.y + e.y), (this.z = t.z + e.z), this
      );
    }
    subVectors(t, e) {
      return (
        (this.x = t.x - e.x), (this.y = t.y - e.y), (this.z = t.z - e.z), this
      );
    }
    multiplyScalar(t) {
      return (this.x *= t), (this.y *= t), (this.z *= t), this;
    }
    divide(t) {
      return (this.x /= t.x), (this.y /= t.y), (this.z /= t.z), this;
    }
    divideScalar(t) {
      return this.multiplyScalar(1 / t);
    }
    min(t) {
      return (
        (this.x = Math.min(this.x, t.x)),
        (this.y = Math.min(this.y, t.y)),
        (this.z = Math.min(this.z, t.z)),
        this
      );
    }
    max(t) {
      return (
        (this.x = Math.max(this.x, t.x)),
        (this.y = Math.max(this.y, t.y)),
        (this.z = Math.max(this.z, t.z)),
        this
      );
    }
    dot(t) {
      return this.x * t.x + this.y * t.y + this.z * t.z;
    }
    normalize() {
      return this.divideScalar(this.length() || 1);
    }
    crossVectors(t, e) {
      const i = t.x,
        n = t.y,
        r = t.z,
        s = e.x,
        o = e.y,
        h = e.z;
      return (
        (this.x = n * h - r * o),
        (this.y = r * s - i * h),
        (this.z = i * o - n * s),
        this
      );
    }
    fromBufferAttribute(t, e, i) {
      return (
        void 0 !== i &&
          console.warn(
            "THREE.Vector3: offset has been removed from .fromBufferAttribute()."
          ),
        (this.x = t.getX(e)),
        (this.y = t.getY(e)),
        (this.z = t.getZ(e)),
        this
      );
    }
  }

  class e {
    constructor(
      e = new t(1 / 0, 1 / 0, 1 / 0),
      i = new t(-1 / 0, -1 / 0, -1 / 0)
    ) {
      (this.min = e), (this.max = i);
    }
    isEmpty() {
      return (
        this.max.x < this.min.x ||
        this.max.y < this.min.y ||
        this.max.z < this.min.z
      );
    }
    getCenter(t) {
      return this.isEmpty()
        ? t.set(0, 0, 0)
        : t.addVectors(this.min, this.max).multiplyScalar(0.5);
    }
    getSize(t) {
      return this.isEmpty() ? t.set(0, 0, 0) : t.subVectors(this.max, this.min);
    }
    expandByPoint(t) {
      return this.min.min(t), this.max.max(t), this;
    }
    union(t) {
      return this.min.min(t.min), this.max.max(t.max), this;
    }
  }

  function i(t, e, i) {
    const n = t[i];
    (t[i] = t[e]), (t[e] = n);
  }

  const n = new t();

  function r(t, e) {
    return { primitives: t, bounds: e };
  }

  function s(t, e, i) {
    let n = i[e] - t.min[e];
    return t.max[e] > t.min[e] && (n /= t.max[e] - t.min[e]), n;
  }

  function o(t) {
    return t.getSize(n), 2 * (n.x * n.z + n.x * n.y + n.z * n.y);
  }

  function h(t, a, u) {
    const l = new e();
    for (let e = a; e < u; e++) l.union(t[e].bounds);
    const c = u - a;
    if (1 === c) return r(t.slice(a, u), l);
    {
      const y = new e();
      for (let e = a; e < u; e++) y.expandByPoint(t[e].center);
      const z =
        (y.getSize(n),
        n.x > n.z ? (n.x > n.y ? "x" : "y") : n.z > n.y ? "z" : "y");
      let d = Math.floor((a + u) / 2);
      if (c <= 4)
        !(function (t, e, n = 0, r = t.length, s = Math.floor((n + r) / 2)) {
          for (let o = n; o <= s; o++) {
            let n = o,
              s = t[o];
            for (let h = o + 1; h < r; h++)
              e(s, t[h]) || ((n = h), (s = t[h]), i(t, o, n));
          }
        })(t, (t, e) => t.center[z] < e.center[z], a, u, d);
      else {
        if (y.max[z] === y.min[z]) return r(t.slice(a, u), l);
        {
          const n = 12,
            r = [];
          for (let t = 0; t < n; t++) r.push({ bounds: new e(), count: 0 });
          for (let e = a; e < u; e++) {
            let i = Math.floor(n * s(y, z, t[e].center));
            i === r.length && (i = r.length - 1),
              r[i].count++,
              r[i].bounds.union(t[e].bounds);
          }
          const h = [];
          for (let t = 0; t < r.length - 1; t++) {
            const i = new e(),
              n = new e();
            let s = 0,
              a = 0;
            for (let e = 0; e <= t; e++)
              i.union(r[e].bounds), (s += r[e].count);
            for (let e = t + 1; e < r.length; e++)
              n.union(r[e].bounds), (a += r[e].count);
            h.push(0.1 + (s * o(i) + a * o(n)) / o(l));
          }
          let c = h[0],
            m = 0;
          for (let t = 1; t < h.length; t++) h[t] < c && ((c = h[t]), (m = t));
          d = (function (t, e, n = 0, r = t.length) {
            for (; n !== r; ) {
              for (; e(t[n]); ) if (++n === r) return n;
              do {
                if (n === --r) return n;
              } while (!e(t[r]));
              i(t, n, r), n++;
            }
            return n;
          })(
            t,
            (t) => {
              let e = Math.floor(r.length * s(y, z, t.center));
              return e === r.length && (e = r.length - 1), e <= m;
            },
            a,
            u
          );
        }
      }
      return (
        (m = z),
        (x = h(t, a, d)),
        (f = h(t, d, u)),
        {
          child0: x,
          child1: f,
          bounds: new e().union(x.bounds).union(f.bounds),
          splitAxis: m,
        }
      );
    }
    var m, x, f;
  }

  function a(i) {
    const n = (function (i) {
      const n = [],
        r = i.getIndex ? i.getIndex().array : i.index.array,
        s = i.getAttribute ? i.getAttribute("position") : i.attributes.position,
        o = i.getAttribute
          ? i.getAttribute("materialMeshIndex")
          : i.attributes.materialMeshIndex,
        h = new t(),
        a = new t(),
        u = new t(),
        l = new t(),
        c = new t();
      for (let m = 0; m < r.length; m += 3) {
        const i = r[m],
          x = r[m + 1],
          f = r[m + 2],
          y = new e();
        s.getX
          ? (h.fromBufferAttribute(s, i),
            a.fromBufferAttribute(s, x),
            u.fromBufferAttribute(s, f))
          : ((h.x = s.array[i * s.itemSize]),
            (h.y = s.array[i * s.itemSize + 1]),
            (h.z = s.array[i * s.itemSize + 2]),
            (a.x = s.array[x * s.itemSize]),
            (a.y = s.array[x * s.itemSize + 1]),
            (a.z = s.array[x * s.itemSize + 2]),
            (u.x = s.array[f * s.itemSize]),
            (u.y = s.array[f * s.itemSize + 1]),
            (u.z = s.array[f * s.itemSize + 2])),
          y.expandByPoint(h),
          y.expandByPoint(a),
          y.expandByPoint(u),
          l.subVectors(u, h),
          c.subVectors(a, h);
        const z = new t().crossVectors(c, l).normalize(),
          d = {
            bounds: y,
            center: y.getCenter(new t()),
            indices: [i, x, f],
            faceNormal: z,
            materialIndex: o.getX ? o.getX(i) : o.array[i * o.itemSize],
          };
        n.push(d);
      }
      return n;
    })(i);
    return h(n, 0, n.length);
  }

  self.onmessage = function ({ data: t }) {
    const { geometry: e } = t;
    try {
      const t = (function (t) {
        const e = [],
          i = [],
          n = { x: 0, y: 1, z: 2 };
        let r = 1;
        const s = (t, o = 1) => {
          if (((r = Math.max(o, r)), t.primitives))
            for (let n = 0; n < t.primitives.length; n++) {
              const r = t.primitives[n];
              e.push(
                r.indices[0],
                r.indices[1],
                r.indices[2],
                t.primitives.length,
                r.faceNormal.x,
                r.faceNormal.y,
                r.faceNormal.z,
                r.materialIndex
              ),
                i.push(!1);
            }
          else {
            const r = t.bounds;
            e.push(
              r.min.x,
              r.min.y,
              r.min.z,
              n[t.splitAxis],
              r.max.x,
              r.max.y,
              r.max.z,
              null
            );
            const h = e.length - 1;
            i.push(!0),
              s(t.child0, o + 1),
              (e[h] = e.length / 4),
              s(t.child1, o + 1);
          }
        };
        s(t);
        const o = new ArrayBuffer(4 * e.length),
          h = new Float32Array(o),
          a = new Int32Array(o);
        for (let u = 0; u < i.length; u++) {
          let t = 8 * u;
          i[u]
            ? ((h[t] = e[t]),
              (h[t + 1] = e[t + 1]),
              (h[t + 2] = e[t + 2]),
              (a[t + 3] = e[t + 3]))
            : ((a[t] = e[t]),
              (a[t + 1] = e[t + 1]),
              (a[t + 2] = e[t + 2]),
              (a[t + 3] = -e[t + 3])),
            (h[t + 4] = e[t + 4]),
            (h[t + 5] = e[t + 5]),
            (h[t + 6] = e[t + 6]),
            (a[t + 7] = e[t + 7]);
        }
        return { maxDepth: r, count: e.length / 4, buffer: h };
      })(a(e));
      self.postMessage({ error: null, flattenedBvh: t });
    } catch (i) {
      self.postMessage({ error: i, flattenedBvh: null });
    }
  };
})();
