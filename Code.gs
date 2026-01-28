/**
 * DISRUPT_FM_ULTIMATE Backend v23.3 - Performance Analytics & Fleet Logic
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
    'Work_Orders': ['Timestamp', 'Category', 'Location', 'AssetTag', 'Details', 'AssignedTo', 'Status', 'ResolvedBy', 'WorkType', 'Remarks', 'GasUsed', 'GasType', 'ComplaintType', 'StarRating', 'PointsAwarded', 'AdminReviewDate'],
    'Checklist_Audit': ['Timestamp', 'Technician', 'AssetTag', 'Task', 'Status', 'Remarks', 'Proof', 'Category', 'Frequency'],
    'Performance_Log': ['Timestamp', 'Technician', 'Points', 'Reason', 'Category'],
    'Material_Demands': ['Timestamp', 'Technician', 'Details', 'Status', 'Category'],
    'Gas_Ledger': ['Timestamp', 'ActionType', 'GasType', 'Amount', 'Technician', 'Reference', 'Category'],
    'System_Insights': ['Timestamp', 'Category', 'AssetTag', 'InsightType', 'Details'],
    'Seating_Plan': ['No', 'location', 'Campus Code', 'Floor Tag', 'Room No. Tag', 'Work Station Tag', 'Emp Name', 'Emp Code', 'Type of Employee', 'Room Code', 'Room Code - Dashboard', 'Seat Code', 'BU', 'Department', 'Category', 'Status', 'snapshot_date', 'FINAL-DEPT'],
    'Master_Tools': ['Category', 'Name', 'Quantity', 'Technician']
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
  initializeSheets(ss);
  const tz = ss.getSpreadsheetTimeZone();
  
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '').toLowerCase().trim();
  const category = (params.category || 'AC').toUpperCase().trim();
  
  try {
    switch(action) {
      case 'get_tools':
        const toolData = getSheetData(ss, 'Master_Tools');
        const filteredTools = toolData.filter(r => String(r[0]).toUpperCase() === category);
        return createJsonResponse(filteredTools.map(r => ({ 
          category: r[0], 
          name: r[1], 
          qty: Number(r[2]), 
          technician: r[3] || '' 
        })));

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
        const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();

        const complaints = getSheetData(ss, 'Work_Orders')
          .map((row, idx) => ({
            rowIndex: idx + 2, date: row[0], category: row[1], location: row[2],
            assetTag: row[3], details: row[4], assignedTo: row[5], status: row[6],
            resolvedBy: row[7], workType: row[8], remarks: row[9], gasUsed: row[10], gasType: row[11],
            complaintType: row[12] || 'Reactive',
            starRating: row[13], pointsAwarded: row[14], adminReviewDate: row[15]
          }))
          .filter(t => String(t.category).toUpperCase() === category);
        
        const checkData = getSheetData(ss, 'Checklist_Audit');
        const dailyComp = [];
        const monthlyComp = [];
        const quarterlyComp = [];

        checkData.forEach(r => {
          const rDate = new Date(r[0]);
          const rDateStr = Utilities.formatDate(rDate, tz, "yyyy-MM-dd");
          const rCat = String(r[7] || '').toUpperCase();
          const rFreq = String(r[8] || 'Daily');
          const rTag = r[2];
          if (rCat !== category) return;
          
          if (rFreq === 'Daily' && rDateStr === todayStr) dailyComp.push(rTag);
          if (rFreq === 'Monthly' && rDate.getMonth() === thisMonth && rDate.getFullYear() === thisYear) monthlyComp.push(rTag);
          if (rFreq === 'Quarterly' && Math.floor(rDate.getMonth() / 3) === Math.floor(thisMonth / 3) && rDate.getFullYear() === thisYear) quarterlyComp.push(rTag);
        });

        const ptLogs = getSheetData(ss, 'Performance_Log')
          .filter(r => String(r[4] || '').toUpperCase() === category)
          .map(r => ({ Timestamp: r[0], tech: r[1], points: Number(r[2]), reason: r[3], category: r[4] }));

        // Real-time Operational Telemetry Logic
        const operationalAssetMap = {};
        getSheetData(ss, 'Master_Assets').forEach(r => {
          if (String(r[11]).toUpperCase() === category) {
             const status = String(r[8]).trim().toUpperCase();
             if (status === 'ACTIVE' || status === 'MAINTENANCE') operationalAssetMap[String(r[1]).trim().toUpperCase()] = true;
          }
        });

        let gStocks = {};
        let assetUsage = {};
        getSheetData(ss, 'Gas_Ledger').forEach(row => {
          const actionType = String(row[1]).toUpperCase();
          const gasType = row[2];
          const amount = Number(row[3]) || 0;
          const ledgerCat = String(row[6]).toUpperCase();

          gStocks[gasType] = (gStocks[gasType] || 0) + amount;

          // Only log usage for assets currently tagged as operational
          if (actionType === 'USAGE' && ledgerCat === category) {
            const tag = String(row[5]).trim().toUpperCase();
            if (operationalAssetMap[tag]) {
              assetUsage[tag] = (assetUsage[tag] || 0) + Math.abs(amount);
            }
          }
        });

        const insightData = getSheetData(ss, 'System_Insights')
          .filter(r => String(r[1]).toUpperCase() === category)
          .map(r => ({ tag: r[2], type: r[3] }));

        return createJsonResponse({ 
          complaints, 
          performanceLogs: ptLogs, 
          hvac: { 
            daily: dailyComp, 
            monthly: monthlyComp, 
            quarterly: quarterlyComp, 
            gasStocks: gStocks,
            assetUsage: assetUsage
          },
          acknowledgedInsights: insightData
        });

      case 'get_global_stats':
        const allTickets = getSheetData(ss, 'Work_Orders').map((row, idx) => ({
          rowIndex: idx + 2, date: row[0], category: row[1], location: row[2],
          assetTag: row[3], details: row[4], assignedTo: row[5], status: row[6],
          resolvedBy: row[7], workType: row[8], remarks: row[9], gasUsed: row[10], gasType: row[11],
          complaintType: row[12] || 'Reactive',
          starRating: row[13], pointsAwarded: row[14], adminReviewDate: row[15]
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
  initializeSheets(ss);
  
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '').toLowerCase().trim();
  const category = (params.category || 'AC').toUpperCase().trim();

  try {
    switch(action) {
      case 'log_gas_tx':
        const amountTx = Number(params.amount);
        const actionTypeTx = String(params.type).toUpperCase();
        ss.getSheetByName('Gas_Ledger').appendRow([
          new Date(), 
          actionTypeTx, 
          params.gasType, 
          actionTypeTx === 'REFILL' ? Math.abs(amountTx) : -Math.abs(amountTx), 
          params.tech, 
          params.refTicket || 'N/A', 
          category
        ]);
        
        if (actionTypeTx === 'USAGE' && params.refTicket && params.refTicket !== 'HUB_REFILL') {
          ss.getSheetByName('System_Insights').appendRow([
            new Date(),
            category,
            params.refTicket,
            'Refill Event',
            `Maintenance: ${Math.abs(amountTx)}kg of ${params.gasType} refilled by ${params.tech}`
          ]);
        }
        break;

      case 'checklist_entry':
        let photoData = params.photo || '';
        ss.getSheetByName('Checklist_Audit').appendRow([
          new Date(), 
          params.technician, 
          params.assetTag, 
          params.task, 
          params.status, 
          params.remarks, 
          photoData, 
          category, 
          params.frequency || 'Daily'
        ]);
        break;

      case 'resolve_ticket':
        const woSheetRes = ss.getSheetByName('Work_Orders');
        const rowIndexRes = Number(params.rowIndex);
        woSheetRes.getRange(rowIndexRes, 7, 1, 6).setValues([[
          params.status, 
          params.resolvedBy, 
          params.workType || '', 
          params.remarks || '', 
          params.gasUsed || 0, 
          params.gasType || ''
        ]]);
        if (params.gasUsed && Number(params.gasUsed) > 0) {
          const techName = params.resolvedBy.split(' • ')[0] || 'Hub Specialist';
          ss.getSheetByName('Gas_Ledger').appendRow([
            new Date(), 
            'USAGE', 
            params.gasType, 
            -Math.abs(Number(params.gasUsed)), 
            techName, 
            params.assetTag, 
            category
          ]);
          ss.getSheetByName('System_Insights').appendRow([
            new Date(),
            category,
            params.assetTag,
            'Refill Event',
            `Work Order: ${Math.abs(Number(params.gasUsed))}kg of ${params.gasType} utilized during resolution.`
          ]);
        }
        break;

      case 'admin_review_ticket':
        const woSheetRev = ss.getSheetByName('Work_Orders');
        const rowIndexRev = Number(params.rowIndex);
        const stars = Number(params.stars);
        const points = Number(params.points);
        const tech = params.technician;
        
        woSheetRev.getRange(rowIndexRev, 7).setValue('Completed');
        woSheetRev.getRange(rowIndexRev, 14, 1, 3).setValues([[
          stars, 
          points, 
          new Date()
        ]]);

        ss.getSheetByName('Performance_Log').appendRow([
          new Date(), 
          tech, 
          points, 
          `Evaluation Rating: ${stars} Stars`, 
          category
        ]);
        break;

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

      case 'update_points':
        ss.getSheetByName('Performance_Log').appendRow([new Date(), params.technician, Number(params.points), params.reason, category]);
        break;

      case 'add_tool':
        ss.getSheetByName('Master_Tools').appendRow([
          category, 
          params.name, 
          Number(params.qty),
          params.technician || ''
        ]);
        break;

      case 'update_tool':
        const toolSheet = ss.getSheetByName('Master_Tools');
        const tools = toolSheet.getDataRange().getValues();
        for (let i = 1; i < tools.length; i++) {
          if (String(tools[i][0]).toUpperCase() === category && String(tools[i][1]).trim() === String(params.oldName).trim()) {
            toolSheet.getRange(i + 1, 2, 1, 3).setValues([[
              params.name, 
              Number(params.qty),
              params.technician || ''
            ]]);
            break;
          }
        }
        break;

      case 'delete_tool':
        const dToolSheet = ss.getSheetByName('Master_Tools');
        const dTools = dToolSheet.getDataRange().getValues();
        for (let i = dTools.length - 1; i >= 1; i--) {
          if (String(dTools[i][0]).toUpperCase() === category && String(dTools[i][1]).trim() === String(params.name).trim()) {
            dToolSheet.deleteRow(i + 1);
            break;
          }
        }
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

      case 'reset_leaderboard':
        const logSheet = ss.getSheetByName('Performance_Log');
        const allLogs = logSheet.getDataRange().getValues();
        const header = allLogs.shift();
        const logsToKeep = [];
        allLogs.forEach(row => {
          if (String(row[4] || '').toUpperCase() !== category) logsToKeep.push(row);
        });
        logSheet.clear();
        logSheet.appendRow(header);
        if (logsToKeep.length > 0) logSheet.getRange(2, 1, logsToKeep.length, header.length).setValues(logsToKeep);
        logSheet.appendRow([new Date(), 'SYSTEM', 0, 'RESET_ALL', category]);
        break;

      default:
        break;
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
