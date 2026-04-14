const fs = require('fs');
const assert = require('assert');

// 1. Read the Google Apps Script code
const gsCode = fs.readFileSync(__dirname + '/website.gs', 'utf8');

// 2. Evaluate it into the global context
// This makes fuzzyNorm_ and other functions available for testing
eval(gsCode);

// 3. Test cases for fuzzyNorm_
function runTests() {
  console.log("Running tests for fuzzyNorm_...");

  // Happy paths
  assert.strictEqual(fuzzyNorm_("Hello World"), "hello world", "Should handle mixed case");
  assert.strictEqual(fuzzyNorm_("HELLO WORLD"), "hello world", "Should handle all caps");
  assert.strictEqual(fuzzyNorm_("hello world"), "hello world", "Should handle all lowercase");

  // Empty/falsy inputs
  assert.strictEqual(fuzzyNorm_(""), "", "Should handle empty string");
  assert.strictEqual(fuzzyNorm_(null), "", "Should handle null");
  assert.strictEqual(fuzzyNorm_(undefined), "", "Should handle undefined");
  assert.strictEqual(fuzzyNorm_(false), "", "Should handle false");
  assert.strictEqual(fuzzyNorm_(0), "", "Should handle 0");

  // Whitespace handling (leading/trailing/multiple)
  assert.strictEqual(fuzzyNorm_("  leading"), "leading", "Should trim leading spaces");
  assert.strictEqual(fuzzyNorm_("trailing  "), "trailing", "Should trim trailing spaces");
  assert.strictEqual(fuzzyNorm_("  both  "), "both", "Should trim both leading and trailing spaces");
  assert.strictEqual(fuzzyNorm_("multiple    spaces"), "multiple spaces", "Should collapse multiple spaces");

  // Tabs and newlines
  assert.strictEqual(fuzzyNorm_("tabs\tand\tnewlines\n"), "tabs and newlines", "Should handle tabs and newlines as spaces");
  assert.strictEqual(fuzzyNorm_("\n\n\n\n\n"), "", "Should handle string with only newlines");
  assert.strictEqual(fuzzyNorm_("\t\t\t"), "", "Should handle string with only tabs");

  // Non-string inputs
  assert.strictEqual(fuzzyNorm_(12345), "12345", "Should handle numbers");

  // Edge cases
  assert.strictEqual(fuzzyNorm_("  a   b   c  "), "a b c", "Should handle spaced letters");
  assert.strictEqual(fuzzyNorm_(" !@#$%^&*() "), "!@#$%^&*()", "Should preserve punctuation");

  console.log("All tests passed!");
}

runTests();
