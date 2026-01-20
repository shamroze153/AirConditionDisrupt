
/**
 * DISRUPT_FM_ULTIMATE Backend v17.0 - Full Action Integration & Drive Support
 */

const SPREADSHEET_ID = "1yS28yOFwRWHoSvMmIm6bEisBFHTrQLiFZc38e6pnpv4";

function initializeSheets(ss) {
  if (!ss) {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {
      console.error("Spreadsheet ID invalid.");
      return;
    }
  }

  const headers = {
    'Master_Assets': ['ID', 'Tag', 'Room', 'Location', 'Campus', 'Floor', 'Brand', 'Capacity', 'Status', 'Year', 'Health', 'Category'],
    'Work_Orders': ['Timestamp', 'Category', 'Location', 'AssetTag', 'Details', 'AssignedTo', 'Status', 'ResolvedBy', 'WorkType', 'Remarks', 'GasUsed', 'GasType', 'ComplaintType'],
    'Checklist_Audit': ['Timestamp', 'Technician', 'AssetTag', 'Task', 'Status', 'Remarks', 'Proof', 'Category', 'Frequency'],
    'Performance_Log': ['Timestamp', 'Technician', 'Points', 'Reason', 'Category'],
    'Material_Demands': ['Timestamp', 'Technician', 'Details', 'Status', 'Category'],
    'Gas_Ledger': ['Timestamp', 'ActionType', 'GasType', 'Amount', 'Technician', 'Reference', 'Category'],
    'System_Insights': ['Timestamp', 'Category', 'AssetTag', 'InsightType', 'Details'],
    'Seating_Plan': ['No', 'location', 'Campus Code', 'Floor Tag', 'Room No. Tag', 'Work Station Tag', 'Emp Name', 'Emp Code', 'Type of Employee', 'Room Code', 'Room Code - Dashboard', 'Seat Code', 'BU', 'Department', 'Category', 'Status', 'snapshot_date', 'FINAL-DEPT'],
    'Master_Tools': ['Category', 'Name', 'Quantity']
  };

  Object.keys(headers).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers[sheetName]);
      sheet.getRange(1, 1, 1, headers[sheetName].length).setFontWeight("bold").setBackground("#f3f3f3");
    }
  });
}

