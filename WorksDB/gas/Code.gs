/**
 * WorksDB Central Project Registry & Shared Project Bridge v4
 * 
 * Central Google Sheets setup:
 * 1. Open a Google Spreadsheet.
 * 2. Go to "Extensions" -> "Apps Script".
 * 3. Replace all default code with this file.
 * 4. Run "setupWorksDBMaster" once to create the central project registry.
 * 5. Click "Deploy" -> "New deployment" -> "Web app".
 *    - Execute as: "Me" (your email)
 *    - Who has access: "Anyone"
 * 6. Copy the Web App URL and paste it into the Web Application.
 */

var CONFIG = {
  registrySheetName: "案件マスター",
  trackSheetName: "進捗管理",
  scheduleSheetName: "制作スケジュール",
  statusSheetName: "設定_ステータス",
  projectSheetName: "設定_案件",
  daysToSetup: 60
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("WorksDB")
    .addItem("管理DBをセットアップ", "setupWorksDBMaster")
    .addItem("このシートを案件用にセットアップ", "setupWorksDB")
    .addItem("接続情報を表示", "showWorksDBInfo_")
    .addToUi();
}

function showWorksDBInfo_() {
  var url = ScriptApp.getService().getUrl() || "未デプロイ";
  SpreadsheetApp.getUi().alert(
    "WorksDB 接続情報",
    "WebアプリURL:\n" + url + "\n\n" +
      "案件マスター: " + CONFIG.registrySheetName + "\n" +
      "案件用スケジュール: " + CONFIG.scheduleSheetName + "\n" +
      "ステータス設定: " + CONFIG.statusSheetName + "\n" +
      "案件設定: " + CONFIG.projectSheetName + "\n" +
      "Engine: WorksDB Central Registry v4",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function setupWorksDB() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    "WorksDB 一括スケジュール管理セットアップ",
    "「スケジュール」シート、「設定_ステータス」シート、「設定_案件」シートを初期化または再作成します。続行しますか？",
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var statusSheet = setupStatusSheet_(ss);
    var projectSheet = setupProjectSheet_(ss);
    var scheduleSheet = setupScheduleSheet_(ss);
    var trackSheet = setupTrackSheet_(ss, { id: "manual", name: ss.getName(), color: "#6fd6ff" });
    
    SpreadsheetApp.flush();
    ui.alert(
      "セットアップ完了",
      "以下のシートを用意しました：\n" +
        "・" + scheduleSheet.getName() + " (スケジュール・ガント本体)\n" +
        "・" + trackSheet.getName() + " (楽曲進捗)\n" +
        "・" + statusSheet.getName() + " (工程カラー設定)\n" +
        "・" + projectSheet.getName() + " (案件カラー・アーカイブ設定)\n\n" +
        "シートを再読み込みして、「WorksDB」メニューを確認してください。",
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert("セットアップエラー", String(err.message || err), ui.ButtonSet.OK);
    throw err;
  }
}

function setupStatusSheet_(ss) {
  var name = CONFIG.statusSheetName;
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  
  var headers = ["工程名", "カラーHEX"];
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setBackground("#10243d")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  
  var defaults = [
    ["作曲", "#ef4444"],
    ["アレンジ", "#22c55e"],
    ["REC", "#f472b6"],
    ["MIX", "#a855f7"],
    ["マスタリング", "#eab308"],
    ["浄書", "#f97316"],
    ["修正", "#ec4899"],
    ["打ち合わせ", "#3b82f6"]
  ];
  sheet.getRange(2, 1, defaults.length, headers.length).setValues(defaults);
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 120);
  return sheet;
}

function setupProjectSheet_(ss) {
  var name = CONFIG.projectSheetName;
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  
  var headers = ["案件ID", "案件名", "カラーHEX", "アーカイブ", "表示順"];
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setBackground("#10243d")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  
  var defaults = [
    ["proj_sample_01", "サンプル案件", "#3b82f6", "FALSE", 1]
  ];
  sheet.getRange(2, 1, defaults.length, headers.length).setValues(defaults);
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 80);
  
  var cell = sheet.getRange("D2:D100");
  cell.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  return sheet;
}

