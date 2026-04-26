const WEBSITE_CONFIG = {
  sheetId: '1DD2Ax-XDGYBKuoe_ajqhIMUDBH0-pC2P4iHS_OpUDoQ',
  apiToken: 'CHANGE_ME'
};


/**
 * Handles incoming POST requests from ScriptCat/Tasker.
 */
function doPost(e) {
  Logger.log("doPost received: " + JSON.stringify(e));
  try {
    // --- AUTHENTICATION CHECK ---
    let requestToken = e.parameter ? e.parameter.token : null;
    if (!requestToken && e.postData && e.postData.contents) {
      try {
        const parsed = JSON.parse(e.postData.contents);
        requestToken = parsed.token;
      } catch (err) {
        // Ignore parse error here
      }
    }

    if (requestToken !== WEBSITE_CONFIG.apiToken) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // --- Intercept Feedback Commands from Website ---
    if (e.parameter && (e.parameter.type === 'feedback' || e.parameter.category)) {
      Logger.log("Processing feedback: " + JSON.stringify(e.parameter));
      const category = e.parameter.category || "";
      const message = e.parameter.message || "";
      const path = e.parameter.path || "";
      
      const ss = SpreadsheetApp.openById(WEBSITE_CONFIG.sheetId);
      if (!ss) throw new Error("Could not open spreadsheet with ID: " + WEBSITE_CONFIG.sheetId);
      
      // Ensure the exact tab exists with the 4 demanded columns
      const sheet = ensureTab_(ss, "Variables", ["Timestamp", "Category", "Message", "Path"]);
      if (!sheet) throw new Error("Could not access or create 'Variables' sheet.");
      
      const timestamp = e.parameter.timestamp || new Date();
      sheet.appendRow([timestamp, category, message, path]);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return JSON_ERROR_("Unsupported request or feature disabled.");


  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Serves Rewind data for the personal website.
 */
/**
 * Serves Music data for the personal website via a secure JSON endpoint.
 * Supports: ?action=rewind, ?action=recent, or default (both).
 */
function doGet(e) {
  try {
    // 1. QUOTES DISCOVERY (Unified Spec)
    if (e.parameter.type === 'quotes') {
      return handleQuotesRequest_();
    }

    return JSON_ERROR_("Action not supported.");

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handles secure quotes discovery with server-side randomization.
 */
function handleQuotesRequest_() {
  const QUOTES_GID = '540861260';
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === QUOTES_GID);
    if (!sheet) return JSON_ERROR_("The 'Quotes' sheet was not found in this spreadsheet.");
    
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    
    // Find column indices for Quote, Author, Source (resilient mapping)
    const lowerH = headers.map(h => String(h || "").toLowerCase());
    const find = (list) => {
      for (let k of list) {
        let idx = lowerH.indexOf(k.toLowerCase());
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idx = {
      quote: find(['Quote', 'quote']),
      author: find(['Author', 'author']),
      source: find(['Source', 'source'])
    };

    // Convert to JSON objects with explicit Unified Schema keys
    const allQuotes = data.filter(r => r[idx.quote]).map(r => ({
      Quote: r[idx.quote],
      Author: r[idx.author] || "Unknown",
      Source: r[idx.source] || ""
    }));
    
    // Server-Side Randomization (Fisher-Yates)
    for (let i = allQuotes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuotes[i], allQuotes[j]] = [allQuotes[j], allQuotes[i]];
    }
    
    // Return discovery subset (Unified Spec Key: quotes)
    return ContentService.createTextOutput(JSON.stringify({
      quotes: allQuotes.slice(0, 50)
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function JSON_ERROR_(msg) {
  return ContentService.createTextOutput(JSON.stringify({ status: "error", error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}







function ensureTab_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}