function doGet(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '').toLowerCase().trim();
  const category = (params.category || 'AC').toUpperCase().trim();
  
  try {
    switch(action) {
      case 'get_tools':
        const toolData = getSheetData(ss, 'Master_Tools');
        const filteredTools = toolData.filter(r => String(r[0]).toUpperCase() === category);
        return createJsonResponse(filteredTools.map(r => ({ category: r[0], name: r[1], qty: r[2] })));

      case 'get_assets':
        const assetData = getSheetData(ss, 'Master_Assets');
        const filteredAssets = assetData.filter(row => String(row[11] || '').toUpperCase() === category);
        return createJsonResponse(filteredAssets.map(row => ({
          id: row[0], tag: row[1], room: row[2], location: row[3], campus: row[4],
          floor: row[5], brand: row[6], cap: row[7], status: row[8], year: row[9],
          healthScore: row[10] || 100, category: row[11]
        })));

      case 'get_stats':
        const now = new Date();
        const todayStr = now.toDateString();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        const thisQuarter = Math.floor(thisMonth / 3);

        const complaints = getSheetData(ss, 'Work_Orders')
          .map((row, idx) => ({
            rowIndex: idx + 2, date: row[0], category: row[1], location: row[2],
            assetTag: row[3], details: row[4], assignedTo: row[5], status: row[6],
            resolvedBy: row[7], workType: row[8], remarks: row[9], gasUsed: row[10], gasType: row[11],
            complaintType: row[12] || 'Reactive'
          }))
          .filter(t => String(t.category).toUpperCase() === category);
        
        const checkData = getSheetData(ss, 'Checklist_Audit');
        const dailyComp = [];
        const monthlyComp = [];
        const quarterlyComp = [];

        checkData.forEach(r => {
          const rDate = new Date(r[0]);
          const rCat = String(r[7] || '').toUpperCase();
          const rFreq = String(r[8] || 'Daily');
          const rTag = r[2];
          if (rCat !== category) return;
          const isElectrical = (rCat === 'ELECTRICAL');
          if (rFreq === 'Daily' && (isElectrical || rDate.toDateString() === todayStr)) dailyComp.push(rTag);
          if (rFreq === 'Monthly' && rDate.getMonth() === thisMonth && rDate.getFullYear() === thisYear) monthlyComp.push(rTag);
          if (rFreq === 'Quarterly' && Math.floor(rDate.getMonth() / 3) === thisQuarter && rDate.getFullYear() === thisYear) quarterlyComp.push(rTag);
        });

        const ptLogs = getSheetData(ss, 'Performance_Log')
          .filter(r => String(r[4] || '').toUpperCase() === category)
          .map(r => ({ Timestamp: r[0], tech: r[1], points: Number(r[2]), reason: r[3], category: r[4] }));

        let gStocks = {};
        getSheetData(ss, 'Gas_Ledger').forEach(row => {
          gStocks[row[2]] = (gStocks[row[2]] || 0) + (Number(row[3]) || 0);
        });

        const insightData = getSheetData(ss, 'System_Insights')
          .filter(r => String(r[1]).toUpperCase() === category)
          .map(r => ({ tag: r[2], type: r[3] }));

        return createJsonResponse({ 
          complaints, 
          performanceLogs: ptLogs, 
          hvac: { daily: dailyComp, monthly: monthlyComp, quarterly: quarterlyComp, gasStocks: gStocks },
          acknowledgedInsights: insightData
        });

      case 'get_global_stats':
        const allTickets = getSheetData(ss, 'Work_Orders').map((row, idx) => ({
          rowIndex: idx + 2, date: row[0], category: row[1], location: row[2],
          assetTag: row[3], details: row[4], assignedTo: row[5], status: row[6],
          resolvedBy: row[7], workType: row[8], remarks: row[9], gasUsed: row[10], gasType: row[11],
          complaintType: row[12] || 'Reactive'
        }));
        const allLogs = getSheetData(ss, 'Performance_Log').map(r => ({ Timestamp: r[0], tech: r[1], points: Number(r[2]), reason: r[3], category: r[4] }));
        const seatingData = getSheetData(ss, 'Seating_Plan').map(row => ({
          no: row[0], location: row[1], campusCode: row[2], floorTag: row[3], roomTag: row[4],
          stationTag: row[5], empName: row[6], empCode: row[7], empType: row[8], roomCode: row[9],
          roomCodeDashboard: row[10], seatCode: row[11], bu: row[12], department: row[13],
          category: row[14], status: row[15], snapshotDate: row[16], finalDept: row[17]
        }));
        return createJsonResponse({ allTickets, allPerformanceLogs: allLogs, seatingData });

      case 'get_checklist_report':
        const rawCheck = getSheetData(ss, 'Checklist_Audit');
        return createJsonResponse(rawCheck.filter(r => String(r[7]).toUpperCase() === category));

      case 'get_complaint_report':
        const rawComplaints = getSheetData(ss, 'Work_Orders');
        return createJsonResponse(rawComplaints.filter(r => String(r[1]).toUpperCase() === category));

      default:
        return createJsonResponse({ error: "Action Unknown: " + action });
    }
  } catch (err) {
    return createJsonResponse({ error: err.toString() });
  }
}