function setupScheduleSheet_(ss) {
  var name = CONFIG.scheduleSheetName;
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  
  var days = CONFIG.daysToSetup;
  var columns = 3 + days;
  ensureSheetSize_(sheet, 10, columns);
  
  var header = ["Project", "Track", "Memo"];
  var start = new Date();
  start = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0);
  for (var d = 0; d < days; d++) {
    var date = new Date(start.getTime());
    date.setDate(start.getDate() + d);
    header.push(date);
  }
  
  sheet.getRange(1, 1, 1, columns).setValues([header]);
  sheet.getRange(1, 4, 1, days).setNumberFormat("yyyy-mm-dd");
  sheet.getRange(1, 1, 1, columns)
    .setBackground("#10243d")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
    
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 150);
  for (var c = 4; c <= columns; c++) sheet.setColumnWidth(c, 76);
  
  var defaults = [
    ["サンプル案件", "Main Theme", "メインテーマ曲用", "作曲", "作曲", "アレンジ"],
    ["サンプル案件", "Ending", "エンディング哀愁漂う曲", "", "", "作曲"]
  ];
  sheet.getRange(2, 1, defaults.length, 6).setValues(defaults);
  
  var condRange = sheet.getRange(2, 4, 100, days);
  condRange.setWrap(true).setHorizontalAlignment("center").setVerticalAlignment("middle");
  
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName(CONFIG.statusSheetName).getRange("A2:A100"), true)
    .setAllowInvalid(true)
    .build();
  condRange.setDataValidation(statusRule);
  
  return sheet;
}

function ensureSheetSize_(sheet, rows, columns) {
  if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  if (sheet.getMaxColumns() < columns) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
}

/**
 * Web App Entry Points
 */
function doGet(e) {
  return handleRequest_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  var params = {};
  try {
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    params = e && e.parameter ? e.parameter : {};
  }
  return handleRequest_(params);
}

/**
 * Router & Dispatcher for Differential Sync
 */
