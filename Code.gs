
/**
 * DISRUPT_FM_ULTIMATE Backend v24.6 - Strategic Auto-Merge & Analytics Engine
 */

const SPREADSHEET_ID = "1F6mPsijxNZF3xIoeZMI9ndZjNb_VdzZrkndPvBkBPsE"; // IMPORTANT: Update this ID if using a different spreadsheet

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
    'Master_Assets': ['ID', 'Tag', 'Room', 'Location', 'Campus', 'Floor', 'Brand', 'Capacity', 'Status', 'Year', 'Health', 'Category', 'AssignedTech'],
    'Work_Orders': ['Timestamp', 'Category', 'Location', 'AssetTag', 'Details', 'AssignedTo', 'Status', 'ResolvedBy', 'ResolvedDate', 'ResolvedTime', 'ResolvedTimestampFull', 'WorkType', 'Remarks', 'GasUsed', 'GasType', 'ComplaintType', 'StarRating', 'PointsAwarded', 'AdminReviewDate', 'RepeatCount', 'IssueCategory'],
    'Checklist_Audit': ['Timestamp', 'Technician', 'AssetTag', 'Task', 'Status', 'Remarks', 'Reference', 'Category', 'Frequency'],
    'Performance_Log': ['Timestamp', 'Technician', 'Points', 'Reason', 'Category'],
    'Material_Demands': ['Timestamp', 'Technician', 'Details', 'Status', 'Category'],
    'Gas_Ledger': ['Timestamp', 'ActionType', 'GasType', 'Amount', 'Technician', 'Reference', 'Category'],
    'System_Insights': ['Timestamp', 'Category', 'AssetTag', 'InsightType', 'Details'],
    'Seating_Plan': ['No', 'location', 'Campus Code', 'Floor Tag', 'Room No. Tag', 'Work Station Tag', 'Emp Name', 'Emp Code', 'Type of Employee', 'Room Code', 'Room Code - Dashboard', 'Seat Code', 'BU', 'Department', 'Category', 'Status', 'snapshot_date', 'FINAL-DEPT'],
    'Master_Tools': ['Category', 'Name', 'Quantity', 'Technician'],
    'Valet_Log': ['Timestamp_IN', 'Date', 'CarNumber', 'CardNumber', 'ParkingSlot', 'Driver_IN', 'Timestamp_OUT', 'Driver_OUT', 'Status', 'Remarks'],
    'SoftFM_Weekly_Evaluation': ['Timestamp', 'Week', 'Name', 'Department', 'Attendance', 'Punctuality', 'Behavior', 'Performance', 'SupervisorScore', 'AutoDailyScore', 'FinalScore', 'Remarks']
  };

  Object.keys(headers).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers[sheetName]);
      sheet.getRange(1, 1, 1, headers[sheetName].length).setFontWeight("bold").setBackground("#f3f3f3");
    } else {
      // Force header update to fix duplicates and shifting
      const targetHeaders = headers[sheetName];
      sheet.getRange(1, 1, 1, targetHeaders.length).setValues([targetHeaders]).setFontWeight("bold").setBackground("#f3f3f3");
    }
  });
}

