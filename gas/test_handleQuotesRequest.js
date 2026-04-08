const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// Read the Google Apps Script file
const code = fs.readFileSync(__dirname + '/website.gs', 'utf8');

// Set up the mock environment
const sandbox = {
  SpreadsheetApp: {
    getActiveSpreadsheet: () => {
      throw new Error("Simulated Spreadsheet Error");
    }
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (text) => {
      return {
        text: text,
        mimeType: null,
        setMimeType: function(type) {
          this.mimeType = type;
          return this;
        }
      };
    }
  },
  Logger: {
    log: () => {}
  }
};

// Compile and run the code in the sandbox
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

// Execute the test
try {
  const result = sandbox.handleQuotesRequest_();

  // Verify that the response has the correct MIME type
  assert.strictEqual(result.mimeType, 'application/json');

  // Verify that the response text is a JSON string containing the error
  const parsedResponse = JSON.parse(result.text);
  assert.strictEqual(parsedResponse.error, 'Error: Simulated Spreadsheet Error');

  console.log("handleQuotesRequest_ error handling test passed successfully!");
} catch (e) {
  console.error("Test failed:", e);
  process.exit(1);
}