function handleRequest_(params) {
  var action = String(params.action || "read").toLowerCase();
  
  try {
    if (action === "ping" || action === "health") {
      return jsonResponse_({ ok: true, action: "ping", version: "v2-diff-sync" });
    }
    
    if (action === "list_projects") return jsonResponse_(listProjects_());
    if (action === "create_project") return jsonResponse_(createProject_(params.project || params));
    if (action === "upsert_project") return jsonResponse_(upsertProject_(params.project || params));
    if (action === "archive_project" || action === "delete_project") return jsonResponse_(archiveProject_(params.projectId || params.id));
    if (action === "setup_master") return jsonResponse_(setupWorksDBMaster_(false));
    if (action === "write_track_field") return jsonResponse_(writeTrackField_(params));
    
    if (action === "schedule") {
      return jsonResponse_(readUnifiedScheduleGrid_(params));
    }
    
    if (action === "write_schedule" || action === "diff_sync") {
      return jsonResponse_(writeDifferentialUpdates_(params));
    }

    if (action === "add_track") {
      return jsonResponse_(addTrackRow_(params));
    }

    if (action === "delete_track") {
      return jsonResponse_(deleteTrackRow_(params));
    }

    throw new Error("Unknown action: " + action);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * Reads schedule grid with optional timestamp / version differential checking
 */
function readUnifiedScheduleGrid_(params) {
  var ss = openTargetSpreadsheet_(params);
  
  var schedSheet = ss.getSheetByName(String(params.sheetName || CONFIG.scheduleSheetName));
  if (!schedSheet) throw new Error("Schedule sheet not found: " + CONFIG.scheduleSheetName);
  var schedValues = schedSheet.getDataRange().getDisplayValues();
  
  var statusSheet = ss.getSheetByName(CONFIG.statusSheetName);
  var statuses = [];
  if (statusSheet) {
    var vals = statusSheet.getDataRange().getDisplayValues();
    for (var r = 1; r < vals.length; r++) {
      if (vals[r][0]) {
        statuses.push({ name: vals[r][0], color: vals[r][1] || "#3b82f6" });
      }
    }
  }
  
  var projSheet = ss.getSheetByName(CONFIG.projectSheetName);
  var projects = [];
  if (projSheet) {
    var vals = projSheet.getDataRange().getDisplayValues();
    for (var r = 1; r < vals.length; r++) {
      if (vals[r][1]) {
        projects.push({
          id: vals[r][0] || ("proj_" + r),
          name: vals[r][1],
          color: vals[r][2] || "#3b82f6",
          archived: String(vals[r][3]).toUpperCase() === "TRUE",
          order: parseInt(vals[r][4], 10) || r
        });
      }
    }
  }
  
  return {
    ok: true,
    action: "schedule",
    sheetId: ss.getId(),
    grid: schedValues,
    statuses: statuses.length ? statuses : undefined,
    projects: projects.length ? projects : undefined,
    syncedAt: new Date().toISOString()
  };
}

/**
 * DIFFERENTIAL SYNC WRITER (差分書き込み)
 * Updates only changed cells identified by (project, track, date) or (r, c).
 */
function writeDifferentialUpdates_(params) {
  var ss = openTargetSpreadsheet_(params);
  var result = { ok: true, updates: {}, note: "Schedule edits are managed centrally in WorksDB Schedule App without writing to individual sheets." };
  
  if (params.edits && params.edits.length > 0) {
    result.updates.editsCount = params.edits.length;
    result.updates.centrallyManaged = true;
  }

  // 3. Differential Statuses Update
  if (params.statuses) {
    var statusSheet = ss.getSheetByName(CONFIG.statusSheetName);
    if (statusSheet) {
      statusSheet.clear();
      var headers = ["工程名", "カラーHEX"];
      statusSheet.getRange(1, 1, 1, headers.length).setValues([headers])
        .setBackground("#10243d").setFontColor("#ffffff").setFontWeight("bold");
      
      var vals = [];
      for (var i = 0; i < params.statuses.length; i++) {
        var st = params.statuses[i];
        if (st.name) vals.push([st.name, st.color || "#3b82f6"]);
      }
      if (vals.length > 0) {
        statusSheet.getRange(2, 1, vals.length, 2).setValues(vals);
      }
      result.updates.statusesCount = vals.length;
    }
  }

  // 4. Differential Projects Update
  if (params.projects) {
    var projSheet = ss.getSheetByName(CONFIG.projectSheetName);
    if (projSheet) {
      projSheet.clear();
      var headers = ["案件ID", "案件名", "カラーHEX", "アーカイブ", "表示順"];
      projSheet.getRange(1, 1, 1, headers.length).setValues([headers])
        .setBackground("#10243d").setFontColor("#ffffff").setFontWeight("bold");
      
      var vals = [];
      for (var i = 0; i < params.projects.length; i++) {
        var p = params.projects[i];
        if (p.name) {
          vals.push([
            p.id || ("proj_" + i),
            p.name,
            p.color || "#3b82f6",
            p.archived ? "TRUE" : "FALSE",
            p.order || (i + 1)
          ]);
        }
      }
      if (vals.length > 0) {
        projSheet.getRange(2, 1, vals.length, 5).setValues(vals);
        projSheet.getRange(2, 4, vals.length, 1).setDataValidation(
          SpreadsheetApp.newDataValidation().requireCheckbox().build()
        );
      }
      result.updates.projectsCount = vals.length;
    }
  }

  SpreadsheetApp.flush();
  result.syncedAt = new Date().toISOString();
  return result;
}

/**
 * Appends a new track row differentials
 */
function addTrackRow_(params) {
  var ss = openTargetSpreadsheet_(params);
  var sheet = ss.getSheetByName(CONFIG.scheduleSheetName);
  if (!sheet) throw new Error("Schedule sheet not found");
  
  var projName = params.project;
  var trackName = params.track;
  var memo = params.memo || "";
  
  if (!projName || !trackName) throw new Error("Project and Track name required");
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  
  var newRow = [projName, trackName, memo];
  for (var c = 4; c <= lastCol; c++) {
    newRow.push("");
  }
  
  sheet.appendRow(newRow);
  SpreadsheetApp.flush();
  return { ok: true, action: "add_track", project: projName, track: trackName };
}

/**
 * Deletes a single track row differentials
 */
function deleteTrackRow_(params) {
  var ss = openTargetSpreadsheet_(params);
  var sheet = ss.getSheetByName(CONFIG.scheduleSheetName);
  if (!sheet) throw new Error("Schedule sheet not found");
  
  var projName = params.project;
  var trackName = params.track;
  
  var values = sheet.getDataRange().getDisplayValues();
  for (var r = 1; r < values.length; r++) {
    if (values[r][0] === projName && values[r][1] === trackName) {
      sheet.deleteRow(r + 1);
      SpreadsheetApp.flush();
      return { ok: true, action: "delete_track", project: projName, track: trackName };
    }
  }
  return { ok: false, error: "Track not found" };
}

var MASTER_HEADERS = [
  "案件ID", "案件名", "種別", "状態", "担当者", "締切日", "放送日メモ", "カラー",
  "スプレッドシートID", "スプレッドシートURL", "WebアプリURL", "進捗シート名", "進捗GID",
  "スケジュールSpreadsheetID", "スケジュールURL", "スケジュールシート名", "スケジュールGID",
  "メモ", "アーカイブ", "表示順", "更新日時", "スケジュール開始日", "表示日数"
];

function setupWorksDBMaster() {
  setupWorksDBMaster_(true);
}

function setupWorksDBMaster_(showAlert) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = setupRegistrySheet_(ss);
  SpreadsheetApp.flush();
  var result = {
    ok: true,
    action: "setup_master",
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    webAppUrl: ScriptApp.getService().getUrl() || "",
    sheetName: sheet.getName()
  };
  if (showAlert) {
    SpreadsheetApp.getUi().alert(
      "WorksDB 管理DBセットアップ完了",
      "案件一覧は「" + sheet.getName() + "」シートで一元管理します。\n\nWebアプリURL:\n" + (result.webAppUrl || "デプロイ後に表示されます"),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
  return result;
}

function setupRegistrySheet_(ss) {
  var sheet = ss.getSheetByName(CONFIG.registrySheetName);
  if (!sheet) sheet = ss.insertSheet(CONFIG.registrySheetName, 0);
  var current = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(sheet.getLastColumn(), MASTER_HEADERS.length)).getValues() : [];
  sheet.clear();
  sheet.getRange(1, 1, 1, MASTER_HEADERS.length).setValues([MASTER_HEADERS])
    .setBackground("#10243d").setFontColor("#ffffff").setFontWeight("bold");
  if (current.length) sheet.getRange(2, 1, current.length, current[0].length).setValues(current);
  sheet.setFrozenRows(1);
  sheet.getRange("S2:S1000").setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sheet.autoResizeColumns(1, MASTER_HEADERS.length);
  sheet.setColumnWidth(2, 250);
  sheet.setColumnWidth(10, 260);
  sheet.setColumnWidth(11, 260);
  sheet.setColumnWidth(18, 320);
  return sheet;
}

function masterSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(CONFIG.registrySheetName) || setupRegistrySheet_(ss);
}

function listProjects_() {
  var sheet = masterSheet_();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, MASTER_HEADERS.length).getDisplayValues() : [];
  var projects = [];
  for (var i = 0; i < rows.length; i++) {
    var item = rowToProject_(rows[i]);
    if (item.id && !item.archived) projects.push(item);
  }
  projects.sort(function(a, b) { return Number(a.order || 9999) - Number(b.order || 9999); });
  return {
    ok: true,
    action: "list_projects",
    projects: projects,
    spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
    spreadsheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    webAppUrl: ScriptApp.getService().getUrl() || "",
    syncedAt: new Date().toISOString()
  };
}