function doGet(e) {
  let ss;
  try {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    return createJsonResponse({ error: "Spreadsheet ID invalid or no access: " + SPREADSHEET_ID });
  }
  
  initializeSheets(ss);
  const tz = ss.getSpreadsheetTimeZone();
  
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '').toLowerCase().trim();
  const category = (params.category || 'AC').toUpperCase().trim();
  
  const cache = CacheService.getScriptCache();
  const cacheKey = action + "_" + category;
  
  if (['get_stats', 'get_global_stats', 'get_tools', 'get_assets', 'get_softfm_evaluations', 'get_valet_data'].includes(action)) {
    const cached = cache.get(cacheKey);
    if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    let responseData;
    switch(action) {
      case 'get_softfm_evaluations':
        const softFMData = getSheetData(ss, 'SoftFM_Weekly_Evaluation');
        responseData = softFMData.map(r => ({
          timestamp: r[0],
          week: r[1],
          name: String(r[2] || '').trim(),
          department: String(r[3] || '').trim(),
          attendance: Number(r[4]),
          punctuality: Number(r[5]),
          behavior: Number(r[6]),
          performance: Number(r[7]),
          supervisorScore: Number(r[8]),
          autoDailyScore: Number(r[9]),
          finalScore: Number(r[10]),
          remarks: String(r[11] || '').trim()
        }));
        break;

      case 'get_tools':
        const toolData = getFilteredSheetData(ss, 'Master_Tools', 0, category);
        responseData = toolData.map(r => ({ 
          category: String(r[0] || '').trim(), 
          name: String(r[1] || '').trim(), 
          qty: Number(r[2]), 
          technician: String(r[3] || '').trim() 
        }));
        break;

      case 'get_assets':
        const assetData = getFilteredSheetData(ss, 'Master_Assets', 11, category);
        responseData = assetData.map(row => ({
          id: row[0], tag: String(row[1] || '').trim(), room: String(row[2] || '').trim(), location: String(row[3] || '').trim(), campus: String(row[4] || '').trim(),
          floor: String(row[5] || '').trim(), brand: String(row[6] || '').trim(), cap: row[7], status: String(row[8] || '').trim(), year: row[9],
          healthScore: row[10] || 100, category: String(row[11] || '').trim(), assignedTech: String(row[12] || '').trim()
        }));
        break;

      case 'get_stats':
        const now = new Date();
        const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();

        const complaints = getFilteredSheetData(ss, 'Work_Orders', 1, category)
          .map((row) => {
            const res = standardizeRowResolution(row, tz);
            return {
              rowIndex: row[row.length - 1], 
              date: row[0], 
              category: String(row[1] || '').trim(), 
              location: String(row[2] || '').trim(),
              assetTag: String(row[3] || '').trim(), 
              details: String(row[4] || '').trim(), 
              assignedTo: String(row[5] || '').trim(), 
              status: String(row[6] || '').trim(),
              resolvedBy: res.resolvedBy,
              resolvedDate: res.resolvedDate,
              resolvedTime: res.resolvedTime,
              resolvedTimestampFull: res.resolvedTimestampFull,
              workType: String(row[11] || '').trim(),
              remarks: String(row[12] || '').trim(),
              gasUsed: row[13],
              gasType: String(row[14] || '').trim(),
              complaintType: row[15] || 'Reactive',
              starRating: row[16],
              pointsAwarded: row[17],
              adminReviewDate: row[18],
              repeatCount: row[19] || 1,
              issueCategory: String(row[20] || 'Unclassified').trim(),
              resolutionTimestamp: res.resolvedTimestampFull
            };
          });
        
        const checkDataRaw = getFilteredSheetData(ss, 'Checklist_Audit', 7, category);
        const checklistAudits = checkDataRaw.map(r => ({
          timestamp: r[0],
          technician: String(r[1] || '').trim(),
          assetTag: String(r[2] || '').trim(),
          task: String(r[3] || '').trim(),
          status: String(r[4] || '').trim(),
          remarks: String(r[5] || '').trim(),
          reference: String(r[6] || '').trim(),
          category: String(r[7] || '').trim(),
          frequency: String(r[8] || '').trim()
        }));

        const dailyComp = [];
        const monthlyComp = [];
        const quarterlyComp = [];

        checkDataRaw.forEach(r => {
          if (!r[0]) return; 
          const rDate = new Date(r[0]);
          const rDateStr = Utilities.formatDate(rDate, tz, "yyyy-MM-dd");
          const rFreq = String(r[8] || 'Daily').trim();
          const rTag = String(r[2] || '').trim();
          
          if (rFreq === 'Daily' && rDateStr === todayStr) dailyComp.push(rTag);
          if (rFreq === 'Monthly' && rDate.getMonth() === thisMonth && rDate.getFullYear() === thisYear) monthlyComp.push(rTag);
          if (rFreq === 'Quarterly' && Math.floor(rDate.getMonth() / 3) === Math.floor(thisMonth / 3) && rDate.getFullYear() === thisYear) quarterlyComp.push(rTag);
        });

        const ptLogs = getFilteredSheetData(ss, 'Performance_Log', 4, category)
          .map(r => ({ Timestamp: r[0], tech: String(r[1] || '').trim(), points: Number(r[2]), reason: String(r[3] || '').trim(), category: String(r[4] || '').trim() }));

        const operationalAssetMap = {};
        getFilteredSheetData(ss, 'Master_Assets', 11, category).forEach(r => {
           const status = String(r[8]).trim().toUpperCase();
           if (status === 'ACTIVE' || status === 'MAINTENANCE') operationalAssetMap[String(r[1]).trim().toUpperCase()] = true;
        });

        let gStocks = {};
        let assetUsage = {};
        getFilteredSheetData(ss, 'Gas_Ledger', 6, category).forEach(row => {
          const actionType = String(row[1] || '').toUpperCase().trim();
          const gasType = String(row[2] || '').trim();
          const amount = Number(row[3]) || 0;

          if (gasType) gStocks[gasType] = (gStocks[gasType] || 0) + amount;

          if (actionType === 'USAGE') {
            const tag = String(row[5] || '').trim().toUpperCase();
            if (operationalAssetMap[tag]) {
              assetUsage[tag] = (assetUsage[tag] || 0) + Math.abs(amount);
            }
          }
        });

        const insightData = getFilteredSheetData(ss, 'System_Insights', 1, category)
          .map(r => ({ tag: String(r[2] || '').trim(), type: String(r[3] || '').trim() }));

        const demands = getFilteredSheetData(ss, 'Material_Demands', 4, category)
          .map(r => ({ timestamp: r[0], technician: String(r[1] || '').trim(), details: String(r[2] || '').trim(), status: String(r[3] || '').trim(), category: String(r[4] || '').trim() }));

        responseData = { 
          complaints, 
          performanceLogs: ptLogs, 
          checklistAudits,
          demands,
          hvac: { 
            daily: dailyComp, 
            monthly: monthlyComp, 
            quarterly: quarterlyComp, 
            gasStocks: gStocks,
            assetUsage: assetUsage
          },
          acknowledgedInsights: insightData
        };
        break;

      case 'get_global_stats':
        const allTickets = getSheetData(ss, 'Work_Orders').map((row) => {
          const res = standardizeRowResolution(row, tz);
          return {
            rowIndex: row[row.length - 1], 
            date: row[0], 
            category: String(row[1] || '').trim(), 
            location: String(row[2] || '').trim(),
            assetTag: String(row[3] || '').trim(), 
            details: String(row[4] || '').trim(), 
            assignedTo: String(row[5] || '').trim(), 
            status: String(row[6] || '').trim(),
            resolvedBy: res.resolvedBy,
            resolvedDate: res.resolvedDate,
            resolvedTime: res.resolvedTime,
            resolvedTimestampFull: res.resolvedTimestampFull,
            workType: String(row[11] || '').trim(),
            complaintType: row[15] || 'Reactive',
            adminReviewDate: row[18],
            resolutionTimestamp: res.resolvedTimestampFull
          };
        });
        const allLogs = getSheetData(ss, 'Performance_Log').map(r => ({ Timestamp: r[0], tech: String(r[1] || '').trim(), points: Number(r[2]), reason: String(r[3] || '').trim(), category: String(r[4] || '').trim() }));
        const allChecklistAudits = getSheetData(ss, 'Checklist_Audit').map(r => ({
          timestamp: r[0],
          technician: String(r[1] || '').trim(),
          assetTag: String(r[2] || '').trim(),
          task: String(r[3] || '').trim(),
          status: String(r[4] || '').trim(),
          remarks: String(r[5] || '').trim(),
          reference: String(r[6] || '').trim(),
          category: String(r[7] || '').trim(),
          frequency: String(r[8] || '').trim()
        }));
        const seatingData = getSheetData(ss, 'Seating_Plan').map(row => ({
          no: row[0], location: String(row[1] || '').trim(), campusCode: String(row[2] || '').trim(), floorTag: String(row[3] || '').trim(), roomTag: String(row[4] || '').trim(),
          stationTag: String(row[5] || '').trim(), empName: String(row[6] || '').trim(), empCode: String(row[7] || '').trim(), empType: String(row[8] || '').trim(), roomCode: String(row[9] || '').trim(),
          roomCodeDashboard: String(row[10] || '').trim(), seatCode: String(row[11] || '').trim(), bu: String(row[12] || '').trim(), department: String(row[13] || '').trim(),
          category: String(row[14] || '').trim(), status: String(row[15] || '').trim(), snapshotDate: String(row[16] || '').trim(), finalDept: String(row[17] || '').trim()
        }));
        const softFMEvaluations = getSheetData(ss, 'SoftFM_Weekly_Evaluation').map(r => ({
          timestamp: r[0],
          week: r[1],
          name: String(r[2] || '').trim(),
          department: String(r[3] || '').trim(),
          attendance: Number(r[4]),
          punctuality: Number(r[5]),
          behavior: Number(r[6]),
          performance: Number(r[7]),
          supervisorScore: Number(r[8]),
          autoDailyScore: Number(r[9]),
          finalScore: Number(r[10]),
          remarks: String(r[11] || '').trim()
        }));
        responseData = { allTickets, allPerformanceLogs: allLogs, allChecklistAudits, seatingData, softFMEvaluations };
        break;

      case 'get_checklist_report':
        const rawCheck = getSheetData(ss, 'Checklist_Audit');
        responseData = rawCheck.filter(r => String(r[7]).toUpperCase().trim() === category);
        break;

      case 'get_complaint_report':
        const rawComplaints = getSheetData(ss, 'Work_Orders');
        responseData = rawComplaints.filter(r => String(r[1]).toUpperCase().trim() === category);
        break;

      case 'get_valet_data':
        const valetData = getSheetData(ss, 'Valet_Log');
        responseData = valetData.map(r => ({
          timestampIn: r[0],
          date: r[1],
          carNumber: String(r[2] || '').trim(),
          cardNumber: String(r[3] || '').trim(),
          parkingSlot: String(r[4] || '').trim(),
          driverIn: String(r[5] || '').trim(),
          timestampOut: r[6],
          driverOut: String(r[7] || '').trim(),
          status: String(r[8] || '').trim(),
          remarks: String(r[9] || '').trim(),
          rowIndex: r[r.length - 1]
        }));
        break;

      default:
        return createJsonResponse({ 
          error: "Action Unknown: " + action,
          v: "24.6",
          allowed: ["get_stats", "get_global_stats", "get_softfm_evaluations"]
        });
    }
    return createJsonResponse(responseData, cacheKey);
  } catch (err) {
    return createJsonResponse({ error: err.toString() });
  }
}

