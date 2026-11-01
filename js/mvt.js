/* Map Vizard — minimal Mapbox Vector Tile (protobuf) decoder: layers, tags and geometry only. */
(function () {
  'use strict';
  const MV = (window.MV = window.MV || {});

  class Reader {
    constructor(buf) {
      this.b = buf;
      this.pos = 0;
    }
    varint() {
      let result = 0, mul = 1, byte;
      do {
        byte = this.b[this.pos++];
        result += (byte & 0x7f) * mul;
        mul *= 128;
      } while (byte & 0x80);
      return result;
    }
    skip(wire) {
      if (wire === 0) this.varint();
      else if (wire === 1) this.pos += 8;
      else if (wire === 2) this.pos += this.varint();
      else if (wire === 5) this.pos += 4;
      else throw new Error('Unsupported protobuf wire type ' + wire);
    }
    // Iterate fields of the message ending at `end`, calling fn(field, wire).
    fields(end, fn) {
      while (this.pos < end) {
        const key = this.varint();
        const before = this.pos;
        if (fn(key >> 3, key & 7) === false) { this.pos = before; this.skip(key & 7); }
      }
    }
    string() {
      const len = this.varint(), s = this.pos;
      this.pos += len;
      return new TextDecoder().decode(this.b.subarray(s, s + len));
    }
    packed() {
      const end = this.varint() + this.pos, out = [];
      while (this.pos < end) out.push(this.varint());
      return out;
    }
  }

  function readValue(r) {
    const end = r.varint() + r.pos;
    let v = null;
    r.fields(end, (f, w) => {
      if (f === 1) v = r.string();
      else if (f === 2) { v = new DataView(r.b.buffer, r.b.byteOffset + r.pos, 4).getFloat32(0, true); r.pos += 4; }
      else if (f === 3) { v = new DataView(r.b.buffer, r.b.byteOffset + r.pos, 8).getFloat64(0, true); r.pos += 8; }
      else if (f === 4 || f === 5) v = r.varint();
      else if (f === 6) { const n = r.varint(); v = n % 2 ? -(n + 1) / 2 : n / 2; }
      else if (f === 7) v = !!r.varint();
      else return false;
    });
    return v;
  }

  // Geometry commands → arrays of [x, y] parts (lines, or polygon rings).
  function decodeGeometry(cmds) {
    const parts = [];
    let x = 0, y = 0, i = 0, cur = null;
    const zz = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);
    while (i < cmds.length) {
      const c = cmds[i++], id = c & 7, count = c >> 3;
      if (id === 1 || id === 2) {
        for (let k = 0; k < count; k++) {
          x += zz(cmds[i++]);
          y += zz(cmds[i++]);
          if (id === 1) { cur = []; parts.push(cur); }
          cur.push([x, y]);
        }
      } else if (id === 7 && cur && cur.length) {
        cur.push(cur[0].slice());
      }
    }
    return parts;
  }

  // Decode the named layers of a tile: { layerName: { extent, features: [{ type, tags, parts }] } }
  function decode(buf, wanted) {
    const r = new Reader(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    const layers = {};
    r.fields(r.b.length, (f) => {
      if (f !== 3) return false;
      const end = r.varint() + r.pos;
      const L = { name: '', extent: 4096, keys: [], values: [], raw: [] };
      r.fields(end, (lf) => {
        if (lf === 1) L.name = r.string();
        else if (lf === 2) { const len = r.varint(); L.raw.push([r.pos, r.pos + len]); r.pos += len; }
        else if (lf === 3) L.keys.push(r.string());
        else if (lf === 4) L.values.push(readValue(r));
        else if (lf === 5) L.extent = r.varint();
        else return false;
      });
      if (!wanted.includes(L.name)) return;
      const features = L.raw.map(([s, e]) => {
        r.pos = s;
        const feat = { type: 0, tags: {}, parts: [] };
        r.fields(e, (ff) => {
          if (ff === 2) {
            const t = r.packed();
            for (let k = 0; k < t.length; k += 2) feat.tags[L.keys[t[k]]] = L.values[t[k + 1]];
          } else if (ff === 3) feat.type = r.varint();
          else if (ff === 4) feat.parts = decodeGeometry(r.packed());
          else return false;
        });
        return feat;
      });
      r.pos = end;
      layers[L.name] = { extent: L.extent, features };
    });
    return layers;
  }

  MV.mvt = { decode };
})();