function rowToProject_(row) {
  return {
    id: row[0] || "", name: row[1] || "", type: row[2] || "制作管理", status: row[3] || "準備中",
    owner: row[4] || "", deadline: normalizeDate_(row[5]), broadcastDate: row[6] || "", color: row[7] || "#6fd6ff",
    spreadsheetId: row[8] || "", spreadsheetUrl: row[9] || "", webAppUrl: row[10] || "",
    trackSheetName: row[11] || CONFIG.trackSheetName, sheetGid: Number(row[12] || 0),
    scheduleSpreadsheetId: row[13] || row[8] || "", scheduleSpreadsheetUrl: row[14] || row[9] || "",
    scheduleSheetName: row[15] || CONFIG.scheduleSheetName, scheduleGid: Number(row[16] || 0),
    note: row[17] || "", archived: String(row[18]).toUpperCase() === "TRUE", order: Number(row[19] || 9999),
    updatedAt: row[20] || "", bridge: { scheduleStartDate: normalizeDate_(row[21]), scheduleDays: Number(row[22] || 30) }, self: false
  };
}

function projectToRow_(project) {
  return [
    project.id, project.name, project.type, project.status, project.owner, project.deadline, project.broadcastDate, project.color,
    project.spreadsheetId, project.spreadsheetUrl, project.webAppUrl, project.trackSheetName, project.sheetGid,
    project.scheduleSpreadsheetId, project.scheduleSpreadsheetUrl, project.scheduleSheetName, project.scheduleGid,
    project.note, project.archived, project.order, project.updatedAt,
    project.bridge && project.bridge.scheduleStartDate || project.scheduleStartDate || "",
    Number(project.bridge && project.bridge.scheduleDays || project.scheduleDays || 30)
  ];
}