function doPost(e) {
  let ss;
  try {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    return ContentService.createTextOutput("POST_ERROR: Spreadsheet ID invalid or no access: " + SPREADSHEET_ID);
  }
  
  initializeSheets(ss);
  
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '').toLowerCase().trim();
  const category = (params.category || 'AC').toUpperCase().trim();

  // Invalidate cache on any write
  const cache = CacheService.getScriptCache();
  cache.remove("get_stats_" + category);
  cache.remove("get_global_stats_AC"); // Invalidate global cache too
  cache.remove("get_assets_" + category);
  cache.remove("get_tools_" + category);
  cache.remove("get_valet_data_VALET");
  cache.remove("get_softfm_evaluations_AC"); // Soft FM evaluations are global but we use AC as default category for global actions

  try {
    switch(action) {
      case 'rebalance_assets':
        const astSheetB = ss.getSheetByName('Master_Assets');
        const astDataB = astSheetB.getDataRange().getValues();
        const techStr = String(params.techs || '');
        const techs = techStr.split(',').filter(t => t.trim() !== '');
        
        if (techs.length === 0) break;
        
        const acAssets = [];
        for (let i = 1; i < astDataB.length; i++) {
          if (String(astDataB[i][11]).toUpperCase() === category && String(astDataB[i][8]).toUpperCase() === 'ACTIVE') {
            acAssets.push(i + 1); // Row number
          }
        }
        
        const total = acAssets.length;
        const num = techs.length;
        const base = Math.floor(total / num);
        const rem = total % num;
        
        let assetIdx = 0;
        for (let tIdx = 0; tIdx < num; tIdx++) {
          const count = tIdx < rem ? base + 1 : base;
          for (let c = 0; c < count; c++) {
            const rowNum = acAssets[assetIdx++];
            astSheetB.getRange(rowNum, 13).setValue(techs[tIdx]);
          }
        }
        break;

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

        // Standardize incoming data formats if needed
        let resBy = String(params.resolvedBy || '').trim();
        let resDate = String(params.resolvedDate || '').trim();
        let resTime = String(params.resolvedTime || '').trim();
        let resFull = String(params.resolvedTimestampFull || '').trim();

        // Update strict resolution block (Col 7 to 15)
        // 7:Status, 8:ResolvedBy, 9:ResolvedDate, 10:ResolvedTime, 11:ResolvedTimestampFull, 12:WorkType, 13:Remarks, 14:GasUsed, 15:GasType
        woSheetRes.getRange(rowIndexRes, 7, 1, 9).setValues([[
          String(params.status || '').trim(), 
          resBy, 
          resDate,
          resTime,
          resFull,
          String(params.workType || '').trim(), 
          String(params.remarks || '').trim(), 
          params.gasUsed || 0, 
          String(params.gasType || '').trim()
        ]]);
        
        // Only update ComplaintType if explicitly provided
        if (params.complaintType) {
          woSheetRes.getRange(rowIndexRes, 16).setValue(String(params.complaintType).trim());
        }
        break;

      case 'standardize_data':
        standardizeWorkOrders(ss);
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
        // 17:StarRating, 18:PointsAwarded, 19:AdminReviewDate
        woSheetRev.getRange(rowIndexRev, 17, 1, 3).setValues([[
          stars, 
          points, 
          new Date()
        ]]);

        if (reviewReason) {
           const currentRemarks = woSheetRev.getRange(rowIndexRev, 13).getValue(); // Col 13 is Remarks
           const updatedRemarks = currentRemarks ? currentRemarks + " | REVIEW: " + reviewReason : "REVIEW: " + reviewReason;
           woSheetRev.getRange(rowIndexRev, 13).setValue(updatedRemarks);
        }

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
        const woSheetC = ss.getSheetByName('Work_Orders');
        const woDataC = woSheetC.getDataRange().getValues();
        const cAssetTag = String(params.assetTag || '').trim().toUpperCase();
        const cIssueCategory = String(params.issueCategory || 'Unclassified').trim();
        const cCategory = category;
        const cDetails = String(params.details || '').trim();
        const cNow = new Date();
        const c7DaysAgo = new Date(cNow.getTime() - (7 * 24 * 3600 * 1000));
        
        let existingRowIdx = -1;
        
        // STRICT AUTO-MERGE LOGIC
        if (cAssetTag !== 'N/A') {
          for (let i = woDataC.length - 1; i >= 1; i--) {
            const rowAssetTag = String(woDataC[i][3]).trim().toUpperCase();
            const rowCategory = String(woDataC[i][1]).trim().toUpperCase();
            const rowIssueCategory = String(woDataC[i][18] || 'Unclassified').trim();
            const rowStatus = String(woDataC[i][6]).trim().toLowerCase();
            const rowTimestamp = new Date(woDataC[i][0]);
            
            // Criteria: Match AssetTag + Category + IssueCategory
            // AND (Status is active OR ticket was raised within last 7 days)
            const isActive = !['resolved', 'completed', 'resolved (admin)', 'resolved – pending admin review'].includes(rowStatus);
            const isWithin7Days = rowTimestamp >= c7DaysAgo;
            
            if (rowAssetTag === cAssetTag && rowCategory === cCategory && rowIssueCategory === cIssueCategory && (isActive || isWithin7Days)) {
              existingRowIdx = i + 1;
              break;
            }
          }
        }

        if (existingRowIdx !== -1) {
          // MERGE PROTOCOL: Increment Repeat_Count and Update Last Reported Activity
          const currentRepeatCount = Number(woDataC[existingRowIdx - 1][19] || 1); // Col 20 is RepeatCount
          const currentDetails = String(woDataC[existingRowIdx - 1][4] || '');
          const newRepeatCount = currentRepeatCount + 1;
          const timestampLabel = Utilities.formatDate(cNow, ss.getSpreadsheetTimeZone(), "MMM dd, HH:mm");
          const mergedDetails = currentDetails + "\n[" + timestampLabel + " - REPEAT]: " + cDetails;
          
          woSheetC.getRange(existingRowIdx, 5).setValue(mergedDetails);
          woSheetC.getRange(existingRowIdx, 7).setValue('Open'); // Ensure it remains/becomes visible as Open
          woSheetC.getRange(existingRowIdx, 20).setValue(newRepeatCount); // Col 20
          woSheetC.getRange(existingRowIdx, 1).setValue(cNow); // Update Timestamp to reflect "Last Reported Date"
        } else {
          // NEW ENTRY: Create fresh Work Order (21 columns)
          woSheetC.appendRow([
            cNow, 
            cCategory, 
            String(params.location || '').trim(), 
            cAssetTag, 
            cDetails, 
            String(params.assignedTech || 'Unassigned').trim(), 
            String(params.status || 'Open').trim(), 
            '', '', '', '', '', '', 0, '', 
            String(params.complaintType || 'Reactive').trim(),
            '', '', '', 1, 
            cIssueCategory
          ]);
        }
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

      case 'valet_action':
        const vSheet = ss.getSheetByName('Valet_Log');
        const vNow = new Date();
        const vAction = String(params.valetAction || '').trim();
        const vCarNumber = String(params.carNumber || '').trim();
        
        if (vAction === 'Drive IN') {
          const vDateStr = Utilities.formatDate(vNow, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
          vSheet.appendRow([
            vNow,
            vDateStr,
            vCarNumber,
            String(params.cardNumber || '').trim(),
            String(params.parkingSlot || '').trim(),
            String(params.driver || '').trim(),
            '', // Timestamp_OUT
            '', // Driver_OUT
            'Parked',
            String(params.remarks || '').trim()
          ]);
        } else if (vAction === 'Drive OUT') {
          const vData = vSheet.getDataRange().getValues();
          let targetRow = -1;
          for (let i = vData.length - 1; i >= 1; i--) {
            if (String(vData[i][2]).trim() === vCarNumber && (!vData[i][6] || String(vData[i][6]).trim() === "")) {
              targetRow = i + 1;
              break;
            }
          }
          
          if (targetRow !== -1) {
            // Update Timestamp_OUT, Driver_OUT, Status
            vSheet.getRange(targetRow, 7).setValue(vNow);
            vSheet.getRange(targetRow, 8).setValue(String(params.driver || '').trim());
            vSheet.getRange(targetRow, 9).setValue('Returned');
          }
        }
        break;

      case 'submit_softfm_evaluation':
        ss.getSheetByName('SoftFM_Weekly_Evaluation').appendRow([
          new Date(),
          params.week,
          params.name,
          params.department,
          Number(params.attendance),
          Number(params.punctuality),
          Number(params.behavior),
          Number(params.performance),
          Number(params.supervisorScore),
          Number(params.autoDailyScore),
          Number(params.finalScore),
          params.remarks
        ]);
        break;

      default:
        break;
    }
    return ContentService.createTextOutput("OK");
  } catch (err) {
    return ContentService.createTextOutput("POST_ERROR: " + err.toString());
  }
}