function doPost(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '').toLowerCase().trim();
  const category = (params.category || 'AC').toUpperCase().trim();

  try {
    switch(action) {
      case 'complain':
        ss.getSheetByName('Work_Orders').appendRow([
          new Date(), 
          category, 
          params.location, 
          params.assetTag, 
          params.details, 
          params.assignedTech, 
          params.status, 
          '', '', '', 0, '', 
          params.complaintType || 'Reactive'
        ]);
        break;

      case 'resolve_ticket':
        const woSheet = ss.getSheetByName('Work_Orders');
        const rowIndex = Number(params.rowIndex);
        woSheet.getRange(rowIndex, 7, 1, 6).setValues([[params.status, params.resolvedBy, params.workType || '', params.remarks || '', params.gasUsed || 0, params.gasType || '']]);
        if (params.gasUsed && Number(params.gasUsed) > 0) {
          ss.getSheetByName('Gas_Ledger').appendRow([new Date(), 'USAGE', params.gasType, -Math.abs(Number(params.gasUsed)), params.resolvedBy.split(' • ')[0], params.assetTag, category]);
        }
        break;

      case 'checklist_entry':
        let photoUrl = params.photo || '';
        if (photoUrl && photoUrl.startsWith('data:image')) {
          try {
            var folder;
            var folders = DriveApp.getFoldersByName("DISRUPT_FM_UPLOADS");
            if (folders.hasNext()) folder = folders.next();
            else folder = DriveApp.createFolder("DISRUPT_FM_UPLOADS");
            var name = params.assetTag + "_" + Date.now() + ".jpg";
            var bytes = Utilities.base64Decode(photoUrl.split(',')[1]);
            var file = folder.createFile(name, bytes, MimeType.JPEG);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            photoUrl = file.getUrl();
          } catch(e) { photoUrl = "Drive_Error: " + e.toString(); }
        }
        ss.getSheetByName('Checklist_Audit').appendRow([new Date(), params.technician, params.assetTag, params.task, params.status, params.remarks, photoUrl, category, params.frequency || 'Daily']);
        break;

      case 'log_gas_tx':
        ss.getSheetByName('Gas_Ledger').appendRow([new Date(), params.type, params.gasType, params.type === 'REFILL' ? Math.abs(Number(params.amount)) : -Math.abs(Number(params.amount)), params.tech, params.refTicket || 'HUB_SYNC', category]);
        break;

      case 'update_points':
        ss.getSheetByName('Performance_Log').appendRow([new Date(), params.technician, Number(params.points), params.reason, category]);
        break;

      case 'reset_leaderboard':
        ss.getSheetByName('Performance_Log').appendRow([new Date(), 'SYSTEM', 0, 'RESET_ALL', category]);
        break;

      case 'log_insight':
        ss.getSheetByName('System_Insights').appendRow([new Date(), category, params.assetTag, params.insightCategory, params.details]);
        break;

      case 'submit_demand':
        ss.getSheetByName('Material_Demands').appendRow([new Date(), params.technician, params.details, params.status, category]);
        break;

      case 'update_asset_status':
        const astSheet = ss.getSheetByName('Master_Assets');
        const astData = astSheet.getDataRange().getValues();
        for (let i = 1; i < astData.length; i++) {
          if (String(astData[i][1]).trim().toUpperCase() === String(params.tag).trim().toUpperCase()) {
            astSheet.getRange(i + 1, 9).setValue(params.status);
            break;
          }
        }
        break;

      case 'add_occupancy':
        ss.getSheetByName('Seating_Plan').appendRow([
          params.no, params.location, params.campusCode, params.floorTag, params.roomTag, 
          params.stationTag, params.empName, params.empCode, params.empType, params.roomCode,
          params.roomCodeDashboard, params.seatCode, params.bu, params.department, params.category, 
          params.status, params.snapshotDate, params.finalDept || ''
        ]);
        break;

      case 'update_occupancy':
        const seatSheet = ss.getSheetByName('Seating_Plan');
        const seatData = seatSheet.getDataRange().getValues();
        for (let i = 1; i < seatData.length; i++) {
          if (String(seatData[i][0]) === String(params.no)) {
            seatSheet.getRange(i + 1, 1, 1, 18).setValues([[
              params.no, params.location, params.campusCode, params.floorTag, params.roomTag, 
              params.stationTag, params.empName, params.empCode, params.empType, params.roomCode,
              params.roomCodeDashboard, params.seatCode, params.bu, params.department, params.category, 
              params.status, params.snapshotDate, params.finalDept || ''
            ]]);
            break;
          }
        }
        break;

      case 'delete_occupancy':
        const dSeatSheet = ss.getSheetByName('Seating_Plan');
        const dSeatData = dSeatSheet.getDataRange().getValues();
        for (let i = dSeatData.length - 1; i >= 1; i--) {
          if (String(dSeatData[i][0]) === String(params.no)) {
            dSeatSheet.deleteRow(i + 1);
            break;
          }
        }
        break;

      case 'add_tool':
        ss.getSheetByName('Master_Tools').appendRow([category, params.name, Number(params.qty)]);
        break;

      case 'update_tool':
        const toolSheet = ss.getSheetByName('Master_Tools');
        const tools = toolSheet.getDataRange().getValues();
        for (let i = 1; i < tools.length; i++) {
          if (String(tools[i][0]).toUpperCase() === category && tools[i][1] === params.oldName) {
            toolSheet.getRange(i + 1, 2, 1, 2).setValues([[params.name, Number(params.qty)]]);
            break;
          }
        }
        break;

      case 'delete_tool':
        const dToolSheet = ss.getSheetByName('Master_Tools');
        const dTools = dToolSheet.getDataRange().getValues();
        for (let i = dTools.length - 1; i >= 1; i--) {
          if (String(dTools[i][0]).toUpperCase() === category && dTools[i][1] === params.name) {
            dToolSheet.deleteRow(i + 1);
            break;
          }
        }
        break;

      default:
        return ContentService.createTextOutput("OK");
    }
    return ContentService.createTextOutput("OK");
  } catch (err) {
    return ContentService.createTextOutput("POST_ERROR: " + err.toString());
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
