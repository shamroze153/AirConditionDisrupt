
/**
 * DISRUPT_FM_ULTIMATE Backend v2.3 - Material Demands & Tools Extension
 * SPREADSHEET_ID: 1yS28yOFwRWHoSvMmIm6bEisBFHTrQLiFZc38e6pnpv4
 */

const SPREADSHEET_ID = "1yS28yOFwRWHoSvMmIm6bEisBFHTrQLiFZc38e6pnpv4";

function initializeSheets(ss) {
  const required = {
    'Master_Assets': ['ID', 'Tag', 'Room', 'Location', 'Campus', 'Floor', 'Brand', 'Capacity', 'Status', 'Year', 'Health'],
    'Work_Orders': ['Timestamp', 'Category', 'Location', 'AssetTag', 'Details', 'AssignedTo', 'Status', 'ResolvedBy', 'WorkType', 'Remarks', 'GasUsed', 'GasType'],
    'Checklist_Audit': ['Timestamp', 'Technician', 'AssetTag', 'Task', 'Status', 'Remarks'],
    'Gas_Ledger': ['Timestamp', 'ActionType', 'GasType', 'Amount', 'Technician', 'Reference'],
    'Performance_Log': ['Timestamp', 'Technician', 'Points', 'Reason'],
    'System_Insights': ['Timestamp', 'AssetTag', 'Category', 'Details', 'Status'],
    'Material_Demands': ['Timestamp', 'Technician', 'Details', 'Status', 'GasType', 'GasAmount']
  };
  
  Object.keys(required).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(required[name]);
      sheet.getRange(1, 1, 1, required[name].length).setFontWeight("bold").setBackground("#f3f3f3");
    }
  });
}

function doGet(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  initializeSheets(ss);

  if (typeof e === 'undefined' || !e || !e.parameter) {
    return ContentService.createTextOutput("DISRUPT FM BACKEND v2.3 ACTIVE.").setMimeType(ContentService.MimeType.TEXT);
  }

  const action = e.parameter.action;
  
  try {
    if (action === 'get_assets') {
      const sheet = ss.getSheetByName('Master_Assets');
      const data = sheet.getDataRange().getValues();
      const assets = data.slice(1).map(row => ({
        id: row[0], tag: row[1], room: row[2], location: row[3], campus: row[4],
        floor: row[5], brand: row[6], cap: row[7], status: row[8], year: row[9],
        healthScore: row[10] || 100
      }));
      return createJsonResponse(assets);
    }

    if (action === 'get_stats') {
      const complaints = getSheetData(ss, 'Work_Orders').map((row, idx) => ({
        rowIndex: idx + 2, date: row[0], category: row[1], location: row[2],
        assetTag: row[3], details: row[4], assignedTo: row[5], status: row[6],
        resolvedBy: row[7], workType: row[8], remarks: row[9], gasUsedKG: row[10], gasType: row[11]
      }));

      const checkData = getSheetData(ss, 'Checklist_Audit');
      const todayStr = new Date().toDateString();
      const daily = checkData.filter(r => new Date(r[0]).toDateString() === todayStr && String(r[3]).includes('Daily')).map(r => r[2]);
      const monthly = checkData.filter(r => new Date(r[0]).toDateString() === todayStr && String(r[3]).includes('Monthly')).map(r => r[2]);
      const quarterly = checkData.filter(r => new Date(r[0]).toDateString() === todayStr && String(r[3]).includes('Quarterly')).map(r => r[2]);

      const performanceLogs = getSheetData(ss, 'Performance_Log').map(r => ({
        tech: r[1], points: Number(r[2])
      }));

      const gasLedger = getSheetData(ss, 'Gas_Ledger');
      const gasStocks = {};
      gasLedger.forEach(row => {
        const gasType = row[2];
        const amount = Number(row[3]) || 0;
        gasStocks[gasType] = (gasStocks[gasType] || 0) + amount;
      });

      return createJsonResponse({ 
        complaints, 
        performanceLogs,
        hvac: { inspection: daily, filters: monthly, quarterly, gasStocks } 
      });
    }

    if (action === 'get_checklist_report' || action === 'get_complaint_report') {
      const sheetName = action === 'get_checklist_report' ? 'Checklist_Audit' : 'Work_Orders';
      const data = getSheetData(ss, sheetName);
      const start = new Date(e.parameter.start);
      const end = new Date(e.parameter.end);
      end.setHours(23, 59, 59);
      const filtered = data.filter(r => { 
        const d = new Date(r[0]); 
        return d >= start && d <= end; 
      });
      return createJsonResponse(filtered);
    }
    
    return createJsonResponse({ error: "Invalid Action" });
  } catch (err) {
    return createJsonResponse({ error: err.toString() });
  }
}