function standardizeWorkOrders(ss) {
  if (!ss) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Work_Orders');
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  const headers = data[0];
  
  const hIdx = headers.indexOf('ResolvedBy');
  const iIdx = headers.indexOf('ResolvedDate');
  const jIdx = headers.indexOf('ResolvedTime');
  const kIdx = headers.indexOf('ResolvedTimestampFull');
  const aIdx = headers.indexOf('Timestamp');
  
  if (hIdx === -1 || iIdx === -1 || jIdx === -1 || kIdx === -1) return;

  const tz = ss.getSpreadsheetTimeZone();
  const updates = [];
  
  for (let i = 1; i < data.length; i++) {
    let resolvedBy = String(data[i][hIdx] || '').trim();
    let resolvedDate = data[i][iIdx];
    let resolvedTime = data[i][jIdx];
    let resolvedTimestampFull = data[i][kIdx];
    const timestamp = data[i][aIdx];

    // 1. Extract from format "Name • DD/MM/YYYY, HH:MM:SS"
    if (resolvedBy.includes('•')) {
      const parts = resolvedBy.split('•');
      resolvedBy = parts[0].trim();
      const dateTimePart = parts[1].trim(); 
      const dtParts = dateTimePart.split(',');
      if (dtParts.length === 2) {
        resolvedDate = dtParts[0].trim();
        resolvedTime = dtParts[1].trim();
      }
    }

    // 2. Fallback for ResolvedDate if missing or invalid (1899 check)
    const isInvalidDate = (d) => {
      if (!d || d === "") return true;
      const dStr = d.toString();
      return dStr.includes("1899") || dStr === "Sat Dec 30 1899 00:00:00 GMT+0500 (Pakistan Standard Time)";
    };

    if (isInvalidDate(resolvedDate)) {
      if (timestamp) {
        resolvedDate = Utilities.formatDate(new Date(timestamp), tz, "dd/MM/yyyy");
      }
    }

    // 3. Ensure proper date/time strings for the sheet
    if (resolvedDate instanceof Date) {
      resolvedDate = Utilities.formatDate(resolvedDate, tz, "dd/MM/yyyy");
    }
    if (resolvedTime instanceof Date) {
      resolvedTime = Utilities.formatDate(resolvedTime, tz, "HH:mm:ss");
    }

    // 4. Standardize ResolvedTimestampFull: M/d/yyyy, h:mm:ss a
    if (resolvedDate && resolvedTime) {
      try {
        const dParts = String(resolvedDate).split('/');
        const tParts = String(resolvedTime).split(':');
        if (dParts.length === 3 && tParts.length === 3) {
           // Assume DD/MM/YYYY
           const dObj = new Date(dParts[2], dParts[1]-1, dParts[0], tParts[0], tParts[1], tParts[2]);
           resolvedTimestampFull = Utilities.formatDate(dObj, tz, "M/d/yyyy, h:mm:ss a");
        }
      } catch(e) {
        resolvedTimestampFull = resolvedDate + ", " + resolvedTime;
      }
    }

    updates.push([resolvedBy, resolvedDate, resolvedTime, resolvedTimestampFull]);
  }

  if (updates.length > 0) {
    sheet.getRange(2, hIdx + 1, updates.length, 4).setValues(updates);
  }
}

