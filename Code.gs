/**
 * DISRUPT_FM_ULTIMATE Backend v23.9 - Multi-Responder Attribution
 */

const SPREADSHEET_ID = "1F6mPsijxNZF3xIoeZMI9ndZjNb_VdzZrkndPvBkBPsE";

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
    'Work_Orders': ['Timestamp', 'Category', 'Location', 'AssetTag', 'Details', 'AssignedTo', 'Status', 'ResolvedBy', 'WorkType', 'Remarks', 'GasUsed', 'GasType', 'ComplaintType', 'StarRating', 'PointsAwarded', 'AdminReviewDate', 'ResolutionTimestamp'],
    'Checklist_Audit': ['Timestamp', 'Technician', 'AssetTag', 'Task', 'Status', 'Remarks', 'Reference', 'Category', 'Frequency'],
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
          category: String(r[0] || '').trim(), 
          name: String(r[1] || '').trim(), 
          qty: Number(r[2]), 
          technician: String(r[3] || '').trim() 
        })));

      case 'get_assets':
        const assetData = getSheetData(ss, 'Master_Assets');
        const filteredAssets = assetData.filter(row => String(row[11] || '').toUpperCase() === category);
        return createJsonResponse(filteredAssets.map(row => ({
          id: row[0], tag: String(row[1] || '').trim(), room: String(row[2] || '').trim(), location: String(row[3] || '').trim(), campus: String(row[4] || '').trim(),
          floor: String(row[5] || '').trim(), brand: String(row[6] || '').trim(), cap: row[7], status: String(row[8] || '').trim(), year: row[9],
          healthScore: row[10] || 100, category: String(row[11] || '').trim()
        })));

      case 'get_stats':
        const now = new Date();
        const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();

        const complaints = getSheetData(ss, 'Work_Orders')
          .map((row, idx) => ({
            rowIndex: idx + 2, date: row[0], category: String(row[1] || '').trim(), location: String(row[2] || '').trim(),
            assetTag: String(row[3] || '').trim(), details: String(row[4] || '').trim(), assignedTo: String(row[5] || '').trim(), status: String(row[6] || '').trim(),
            resolvedBy: String(row[7] || '').trim(), workType: String(row[8] || '').trim(), remarks: String(row[9] || '').trim(), gasUsed: row[10], gasType: String(row[11] || '').trim(),
            complaintType: row[12] || 'Reactive',
            starRating: row[13], pointsAwarded: row[14], adminReviewDate: row[15],
            resolutionTimestamp: row[16]
          }))
          .filter(t => String(t.category).toUpperCase() === category);
        
        const checkData = getSheetData(ss, 'Checklist_Audit');
        const dailyComp = [];
        const monthlyComp = [];
        const quarterlyComp = [];

        checkData.forEach(r => {
          if (!r[0]) return; // Skip ghost rows
          const rDate = new Date(r[0]);
          const rDateStr = Utilities.formatDate(rDate, tz, "yyyy-MM-dd");
          const rCat = String(r[7] || '').toUpperCase().trim();
          const rFreq = String(r[8] || 'Daily').trim();
          const rTag = String(r[2] || '').trim();
          if (rCat !== category) return;
          if (!rTag) return;
          
          if (rFreq === 'Daily' && rDateStr === todayStr) dailyComp.push(rTag);
          if (rFreq === 'Monthly' && rDate.getMonth() === thisMonth && rDate.getFullYear() === thisYear) monthlyComp.push(rTag);
          if (rFreq === 'Quarterly' && Math.floor(rDate.getMonth() / 3) === Math.floor(thisMonth / 3) && rDate.getFullYear() === thisYear) quarterlyComp.push(rTag);
        });

        const ptLogs = getSheetData(ss, 'Performance_Log')
          .filter(r => String(r[4] || '').toUpperCase().trim() === category)
          .map(r => ({ Timestamp: r[0], tech: String(r[1] || '').trim(), points: Number(r[2]), reason: String(r[3] || '').trim(), category: String(r[4] || '').trim() }));

        const operationalAssetMap = {};
        getSheetData(ss, 'Master_Assets').forEach(r => {
          if (String(r[11]).toUpperCase().trim() === category) {
             const status = String(r[8]).trim().toUpperCase();
             if (status === 'ACTIVE' || status === 'MAINTENANCE') operationalAssetMap[String(r[1]).trim().toUpperCase()] = true;
          }
        });

        let gStocks = {};
        let assetUsage = {};
        getSheetData(ss, 'Gas_Ledger').forEach(row => {
          const actionType = String(row[1] || '').toUpperCase().trim();
          const gasType = String(row[2] || '').trim();
          const amount = Number(row[3]) || 0;
          const ledgerCat = String(row[6] || '').toUpperCase().trim();

          if (gasType) gStocks[gasType] = (gStocks[gasType] || 0) + amount;

          if (actionType === 'USAGE' && ledgerCat === category) {
            const tag = String(row[5] || '').trim().toUpperCase();
            if (operationalAssetMap[tag]) {
              assetUsage[tag] = (assetUsage[tag] || 0) + Math.abs(amount);
            }
          }
        });

        const insightData = getSheetData(ss, 'System_Insights')
          .filter(r => String(r[1] || '').toUpperCase().trim() === category)
          .map(r => ({ tag: String(r[2] || '').trim(), type: String(r[3] || '').trim() }));

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
          rowIndex: idx + 2, date: row[0], category: String(row[1] || '').trim(), location: String(row[2] || '').trim(),
          assetTag: String(row[3] || '').trim(), details: String(row[4] || '').trim(), assignedTo: String(row[5] || '').trim(), status: String(row[6] || '').trim(),
          resolvedBy: String(row[7] || '').trim(), workType: String(row[8] || '').trim(), remarks: String(row[9] || '').trim(), gasUsed: row[10], gasType: String(row[11] || '').trim(),
          complaintType: row[12] || 'Reactive',
          starRating: row[13], pointsAwarded: row[14], adminReviewDate: row[15],
          resolutionTimestamp: row[16]
        }));
        const allLogs = getSheetData(ss, 'Performance_Log').map(r => ({ Timestamp: r[0], tech: String(r[1] || '').trim(), points: Number(r[2]), reason: String(r[3] || '').trim(), category: String(r[4] || '').trim() }));
        const seatingData = getSheetData(ss, 'Seating_Plan').map(row => ({
          no: row[0], location: String(row[1] || '').trim(), campusCode: String(row[2] || '').trim(), floorTag: String(row[3] || '').trim(), roomTag: String(row[4] || '').trim(),
          stationTag: String(row[5] || '').trim(), empName: String(row[6] || '').trim(), empCode: String(row[7] || '').trim(), empType: String(row[8] || '').trim(), roomCode: String(row[9] || '').trim(),
          roomCodeDashboard: String(row[10] || '').trim(), seatCode: String(row[11] || '').trim(), bu: String(row[12] || '').trim(), department: String(row[13] || '').trim(),
          category: String(row[14] || '').trim(), status: String(row[15] || '').trim(), snapshotDate: String(row[16] || '').trim(), finalDept: String(row[17] || '').trim()
        }));
        return createJsonResponse({ allTickets, allPerformanceLogs: allLogs, seatingData });

      case 'get_checklist_report':
        const rawCheck = getSheetData(ss, 'Checklist_Audit');
        return createJsonResponse(rawCheck.filter(r => String(r[7]).toUpperCase().trim() === category));

      case 'get_complaint_report':
        const rawComplaints = getSheetData(ss, 'Work_Orders');
        return createJsonResponse(rawComplaints.filter(r => String(r[1]).toUpperCase().trim() === category));

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
        const actionTypeTx = String(params.type || '').toUpperCase().trim();
        ss.getSheetByName('Gas_Ledger').appendRow([
          new Date(), 
          actionTypeTx, 
          String(params.gasType || '').trim(), 
          actionTypeTx === 'REFILL' ? Math.abs(amountTx) : -Math.abs(amountTx), 
          String(params.tech || '').trim(), 
          String(params.refTicket || 'N/A').trim(), 
          category
        ]);
        break;

      case 'checklist_entry':
        // Data Normalization to prevent false 'Missing' flags
        const cTag = String(params.assetTag || '').trim().toUpperCase();
        const cTech = String(params.technician || '').trim();
        const cTask = String(params.task || '').trim();
        const cFreq = String(params.frequency || 'Daily').trim();
        const cStatus = String(params.status || 'OK').trim();
        
        if (!cTag || !cTech) break;

        ss.getSheetByName('Checklist_Audit').appendRow([
          new Date(), 
          cTech, 
          cTag, 
          cTask, 
          cStatus, 
          String(params.remarks || '').trim(), 
          String(params.reference || '').trim(), 
          category, 
          cFreq
        ]);
        break;

      case 'resolve_ticket':
        const woSheetRes = ss.getSheetByName('Work_Orders');
        const rowIndexRes = Number(params.rowIndex);
        if (!rowIndexRes) break;

        woSheetRes.getRange(rowIndexRes, 7, 1, 11).setValues([[
          String(params.status || '').trim(), 
          String(params.resolvedBy || '').trim(), 
          String(params.workType || '').trim(), 
          String(params.remarks || '').trim(), 
          params.gasUsed || 0, 
          String(params.gasType || '').trim(),
          String(params.complaintType || '').trim(),
          '', '', '',
          new Date()
        ]]);
        break;

      case 'admin_review_ticket':
        const woSheetRev = ss.getSheetByName('Work_Orders');
        const rowIndexRev = Number(params.rowIndex);
        if (!rowIndexRev) break;

        const stars = Number(params.stars);
        const points = Number(params.points);
        const multiTechStr = String(params.technician || '').trim();
        const assetTagRev = String(params.assetTag || '').trim().toUpperCase();
        const reviewReason = String(params.reviewReason || '').trim();
        
        woSheetRev.getRange(rowIndexRev, 7).setValue('Completed');
        woSheetRev.getRange(rowIndexRev, 14, 1, 3).setValues([[
          stars, 
          points, 
          new Date()
        ]]);

        if (reviewReason) {
           const currentRemarks = woSheetRev.getRange(rowIndexRev, 10).getValue();
           const updatedRemarks = currentRemarks ? currentRemarks + " | REVIEW: " + reviewReason : "REVIEW: " + reviewReason;
           woSheetRev.getRange(rowIndexRev, 10).setValue(updatedRemarks);
        }

        // MULTI-ATTRIBUTION LOGIC: Award points to all responders
        const techList = multiTechStr.split(',').map(t => t.trim()).filter(Boolean);
        const perfLog = ss.getSheetByName('Performance_Log');
        
        techList.forEach(t => {
          perfLog.appendRow([
            new Date(), 
            t, 
            points, 
            reviewReason ? `Audit: ${stars} Stars - ${reviewReason}` : `Evaluation Rating: ${stars} Stars`, 
            category
          ]);
        });

        if (category === 'AC' && assetTagRev && assetTagRev !== 'N/A') {
          const astSheet = ss.getSheetByName('Master_Assets');
          const astData = astSheet.getDataRange().getValues();
          for (let i = 1; i < astData.length; i++) {
            if (String(astData[i][1]).trim().toUpperCase() === assetTagRev) {
              astSheet.getRange(i + 1, 9).setValue('Active');
              break;
            }
          }
        }
        break;

      case 'complain':
        ss.getSheetByName('Work_Orders').appendRow([
          new Date(), 
          category, 
          String(params.location || '').trim(), 
          String(params.assetTag || '').trim().toUpperCase(), 
          String(params.details || '').trim(), 
          String(params.assignedTech || 'Unassigned').trim(), 
          String(params.status || 'Open').trim(), 
          '', '', '', 0, '', 
          String(params.complaintType || 'Reactive').trim()
        ]);
        break;

      case 'update_points':
        ss.getSheetByName('Performance_Log').appendRow([
          new Date(), 
          String(params.technician || '').trim(), 
          Number(params.points), 
          String(params.reason || '').trim(), 
          category
        ]);
        break;

      case 'add_tool':
        ss.getSheetByName('Master_Tools').appendRow([
          category, 
          String(params.name || '').trim(), 
          Number(params.qty),
          String(params.technician || '').trim()
        ]);
        break;

      case 'update_tool':
        const toolSheet = ss.getSheetByName('Master_Tools');
        const tools = toolSheet.getDataRange().getValues();
        const oldN = String(params.oldName || '').trim();
        for (let i = 1; i < tools.length; i++) {
          if (String(tools[i][0]).toUpperCase().trim() === category && String(tools[i][1]).trim() === oldN) {
            toolSheet.getRange(i + 1, 2, 1, 3).setValues([[
              String(params.name || '').trim(), 
              Number(params.qty),
              String(params.technician || '').trim()
            ]]);
            break;
          }
        }
        break;

      case 'delete_tool':
        const dToolSheet = ss.getSheetByName('Master_Tools');
        const dTools = dToolSheet.getDataRange().getValues();
        const delN = String(params.name || '').trim();
        for (let i = dTools.length - 1; i >= 1; i--) {
          if (String(dTools[i][0]).toUpperCase().trim() === category && String(dTools[i][1]).trim() === delN) {
            dToolSheet.deleteRow(i + 1);
            break;
          }
        }
        break;

      case 'submit_demand':
        ss.getSheetByName('Material_Demands').appendRow([
          new Date(), 
          String(params.technician || '').trim(), 
          String(params.details || '').trim(), 
          String(params.status || 'Submitted').trim(), 
          category
        ]);
        break;

      case 'update_asset_status':
        const astSheetU = ss.getSheetByName('Master_Assets');
        const astDataU = astSheetU.getDataRange().getValues();
        const updT = String(params.tag || '').trim().toUpperCase();
        for (let i = 1; i < astDataU.length; i++) {
          if (String(astDataU[i][1]).trim().toUpperCase() === updT) {
            astSheetU.getRange(i + 1, 9).setValue(String(params.status).trim());
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
          if (String(row[4] || '').toUpperCase().trim() !== category) logsToKeep.push(row);
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
  const values = range.getValues();
  if (values.length <= 1) return [];
  // Enhanced Filtering: Only non-empty rows based on Timestamp (Col 0)
  return values.slice(1).filter(row => row[0] && String(row[0]).trim() !== "");
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
