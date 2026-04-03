// v2.1.0
/**
 * CMS Rich Editor — Companion module for website.gs
 * 
 * Paste this into a NEW file in the same Apps Script project as website.gs.
 * In the Apps Script editor: click (+) > Script > name it "RichEditor"
 *
 * No function conflicts with website.gs:
 *   - website.gs has: onEdit, doGet, doPost, updateWebsiteCache_, etc.
 *   - This file adds: onOpen, openRichEditor, getActiveCellValue, saveToActiveCell
 */

// ─── Menu Hook ───────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CMS')
    .addItem('Open Rich Editor', 'openRichEditor')
    .addToUi();
}

// ─── Open the Editor Modal ───────────────────────────────────
function openRichEditor() {
  const html = HtmlService.createHtmlOutputFromFile('Editor')
    .setWidth(960)
    .setHeight(640)
    .setTitle('CMS — Markdown Editor');
  SpreadsheetApp.getUi().showModalDialog(html, 'Markdown Editor');
}

// ─── Data Bridge: Sheet → Editor ─────────────────────────────
function getActiveCellValue() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getActiveRange();

  if (!range) return { value: '', cell: 'No cell selected', sheet: sheet.getName() };

  return {
    value: range.getValue().toString(),
    cell: range.getA1Notation(),
    sheet: sheet.getName()
  };
}

// ─── Data Bridge: Editor → Sheet ─────────────────────────────
function saveToActiveCell(content) {
  const range = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getActiveRange();
  if (!range) throw new Error('No active cell — select a cell first.');
  range.setValue(content);
  return true;
}