function standardizeRowResolution(row, tz) {
  let resBy = String(row[7] || '').trim();
  let resDate = row[8];
  let resTime = row[9];
  let resFull = row[10];

  // If resFull is empty, try to extract from resBy (Old Format)
  if (!resFull || String(resFull).trim() === "") {
    const bulletMatch = resBy.match(/[•·\-\|]/);
    if (bulletMatch) {
      const bullet = bulletMatch[0];
      const parts = resBy.split(bullet);
      resBy = parts[0].trim();
      const dateTimePart = (parts[1] || '').trim();
      resFull = dateTimePart;
      const dtParts = dateTimePart.split(',');
      if (dtParts.length >= 2) {
        resDate = dtParts[0].trim();
        resTime = dtParts[1].trim();
      } else {
        resDate = dateTimePart;
      }
    }
  }

  // Ensure they are strings for the API response
  if (resDate instanceof Date) resDate = Utilities.formatDate(resDate, tz, "dd/MM/yyyy");
  if (resTime instanceof Date) resTime = Utilities.formatDate(resTime, tz, "HH:mm:ss");
  if (resFull instanceof Date) resFull = Utilities.formatDate(resFull, tz, "M/d/yyyy, h:mm:ss a");
  
  return { 
    resolvedBy: String(resBy || '').trim(), 
    resolvedDate: String(resDate || '').trim(), 
    resolvedTime: String(resTime || '').trim(), 
    resolvedTimestampFull: String(resFull || '').trim() 
  };
}

