const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Read website.gs and extract the fuzzyNorm_ function
const gsContent = fs.readFileSync(path.join(__dirname, '../../gas/website.gs'), 'utf8');

const script = `
${gsContent}
module.exports = { fuzzyNorm_ };
`;

try {
    const fn = new Function('module', script);
    const moduleObj = { exports: {} };
    fn(moduleObj);
    const fuzzyNorm_ = moduleObj.exports.fuzzyNorm_;

    // Tests
    let passed = 0;
    let failed = 0;

    function test(name, input, expected) {
        try {
            const result = fuzzyNorm_(input);
            assert.strictEqual(result, expected);
            passed++;
            console.log(`✅ ${name}`);
        } catch (e) {
            failed++;
            console.error(`❌ ${name}`);
            console.error(`   Expected: ${expected}`);
            console.error(`   Got:      ${e.actual}`);
        }
    }

    console.log("Running fuzzyNorm_ tests...\n");

    // Falsy values
    test("Empty string", "", "");
    test("Null", null, "");
    test("Undefined", undefined, "");

    // Normalization
    test("Basic lowercase", "Hello World", "hello world");
    test("Trim leading/trailing spaces", "  Hello World  ", "hello world");
    test("Normalize multiple spaces", "Hello    World", "hello world");
    test("Mixed case", "hElLo WoRlD", "hello world");

    // Edge cases
    test("Numbers as strings", "123 456", "123 456");
    test("Numbers", 123456, "123456"); // String(s) handles this
    test("Special characters", "Song (Remix) [feat. Artist]", "song (remix) [feat. artist]");
    test("Newline characters", "Line1\nLine2", "line1 line2");
    test("Tabs", "Word1\tWord2", "word1 word2");

    console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
    process.exit(failed > 0 ? 1 : 0);

} catch (e) {
    console.error("Error evaluating script:", e);
    process.exit(1);
}
