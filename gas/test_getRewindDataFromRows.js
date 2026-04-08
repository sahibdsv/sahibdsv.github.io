const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Read the website.gs file
const code = fs.readFileSync(path.join(__dirname, 'website.gs'), 'utf8');

// Evaluate it in the current context to make functions available
eval(code);

function runTests() {
  console.log("Testing getRewindDataFromRows_ error handling...");

  const mockRows = [['Source', 'Artist Name', 'Track Name', 'url', 'thumb']];

  // Test 1: Missing Artist
  let headersMissingArtist = ['Source', 'Missing', 'Track', 'Link', 'Thumbnail'];
  let result1 = getRewindDataFromRows_(mockRows, headersMissingArtist);
  assert.strictEqual(typeof result1.error, 'string', 'Expected error string for missing Artist');
  assert.match(result1.error, /Missing music columns: Artist\(-1\), Track\(2\)/);

  // Test 2: Missing Track
  let headersMissingTrack = ['Source', 'Artist', 'Missing', 'Link', 'Thumbnail'];
  let result2 = getRewindDataFromRows_(mockRows, headersMissingTrack);
  assert.strictEqual(typeof result2.error, 'string', 'Expected error string for missing Track');
  assert.match(result2.error, /Missing music columns: Artist\(1\), Track\(-1\)/);

  // Test 3: Missing Both
  let headersMissingBoth = ['Source', 'Missing', 'Missing', 'Link', 'Thumbnail'];
  let result3 = getRewindDataFromRows_(mockRows, headersMissingBoth);
  assert.strictEqual(typeof result3.error, 'string', 'Expected error string for missing Both');
  assert.match(result3.error, /Missing music columns: Artist\(-1\), Track\(-1\)/);

  // Test 4: Happy path (should not have error property)
  let headersGood = ['Source', 'Artist', 'Track', 'Link', 'Thumbnail'];
  let result4 = getRewindDataFromRows_(mockRows, headersGood);
  assert.strictEqual(result4.error, undefined, 'Expected no error for good headers');
  assert.strictEqual(result4.totalPlays, 1, 'Expected 1 total play');

  console.log("All getRewindDataFromRows_ tests passed! ✅");
}

try {
  runTests();
} catch (e) {
  console.error("Test failed:", e);
  process.exit(1);
}
