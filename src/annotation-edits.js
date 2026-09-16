export function letterNumber(label) {
  return /^[A-Z]+$/.test(label)
    ? [...label].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
    : 0;
}
export function letterLabel(n) {
  let s = "";
  for (; n > 0; n = Math.floor(n / 26)) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
  }
  return s;
}

const faceKey = (p) => `${p.meshId}:${p.faceIndex}`;

/* A face covered end to end is spelled by its own number and nothing else.
   `faces` already names it; a polygon repeating the triangle that number
   points at costs about 142 bytes to say a second time what the index said
   for six. So under `source-v2` a face listed in `faces` with no patch beside
   it means the whole face, and a face with patches means those patches and no
   more.

   Nothing writes a patch any longer — the bucket is the only tool that marks
   surface, and every face it hands over is entire by construction. The subset
   this allows for is `source-v1` drafts already on disk, which still carry
   polygons and still have to render. */
export const wholeFaces = (region) => {
  const whole = new Set();
  for (const [meshId, faces] of Object.entries(region.faces || {}))
    for (const f of faces) whole.add(`${meshId}:${f}`);
  for (const p of region.surfacePatches || []) whole.delete(faceKey(p));
  return whole;
};

// Kept between fills; rebuilding it per fill would walk the whole draft each
// time. Thrown away when the region is not the object it was built from, or
// left a different number of patches behind.
export function paintIndex(region, previous) {
  if (
    previous?.region === region &&
    previous.count === region.surfacePatches.length
  )
    return previous;
  return {
    region,
    count: region.surfacePatches.length,
    whole: wholeFaces(region),
  };
}

/* `whole` arrives as the tool's claim and leaves as an absence: the face is
   recorded, the polygon describing it is not.

   A patch that does not claim its whole face is refused rather than stored.
   Storing one would be the old brush representation creeping back in through a
   tool that cannot produce it, and a path that never runs is exactly the kind
   that was dead for a whole release without anyone noticing. */
export function addPatches(region, patches, index) {
  for (const { whole, ...p } of patches) {
    if (!whole)
      throw new Error(`partial coverage of ${faceKey(p)} is no longer stored`);
    const key = faceKey(p);
    if (index.whole.has(key)) continue;
    index.whole.add(key);
    (region.faces[p.meshId] ||= []).push(p.faceIndex);
  }
  index.count = region.surfacePatches.length;
  for (const key of Object.keys(region.faces))
    region.faces[key] = [...new Set(region.faces[key])].sort((a, b) => a - b);
  return index;
}