function getSheetData(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const filtered = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row[0] && String(row[0]).trim() !== "") {
      row.push(i + 1); // Original row index
      filtered.push(row);
    }
  }
  return filtered;
}

function getFilteredSheetData(ss, sheetName, categoryIndex, categoryValue) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  
  const filtered = [];
  let targetCat = String(categoryValue || '').toUpperCase().trim();
  
  // Normalize targetCat if it's the long name from api.ts
  if (targetCat === 'GENERAL MAINTENANCE (GM)') targetCat = 'HANDYMAN';
  
  // Define aliases for flexible filtering
  const aliases = {
    'HANDYMAN': ['HANDYMAN', 'GM', 'GENERAL MAINTENANCE', 'GENERAL-MAINTENANCE', 'PLUMBING'],
    'AC': ['AC', 'HVAC', 'AC (HVAC)'],
    'ELECTRICAL': ['ELECTRICAL', 'ELECTRIC']
  };

  const allowedCats = aliases[targetCat] || [targetCat];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue;
    
    const rowCat = String(row[categoryIndex] || '').toUpperCase().trim();
    if (categoryIndex === -1 || allowedCats.includes(rowCat)) {
      row.push(i + 1); // Original row index
      filtered.push(row);
    }
  }
  return filtered;
}

function createJsonResponse(data, cacheKey) {
  const json = JSON.stringify(data);
  if (cacheKey) {
    try {
      CacheService.getScriptCache().put(cacheKey, json, 30);
    } catch (e) {}
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