function normalizeProject_(input) {
  input = input || {};
  var id = String(input.id || input.projectId || "").trim();
  var name = String(input.name || input.projectName || "").trim();
  if (!id) id = "proj_" + Utilities.getUuid().replace(/-/g, "").slice(0, 12);
  if (!name) throw new Error("案件名が必要です");
  return {
    id: id, name: name, type: String(input.type || "制作管理"), status: String(input.status || "稼働中"),
    owner: String(input.owner || ""), deadline: normalizeDate_(input.deadline), broadcastDate: String(input.broadcastDate || ""),
    color: String(input.color || "#6fd6ff"), spreadsheetId: String(input.spreadsheetId || ""),
    spreadsheetUrl: String(input.spreadsheetUrl || ""), webAppUrl: String(input.webAppUrl || ScriptApp.getService().getUrl() || ""),
    trackSheetName: String(input.trackSheetName || CONFIG.trackSheetName), sheetGid: Number(input.sheetGid || 0),
    scheduleSpreadsheetId: String(input.scheduleSpreadsheetId || input.spreadsheetId || ""),
    scheduleSpreadsheetUrl: String(input.scheduleSpreadsheetUrl || input.spreadsheetUrl || ""),
    scheduleSheetName: String(input.scheduleSheetName || CONFIG.scheduleSheetName), scheduleGid: Number(input.scheduleGid || 0),
    note: String(input.note || ""), archived: input.archived === true || String(input.archived).toUpperCase() === "TRUE",
    order: Number(input.order || input.sortOrder || 9999), updatedAt: new Date().toISOString(),
    bridge: {
      scheduleStartDate: normalizeDate_(input.bridge && input.bridge.scheduleStartDate || input.scheduleStartDate),
      scheduleDays: Number(input.bridge && input.bridge.scheduleDays || input.scheduleDays || 30)
    }, self: false
  };
}

function findProjectRow_(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return 0;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i++) if (values[i][0] === id) return i + 2;
  return 0;
}

function upsertProject_(input) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var project = normalizeProject_(input);
    var sheet = masterSheet_();
    var row = findProjectRow_(sheet, project.id);
    if (!project.order || project.order === 9999) project.order = row ? Number(sheet.getRange(row, 20).getValue() || row - 1) : Math.max(1, sheet.getLastRow());
    if (row) sheet.getRange(row, 1, 1, MASTER_HEADERS.length).setValues([projectToRow_(project)]);
    else sheet.appendRow(projectToRow_(project));
    SpreadsheetApp.flush();
    return { ok: true, action: "upsert_project", project: project };
  } finally {
    lock.releaseLock();
  }
}

