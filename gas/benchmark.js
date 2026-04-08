const headers = Array.from({length: 100}, (_, i) => `Col${i}`);
headers[50] = "Artist";
headers[60] = "Track";
headers[70] = "Thumbnail";
headers[80] = "Link";

const listArtist = ['Artist', 'artist'];
const listTrack = ['Track', 'track', 'Song', 'song'];
const listThumbnail = ['Thumbnail', 'thumbnail'];
const listLink = ['Link', 'link', 'URL', 'url'];

// Old approach
function findColOld(headers, list) {
  const lowerH = headers.map(h => String(h || "").toLowerCase());
  for (let k of list) {
    let idx = lowerH.indexOf(k.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function runOld() {
  findColOld(headers, listArtist);
  findColOld(headers, listTrack);
  findColOld(headers, listThumbnail);
  findColOld(headers, listLink);
}

// New approach
function findColNew(lowerH, list) {
  for (let k of list) {
    let idx = lowerH.indexOf(k.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function runNew() {
  const lowerH = headers.map(h => String(h || "").toLowerCase());
  findColNew(lowerH, listArtist);
  findColNew(lowerH, listTrack);
  findColNew(lowerH, listThumbnail);
  findColNew(lowerH, listLink);
}

const ITERATIONS = 100000;

console.time("Old");
for (let i = 0; i < ITERATIONS; i++) {
  runOld();
}
console.timeEnd("Old");

console.time("New");
for (let i = 0; i < ITERATIONS; i++) {
  runNew();
}
console.timeEnd("New");
