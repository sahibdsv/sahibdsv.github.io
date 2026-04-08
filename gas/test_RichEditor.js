const fs = require('fs');
const assert = require('assert');

// Read and evaluate the Apps Script file
const code = fs.readFileSync('gas/RichEditor.gs', 'utf8');

// Global scope injection to avoid ReferenceError
global.SpreadsheetApp = {};
global.HtmlService = {};

eval(code);

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(err);
    testsFailed++;
  }
}

// ─── Tests for saveToActiveCell ─────────────────────────────

runTest('saveToActiveCell - sets value and returns true when range exists', () => {
  let setValueCalledWith = null;
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getActiveSheet: () => ({
        getActiveRange: () => ({
          setValue: (val) => { setValueCalledWith = val; }
        })
      })
    })
  };

  const result = saveToActiveCell('Test Content');
  assert.strictEqual(result, true, 'Should return true on success');
  assert.strictEqual(setValueCalledWith, 'Test Content', 'Should call setValue with the correct content');
});

runTest('saveToActiveCell - throws error when no active range exists', () => {
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getActiveSheet: () => ({
        getActiveRange: () => null
      })
    })
  };

  let errorThrown = false;
  try {
    saveToActiveCell('Test Content');
  } catch (err) {
    errorThrown = true;
    assert.strictEqual(err.message, 'No active cell — select a cell first.', 'Should throw the correct error message');
  }
  assert.strictEqual(errorThrown, true, 'Should throw an error');
});

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log(`All ${testsPassed} tests passed!`);
}