function createProject_(input) {
  var project = normalizeProject_(input);
  var ss = SpreadsheetApp.create(project.name);
  var layout = setupProjectWorkbook_(ss, project);
  project.spreadsheetId = ss.getId();
  project.spreadsheetUrl = ss.getUrl();
  project.sheetGid = layout.trackGid;
  project.scheduleSpreadsheetId = ss.getId();
  project.scheduleSpreadsheetUrl = ss.getUrl();
  project.scheduleGid = layout.scheduleGid;
  project.webAppUrl = ScriptApp.getService().getUrl() || project.webAppUrl;
  var saved = upsertProject_(project);
  saved.action = "create_project";
  return saved;
}

function archiveProject_(id) {
  var sheet = masterSheet_();
  var row = findProjectRow_(sheet, String(id || ""));
  if (!row) throw new Error("案件が見つかりません");
  sheet.getRange(row, 19).setValue(true);
  sheet.getRange(row, 21).setValue(new Date().toISOString());
  return { ok: true, action: "archive_project", projectId: id };
}

function setupProjectWorkbook_(ss, project) {
  setupStatusSheet_(ss);
  setupProjectSheet_(ss);
  var schedule = setupScheduleSheet_(ss);
  var track = setupTrackSheet_(ss, project);
  var projectSheet = ss.getSheetByName(CONFIG.projectSheetName);
  projectSheet.getRange(2, 1, 1, 5).setValues([[project.id, project.name, project.color, false, 1]]);
  if (schedule.getLastRow() >= 2) schedule.getRange(2, 1, schedule.getLastRow() - 1, 1).setValue(project.name);
  var defaultSheet = ss.getSheetByName("シート1") || ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
  SpreadsheetApp.flush();
  return { trackGid: track.getSheetId(), scheduleGid: schedule.getSheetId() };
}

function setupTrackSheet_(ss, project) {
  var sheet = ss.getSheetByName(CONFIG.trackSheetName);
  if (!sheet) sheet = ss.insertSheet(CONFIG.trackSheetName);
  sheet.clear();
  var headers = ["No.", "V", "title", "要約", "録音楽器", "sec", "担当", "date", "進捗", "進捗%", "client", "全体要約"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground("#10243d").setFontColor("#ffffff").setFontWeight("bold");
  var rows = [];
  for (var i = 1; i <= 10; i++) rows.push([i, "", "楽曲 " + i, "", "", "", "", "", "", 0, "", ""]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  sheet.setColumnWidth(3, 240);
  sheet.setColumnWidth(4, 320);
  sheet.setColumnWidth(12, 360);
  return sheet;
}

function openTargetSpreadsheet_(params) {
  var id = params && String(params.spreadsheetId || params.sheetId || "").trim();
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function writeTrackField_(params) {
  var ss = openTargetSpreadsheet_(params);
  var sheet = ss.getSheetByName(String(params.trackSheetName || CONFIG.trackSheetName));
  if (!sheet) throw new Error("進捗管理シートが見つかりません");
  var trackNo = Number(params.trackNo || 0);
  if (trackNo < 1) throw new Error("trackNo が不正です");
  var row = trackNo + 1;
  if (params.version !== undefined) sheet.getRange(row, 2).setValue(params.version);
  if (params.progress !== undefined) sheet.getRange(row, 9).setValue(params.progress);
  if (params.percent !== undefined) sheet.getRange(row, 10).setValue(Number(params.percent || 0));
  if (params.client !== undefined) sheet.getRange(row, 11).setValue(params.client);
  if (params.overallSummary !== undefined) sheet.getRange(row, 12).setValue(params.overallSummary);
  SpreadsheetApp.flush();
  return { ok: true, action: "write_track_field", spreadsheetId: ss.getId(), trackNo: row };
}

function normalizeDate_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || "Asia/Tokyo", "yyyy-MM-dd");
  }
  var text = String(value).trim();
  var match = text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (!match) return text;
  return match[1] + "-" + ("0" + match[2]).slice(-2) + "-" + ("0" + match[3]).slice(-2);
}
function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