function doPost(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (!e || !e.parameter) return ContentService.createTextOutput("ERR").setMimeType(ContentService.MimeType.TEXT);

  const p = e.parameter;
  const action = p.action;

  try {
    if (action === 'complain') {
      ss.getSheetByName('Work_Orders').appendRow([new Date(), p.category, p.location, p.assetTag, p.details, p.assignedTech, p.status]);
    }
    else if (action === 'log_insight') {
      ss.getSheetByName('System_Insights').appendRow([new Date(), p.assetTag, p.category, p.details, 'Acknowledged']);
    }
    else if (action === 'log_gas_tx') {
      ss.getSheetByName('Gas_Ledger').appendRow([new Date(), p.type, p.gasType, Number(p.amount), p.tech, p.refTicket]);
      if (p.type === 'USAGE') adjustHealthScore(p.refTicket, -15);
    }
    else if (action === 'add_asset') {
      const sheet = ss.getSheetByName('Master_Assets');
      const lastId = sheet.getLastRow() > 1 ? Number(sheet.getRange(sheet.getLastRow(), 1).getValue()) : 0;
      sheet.appendRow([lastId + 1, p.tag, p.room, p.location, p.campus, p.floor, p.brand, p.cap, 'Active', p.year, 100]);
    }
    else if (action === 'resolve_ticket') {
      const sheet = ss.getSheetByName('Work_Orders');
      const row = Number(p.rowIndex);
      sheet.getRange(row, 7, 1, 4).setValues([[p.status, p.resolvedBy, p.workType || '', p.remarks || '']]);
      if (p.workType === 'Major') adjustHealthScore(p.assetTag, -10);
    }
    else if (action === 'update_asset_status') {
      updateAssetField(ss, p.tag, 9, p.status);
    }
    else if (action === 'manual_override_health') {
      updateAssetField(ss, p.tag, 11, Number(p.health));
    }
    else if (action === 'checklist_entry') {
      ss.getSheetByName('Checklist_Audit').appendRow([new Date(), p.technician, p.assetTag, p.task, p.status, p.remarks]);
      adjustHealthScore(p.assetTag, 2);
    }
    else if (action === 'update_points') {
      ss.getSheetByName('Performance_Log').appendRow([new Date(), p.technician, Number(p.points), p.reason]);
    }
    else if (action === 'submit_demand') {
      ss.getSheetByName('Material_Demands').appendRow([new Date(), p.technician, p.details, p.status, p.gasType || '', p.gasAmount || '']);
    }
    
    return ContentService.createTextOutput("OK");
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.toString());
  }
}

function getSheetData(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const range = sheet.getDataRange();
  return range.getNumRows() > 1 ? range.getValues().slice(1) : [];
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function updateAssetField(ss, tag, col, val) {
  const sheet = ss.getSheetByName('Master_Assets');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === String(tag).trim()) {
      sheet.getRange(i + 1, col).setValue(val);
      break;
    }
  }
}

function adjustHealthScore(tag, change) {
  if (!tag || tag === 'RANKING_HUB' || tag === 'STOCK_RELOAD') return;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Master_Assets');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === String(tag).trim()) {
      let current = Number(data[i][10]) || 100;
      sheet.getRange(i + 1, 11).setValue(Math.min(100, Math.max(0, current + change)));
      break;
    }
  }
}
