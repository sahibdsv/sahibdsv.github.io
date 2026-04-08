const fs = require('fs');
const assert = require('assert');

const gasCode = fs.readFileSync(__dirname + '/website.gs', 'utf8');

// Extract findCol_ function specifically to avoid GAS dependencies
const match = gasCode.match(/function findCol_\(headers, list\) \{[\s\S]*?\n\}/);

if (!match) {
  console.error("Function findCol_ not found in website.gs");
  process.exit(1);
}

// Evaluate the extracted function into global scope
eval(match[0]);

console.log("Running tests for findCol_...");
let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`❌ ${name}`);
    console.error(`   ${e.message}`);
    failed++;
  }
}

// Happy path
runTest('Exact match should return correct index', () => {
  assert.strictEqual(findCol_(['Artist', 'Track', 'Link'], ['Track']), 1);
});

// Case insensitivity
runTest('Should handle lowercase headers and uppercase lists', () => {
  assert.strictEqual(findCol_(['artist', 'TRACK', 'link'], ['track']), 1);
});

runTest('Should handle uppercase list', () => {
  assert.strictEqual(findCol_(['Artist', 'Track', 'Link'], ['TRACK']), 1);
});

// List fallback logic
runTest('Should match second item in list if first is missing', () => {
  assert.strictEqual(findCol_(['Artist', 'Track', 'Link'], ['Song', 'Track']), 1);
});

runTest('Should match first item in the list array that is found', () => {
  assert.strictEqual(findCol_(['Artist', 'Track', 'Song'], ['Song', 'Track']), 2);
});

// Edge cases
runTest('Should return -1 when no match is found', () => {
  assert.strictEqual(findCol_(['Artist', 'Track', 'Link'], ['Album', 'Year']), -1);
});

runTest('Should handle null/undefined/empty string headers', () => {
  assert.strictEqual(findCol_([null, undefined, '', 'Track'], ['Track']), 3);
});

runTest('Should return -1 for empty list', () => {
  assert.strictEqual(findCol_(['Artist', 'Track'], []), -1);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
