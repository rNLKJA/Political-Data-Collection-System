/**
 * Decoder for the inverted-index blobs in `analytics.db` (`terms.postings`):
 * a sequence of unsigned LEB128 varints, alternating (doc-id delta, count).
 * Encoded by `encode_postings` in scripts/build_analytics.py.
 */

export interface Postings {
  docs: Int32Array;
  counts: Int32Array;
}

export function decodePostings(buf: Uint8Array): Postings {
  // Upper bound: every varint is at least one byte, two varints per posting.
  const docs = new Int32Array(buf.length >> 1);
  const counts = new Int32Array(buf.length >> 1);
  let n = 0;
  let i = 0;
  let prev = 0;
  const read = () => {
    let shift = 0;
    let value = 0;
    for (;;) {
      const b = buf[i++];
      value += (b & 0x7f) * 2 ** shift;
      if ((b & 0x80) === 0) return value;
      shift += 7;
    }
  };
  while (i < buf.length) {
    prev += read();
    docs[n] = prev;
    counts[n] = read();
    n++;
  }
  return { docs: docs.slice(0, n), counts: counts.slice(0, n) };
}

/** Inverse of {@link decodePostings}; used by tests. */
export function encodePostings(pairs: Array<[number, number]>): Uint8Array {
  const out: number[] = [];
  const write = (v: number) => {
    let n = v;
    for (;;) {
      const b = n % 128;
      n = Math.floor(n / 128);
      if (n) out.push(b | 0x80);
      else {
        out.push(b);
        return;
      }
    }
  };
  let prev = 0;
  for (const [doc, cnt] of pairs) {
    write(doc - prev);
    write(cnt);
    prev = doc;
  }
  return Uint8Array.from(out);
}
