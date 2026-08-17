(function () {
  "use strict";

  // ===========================================================================
  // CONFIG — コーディングAIは主にこのブロックを編集してください
  // ===========================================================================
  const CONFIG = {
    storageKey: "kimchi-dashboard-v2",
    themeStorageKey: "kimchi-dashboard-theme",
    aiKeyStorageKey: "kimchi-dashboard-gemini-key",
    aiCacheStorageKey: "kimchi-dashboard-ai-cache",
    // Gemini APIキー（個人利用・このファイル専用）。空なら localStorage / AI設定を使う。
    // 共有・公開するときは必ず空にすること。
    geminiApiKey: "",
    // Gemini Free tier 向け（失敗時は次モデルへフォールバック）
    // 新規キーでは 2.5/2.0 系が制限されることがあるため 3.1 Flash-Lite を優先
    geminiModels: [
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.5-flash",
      "gemini-3-flash-preview",
      "gemini-2.0-flash-lite",
      "gemini-2.0-flash",
    ],
    maxTracks: 11,

    // Google スプレッドシート（Msheet V2）
    // webAppUrl … Google Apps Script のデプロイURL（空なら読み取りのみ）
    // 列 index（0始まり）:
    // 1=v, 4=title, 5=scene, 7=sec, 8=進捗, 9=進捗%, 10=client(K), 11=全体要約(L),
    // 12=初稿memo, 13=制作資料, 14=打ち合わせ時メモ, 15=リハメモ, 16=要約,
    // 17=FB_v1, 18=FB_v2, 19=FB_v3(T), 20=FB_v4(U), 21=録音楽器, 30=参考曲
    // ※ K列 client / U列 FB_v4 挿入後の配置。列がズレているときはここを修正。
    sheet: {
      id: "1gcr88Wp-cjWSMwWiUX3U1NC7dU1WQ0HfF7n3JTH-23U",
      gid: 0,
      webAppUrl: "https://script.google.com/macros/s/AKfycbwlwsfJekrSMBM7v-ADc6ncZYQAXw_iVPRtotGoFtCZymCtfNJ9FqjfQYrlskbSJ4fnKw/exec",
      editUrl: "https://docs.google.com/spreadsheets/d/1gcr88Wp-cjWSMwWiUX3U1NC7dU1WQ0HfF7n3JTH-23U/edit?gid=0",
      cols: {
        version: 1,
        title: 4,
        scene: 5,
        length: 7,
        progress: 8,
        percent: 9,
        client: 10, // K列 client（OK または空）
        overallSummary: 11, // L列 AI全文バックアップ（localStorage 障害時の復元用）
        productionMemo: 12,
        productionMaterial: 13,
        meetingMemo: 14,
        rehaMemo: 15,
        memo: 16,
        fbV1: 17,
        fbV2: 18,
        fbV3: 19, // T列
        fbV4: 20, // U列 FB_v4（シート表記 BF_v4 も可）
        instrument: 21,
        reference: 30,
      },
    },

    scheduleSheet: {
      id: "1aPDB-g_eMP60naVDGSY3P0Sm7RELQ0laihPVq2VS8-Y",
      gid: 0,
      editUrl: "https://docs.google.com/spreadsheets/d/1aPDB-g_eMP60naVDGSY3P0Sm7RELQ0laihPVq2VS8-Y/edit?usp=sharing",
      dateColStart: 6,
      trackRowStart: 3,
      legendSheetName: "シート8",
      // 読取優先順: webApp(getDisplayValues) → CSV export → GViz(最終手段)
      // webApp は sheet.webAppUrl の ?action=schedule を使用
    },

    project: {
      finalDeadline: "2026-07-23",
      broadcastLabel: "2026年9月5日（土）22:00〜22:50",
    },

    // スケジュール表取得失敗時のマイルストーン・カレンダー用フォールバック
    milestones: [
      { date: "2026-07-07", label: "制作打ち合わせ" },
      { date: "2026-07-09", label: "リハーサル / WS" },
      { date: "2026-07-12", label: "セリフ収録" },
      { date: "2026-07-23", label: "完パケ" },
      { date: "2026-07-25", label: "劇伴貼付・SE" },
    ],

    // スケジュール表「シート8」／リスト表の色分け（#RRGGBB）
    scheduleTaskColors: {
      "START": "#ffd966",
      "demoup": "#c9daf8",
      "修正": "#d0e0e3",
      "作詞": "#d9ead3",
      "作曲": "#b7e1cd",
      "編曲": "#4a86e8",
      "編曲外注": "#0000ff",
      "録音": "#f4cccc",
      "仮MIX": "#f9cb9c",
      "本MIX": "#ffd966",
      "DEADLINE": "#ff0000",
      "尺編集": "#45818e",
      "MASTERING": "#ff9900",
      "meeting": "#f4cccc",
      "譜面制作": "#45818e",
      "Check": "#45818e",
      "DATA作成": "#45818e",
      "RELEASE": "#45818e",
      "FIX": "#ffff00",
      "打ち合わせ": "#ffff00",
      "リハーサル": "#d0e0e3",
      "内見": "#f4cccc",
      "休み": "#c9daf8",
      "午後休み": "#f4c7c3",
    },
    scheduleTaskColorFallback: "#8aa8c8",

    tracks: [
      { id: "m1", code: "M1", title: "M1", brief: "楽曲概要・メモ" },
      { id: "m2", code: "M2", title: "M2", brief: "楽曲概要・メモ" },
      { id: "m3", code: "M3", title: "M3", brief: "楽曲概要・メモ" },
      { id: "m4", code: "M4", title: "M4", brief: "楽曲概要・メモ" },
      { id: "m5", code: "M5", title: "M5", brief: "楽曲概要・メモ" },
    ],

    // シート「進捗」列の種類（value はシートに書き戻す文字列そのまま）
    statusOptions: [
      { value: "", label: "—", percent: 0, slug: "unset" },
      { value: "作曲", label: "作曲", percent: 15, slug: "sakkyoku" },
      { value: "編曲", label: "編曲", percent: 30, slug: "henkyoku" },
      { value: "宅録", label: "宅録", percent: 45, slug: "takuroku" },
      { value: "譜面制作", label: "譜面制作", percent: 55, slug: "score" },
      { value: "修正", label: "修正", percent: 60, slug: "shusei" },
      { value: "Mix", label: "Mix", percent: 80, slug: "mix" },
      { value: "fix", label: "fix", percent: 90, slug: "fix" },
      { value: "確認中", label: "確認中", percent: 95, slug: "checking" },
      { value: "OK", label: "OK", percent: 100, slug: "ok" },
    ],

    guidelines: [],
    team: [],
    characters: [],
    scenes: [],
  };

  // ===========================================================================
  // RUNTIME — 通常は編集不要
  // ===========================================================================
  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const $ = (id) => document.getElementById(id);
  const BASE_STORAGE_KEY = CONFIG.storageKey;
  let projectLoadToken = 0;
  let state = { tracks: [], extraTrackCount: 0 };
  let sheetMeta = { loaded: false, loading: false, source: "local", syncedAt: null, error: null };
  let scheduleMeta = { loaded: false, syncedAt: null, error: null, source: null };
  let scheduleData = null;
  let activeMilestones = CONFIG.milestones.slice();
  let scheduleBoardMilestones = CONFIG.milestones.slice();
  let activeProjectEntry = null;
  const DEFAULT_SHEET_CONFIG = { ...CONFIG.sheet };
  const DEFAULT_SCHEDULE_SHEET_CONFIG = { ...CONFIG.scheduleSheet };
  // ステータス絞り込み: "__all__" | "__not_ok__" | ステータス文字列
  let statusFilter = "__all__";

  function daysBetween(from, to) {
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / 86400000);
  }

  function formatDateJa(iso) {
    const d = new Date(iso + "T00:00:00");
    return (d.getMonth() + 1) + "/" + d.getDate() + "（" + WEEKDAYS[d.getDay()] + "）";
  }

  function todayIso() {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  }

  function percentForStatus(status) {
    var o = CONFIG.statusOptions.find(function (s) { return s.value === status; });
    return o ? o.percent : 0;
  }

  function statusSlug(status) {
    var o = CONFIG.statusOptions.find(function (s) { return s.value === status; });
    return o ? o.slug : "unknown";
  }

  function clampPercent(n) {
    var v = Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    // プログレスは 5% 刻み
    return Math.round(v / 5) * 5;
  }

  /** シート B列 v の数値（1–10）を取り出す。v3 / 3 などを許容 */
  function parseVersionTone(version) {
    var s = String(version == null ? "" : version).trim();
    if (!s) return 0;
    var m = s.match(/(\d{1,2})/);
    if (!m) return 0;
    var n = parseInt(m[1], 10);
    if (!n || n < 1) return 0;
    if (n > 10) n = 10;
    return n;
  }

  function versionToneClass(version) {
    var n = parseVersionTone(version);
    return n ? "version-tone-" + n : "";
  }

  function versionInputClassName(version, extra) {
    var parts = ["version-input"];
    if (extra) parts.push(extra);
    var tone = versionToneClass(version);
    if (tone) parts.push(tone);
    return parts.join(" ");
  }

  function buildVersionOptions(current) {
    var cur = String(current == null ? "" : current).trim();
    var html = '<option value="">—</option>';
    var matched = false;
    for (var i = 1; i <= 10; i++) {
      var val = String(i);
      var isSel = cur === val || cur.toLowerCase() === "v" + val;
      if (isSel) matched = true;
      html += '<option value="' + val + '"' + (isSel ? " selected" : "") + ">" + val + "</option>";
    }
    if (cur && !matched) {
      html += '<option value="' + escapeHtml(cur) + '" selected>' + escapeHtml(cur) + "（シート）</option>";
    }
    return html;
  }

  function applyVersionToneToEl(el, version) {
    if (!el) return;
    var tones = el.className.split(/\s+/).filter(function (c) {
      return c && c.indexOf("version-tone-") !== 0 && c !== "version-input" && c !== "detail-version-input";
    });
    var base = ["version-input"];
    if (el.id === "detail-version-input" || (el.className && el.className.indexOf("detail-version-input") >= 0)) {
      base.push("detail-version-input");
    }
    var tone = versionToneClass(version);
    el.className = base.concat(tones).concat(tone ? [tone] : []).join(" ");
  }

  /** シート K列 client が OK 相当か（OK / 〇 / true 等を許容） */
  function isClientOk(value) {
    var s = String(value == null ? "" : value).trim();
    if (!s) return false;
    if (/^ok$/i.test(s)) return true;
    if (/^(true|1|yes|〇|○|済|done)$/i.test(s)) return true;
    return false;
  }

  function normalizeClientValue(value) {
    return isClientOk(value) ? "OK" : "";
  }

  function parseSheetPercent(raw, statusFallback) {
    var s = String(raw == null ? "" : raw).trim().replace(/%/g, "");
    if (s === "") return percentForStatus(statusFallback);
    var n = Number(s);
    if (!isFinite(n)) return percentForStatus(statusFallback);
    return clampPercent(n);
  }

  function percentFromBarEvent(bar, clientX) {
    var rect = bar.getBoundingClientRect();
    if (!rect.width) return 0;
    var ratio = (clientX - rect.left) / rect.width;
    return clampPercent(ratio * 100);
  }

  function setProgressBarVisual(bar, percent) {
    if (!bar) return;
    percent = clampPercent(percent);
    bar.style.setProperty("--progress-thumb", percent + "%");
    bar.setAttribute("aria-valuenow", String(percent));
    var fill = bar.querySelector(".progress-fill");
    if (fill) fill.style.width = percent + "%";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** インライン Markdown（**太字** *斜体* `code` [link](url)）→ HTML（入力は escape 済み想定） */
  function formatInlineMarkdown(escaped) {
    escaped = String(escaped || "");
    // code first
    escaped = escaped.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    // bold ** or __
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    // italic * or _
    escaped = escaped.replace(/(^|[\s（(「『])\*([^*\n]+)\*(?=[\s）)」』.,、。!？?]|$)/g, "$1<em>$2</em>");
    // links [text](url) — only http(s)
    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function (_, label, url) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + label + "</a>";
    });
    return escaped;
  }

  /**
   * AI/メモ用の簡易 Markdown → 安全な HTML。
   * 対応: #〜### 見出し, 箇条書き, 番号リスト, 段落, 水平線, インライン強調
   */
  function formatMarkdownHtml(md) {
    md = String(md || "").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "").trim();
    if (!md) return "";

    var lines = md.split("\n");
    var html = [];
    var i = 0;

    function flushPara(buf) {
      if (!buf.length) return;
      var text = buf.join(" ").trim();
      if (text) html.push("<p>" + formatInlineMarkdown(escapeHtml(text)) + "</p>");
      buf.length = 0;
    }

    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        html.push("<hr>");
        i++;
        continue;
      }

      var hm = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (hm) {
        // # / ## → h2、### → h3、#### → h4（カード内で見やすく）
        var hashes = hm[1].length;
        var level = hashes <= 2 ? 2 : (hashes === 3 ? 3 : 4);
        html.push("<h" + level + ">" + formatInlineMarkdown(escapeHtml(hm[2])) + "</h" + level + ">");
        i++;
        continue;
      }

      // unordered list
      if (/^[-*•]\s+/.test(trimmed)) {
        html.push("<ul>");
        while (i < lines.length) {
          var ul = lines[i].trim();
          if (!ul) { i++; break; }
          var um = ul.match(/^[-*•]\s+(.+)$/);
          if (!um) break;
          html.push("<li>" + formatInlineMarkdown(escapeHtml(um[1])) + "</li>");
          i++;
        }
        html.push("</ul>");
        continue;
      }

      // ordered list
      if (/^\d+[.)]\s+/.test(trimmed)) {
        html.push("<ol>");
        while (i < lines.length) {
          var ol = lines[i].trim();
          if (!ol) { i++; break; }
          var om = ol.match(/^\d+[.)]\s+(.+)$/);
          if (!om) break;
          html.push("<li>" + formatInlineMarkdown(escapeHtml(om[1])) + "</li>");
          i++;
        }
        html.push("</ol>");
        continue;
      }

      // paragraph: gather consecutive non-empty non-special lines
      var para = [];
      while (i < lines.length) {
        var pl = lines[i];
        var pt = pl.trim();
        if (!pt) break;
        if (/^(#{1,4})\s+/.test(pt)) break;
        if (/^[-*•]\s+/.test(pt)) break;
        if (/^\d+[.)]\s+/.test(pt)) break;
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(pt)) break;
        para.push(pt);
        i++;
      }
      flushPara(para);
    }

    return html.join("");
  }

  function formatAiOutputHtml(text, extraClass) {
    var rich = formatMarkdownHtml(text);
    var cls = "detail-ai-output detail-ai-output--rich" + (extraClass ? " " + extraClass : "");
    if (!rich) {
      return '<p class="' + cls + ' detail-ai-output--placeholder"></p>';
    }
    return '<div class="' + cls + '">' + rich + "</div>";
  }

  function statusFromSheetProgress(progress) {
    return String(progress || "").trim();
  }

  function isKnownStatus(status) {
    return CONFIG.statusOptions.some(function (o) { return o.value === status; });
  }

  function sheetGvizUrl(sheetConfig) {
    var cfg = sheetConfig || CONFIG.sheet;
    return "https://docs.google.com/spreadsheets/d/" + cfg.id +
      "/gviz/tq?tqx=out:json&gid=" + cfg.gid;
  }

  var gvizScriptQueue = Promise.resolve();

  function parseGvizResponse(text) {
    var match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\);?\s*$/);
    if (!match) throw new Error("GViz response parse failed");
    return JSON.parse(match[1]);
  }

  function fetchGvizSheetViaScript(sheetConfig) {
    gvizScriptQueue = gvizScriptQueue.then(function () {
      return new Promise(function (resolve, reject) {
        var timeout = setTimeout(function () {
          reject(new Error("スクリプト読み込みタイムアウト"));
        }, 25000);
        window.google = window.google || {};
        window.google.visualization = window.google.visualization || {};
        window.google.visualization.Query = window.google.visualization.Query || {};
        var script = document.createElement("script");
        window.google.visualization.Query.setResponse = function (data) {
          clearTimeout(timeout);
          if (script.parentNode) script.parentNode.removeChild(script);
          resolve(data);
        };
        script.src = sheetGvizUrl(sheetConfig);
        script.onerror = function () {
          clearTimeout(timeout);
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error("スクリプト読み込み失敗"));
        };
        document.head.appendChild(script);
      });
    });
    return gvizScriptQueue;
  }

  function fetchGvizSheet(sheetConfig) {
    return fetch(sheetGvizUrl(sheetConfig), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(parseGvizResponse)
      .catch(function () {
        return fetchGvizSheetViaScript(sheetConfig);
      });
  }

  function parseSheetDateCell(cell) {
    if (!cell) return null;
    var sources = [cell.v, cell.f];
    for (var si = 0; si < sources.length; si++) {
      var v = sources[si];
      if (v == null || v === "") continue;
      if (typeof v === "string" && v.indexOf("Date(") === 0) {
        var m = v.match(/Date\((\d+),(\d+),(\d+)\)/);
        if (m) {
          return m[1] + "-" + String(parseInt(m[2], 10) + 1).padStart(2, "0") + "-" +
            String(m[3]).padStart(2, "0");
        }
      }
      var dm = String(v).match(/(\d{1,2})\/(\d{1,2})/);
      if (dm) {
        return "2026-" + String(dm[1]).padStart(2, "0") + "-" + String(dm[2]).padStart(2, "0");
      }
    }
    return null;
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        if (ch === "\r") i++;
      } else if (ch !== "\r") {
        field += ch;
      }
    }
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function gvizToGrid(gviz) {
    var rows = (gviz.table && gviz.table.rows) || [];
    var grid = [];
    for (var ri = 0; ri < rows.length; ri++) {
      var gvizRow = rows[ri];
      var maxCol = gvizRow.c ? gvizRow.c.length : 0;
      var arr = [];
      for (var ci = 0; ci < maxCol; ci++) arr.push(cellValue(gvizRow, ci));
      grid.push(arr);
    }
    return grid;
  }

  function cellAt(grid, ri, ci) {
    if (!grid[ri] || grid[ri][ci] == null) return "";
    return String(grid[ri][ci]).trim();
  }

  function scheduleDefaultYear() {
    var dl = CONFIG.project && CONFIG.project.finalDeadline;
    if (dl && /^\d{4}-/.test(dl)) return parseInt(dl.slice(0, 4), 10);
    return new Date().getFullYear();
  }

  function parseDateHeaderText(text) {
    if (text == null || text === "") return null;
    var s = String(text).trim();
    if (!s) return null;

    var dateMatch = s.match(/Date\((\d+),(\d+),(\d+)\)/);
    if (dateMatch) {
      return dateMatch[1] + "-" + String(parseInt(dateMatch[2], 10) + 1).padStart(2, "0") + "-" +
        String(parseInt(dateMatch[3], 10)).padStart(2, "0");
    }

    var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      return iso[1] + "-" + String(iso[2]).padStart(2, "0") + "-" + String(iso[3]).padStart(2, "0");
    }

    var ymd = s.match(/(\d{4})[\/年.](\d{1,2})[\/月.](\d{1,2})/);
    if (ymd) {
      return ymd[1] + "-" + String(ymd[2]).padStart(2, "0") + "-" + String(ymd[3]).padStart(2, "0");
    }

    var mdJa = s.match(/(\d{1,2})月(\d{1,2})日/);
    if (mdJa) {
      return scheduleDefaultYear() + "-" + String(mdJa[1]).padStart(2, "0") + "-" +
        String(mdJa[2]).padStart(2, "0");
    }

    var dm = s.match(/(\d{1,2})\/(\d{1,2})/);
    if (!dm) return null;
    return scheduleDefaultYear() + "-" + String(dm[1]).padStart(2, "0") + "-" +
      String(dm[2]).padStart(2, "0");
  }

  function findFirstTrackRowIndexGrid(grid) {
    for (var ri = 1; ri < grid.length; ri++) {
      if (/^M\d+/i.test(cellAt(grid, ri, 0))) return ri;
    }
    return grid.length;
  }

  /**
   * セル結合: 完全なソース（CSV / webApp）を優先し、欠けているセルだけ他方で補完。
   * GViz は日付型列のテキストを落とすため、完全ソースがある場合は GViz を使わない。
   */
  function mergeScheduleGrids(primaryGrid, secondaryGrid) {
    if (!primaryGrid || !primaryGrid.length) return secondaryGrid || null;
    if (!secondaryGrid || !secondaryGrid.length) return primaryGrid;
    var maxRows = Math.max(primaryGrid.length, secondaryGrid.length);
    var merged = [];
    for (var ri = 0; ri < maxRows; ri++) {
      var prow = primaryGrid[ri] || [];
      var srow = secondaryGrid[ri] || [];
      var maxCols = Math.max(prow.length, srow.length);
      var row = [];
      for (var ci = 0; ci < maxCols; ci++) {
        var p = String(prow[ci] != null ? prow[ci] : "").trim();
        var s = String(srow[ci] != null ? srow[ci] : "").trim();
        row.push(p || s);
      }
      merged.push(row);
    }
    return merged;
  }

  function countScheduleFilledCells(grid) {
    if (!grid || !grid.length) return 0;
    var cfg = CONFIG.scheduleSheet;
    var count = 0;
    for (var ri = 1; ri < grid.length; ri++) {
      var row = grid[ri] || [];
      for (var ci = cfg.dateColStart; ci < row.length; ci++) {
        if (String(row[ci] || "").trim()) count++;
      }
    }
    return count;
  }

  function fetchScheduleFromWebApp() {
    var base = CONFIG.sheet && CONFIG.sheet.webAppUrl;
    if (!base) return Promise.reject(new Error("webAppUrl not set"));
    var url = base +
      (base.indexOf("?") >= 0 ? "&" : "?") +
      "action=schedule" +
      "&sheetId=" + encodeURIComponent(CONFIG.scheduleSheet.id) +
      "&gid=" + encodeURIComponent(String(CONFIG.scheduleSheet.gid));
    return fetch(url, { cache: "no-store", redirect: "follow" })
      .then(function (res) {
        if (!res.ok) throw new Error("schedule webApp HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok || !data.grid || !data.grid.length) {
          throw new Error((data && data.error) || "schedule webApp empty");
        }
        return data.grid;
      });
  }

  function fetchScheduleCsvGrid() {
    var url = "https://docs.google.com/spreadsheets/d/" + CONFIG.scheduleSheet.id +
      "/export?format=csv&gid=" + CONFIG.scheduleSheet.gid;
    return fetch(url, { redirect: "follow", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("CSV HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var grid = parseCsv(text);
        if (!grid || !grid.length) throw new Error("CSV empty");
        return grid;
      });
  }

  function fetchScheduleGvizGrid() {
    return fetchGvizSheet(CONFIG.scheduleSheet).then(function (gviz) {
      var grid = gvizToGrid(gviz);
      if (!grid || !grid.length) throw new Error("GViz empty");
      return grid;
    });
  }

  function mergeMilestones(scheduleMilestones) {
    var map = {};
    var all = CONFIG.milestones.concat(scheduleMilestones || []);
    for (var i = 0; i < all.length; i++) {
      var m = all[i];
      if (!m || !m.date) continue;
      var key = m.date + "|" + m.label;
      if (!map[key]) map[key] = m;
    }
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  function normalizeHexColor(hex) {
    if (!hex) return "";
    var h = String(hex).trim().toLowerCase();
    if (h.charAt(0) !== "#") h = "#" + h;
    if (h.length === 4) {
      h = "#" + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2) + h.charAt(3) + h.charAt(3);
    }
    return h.length === 7 ? h : "";
  }

  function hexToRgb(hex) {
    var h = normalizeHexColor(hex);
    if (!h) return null;
    return {
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16),
    };
  }

  function mixRgb(rgb, target, amount) {
    return {
      r: Math.round(rgb.r + (target.r - rgb.r) * amount),
      g: Math.round(rgb.g + (target.g - rgb.g) * amount),
      b: Math.round(rgb.b + (target.b - rgb.b) * amount),
    };
  }

  function isLightTheme() {
    return getTheme() === "light";
  }

  function rgbLuminance(rgb) {
    return rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
  }

  function scheduleThemeFromHex(hex) {
    var rgb = hexToRgb(hex);
    var white = { r: 255, g: 255, b: 255 };
    var darkText = { r: 30, g: 45, b: 66 };
    var panelDark = { r: 10, g: 16, b: 30 };

    if (!rgb) {
      return isLightTheme()
        ? { bg: "rgba(90,112,136,0.14)", border: "rgba(90,112,136,0.34)", text: "#3d4f63", dot: "#5a7088" }
        : { bg: "rgba(90,112,136,0.2)", border: "rgba(138,168,200,0.3)", text: "#b8cce4", dot: "#8aa8c8" };
    }

    if (isLightTheme()) {
      var lightBg = mixRgb(rgb, white, 0.9);
      var lightText = mixRgb(rgb, darkText, 0.74);
      var lightBorder = mixRgb(rgb, darkText, 0.45);
      var lightDot = mixRgb(rgb, darkText, 0.3);
      if (rgbLuminance(lightText) > 135) lightText = mixRgb(lightText, darkText, 0.55);
      return {
        bg: "rgb(" + lightBg.r + "," + lightBg.g + "," + lightBg.b + ")",
        border: "rgba(" + lightBorder.r + "," + lightBorder.g + "," + lightBorder.b + ",0.55)",
        text: "rgb(" + lightText.r + "," + lightText.g + "," + lightText.b + ")",
        dot: "rgb(" + lightDot.r + "," + lightDot.g + "," + lightDot.b + ")",
      };
    }

    var lum = rgbLuminance(rgb);
    var darkBg = mixRgb(rgb, panelDark, lum < 100 ? 0.8 : 0.86);
    var darkTextColor = mixRgb(rgb, white, lum < 100 ? 0.36 : 0.46);
    var darkBorder = mixRgb(rgb, white, 0.16);
    var darkDot = mixRgb(rgb, white, 0.26);
    return {
      bg: "rgba(" + darkBg.r + "," + darkBg.g + "," + darkBg.b + ",0.68)",
      border: "rgba(" + darkBorder.r + "," + darkBorder.g + "," + darkBorder.b + ",0.28)",
      text: "rgb(" + darkTextColor.r + "," + darkTextColor.g + "," + darkTextColor.b + ")",
      dot: "rgb(" + darkDot.r + "," + darkDot.g + "," + darkDot.b + ")",
    };
  }

  function scheduleColorStyle(hex) {
    var theme = scheduleThemeFromHex(hex);
    return "background:" + theme.bg + ";border-color:" + theme.border + ";color:" + theme.text + ";";
  }

  function scheduleDotStyle(hex) {
    var theme = scheduleThemeFromHex(hex);
    if (isLightTheme()) {
      return "background:" + theme.dot + ";box-shadow:0 0 0 1px " + theme.border + ";";
    }
    return "background:" + theme.dot + ";";
  }

  function taskColor(label) {
    var key = String(label || "").trim();
    if (!key) return CONFIG.scheduleTaskColorFallback;
    if (CONFIG.scheduleTaskColors[key]) return CONFIG.scheduleTaskColors[key];
    if (/up/i.test(key) && CONFIG.scheduleTaskColors.demoup) return CONFIG.scheduleTaskColors.demoup;
    if (/meeting/i.test(key) && CONFIG.scheduleTaskColors.meeting) return CONFIG.scheduleTaskColors.meeting;
    if (/retake/i.test(key) && CONFIG.scheduleTaskColors["修正"]) return CONFIG.scheduleTaskColors["修正"];
    return CONFIG.scheduleTaskColorFallback;
  }

  function collectUsedScheduleLabels(data) {
    var seen = {};
    var labels = [];
    function add(label) {
      var key = String(label || "").trim();
      if (!key || seen[key]) return;
      seen[key] = true;
      labels.push(key);
    }
    if (data) {
      for (var ei = 0; ei < data.events.length; ei++) add(data.events[ei].label);
      for (var ti = 0; ti < data.tracks.length; ti++) {
        for (var tk = 0; tk < data.tracks[ti].tasks.length; tk++) add(data.tracks[ti].tasks[tk].label);
      }
    }
    if (!labels.length) {
      return Object.keys(CONFIG.scheduleTaskColors).filter(function (k) {
        return /^(作曲|demoup|DEADLINE|打ち合わせ|リハーサル|meeting|録音|休み)$/.test(k);
      });
    }
    return labels.sort(function (a, b) { return a < b ? -1 : 1; });
  }

  function renderScheduleLegend(container, labels) {
    if (!container) return;
    var lhtml = "";
    for (var li = 0; li < labels.length; li++) {
      var lbl = labels[li];
      lhtml += '<span class="legend-item"><span class="legend-swatch" style="' +
        scheduleDotStyle(taskColor(lbl)) + '"></span>' +
        escapeHtml(lbl) + "</span>";
    }
    container.innerHTML = lhtml;
  }

  function ensureScheduleColorLabel(label) {
    var key = String(label || "").trim();
    if (!key || CONFIG.scheduleTaskColors[key]) return;
    CONFIG.scheduleTaskColors[key] = taskColor(key);
  }

  function fetchScheduleColorLegend() {
    var sheetName = CONFIG.scheduleSheet.legendSheetName;
    if (!sheetName) return Promise.resolve();
    var url = "https://docs.google.com/spreadsheets/d/" + CONFIG.scheduleSheet.id +
      "/gviz/tq?tqx=out:json&sheet=" + encodeURIComponent(sheetName);
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("legend HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var gviz = parseGvizResponse(text);
        var rows = (gviz.table && gviz.table.rows) || [];
        for (var i = 0; i < rows.length; i++) {
          var label = cellValue(rows[i], 0);
          if (label) ensureScheduleColorLabel(label);
        }
      })
      .catch(function () { /* 凡例シート未取得時は CONFIG の既定色を使用 */ });
  }

  /** 1セルに改行や " / " で複数予定が入っている場合に分割 */
  function splitScheduleLabels(raw) {
    var s = String(raw || "").trim();
    if (!s) return [];
    var parts = s.split(/\r?\n+|[/|／、,]+/).map(function (p) {
      return p.trim();
    }).filter(Boolean);
    return parts.length ? parts : [s];
  }

  function resolveScheduleMetaCols_(headerRow, dateColStart) {
    var result = { code: 0, title: 1, memo: 2, instrument: 3, length: 4 };
    if (!headerRow) return result;
    var limit = dateColStart || headerRow.length;
    for (var ci = 0; ci < limit; ci++) {
      var label = String(headerRow[ci] || "").trim();
      if (!label) continue;
      var lo = label.toLowerCase();
      if (/^m?\d|no\.|no$|^#|コード|code/i.test(lo)) result.code = ci;
      else if (/曲名|タイトル|title/i.test(lo)) result.title = ci;
      else if (/メモ|memo/i.test(lo)) result.memo = ci;
      else if (/楽器|instrument|収録|使用楽器/i.test(lo)) result.instrument = ci;
      else if (/尺|長さ|length|sec/i.test(lo)) result.length = ci;
    }
    return result;
  }

  function parseScheduleGrid(grid) {
    if (!grid || !grid.length) return null;

    var cfg = CONFIG.scheduleSheet;
    var header = grid[0];
    var metaCols = resolveScheduleMetaCols_(header, cfg.dateColStart);
    var dateCols = [];
    var maxHeaderCols = header.length;
    for (var hi = 1; hi < grid.length; hi++) {
      if (grid[hi] && grid[hi].length > maxHeaderCols) maxHeaderCols = grid[hi].length;
    }

    for (var ci = cfg.dateColStart; ci < maxHeaderCols; ci++) {
      var iso = parseDateHeaderText(header[ci]);
      if (!iso) continue;
      var rawLabel = cellAt(grid, 0, ci);
      var displayLabel = rawLabel;
      if (/^Date\(/.test(String(rawLabel || ""))) {
        displayLabel = iso.slice(5).replace("-", "/");
      }
      dateCols.push({
        col: ci,
        iso: iso,
        label: displayLabel || iso.slice(5).replace("-", "/"),
      });
    }

    var firstTrackRow = findFirstTrackRowIndexGrid(grid);
    var events = [];
    for (var er = 1; er < firstTrackRow; er++) {
      var rowLabel = cellAt(grid, er, 0) || cellAt(grid, er, 1) || "イベント";
      for (var di = 0; di < dateCols.length; di++) {
        var dc = dateCols[di];
        var evParts = splitScheduleLabels(cellAt(grid, er, dc.col));
        for (var ep = 0; ep < evParts.length; ep++) {
          var evLabel = evParts[ep];
          ensureScheduleColorLabel(evLabel);
          events.push({
            date: dc.iso,
            label: evLabel,
            color: taskColor(evLabel),
            source: rowLabel,
          });
        }
      }
    }

    var tracks = [];
    for (var ri = firstTrackRow; ri < grid.length; ri++) {
      var code = cellAt(grid, ri, 0);
      if (!/^M\d+/i.test(code)) {
        var extraLabel = cellAt(grid, ri, 0) || cellAt(grid, ri, 1) || "その他";
        for (var xi = 0; xi < dateCols.length; xi++) {
          var xdc = dateCols[xi];
          var xParts = splitScheduleLabels(cellAt(grid, ri, xdc.col));
          for (var xp = 0; xp < xParts.length; xp++) {
            var xev = xParts[xp];
            ensureScheduleColorLabel(xev);
            events.push({
              date: xdc.iso,
              label: xev,
              color: taskColor(xev),
              source: extraLabel,
            });
          }
        }
        continue;
      }
      var tasks = [];
      for (var ti = 0; ti < dateCols.length; ti++) {
        var col = dateCols[ti];
        var taskParts = splitScheduleLabels(cellAt(grid, ri, col.col));
        for (var tp = 0; tp < taskParts.length; tp++) {
          var taskLabel = taskParts[tp];
          ensureScheduleColorLabel(taskLabel);
          tasks.push({ date: col.iso, label: taskLabel, color: taskColor(taskLabel) });
        }
      }
      tracks.push({
        code: code,
        title: cellAt(grid, ri, metaCols.title),
        memo: cellAt(grid, ri, metaCols.memo),
        instrument: cellAt(grid, ri, metaCols.instrument),
        length: cellAt(grid, ri, metaCols.length),
        tasks: tasks,
      });
    }

    var milestoneMap = {};
    for (var mi = 0; mi < events.length; mi++) {
      var ev = events[mi];
      var key = ev.date + "|" + ev.label;
      if (!milestoneMap[key]) milestoneMap[key] = { date: ev.date, label: ev.label };
    }
    if (CONFIG.project.finalDeadline) {
      milestoneMap[CONFIG.project.finalDeadline + "|完パケ"] = {
        date: CONFIG.project.finalDeadline,
        label: "完パケ（DEADLINE）",
      };
    }
    var scheduleMilestones = Object.keys(milestoneMap).map(function (k) { return milestoneMap[k]; });
    for (var tmi = 0; tmi < tracks.length; tmi++) {
      for (var tt = 0; tt < tracks[tmi].tasks.length; tt++) {
        var ttask = tracks[tmi].tasks[tt];
        if (ttask.label === "DEADLINE") continue;
        scheduleMilestones.push({
          date: ttask.date,
          label: tracks[tmi].code + " " + ttask.label,
        });
      }
    }

    return {
      dateCols: dateCols,
      tracks: tracks,
      events: events,
      milestones: mergeMilestones(scheduleMilestones),
    };
  }

  /**
   * スケジュール読取の優先順位（根本対策）:
   * 1. Apps Script webApp action=schedule → getDisplayValues()（最確実）
   * 2. Google Sheets CSV export（テキスト保持・CORS可）
   * 3. GViz（最終手段。日付型列の非日付テキストは欠落しうる）
   *
   * 以前は CSV と GViz を無条件マージしていたが、GViz 欠落とローカル file:// 時の
   * CSV 失敗が組み合わさると「内見」「休み」「作曲」などが消えていた。
   */
  function loadScheduleData() {
    var attempts = [
      { name: "webapp", run: fetchScheduleFromWebApp },
      { name: "csv", run: fetchScheduleCsvGrid },
      { name: "gviz", run: fetchScheduleGvizGrid },
    ];

    var errors = [];
    var completeGrid = null;
    var completeSource = null;
    var gvizGrid = null;

    function tryNext(index) {
      if (index >= attempts.length) {
        if (completeGrid) {
          return {
            grid: completeGrid,
            source: completeSource,
            warning: null,
          };
        }
        if (gvizGrid) {
          return {
            grid: gvizGrid,
            source: "gviz",
            warning: "GViz 経由のため日付列の一部予定が欠ける可能性があります",
          };
        }
        throw new Error("スケジュール表の取得に失敗: " + errors.join(" / "));
      }

      var attempt = attempts[index];
      return attempt.run()
        .then(function (grid) {
          var filled = countScheduleFilledCells(grid);
          if (attempt.name === "gviz") {
            gvizGrid = grid;
            // 既に完全ソースがあれば GViz は使わない
            if (completeGrid) {
              return tryNext(attempts.length);
            }
            // GViz のみならそのまま（警告付き）
            return tryNext(index + 1);
          }
          // webapp / csv は表示値を保持する完全ソース
          if (!completeGrid || filled > countScheduleFilledCells(completeGrid)) {
            completeGrid = grid;
            completeSource = attempt.name;
          }
          // 十分なセルがあれば打ち切り（無駄な取得を避ける）
          if (filled > 0) {
            return tryNext(attempts.length);
          }
          return tryNext(index + 1);
        })
        .catch(function (err) {
          errors.push(attempt.name + ":" + (err && err.message ? err.message : err));
          return tryNext(index + 1);
        });
    }

    return tryNext(0).then(function (result) {
      var parsed = parseScheduleGrid(result.grid);
      if (!parsed) throw new Error("スケジュールの解析に失敗");
      parsed._source = result.source;
      parsed._warning = result.warning;
      return parsed;
    });
  }

  function ganttDateRange(data) {
    var fallbackEnd = CONFIG.project.finalDeadline || "2026-07-23";
    var fallbackStart = fallbackEnd;
    // シート上の最初の日付列を下限の既定にする（ハードコード日付を避ける）
    if (data && data.dateCols && data.dateCols.length) {
      fallbackStart = data.dateCols[0].iso;
    } else {
      fallbackStart = "2026-07-07";
    }

    if (!data || !data.dateCols.length) {
      return { start: fallbackStart, end: fallbackEnd };
    }

    var marked = {};
    function mark(iso) { if (iso) marked[iso] = true; }

    for (var ei = 0; ei < data.events.length; ei++) mark(data.events[ei].date);
    for (var ti = 0; ti < data.tracks.length; ti++) {
      for (var tj = 0; tj < data.tracks[ti].tasks.length; tj++) {
        mark(data.tracks[ti].tasks[tj].date);
      }
    }
    mark(fallbackEnd);
    for (var mi = 0; mi < CONFIG.milestones.length; mi++) mark(CONFIG.milestones[mi].date);

    var keys = Object.keys(marked).sort();
    if (!keys.length) return { start: fallbackStart, end: fallbackEnd };

    var start = keys[0] < fallbackStart ? keys[0] : fallbackStart;
    var end = keys[keys.length - 1] > fallbackEnd ? keys[keys.length - 1] : fallbackEnd;
    return { start: start, end: end };
  }

  function filterDateCols(data, range) {
    return data.dateCols.filter(function (d) {
      return d.iso >= range.start && d.iso <= range.end;
    });
  }

  function ganttShortLabel(label) {
    var map = {
      "作曲": "作曲",
      "demoup": "dem",
      "DEADLINE": "DL",
      "打ち合わせ": "打合",
      "リハーサル": "リハ",
      "meeting": "mtg",
      "休み": "休",
      "午後休み": "午休",
      "内見": "内見",
      "録音": "録音",
    };
    return map[label] || label;
  }

  function ganttPillHtml(label, color) {
    return '<span class="gantt-pill" style="' + scheduleColorStyle(color) + '" title="' + escapeHtml(label) + '">' +
      escapeHtml(ganttShortLabel(label)) + "</span>";
  }

  function formatGanttTh(col, today, deadline) {
    var d = new Date(col.iso + "T00:00:00");
    var cls = "gantt-th";
    if (col.iso === today) cls += " gantt-th--today";
    if (col.iso === deadline) cls += " gantt-th--deadline";
    return '<th class="' + cls + '">' + (d.getMonth() + 1) + "/" + d.getDate() +
      '<br><span class="gantt-th-wd">' + WEEKDAYS[d.getDay()] + "</span></th>";
  }

  function ganttTdAttrs(iso, today, deadline, extraClass) {
    var cls = [];
    if (extraClass) cls.push(extraClass);
    if (iso === today) cls.push("gantt-td--today");
    if (iso === deadline) cls.push("gantt-td--deadline");
    return cls.length ? ' class="' + cls.join(" ") + '"' : "";
  }

  function buildEventsByDate(data, range) {
    var eventsByDate = {};
    for (var evi = 0; evi < data.events.length; evi++) {
      var event = data.events[evi];
      if (event.date < range.start || event.date > range.end) continue;
      if (!eventsByDate[event.date]) eventsByDate[event.date] = [];
      var dup = eventsByDate[event.date].some(function (e) {
        return e.label === event.label;
      });
      if (!dup) eventsByDate[event.date].push({ label: event.label, color: event.color });
    }
    return eventsByDate;
  }

  function scrollGanttToToday() {
    var wrap = $("gantt-wrap");
    if (!wrap) return;
    var todayCell = wrap.querySelector(".gantt-th--today");
    if (todayCell) todayCell.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }

  function renderGantt() {
    var wrap = $("gantt-wrap");
    var legend = $("gantt-legend");
    var badge = $("gantt-badge");
    var status = $("gantt-status");
    if (!wrap) return;

    if (scheduleMeta.error) {
      wrap.innerHTML = "";
      if (status) {
        status.textContent = "スケジュール読み込み失敗: " + scheduleMeta.error +
          " — ローカルHTMLの場合はブラウザで再読み込みしてください。";
        status.className = "gantt-status text-small sheet-sync-status sheet-sync-status--err";
      }
      if (legend) legend.innerHTML = "";
      if (badge) badge.textContent = "ERROR";
      return;
    }

    if (!scheduleData || !scheduleData.tracks.length) {
      wrap.innerHTML = '<p class="text-muted text-small" style="padding:1rem;">' +
        (scheduleMeta.loaded ? "スケジュールに曲データがありません。" : "スケジュールデータを読み込み中…") +
        "</p>";
      if (status) status.textContent = "";
      if (legend) legend.innerHTML = "";
      if (badge) badge.textContent = "GANTT";
      return;
    }

    var range = ganttDateRange(scheduleData);
    var cols = filterDateCols(scheduleData, range);
    var today = todayIso();
    var deadline = CONFIG.project.finalDeadline;
    var eventsByDate = buildEventsByDate(scheduleData, range);
    var html = '<table class="gantt-table"><thead><tr>';
    html += '<th class="gantt-label-col">曲 / 日付</th>';
    for (var hi = 0; hi < cols.length; hi++) {
      html += formatGanttTh(cols[hi], today, deadline);
    }
    html += "</tr></thead><tbody>";

    if (Object.keys(eventsByDate).length > 0) {
      html += '<tr class="gantt-event-row"><td class="gantt-label-col">' +
        '<span class="gantt-row-code">EVT</span>' +
        '<span class="gantt-row-title">イベント・共通</span></td>';
      for (var ec = 0; ec < cols.length; ec++) {
        var dayEvents = eventsByDate[cols[ec].iso];
        var eAttrs = ganttTdAttrs(cols[ec].iso, today, deadline, dayEvents && dayEvents.length ? "gantt-cell--stack" : "");
        if (dayEvents && dayEvents.length) {
          html += "<td" + eAttrs + '><div class="gantt-cell-inner">';
          for (var pe = 0; pe < dayEvents.length; pe++) {
            html += ganttPillHtml(dayEvents[pe].label, dayEvents[pe].color);
          }
          html += "</div></td>";
        } else {
          html += "<td" + eAttrs + "></td>";
        }
      }
      html += "</tr>";
    }

    for (var tri = 0; tri < scheduleData.tracks.length; tri++) {
      var tr = scheduleData.tracks[tri];
      var trackMatch = findTrackByCode(tr.code);
      html += '<tr class="gantt-track-row" data-code="' + escapeHtml(tr.code) + '"' +
        (trackMatch ? ' data-id="' + escapeHtml(trackMatch.id) + '"' : "") +
        ' title="クリックで曲詳細を開く">' +
        '<td class="gantt-label-col"><span class="gantt-row-code">' + escapeHtml(tr.code) +
        '</span><span class="gantt-row-title">' + escapeHtml(tr.title) + "</span></td>";
      for (var ci = 0; ci < cols.length; ci++) {
        var col = cols[ci];
        var dayTasks = [];
        for (var tj = 0; tj < tr.tasks.length; tj++) {
          if (tr.tasks[tj].date === col.iso) dayTasks.push(tr.tasks[tj]);
        }
        var tAttrs = ganttTdAttrs(col.iso, today, deadline, dayTasks.length ? "gantt-cell--stack" : "");
        if (dayTasks.length) {
          html += "<td" + tAttrs + '><div class="gantt-cell-inner">';
          for (var dt = 0; dt < dayTasks.length; dt++) {
            html += ganttPillHtml(dayTasks[dt].label, dayTasks[dt].color);
          }
          html += "</div></td>";
        } else {
          html += "<td" + tAttrs + "></td>";
        }
      }
      html += "</tr>";
    }

    html += "</tbody></table>";
    wrap.innerHTML = html;

    var taskCount = 0;
    for (var ti = 0; ti < scheduleData.tracks.length; ti++) taskCount += scheduleData.tracks[ti].tasks.length;
    if (badge) badge.textContent = scheduleData.tracks.length + " TRK · " + cols.length + "D";
    if (status) {
      var srcLabel = scheduleMeta.source
        ? ({ webapp: "webApp", csv: "CSV", gviz: "GViz" }[scheduleMeta.source] || scheduleMeta.source)
        : "?";
      var warn = scheduleMeta.warning ? " ⚠ " + scheduleMeta.warning : "";
      status.textContent = "予定 " + scheduleData.events.length + " 件 · 曲タスク " + taskCount +
        " 件 · " + range.start.slice(5) + "〜" + range.end.slice(5) +
        " · src:" + srcLabel + warn;
      status.className = "gantt-status text-muted text-small sheet-sync-status " +
        (scheduleMeta.warning ? "sheet-sync-status--warn" : "sheet-sync-status--ok");
    }

    renderScheduleLegend(legend, collectUsedScheduleLabels(scheduleData));

    scrollGanttToToday();
  }

  function cellValue(row, index) {
    if (index == null || index < 0) return "";
    if (!row || !row.c || index >= row.c.length || !row.c[index]) return "";
    var cell = row.c[index];
    if (cell.v != null && cell.v !== "") return String(cell.v).trim();
    if (cell.f != null && cell.f !== "") return String(cell.f).trim();
    return "";
  }

  /**
   * GViz のヘッダー名から列 index を解決する。
   * 列の挿入・移動で CONFIG.sheet.cols がズレても、ヘッダーが合えば追従する。
   */
  function resolveSheetCols(gviz) {
    var fallback = CONFIG.sheet.cols || {};
    var cols = {};
    for (var key in fallback) {
      if (Object.prototype.hasOwnProperty.call(fallback, key)) cols[key] = fallback[key];
    }

    var labels = (gviz && gviz.table && gviz.table.cols) || [];
    var byLabel = {};
    for (var i = 0; i < labels.length; i++) {
      var lab = labels[i] && labels[i].label != null ? String(labels[i].label).trim() : "";
      if (!lab) continue;
      byLabel[lab] = i;
      byLabel[lab.toLowerCase()] = i;
    }

    function findCol(names) {
      for (var n = 0; n < names.length; n++) {
        var name = names[n];
        if (byLabel[name] != null) return byLabel[name];
        if (byLabel[String(name).toLowerCase()] != null) return byLabel[String(name).toLowerCase()];
      }
      return null;
    }

    var headerMap = {
      version: ["V", "v", "バージョン"],
      title: ["title", "曲名"],
      scene: ["scene"],
      // sec を優先（従来どおり）。なければ 長さ
      length: ["sec", "長さ"],
      progress: ["進捗"],
      percent: ["進捗%", "進捗％"],
      client: ["client"],
      overallSummary: ["全体要約"],
      productionMemo: ["初稿memo", "初稿メモ"],
      productionMaterial: ["制作資料"],
      meetingMemo: ["打ち合わせ時メモ"],
      rehaMemo: ["リハメモ"],
      memo: ["要約"],
      fbV1: ["FB_v1", "FB_V1"],
      fbV2: ["FB_v2", "FB_V2"],
      fbV3: ["FB_v3", "FB_V3"],
      fbV4: ["FB_v4", "FB_V4", "BF_v4", "BF_V4"],
      instrument: ["録音楽器", "収録楽器", "楽器", "使用楽器"],
      reference: ["参考曲"],
      demo: ["demo"],
      trackNo: ["No.", "No", "NO", "#M"],
    };

    for (var field in headerMap) {
      if (!Object.prototype.hasOwnProperty.call(headerMap, field)) continue;
      var resolved = findCol(headerMap[field]);
      if (resolved != null) cols[field] = resolved;
    }

    return cols;
  }

  function parseSheetTracks(gviz) {
    var rows = (gviz.table && gviz.table.rows) || [];
    var cols = resolveSheetCols(gviz);
    var tracks = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var noRaw = (cols.trackNo != null ? cellValue(row, cols.trackNo) : "") ||
        cellValue(row, 0) || cellValue(row, 2);
      var no = parseInt(noRaw, 10);
      if (!no || no < 1 || no > CONFIG.maxTracks) continue;

      var title = cellValue(row, cols.title).trim() || cellValue(row, cols.scene).trim();
      if (!title) continue;

      var progress = cellValue(row, cols.progress).trim();
      var status = statusFromSheetProgress(progress);
      var percentRaw = cols.percent != null ? cellValue(row, cols.percent).trim() : "";
      var demoCol = cols.demo != null ? cols.demo : 3;
      tracks.push({
        id: "m" + no,
        code: "M" + no,
        trackNo: no,
        sheetRow: i + 2,
        title: title,
        scene: cellValue(row, cols.scene).trim(),
        brief: cellValue(row, cols.memo).trim(),
        client: cols.client != null
          ? normalizeClientValue(cellValue(row, cols.client).trim())
          : "",
        overallSummary: cols.overallSummary != null
          ? cellValue(row, cols.overallSummary).trim()
          : "",
        productionMemo: cellValue(row, cols.productionMemo).trim(),
        productionMaterial: cellValue(row, cols.productionMaterial).trim(),
        meetingMemo: cellValue(row, cols.meetingMemo).trim(),
        rehaMemo: cellValue(row, cols.rehaMemo).trim(),
        fbV1: cellValue(row, cols.fbV1).trim(),
        fbV2: cellValue(row, cols.fbV2).trim(),
        fbV3: cols.fbV3 != null ? cellValue(row, cols.fbV3).trim() : "",
        fbV4: cols.fbV4 != null ? cellValue(row, cols.fbV4).trim() : "",
        demo: cellValue(row, demoCol).trim(),
        instrument: cols.instrument != null ? cellValue(row, cols.instrument).trim() : "",
        length: cellValue(row, cols.length).trim(),
        reference: cols.reference != null ? cellValue(row, cols.reference).trim() : "",
        version: cellValue(row, cols.version).trim(),
        status: status,
        percent: parseSheetPercent(percentRaw, status),
        percentFromSheet: percentRaw !== "",
        fromSheet: true,
      });
    }
    tracks.sort(function (a, b) { return a.trackNo - b.trackNo; });
    return tracks;
  }

  function fetchSheetTracks() {
    return fetchGvizSheet(CONFIG.sheet).then(parseSheetTracks);
  }

  function readSavedOverlay() {
    try {
      var raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return { tracks: [], extraTrackCount: 0 };
      return JSON.parse(raw);
    } catch (e) {
      return { tracks: [], extraTrackCount: 0 };
    }
  }

  function mergeTracksWithOverlay(baseTracks, overlay) {
    var savedMap = {};
    for (var i = 0; i < (overlay.tracks || []).length; i++) {
      savedMap[overlay.tracks[i].id] = overlay.tracks[i];
    }
    var known = new Set(baseTracks.map(function (t) { return t.id; }));
    var merged = baseTracks.map(function (base) {
      var saved = savedMap[base.id];
      if (!saved) return base;
      if (base.fromSheet) {
        // J列に値があるときはシート優先。空のときはローカル上書きを許可
        // v（B列）はシート優先。空のときのみローカル上書きを許可
        // client（K列）はシート優先。空のときのみローカル上書きを許可
        return {
          ...base,
          percent: base.percentFromSheet
            ? base.percent
            : (saved.percent != null ? clampPercent(saved.percent) : base.percent),
          version: base.version
            ? base.version
            : (saved.version != null ? String(saved.version) : base.version),
          client: base.client
            ? base.client
            : (saved.client != null ? normalizeClientValue(saved.client) : base.client),
        };
      }
      return {
        ...base,
        status: saved.status != null ? saved.status : base.status,
        percent: saved.percent != null ? clampPercent(saved.percent) : percentForStatus(saved.status || base.status),
        version: saved.version != null ? String(saved.version) : (base.version || ""),
        client: saved.client != null ? normalizeClientValue(saved.client) : (base.client || ""),
      };
    });
    var extras = (overlay.tracks || []).filter(function (t) {
      return !known.has(t.id);
    }).map(function (t) {
      return {
        ...t,
        percent: clampPercent(t.percent != null ? t.percent : percentForStatus(t.status)),
      };
    });
    return {
      tracks: merged.concat(extras),
      extraTrackCount: overlay.extraTrackCount || extras.length,
    };
  }

  function buildStateFromBases(baseTracks) {
    return mergeTracksWithOverlay(
      baseTracks.map(function (t) {
        return { ...t, status: t.status != null ? t.status : "", percent: t.percent != null ? t.percent : 0 };
      }),
      readSavedOverlay()
    );
  }

  function projectStateStorageKey(entry) {
    if (!entry || isBuiltInProject(entry)) return BASE_STORAGE_KEY;
    var id = entry.id || entry.spreadsheetId || entry.name || "project";
    return BASE_STORAGE_KEY + "::" + encodeURIComponent(String(id));
  }

  function resetProjectRuntime(entry) {
    projectLoadToken++;
    CONFIG.storageKey = projectStateStorageKey(entry);
    state = { tracks: [], extraTrackCount: 0 };
    sheetMeta = { loaded: false, loading: false, source: "project", syncedAt: null, error: null };
    scheduleMeta = { loaded: false, syncedAt: null, error: null, source: null };
    scheduleData = null;
    activeMilestones = [];
    statusFilter = "__all__";
    if (activeDetailTrackId) closeTrackDetail();
    renderTracks();
    renderGantt();
    renderNativeScheduleBoard();
    updateFooterStatus();
  }

  function defaultState() {
    if (activeProjectEntry && !isBuiltInProject(activeProjectEntry)) return { tracks: [], extraTrackCount: 0 };
    return buildStateFromBases(CONFIG.tracks.map(function (t) {
      return { ...t, status: "", percent: 0, version: "", client: "", fromSheet: false };
    }));
  }

  function saveState() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify({
      tracks: state.tracks.map(function (t) {
        return {
          id: t.id,
          status: t.status,
          percent: t.percent,
          version: t.version || "",
          client: t.client || "",
        };
      }),
      extraTrackCount: state.extraTrackCount,
    }));
  }

  function canWriteToSheet(track) {
    return !!(CONFIG.sheet.webAppUrl && track && track.fromSheet && track.trackNo);
  }

  function buildSheetWriteUrl(track, fields) {
    var url = CONFIG.sheet.webAppUrl + "?action=write_track_field&spreadsheetId=" + encodeURIComponent(CONFIG.sheet.id) + "&trackSheetName=" + encodeURIComponent((getActiveProjectEntry()||{}).trackSheetName||"進捗管理") + "&trackNo=" + encodeURIComponent(track.trackNo);
    if (fields.version !== undefined) url += "&version=" + encodeURIComponent(fields.version);
    if (fields.progress !== undefined) url += "&progress=" + encodeURIComponent(fields.progress);
    if (fields.percent !== undefined) url += "&percent=" + encodeURIComponent(fields.percent);
    if (fields.client !== undefined) url += "&client=" + encodeURIComponent(fields.client);
    // overallSummary は長文のため GET に載せない（POST を使う）
    return url;
  }

  function pushTrackToSheet(track, fields, successMsg) {
    if (!canWriteToSheet(track)) return Promise.resolve(null);

    var usePost = fields.overallSummary !== undefined;
    var payload = {
      action: "write_track_field",
      spreadsheetId: CONFIG.sheet.id,
      trackSheetName: (getActiveProjectEntry() || {}).trackSheetName || "進捗管理",
      trackNo: track.trackNo,
    };
    if (fields.version !== undefined) payload.version = fields.version;
    if (fields.progress !== undefined) payload.progress = fields.progress;
    if (fields.percent !== undefined) payload.percent = fields.percent;
    if (fields.client !== undefined) payload.client = fields.client;
    if (fields.overallSummary !== undefined) payload.overallSummary = fields.overallSummary;

    function handleOk(data) {
      if (!data || !data.ok) throw new Error((data && data.error) || "書き戻し失敗");
      showToast(successMsg || (track.code + " を Msheet に反映しました"), "ok");
      return true;
    }

    if (usePost) {
      // text/plain にして CORS プリフライトを避ける（Apps Script が contents を JSON として読む）
      return fetch(CONFIG.sheet.webAppUrl, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(handleOk)
        .catch(function (err) {
          // no-cors では結果が読めないが送信は試す
          return fetch(CONFIG.sheet.webAppUrl, {
            method: "POST",
            mode: "no-cors",
            cache: "no-store",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
          })
            .then(function () {
              showToast(track.code + " の全体要約を送信しました（結果は確認できません）", "info");
              return null;
            })
            .catch(function () {
              showToast("シート反映失敗（" + track.code + "）: " + (err.message || err), "err");
              return false;
            });
        });
    }

    var url = buildSheetWriteUrl(track, fields);
    return fetch(url, { method: "GET", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(handleOk)
      .catch(function (err) {
        return fetch(url, { method: "GET", mode: "no-cors", cache: "no-store" })
          .then(function () {
            showToast(track.code + " を送信しました（結果は確認できません）", "info");
            return null;
          })
          .catch(function () {
            showToast("シート反映失敗（" + track.code + "）: " + (err.message || err), "err");
            return false;
          });
      });
  }

  function pushStatusToSheet(track) {
    return pushTrackToSheet(
      track,
      { progress: track.status || "" },
      track.code + " の進捗を Msheet に反映しました"
    );
  }

  function pushPercentToSheet(track) {
    return pushTrackToSheet(
      track,
      { percent: clampPercent(track.percent) },
      track.code + " の進捗%を Msheet に反映しました"
    );
  }

  function pushVersionToSheet(track) {
    return pushTrackToSheet(
      track,
      { version: track.version || "" },
      track.code + " の v を Msheet に反映しました"
    );
  }

  function pushClientToSheet(track) {
    return pushTrackToSheet(
      track,
      { client: track.client || "" },
      track.code + " の client を Msheet に反映しました"
    );
  }

  function pushOverallSummaryToSheet(track) {
    return pushTrackToSheet(
      track,
      { overallSummary: track.overallSummary || "" },
      track.code + " の AI全文を L列 に保存しました"
    );
  }

  /**
   * AI表示用テキスト取得。
   * 優先: localStorage キャッシュ → シート L列（バックアップ）
   */
  function getAiDisplayEntry(track) {
    if (!track) return null;
    var cached = getAiCacheEntry(track.id);
    if (cached && cached.text) {
      return {
        text: cached.text,
        at: cached.at || null,
        model: cached.model || null,
        source: "local",
      };
    }
    if (track.overallSummary) {
      return {
        text: track.overallSummary,
        at: null,
        model: null,
        source: "sheet",
      };
    }
    return null;
  }

  var toastTimer = null;

  function showToast(message, kind) {
    var root = $("toast-root");
    if (!root) return;
    var el = document.createElement("div");
    el.className = "toast toast--" + (kind || "info");
    el.textContent = message;
    root.appendChild(el);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 4200);
  }

  function findScheduleTrack(code) {
    if (!scheduleData || !code) return null;
    var upper = String(code).toUpperCase();
    for (var i = 0; i < scheduleData.tracks.length; i++) {
      if (String(scheduleData.tracks[i].code).toUpperCase() === upper) {
        return scheduleData.tracks[i];
      }
    }
    return null;
  }

  var activeDetailTrackId = null;

  /**
   * 詳細ダイアログの左右カラムに確定高さを与え、overflow でスクロール可能にする。
   * flex の min-height:auto で高さが内容に引きずられるのを防ぐ。
   */
  function layoutTrackDetailScroll() {
    var overlay = $("track-detail-overlay");
    var dialog = overlay && overlay.querySelector(".track-detail-dialog");
    var header = overlay && overlay.querySelector(".track-detail-header");
    var body = $("track-detail-body");
    if (!overlay || overlay.hidden || !dialog || !body) return;

    var top = body.querySelector(".detail-top");
    var layout = body.querySelector(".detail-layout");
    var aside = body.querySelector(".detail-aside");
    var main = body.querySelector(".detail-main");
    if (!layout) return;

    var dialogH = dialog.clientHeight || Math.floor(window.innerHeight * 0.9);
    var headerH = header ? header.offsetHeight : 0;
    var bodyH = Math.max(160, dialogH - headerH);
    body.style.flex = "1 1 auto";
    body.style.height = bodyH + "px";
    body.style.minHeight = "0";
    body.style.overflow = "hidden";
    body.style.display = "flex";
    body.style.flexDirection = "column";

    var topH = top ? top.offsetHeight : 0;
    var layoutH = Math.max(120, bodyH - topH);
    layout.style.flex = "1 1 auto";
    layout.style.height = layoutH + "px";
    layout.style.minHeight = "0";
    layout.style.overflow = "hidden";
    layout.style.display = "flex";

    var narrow = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
    if (narrow) {
      layout.style.flexDirection = "column";
      layout.style.overflowY = "auto";
      layout.style.webkitOverflowScrolling = "touch";
      if (aside) {
        aside.style.height = "auto";
        aside.style.overflow = "visible";
        aside.style.flex = "0 0 auto";
        aside.style.width = "100%";
      }
      if (main) {
        main.style.height = "auto";
        main.style.overflow = "visible";
        main.style.flex = "0 0 auto";
      }
      return;
    }

    layout.style.flexDirection = "row";
    if (aside) {
      aside.style.flex = "0 0 15.5rem";
      aside.style.width = "15.5rem";
      aside.style.height = layoutH + "px";
      aside.style.minHeight = "0";
      aside.style.overflowX = "hidden";
      aside.style.overflowY = "auto";
      aside.style.webkitOverflowScrolling = "touch";
    }
    if (main) {
      main.style.flex = "1 1 auto";
      main.style.minWidth = "0";
      main.style.height = layoutH + "px";
      main.style.minHeight = "0";
      main.style.overflowX = "hidden";
      main.style.overflowY = "auto";
      main.style.webkitOverflowScrolling = "touch";
    }
  }

  function refreshTrackDetailBody(track) {
    var body = $("track-detail-body");
    if (!body || !track) return;
    body.innerHTML = renderTrackDetailBody(track);
    requestAnimationFrame(function () {
      layoutTrackDetailScroll();
    });
  }

  function closeTrackDetail() {
    var overlay = $("track-detail-overlay");
    if (!overlay) return;
    overlay.hidden = true;
    activeDetailTrackId = null;
    document.body.style.overflow = "";
  }

  function buildDetailStatusOptions(track) {
    var html = "";
    for (var j = 0; j < CONFIG.statusOptions.length; j++) {
      var o = CONFIG.statusOptions[j];
      html += '<option value="' + escapeHtml(o.value) + '"' +
        (track.status === o.value ? " selected" : "") + ">" + escapeHtml(o.label) + "</option>";
    }
    if (track.status && !isKnownStatus(track.status)) {
      html += '<option value="' + escapeHtml(track.status) + '" selected>' +
        escapeHtml(track.status) + "（シート）</option>";
    }
    return html;
  }

  function renderDetailChip(label, value, mod) {
    if (!value) return "";
    return '<span class="detail-chip' + (mod ? " detail-chip--" + mod : "") + '" title="' + escapeHtml(value) + '">' +
      '<span class="detail-chip-label">' + escapeHtml(label) + "</span>" +
      '<span class="detail-chip-value">' + escapeHtml(value) + "</span></span>";
  }

  function renderDetailChips(track, sched) {
    var chips = [
      renderDetailChip("v", track.version),
      renderDetailChip("デモ", track.demo, "demo"),
      renderDetailChip("シーン", track.scene),
      renderDetailChip("尺", track.length || (sched && sched.length)),
      renderDetailChip("楽器", track.fromSheet ? track.instrument : (track.instrument || (sched && sched.instrument))),
      renderDetailChip("ソース", track.fromSheet ? "Msheet V2" : "ローカル"),
    ].filter(Boolean);
    return chips.length ? '<div class="detail-chips">' + chips.join("") + "</div>" : "";
  }

  function renderDetailNoteBlock(title, content, opts) {
    if (!content) return "";
    opts = opts || {};
    var body;
    if (opts.rich) {
      body = '<div class="detail-text detail-text--rich">' + formatMarkdownHtml(content) + "</div>";
    } else {
      body = '<p class="detail-text detail-text--pre">' + escapeHtml(content) + "</p>";
    }
    if (opts.collapsible) {
      return '<details class="detail-note-card"' + (opts.open ? " open" : "") + ">" +
        "<summary>" + escapeHtml(title) + "</summary>" +
        '<div class="detail-note-card-body">' + body + "</div></details>";
    }
    return '<div class="detail-note-card detail-note-card--static">' +
      '<div class="detail-note-card-head">' + escapeHtml(title) + "</div>" +
      '<div class="detail-note-card-body">' + body + "</div></div>";
  }

  function renderDetailScheduleSection(sched) {
    var tasks = sched ? sched.tasks.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }) : [];
    var html = '<div class="detail-panel"><h4 class="detail-panel-title">スケジュール（' + tasks.length + "件）</h4>";
    if (tasks.length) {
      html += '<ul class="detail-task-list detail-schedule-compact">';
      for (var ti = 0; ti < tasks.length; ti++) {
        var task = tasks[ti];
        html += '<li class="detail-task-item"><span class="detail-task-date">' + formatDateJa(task.date) +
          '</span><span class="detail-task-pill" style="' + scheduleColorStyle(task.color) + '">' +
          escapeHtml(task.label) + "</span></li>";
      }
      html += "</ul>";
    } else {
      html += '<p class="detail-text text-muted">タスクなし</p>';
    }
    return html + "</div>";
  }

  function getGeminiApiKey() {
    // 1) ブラウザに上書き保存したキー  2) CONFIG に直書きしたキー
    try {
      var stored = (localStorage.getItem(CONFIG.aiKeyStorageKey) || "").trim();
      if (stored) return stored;
    } catch (err) { /* ignore */ }
    return String(CONFIG.geminiApiKey || "").trim();
  }

  function hasBuiltinGeminiKey() {
    return !!String(CONFIG.geminiApiKey || "").trim();
  }

  function setGeminiApiKey(key) {
    try {
      key = String(key || "").trim();
      if (key) localStorage.setItem(CONFIG.aiKeyStorageKey, key);
      else localStorage.removeItem(CONFIG.aiKeyStorageKey);
      return true;
    } catch (err) {
      return false;
    }
  }

  function loadAiCache() {
    try {
      var raw = localStorage.getItem(CONFIG.aiCacheStorageKey);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function saveAiCacheEntry(trackId, entry) {
    try {
      var cache = loadAiCache();
      cache[trackId] = entry;
      localStorage.setItem(CONFIG.aiCacheStorageKey, JSON.stringify(cache));
    } catch (err) { /* ignore quota */ }
  }

  function getAiCacheEntry(trackId) {
    var cache = loadAiCache();
    return cache[trackId] || null;
  }

  function openAiKeyDialog(opts) {
    opts = opts || {};
    var overlay = $("ai-key-overlay");
    var input = $("ai-key-input");
    if (!overlay || !input) return;
    input.value = getGeminiApiKey();
    overlay.hidden = false;
    input.focus();
    input.select();
    overlay._aiKeyOnSave = opts.onSave || null;
  }

  function closeAiKeyDialog() {
    var overlay = $("ai-key-overlay");
    if (overlay) {
      overlay.hidden = true;
      overlay._aiKeyOnSave = null;
    }
  }

  function buildTrackAiContext(track) {
    var sched = findScheduleTrack(track.code);
    var brief = track.brief || (sched && sched.memo) || "";
    var lines = [
      "曲コード: " + (track.code || ""),
      "曲名: " + (track.title || ""),
      "バージョン(v): " + (track.version || "未設定"),
      "ステータス: " + (track.status || "未設定"),
      "進捗%: " + (track.percent != null ? track.percent : "未設定"),
      "シーン: " + (track.scene || "未設定"),
      "尺: " + (track.length || (sched && sched.length) || "未設定"),
      "楽器: " + (track.fromSheet ? (track.instrument || "未設定") : (track.instrument || (sched && sched.instrument) || "未設定")),
      "デモ: " + (track.demo || "未設定"),
      "",
      "【初稿memo】",
      track.productionMemo || "（なし）",
      "",
      "【要約】",
      brief || "（なし）",
      "",
      "【制作資料】",
      track.productionMaterial || "（なし）",
      "",
      "【打ち合わせ時メモ】",
      track.meetingMemo || "（なし）",
      "",
      "【リハメモ】",
      track.rehaMemo || "（なし）",
      "",
      "【FB_v1】",
      track.fbV1 || "（なし）",
      "",
      "【FB_v2】",
      track.fbV2 || "（なし）",
      "",
      "【FB_v3】",
      track.fbV3 || "（なし）",
      "",
      "【FB_v4】",
      track.fbV4 || "（なし）",
      "",
      "【リファレンス】",
      track.reference || "（なし）",
    ];
    if (sched && sched.tasks && sched.tasks.length) {
      lines.push("", "【スケジュール】");
      var tasks = sched.tasks.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      for (var i = 0; i < tasks.length; i++) {
        lines.push("- " + tasks[i].date + " " + tasks[i].label);
      }
    }
    return lines.join("\n");
  }

  function buildAiPrompt(track) {
    return [
      "あなたはラジオドラマ（NHK FMシアター）の劇伴制作アシスタントです。",
      "以下の1曲のメモ・FB・指示を読み、制作者向けに簡潔で実務的な出力をしてください。",
      "口調は日本語・ですます調。推測は推測と明記。存在しない指示は作らない。",
      "",
      "必ず次の見出し構成で出力してください（Markdown可）:",
      "## 要約",
      "（3〜6行で曲の方向性と現状）",
      "",
      "## 指示・FBの要点",
      "（箇条書き。重複は統合）",
      "",
      "## 矛盾・注意点",
      "（あれば。なければ「特になし」）",
      "",
      "## 次のアクション",
      "（優先度つき箇条書き: 今すぐ / 次バージョン / 任意）",
      "",
      "## 短いアドバイス",
      "（アレンジ・ミックス・構成など、1〜3点）",
      "",
      "----- 曲データ -----",
      buildTrackAiContext(track),
    ].join("\n");
  }

  function extractGeminiText(data) {
    if (!data) return "";
    if (data.output_text) return String(data.output_text);
    var cands = data.candidates;
    if (!cands || !cands.length) {
      if (data.error && data.error.message) throw new Error(data.error.message);
      if (data.promptFeedback && data.promptFeedback.blockReason) {
        throw new Error("ブロック: " + data.promptFeedback.blockReason);
      }
      return "";
    }
    var parts = cands[0].content && cands[0].content.parts;
    if (!parts || !parts.length) return "";
    var texts = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].text) texts.push(parts[i].text);
    }
    return texts.join("\n").trim();
  }

  function callGeminiGenerate(apiKey, model, prompt) {
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var msg = (data && data.error && data.error.message) || ("HTTP " + res.status);
          var err = new Error(msg);
          err.status = res.status;
          err.data = data;
          throw err;
        }
        var text = extractGeminiText(data);
        if (!text) throw new Error("応答が空でした");
        return { text: text, model: model };
      });
    });
  }

  function requestTrackAiAdvice(track) {
    var apiKey = getGeminiApiKey();
    if (!apiKey) {
      return Promise.reject(new Error("APIキー未設定"));
    }
    var prompt = buildAiPrompt(track);
    var models = (CONFIG.geminiModels || []).slice();
    var lastErr = null;

    function tryNext(index) {
      if (index >= models.length) {
        return Promise.reject(lastErr || new Error("AI呼び出しに失敗しました"));
      }
      return callGeminiGenerate(apiKey, models[index], prompt).catch(function (err) {
        lastErr = err;
        // モデル未存在・上限などは次へ
        return tryNext(index + 1);
      });
    }
    return tryNext(0);
  }

  function formatAiCacheMeta(entry) {
    if (!entry) return "";
    if (entry.source === "sheet" && !entry.at) {
      return "シート L列バックアップから表示";
    }
    if (!entry.at) return entry.source === "local" ? "ローカル保存済み" : "保存済み";
    try {
      var d = new Date(entry.at);
      var t = d.toLocaleString("ja-JP", {
        month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      var src = entry.source === "sheet" ? "シート" : "ローカル";
      return src + " · " + t + (entry.model ? " · " + entry.model : "");
    } catch (err) {
      return "保存済み";
    }
  }

  function renderDetailAiPanel(track) {
    var display = getAiDisplayEntry(track);
    var hasKey = !!getGeminiApiKey();
    var canWrite = canWriteToSheet(track);
    var status = hasKey
      ? (display ? formatAiCacheMeta(display) : "ボタン一発で要約・アドバイスを生成（キー入力不要）")
      : "APIキー未設定 — ヘッダーの「AI設定」から保存するか CONFIG.geminiApiKey を設定してください";
    if (canWrite) {
      status += " · AI全文は L列へ自動バックアップ";
    }
    var body = display && display.text
      ? formatAiOutputHtml(display.text)
      : '<p class="detail-ai-output detail-ai-output--placeholder">まだ生成結果がありません。「AI要約を生成」を押すと、初稿memo・FB・打ち合わせメモなどから要約と次のアクションを出します。全文は L列にも保存され、ローカルが消えても復元できます。</p>';

    var saveBtn = canWrite
      ? '<button type="button" class="studio-btn studio-btn--ghost" id="detail-ai-save-sheet-btn" data-id="' +
        escapeHtml(track.id) + '" title="AI出力の全文を L列へ書き戻し（バックアップ）">L列へ保存</button>'
      : "";
    // 組み込みキーがあるときは詳細内のキー設定を出さない（めんどくさい入力を減らす）
    var keyBtn = hasBuiltinGeminiKey()
      ? ""
      : '<button type="button" class="studio-btn studio-btn--ghost" id="detail-ai-key-btn">キー設定</button>';

    return '<div class="detail-ai-card" id="detail-ai-card" data-track-id="' + escapeHtml(track.id) + '">' +
      '<div class="detail-ai-card-head">' +
      '<h4 class="detail-ai-card-title">✦ AI 要約・アドバイス</h4>' +
      '<div class="detail-ai-card-actions">' +
      keyBtn +
      saveBtn +
      '<button type="button" class="studio-btn studio-btn--ai" id="detail-ai-generate-btn"' +
      ' data-id="' + escapeHtml(track.id) + '">AI要約を生成</button>' +
      "</div></div>" +
      '<div class="detail-ai-card-body">' +
      '<p class="detail-ai-status" id="detail-ai-status">' + escapeHtml(status) + "</p>" +
      '<div id="detail-ai-output-wrap">' + body + "</div>" +
      "</div></div>";
  }

  function setDetailAiUi(state) {
    state = state || {};
    var statusEl = $("detail-ai-status");
    var wrap = $("detail-ai-output-wrap");
    var btns = document.querySelectorAll("#detail-ai-generate-btn, #detail-ai-generate-btn-aside");
    if (statusEl) {
      statusEl.textContent = state.status || "";
      statusEl.className = "detail-ai-status" +
        (state.err ? " detail-ai-status--err" : "") +
        (state.ok ? " detail-ai-status--ok" : "");
    }
    if (wrap && state.html != null) wrap.innerHTML = state.html;
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      if (state.loading) {
        btn.classList.add("is-loading");
        btn.disabled = true;
        btn.textContent = btn.id === "detail-ai-generate-btn-aside" ? "生成中…" : "生成中…";
      } else {
        btn.classList.remove("is-loading");
        btn.disabled = false;
        btn.textContent = btn.id === "detail-ai-generate-btn-aside" ? "✦ AI要約" : "AI要約を生成";
      }
    }
  }

  function runDetailAiGenerate(trackId) {
    var track = findTrack(trackId);
    if (!track) return;

    if (!getGeminiApiKey()) {
      openAiKeyDialog({
        onSave: function () { runDetailAiGenerate(trackId); },
      });
      showToast("Gemini APIキーを保存してください", "info");
      return;
    }

    var hasText = !!(track.productionMemo || track.brief || track.productionMaterial ||
      track.meetingMemo || track.rehaMemo || track.fbV1 || track.fbV2 || track.fbV3 || track.fbV4);
    if (!hasText) {
      setDetailAiUi({
        err: true,
        status: "メモ・FBが空のため生成できません",
        html: '<p class="detail-ai-output detail-ai-output--placeholder">シートにテキストがありません。</p>',
      });
      return;
    }

    setDetailAiUi({
      loading: true,
      status: "Gemini に送信中…（無料枠・数十秒かかることがあります）",
      html: '<p class="detail-ai-output detail-ai-output--plain is-loading">生成中です…</p>',
    });

    requestTrackAiAdvice(track)
      .then(function (result) {
        var entry = {
          text: result.text,
          model: result.model,
          at: new Date().toISOString(),
        };
        saveAiCacheEntry(track.id, entry);

        // L列バックアップ用: AIが返した全文をそのまま保存（セクション抽出はしない）
        track.overallSummary = result.text;
        var richHtml = formatAiOutputHtml(result.text);
        var metaLocal = formatAiCacheMeta({
          text: entry.text,
          at: entry.at,
          model: entry.model,
          source: "local",
        });

        setDetailAiUi({
          ok: true,
          status: metaLocal,
          html: richHtml,
        });
        showToast(track.code + " の AI要約を生成しました", "ok");
        requestAnimationFrame(layoutTrackDetailScroll);

        // シート連携曲なら AI 全文を L列へ自動バックアップ
        if (canWriteToSheet(track) && result.text) {
          setDetailAiUi({
            ok: true,
            status: metaLocal + " · L列へバックアップ中…",
            html: richHtml,
          });
          return pushOverallSummaryToSheet(track).then(function (ok) {
            var note = ok === false
              ? " · L列バックアップ失敗"
              : " · L列へ全文バックアップ済み";
            setDetailAiUi({
              ok: ok !== false,
              err: ok === false,
              status: metaLocal + note,
              html: richHtml,
            });
            if (activeDetailTrackId === track.id) {
              refreshTrackDetailBody(track);
            }
            return ok;
          });
        }
        if (activeDetailTrackId === track.id) {
          refreshTrackDetailBody(track);
        }
        return null;
      })
      .catch(function (err) {
        var msg = (err && err.message) ? err.message : String(err);
        if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(msg)) {
          msg = "APIキーが無効です。AI設定から正しいキーを保存してください。";
        } else if (/quota|rate|Resource exhausted|429/i.test(msg)) {
          msg = "無料枠の上限に達した可能性があります。しばらく待って再試行してください。";
        } else if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
          msg = "通信に失敗しました。ネット接続を確認し、file:// ではなくローカルサーバーや通常のブラウザ表示で試してください。";
        }
        setDetailAiUi({
          err: true,
          status: msg,
          html: '<p class="detail-ai-output detail-ai-output--placeholder">生成に失敗しました。</p>',
        });
        showToast("AI要約に失敗: " + msg, "err");
      });
  }

  function saveDetailAiSummaryToSheet(trackId) {
    var track = findTrack(trackId);
    if (!track) return;
    if (!canWriteToSheet(track)) {
      showToast("シート書き戻し不可（webApp 未設定 or ローカル曲）", "err");
      return;
    }
    var display = getAiDisplayEntry(track);
    var fullText = (display && display.text) || track.overallSummary || "";
    if (!fullText) {
      showToast("保存する AI 全文がありません。先に AI要約を生成してください", "err");
      return;
    }
    track.overallSummary = fullText;
    var statusEl = $("detail-ai-status");
    if (statusEl) {
      statusEl.textContent = "L列へ AI全文をバックアップ中…";
      statusEl.className = "detail-ai-status";
    }
    pushOverallSummaryToSheet(track).then(function (ok) {
      if (activeDetailTrackId === track.id) refreshTrackDetailBody(track);
      if (ok === false) return;
    });
  }

  function renderClientCheckbox(track, opts) {
    opts = opts || {};
    var checked = isClientOk(track.client);
    var idAttr = opts.inputId ? ' id="' + escapeHtml(opts.inputId) + '"' : "";
    var extraClass = opts.className ? " " + opts.className : "";
    return '<label class="client-ok-check' + (checked ? " is-ok" : "") + extraClass +
      '" title="client OK（K列）。チェックで OK を書き込み">' +
      '<input type="checkbox" class="client-ok-input"' + idAttr +
      ' data-id="' + escapeHtml(track.id) + '" data-field="client"' +
      ' aria-label="' + escapeHtml(track.code) + ' client OK"' +
      (checked ? " checked" : "") + ">" +
      '<span class="client-ok-mark" aria-hidden="true"></span>' +
      '<span class="client-ok-label">' + (opts.label || "Client") + "</span>" +
      (checked ? '<span class="client-ok-badge">OK</span>' : "") +
      "</label>";
  }

  function renderTrackDetailBody(track) {
    var sched = findScheduleTrack(track.code);
    var html = "";
    var chips = renderDetailChips(track, sched);
    if (chips) html += '<div class="detail-top">' + chips + "</div>";

    html += '<div class="detail-layout">';
    html += '<aside class="detail-aside">';

    html += '<div class="detail-panel detail-panel--progress"><h4 class="detail-panel-title">進捗</h4>' +
      '<div class="detail-status-row">' +
      '<div class="progress-bar progress-bar--interactive detail-progress-bar" role="slider" tabindex="0"' +
      ' data-id="' + track.id + '" data-field="percent" aria-valuemin="0" aria-valuemax="100" aria-valuestep="5"' +
      ' aria-valuenow="' + track.percent + '" aria-label="' + escapeHtml(track.code) + ' 進捗%"' +
      ' style="--progress-thumb:' + track.percent + '%"' +
      ' title="クリック／ドラッグで進捗%を変更（5%刻み）">' +
      '<div class="progress-fill" style="width:' + track.percent + '%"></div></div>' +
      '<span class="font-mono text-small" id="detail-percent-label">' + track.percent + "%</span></div>" +
      '<div class="detail-status-row">' +
      '<label class="version-label" for="detail-version-input">v</label>' +
      '<select class="' + versionInputClassName(track.version, "detail-version-input") +
      '" id="detail-version-input"' +
      ' data-id="' + track.id + '" data-field="version"' +
      ' aria-label="' + escapeHtml(track.code) + ' バージョン" title="B列 v（1–10）">' +
      buildVersionOptions(track.version) + "</select>" +
      '<select class="track-status-select status-' + statusSlug(track.status) +
      '" id="detail-status-select" data-id="' + track.id + '" data-field="status">' +
      buildDetailStatusOptions(track) + "</select></div>" +
      '<div class="detail-status-row detail-status-row--client">' +
      renderClientCheckbox(track, { inputId: "detail-client-input", label: "Client OK", className: "client-ok-check--detail" }) +
      "</div>";
    if (canWriteToSheet(track)) {
      html += '<p class="detail-write-note">v→B列 / ステータス→I列 / 進捗%→J列 / client→K列 / AI全文→L列 · バーをクリックで%調整</p>';
    } else if (track.fromSheet) {
      html += '<p class="detail-write-note">読み取り専用</p>';
    } else {
      html += '<p class="detail-write-note">ローカルのみ保存 · バーをクリックで%調整</p>';
    }
    html += "</div>";

    html += renderDetailScheduleSection(sched);

    html += '<div class="detail-actions">' +
      '<button type="button" class="studio-btn studio-btn--ai" id="detail-ai-generate-btn-aside" data-id="' +
      escapeHtml(track.id) + '">✦ AI要約</button>' +
      '<a class="studio-btn studio-btn--ghost" href="' + escapeHtml(CONFIG.sheet.editUrl) +
      '" target="_blank" rel="noopener">↗ Msheet</a>' +
      '<a class="studio-btn studio-btn--ghost" href="' + escapeHtml(CONFIG.scheduleSheet.editUrl) +
      '" target="_blank" rel="noopener">↗ スケジュール</a></div>';
    html += "</aside>";

    html += '<div class="detail-main">';
    html += renderDetailAiPanel(track);
    var brief = track.brief || (sched && sched.memo) || "";
    html += renderDetailNoteBlock("AI全文バックアップ（L列）", track.overallSummary, {
      collapsible: true,
      open: false,
      rich: true,
    });
    html += renderDetailNoteBlock("初稿memo", track.productionMemo, { collapsible: true, open: true });
    html += renderDetailNoteBlock("要約", brief);
    html += renderDetailNoteBlock("制作資料", track.productionMaterial, { collapsible: true, open: true });
    html += renderDetailNoteBlock("打ち合わせ時メモ", track.meetingMemo, { collapsible: true, open: true });
    html += renderDetailNoteBlock("リハメモ", track.rehaMemo, { collapsible: true, open: true });
    html += renderDetailNoteBlock("FB_v1", track.fbV1, { collapsible: true, open: true });
    html += renderDetailNoteBlock("FB_v2", track.fbV2, { collapsible: true, open: !!track.fbV2 });
    html += renderDetailNoteBlock("FB_v3", track.fbV3, { collapsible: true, open: !!track.fbV3 });
    html += renderDetailNoteBlock("FB_v4", track.fbV4, { collapsible: true, open: !!track.fbV4 });
    if (track.reference) {
      html += '<div class="detail-note-card detail-note-card--static">' +
        '<div class="detail-note-card-head">リファレンス</div>' +
        '<div class="detail-note-card-body">' + formatReferenceHtml(track.reference) + "</div></div>";
    }
    if (!track.productionMemo && !brief && !track.productionMaterial && !track.meetingMemo &&
        !track.rehaMemo && !track.fbV1 && !track.fbV2 && !track.fbV3 && !track.fbV4 && !track.reference) {
      html += '<p class="detail-text text-muted">シートのテキスト情報はまだありません。</p>';
    }
    html += "</div></div>";

    return html;
  }

  function openTrackDetail(trackId) {
    var track = findTrack(trackId);
    if (!track) return;
    activeDetailTrackId = trackId;
    $("track-detail-code").textContent = track.code;
    $("track-detail-title").textContent = track.title;
    $("track-detail-body").innerHTML = renderTrackDetailBody(track);
    var overlay = $("track-detail-overlay");
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () {
      layoutTrackDetailScroll();
      // レイアウト確定後にもう一度（フォント・チップ折り返し反映）
      requestAnimationFrame(layoutTrackDetailScroll);
    });
    var closeBtn = $("track-detail-close");
    if (closeBtn) closeBtn.focus();
  }

  function applyTrackStatusChange(track, status, sourceEl) {
    track.status = status;
    // ステータス変更時は進捗%を触らない（手動調整した%を維持）
    if (sourceEl) {
      sourceEl.className = "track-status-select status-" + statusSlug(track.status);
      sourceEl.value = track.status;
    }
    saveState();
    renderTracks();
    if (activeDetailTrackId === track.id) {
      refreshTrackDetailBody(track);
    }
    if (canWriteToSheet(track)) {
      pushStatusToSheet(track);
    } else if (track.fromSheet && CONFIG.sheet.webAppUrl) {
      showToast("シート行が特定できないため反映できません", "err");
    } else {
      showToast(track.code + " をローカルに保存しました" +
        (track.fromSheet ? "（シート未連携）" : ""), "info");
    }
  }

  function applyTrackVersionChange(track, version, sourceEl) {
    track.version = String(version == null ? "" : version).trim();
    if (sourceEl) {
      sourceEl.value = track.version;
      applyVersionToneToEl(sourceEl, track.version);
    }
    saveState();
    renderTracks();
    if (activeDetailTrackId === track.id) {
      refreshTrackDetailBody(track);
    }
    if (canWriteToSheet(track)) {
      pushVersionToSheet(track);
    } else if (track.fromSheet && CONFIG.sheet.webAppUrl) {
      showToast("シート行が特定できないため反映できません", "err");
    } else {
      showToast(track.code + " の v をローカルに保存しました" +
        (track.fromSheet ? "（シート未連携）" : ""), "info");
    }
  }

  function applyTrackClientChange(track, checked) {
    track.client = checked ? "OK" : "";
    saveState();
    renderTracks();
    if (activeDetailTrackId === track.id) {
      refreshTrackDetailBody(track);
    }
    if (canWriteToSheet(track)) {
      pushClientToSheet(track);
    } else if (track.fromSheet && CONFIG.sheet.webAppUrl) {
      showToast("シート行が特定できないため反映できません", "err");
    } else {
      showToast(
        track.code + " の client を" + (track.client ? " OK" : " 未") + "（ローカル）に保存しました" +
        (track.fromSheet ? "（シート未連携）" : ""),
        "info"
      );
    }
  }

  function applyTrackPercentChange(track, percent, opts) {
    opts = opts || {};
    track.percent = clampPercent(percent);
    track.percentFromSheet = false;
    saveState();
    if (!opts.skipRender) {
      renderTracks();
      if (activeDetailTrackId === track.id) {
        refreshTrackDetailBody(track);
      }
    } else {
      updateOverallUI();
      document.querySelectorAll('.progress-bar--interactive[data-id="' + track.id + '"]').forEach(function (bar) {
        setProgressBarVisual(bar, track.percent);
      });
      document.querySelectorAll('.percent-input[data-id="' + track.id + '"]').forEach(function (input) {
        input.value = track.percent;
      });
      var label = $("detail-percent-label");
      if (label && activeDetailTrackId === track.id) label.textContent = track.percent + "%";
      var badge = $("msheet-badge");
      if (badge) {
        var done = state.tracks.filter(function (t) { return t.status === "OK"; }).length;
        badge.textContent = "Msheet V2 · " + done + "/" + state.tracks.length + " · " + overallPercent() + "%";
      }
    }
    if (canWriteToSheet(track)) {
      pushPercentToSheet(track);
    } else if (!opts.quietLocal) {
      showToast(track.code + " の進捗%をローカルに保存しました", "info");
    }
  }

  var progressDrag = null;

  function beginProgressBarDrag(bar, clientX, pointerId) {
    var id = bar.dataset.id;
    var track = findTrack(id);
    if (!track) return;
    var percent = percentFromBarEvent(bar, clientX);
    progressDrag = { bar: bar, trackId: id, lastPercent: percent, pointerId: pointerId };
    bar.classList.add("is-dragging");
    setProgressBarVisual(bar, percent);
    var input = document.querySelector('.percent-input[data-id="' + id + '"]');
    if (input) input.value = percent;
    var label = $("detail-percent-label");
    if (label && activeDetailTrackId === id) label.textContent = percent + "%";
    if (pointerId != null && bar.setPointerCapture) {
      try { bar.setPointerCapture(pointerId); } catch (e) { /* ignore */ }
    }
  }

  function moveProgressBarDrag(clientX) {
    if (!progressDrag) return;
    var percent = percentFromBarEvent(progressDrag.bar, clientX);
    progressDrag.lastPercent = percent;
    setProgressBarVisual(progressDrag.bar, percent);
    var input = document.querySelector('.percent-input[data-id="' + progressDrag.trackId + '"]');
    if (input) input.value = percent;
    var label = $("detail-percent-label");
    if (label && activeDetailTrackId === progressDrag.trackId) label.textContent = percent + "%";
    // 他の同じ track のバーも更新
    document.querySelectorAll('.progress-bar--interactive[data-id="' + progressDrag.trackId + '"]').forEach(function (bar) {
      if (bar !== progressDrag.bar) setProgressBarVisual(bar, percent);
    });
  }

  function endProgressBarDrag() {
    if (!progressDrag) return;
    var track = findTrack(progressDrag.trackId);
    var percent = progressDrag.lastPercent;
    progressDrag.bar.classList.remove("is-dragging");
    progressDrag = null;
    if (!track) return;
    applyTrackPercentChange(track, percent);
  }

  function youtubeEmbedUrl(url) {
    var m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? "https://www.youtube.com/embed/" + m[1] + "?rel=0" : null;
  }

  function formatReferenceHtml(reference) {
    if (!reference) return "";
    if (/^https?:\/\//i.test(reference)) {
      var embedUrl = youtubeEmbedUrl(reference);
      if (embedUrl) {
        var label = reference.indexOf("youtu") >= 0 ? "YouTube 参考曲" : "参考リンク";
        return '<p class="track-reference">✦ <a href="' + escapeHtml(reference) + '" target="_blank" rel="noopener">' +
          escapeHtml(label) + '</a></p>' +
          '<div class="track-ref-player"><iframe src="' + embedUrl +
          '" title="YouTube 参考曲" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>';
      }
      var label = reference.indexOf("youtu") >= 0 ? "YouTube 参考曲" : "参考リンク";
      return '<p class="track-reference">✦ <a href="' + escapeHtml(reference) + '" target="_blank" rel="noopener">' +
        escapeHtml(label) + '</a></p>';
    }
    return '<p class="track-reference">✦ ' + escapeHtml(reference) + '</p>';
  }

  function updateFooterStatus() {
    var el = $("footer-status");
    if (!el) return;
    var errors = [];
    if (sheetMeta.error) errors.push("Msheet:" + sheetMeta.error);
    if (scheduleMeta.error) errors.push("Schedule:" + scheduleMeta.error);
    if (errors.length) {
      el.textContent = "STATUS: SYNC ERROR · " + errors.join(" · ");
      el.className = "font-mono text-small sheet-sync-status sheet-sync-status--err";
      return;
    }
    if (sheetMeta.loaded || scheduleMeta.loaded) {
      var time = sheetMeta.syncedAt || scheduleMeta.syncedAt;
      var timeStr = time ? time.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "--:--";
      var writeMode = CONFIG.sheet.webAppUrl ? "RW" : "RO";
      var sched = scheduleData ? scheduleData.tracks.length + " sched" : "no sched";
      el.textContent = "STATUS: " + writeMode + " · " + state.tracks.length + " tracks · " + sched + " · " + timeStr;
      el.className = "font-mono text-small sheet-sync-status sheet-sync-status--ok";
      return;
    }
    el.textContent = "STATUS: LOADING SHEETS · Msheet V2 · HTML版";
    el.className = "font-mono text-small sheet-sync-status sheet-sync-status--warn";
  }

  async function loadAllSheets() {
    var token = ++projectLoadToken;
    var list = $("track-list");
    sheetMeta.loading = true;
    if (list) list.classList.add("track-list--loading");
    renderTracks();
    updateFooterStatus();

    try {
      try {
        var gviz = await fetchGvizSheet(CONFIG.sheet);
        if (token !== projectLoadToken) return;
        sheetMeta = { loaded: true, loading: true, source: "sheet", syncedAt: new Date(), error: null };
        state = buildStateFromBases(parseSheetTracks(gviz));
      } catch (err) {
        if (token !== projectLoadToken) return;
        sheetMeta = { loaded: false, loading: true, source: "local", syncedAt: null, error: err.message || "fetch failed" };
        state = defaultState();
      }

      if (token !== projectLoadToken) return;
      try { await fetchScheduleColorLegend(); } catch (legendError) {}
      if (token !== projectLoadToken) return;

      try {
        var data = await loadScheduleData();
        if (token !== projectLoadToken) return;
        scheduleData = data;
        scheduleMeta = {
          loaded: true,
          syncedAt: new Date(),
          error: null,
          source: data && data._source ? data._source : null,
          warning: data && data._warning ? data._warning : null,
        };
        activeMilestones = (scheduleData && scheduleData.milestones.length)
          ? scheduleData.milestones
          : mergeMilestones([]);
      } catch (err) {
        if (token !== projectLoadToken) return;
        scheduleData = null;
        scheduleMeta = {
          loaded: false,
          syncedAt: null,
          error: err.message || "fetch failed",
          source: null,
          warning: null,
        };
        activeMilestones = mergeMilestones([]);
      }
    } finally {
      if (token !== projectLoadToken) return;
      sheetMeta.loading = false;
      if (list) list.classList.remove("track-list--loading");
      updateFooterStatus();
      renderTracks();
      renderGantt();
      renderNativeScheduleBoard();
      renderCountdown();
    }
  }

  function renderNativeScheduleBoard(filterProjectName) {
    var targets = [
      $("native-schedule-board-wrap"),
      $("registry-native-schedule-board-wrap")
    ].filter(Boolean);

    if (!targets.length) return;

    if (scheduleMeta.error) {
      var errHtml = '<div style="padding:1.5rem; text-align:center;" class="gantt-status text-small sheet-sync-status sheet-sync-status--err">' +
        'スプレッドシートデータ取得失敗: ' + escapeHtml(scheduleMeta.error) +
        '</div>';
      targets.forEach(function(t) { t.innerHTML = errHtml; });
      return;
    }

    if (!scheduleData || !scheduleData.dateCols || !scheduleData.dateCols.length) {
      var emptyHtml = '<div style="padding:2rem; text-align:center;" class="text-muted text-small">' +
        (scheduleMeta.loaded ? "スプレッドシートにスケジュールデータがありません。" : "スプレッドシートから最新データを取得中…") +
        '</div>';
      targets.forEach(function(t) { t.innerHTML = emptyHtml; });
      return;
    }

    var range = ganttDateRange(scheduleData);
    var cols = filterDateCols(scheduleData, range);
    var today = todayIso();
    var deadline = activeProjectEntry ? (activeProjectEntry.deadline || "") : CONFIG.project.finalDeadline;
    var eventsByDate = buildEventsByDate(scheduleData, range);

    var sourceLabel = scheduleMeta.source ? ("取得ソース: " + scheduleMeta.source.toUpperCase()) : "Google Spreadsheet 直結";
    var syncedTime = scheduleMeta.syncedAt ? scheduleMeta.syncedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "";

    var html = '<div class="native-board-toolbar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px;">' +
      '<div style="font-size:0.8rem; font-weight:600; color:var(--studio-cyan); display:flex; align-items:center; gap:6px;">' +
        '<span>✦ スプレッドシート直結一括ボード</span>' +
        '<span class="text-muted text-small" style="font-weight:normal;">(' + cols.length + '日間 · ' + sourceLabel + (syncedTime ? " · " + syncedTime : "") + ')</span>' +
      '</div>' +
      '<div style="display:flex; gap:6px;">' +
        '<button type="button" class="btn-reload-native-board studio-btn studio-btn--ghost" style="padding:2px 8px; font-size:0.72rem;" title="Googleスプレッドシートから最新データを再読み込み">↻ スプレッドシートから再取得</button>' +
        '<a class="studio-btn studio-btn--ghost" href="' + escapeHtml(CONFIG.scheduleSheet.editUrl) + '" target="_blank" rel="noopener" style="padding:2px 8px; font-size:0.72rem;">↗ シート直接編集</a>' +
      '</div>' +
      '</div>';

    html += '<div class="native-board-scroll-wrap" style="overflow:auto; max-height:560px; border:1px solid var(--studio-border); border-radius:6px; background:var(--studio-surface-1);">';
    html += '<table class="gantt-table native-board-table" style="width:100%; border-collapse:collapse;">';
    
    // Header Row
    html += '<thead><tr>';
    html += '<th class="gantt-label-col" style="position:sticky; left:0; z-index:4; background:var(--studio-surface-2); min-width:180px;">項目 / 日付</th>';
    for (var hi = 0; hi < cols.length; hi++) {
      html += formatGanttTh(cols[hi], today, deadline);
    }
    html += '</tr></thead><tbody>';

    // Common Events Row
    if (Object.keys(eventsByDate).length > 0) {
      html += '<tr class="gantt-event-row" style="background:rgba(255,217,102,0.06);">' +
        '<td class="gantt-label-col" style="position:sticky; left:0; z-index:3; background:var(--studio-surface-2); font-weight:bold;">' +
          '<span class="gantt-row-code" style="color:var(--studio-amber);">EVT</span>' +
          '<span class="gantt-row-title"> 共通イベント</span>' +
        '</td>';
      for (var ec = 0; ec < cols.length; ec++) {
        var dayEvts = eventsByDate[cols[ec].iso];
        var eAttrs = ganttTdAttrs(cols[ec].iso, today, deadline, dayEvts && dayEvts.length ? "gantt-cell--stack" : "");
        if (dayEvts && dayEvts.length) {
          html += '<td' + eAttrs + '><div class="gantt-cell-inner">';
          for (var pe = 0; pe < dayEvts.length; pe++) {
            html += ganttPillHtml(dayEvts[pe].label, dayEvts[pe].color);
          }
          html += '</div></td>';
        } else {
          html += '<td' + eAttrs + '></td>';
        }
      }
      html += '</tr>';
    }

    // Track Rows
    for (var tri = 0; tri < scheduleData.tracks.length; tri++) {
      var trk = scheduleData.tracks[tri];
      if (filterProjectName && trk.title && trk.title.indexOf(filterProjectName) < 0 && trk.code.indexOf(filterProjectName) < 0) {
        continue;
      }
      var taskMap = {};
      for (var tsi = 0; tsi < trk.tasks.length; tsi++) {
        var tsk = trk.tasks[tsi];
        if (!taskMap[tsk.date]) taskMap[tsk.date] = [];
        taskMap[tsk.date].push(tsk);
      }

      html += '<tr class="gantt-track-row" data-code="' + escapeHtml(trk.code) + '">' +
        '<td class="gantt-label-col" style="position:sticky; left:0; z-index:3; background:var(--studio-surface-2);">' +
          '<span class="gantt-row-code">' + escapeHtml(trk.code) + '</span>' +
          '<span class="gantt-row-title">' + escapeHtml(trk.title || trk.code) + '</span>' +
        '</td>';

      for (var tc = 0; tc < cols.length; tc++) {
        var iso = cols[tc].iso;
        var dayTasks = taskMap[iso];
        var tAttrs = ganttTdAttrs(iso, today, deadline, dayTasks && dayTasks.length ? "gantt-cell--stack" : "");
        if (dayTasks && dayTasks.length) {
          html += '<td' + tAttrs + '><div class="gantt-cell-inner">';
          for (var pt = 0; pt < dayTasks.length; pt++) {
            html += ganttPillHtml(dayTasks[pt].label, dayTasks[pt].color);
          }
          html += '</div></td>';
        } else {
          html += '<td' + tAttrs + '></td>';
        }
      }
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    targets.forEach(function(t) { t.innerHTML = html; });

    document.querySelectorAll(".btn-reload-native-board").forEach(function(btn) {
      btn.addEventListener("click", function() {
        loadAllSheets();
      });
    });
  }

  function overallPercent() {
    if (!state.tracks.length) return 0;
    var sum = 0;
    for (var i = 0; i < state.tracks.length; i++) sum += state.tracks[i].percent;
    return Math.round(sum / state.tracks.length);
  }

  function findTrackByCode(code) {
    if (!code) return null;
    var upper = String(code).toUpperCase();
    for (var i = 0; i < state.tracks.length; i++) {
      if (String(state.tracks[i].code).toUpperCase() === upper) return state.tracks[i];
    }
    return null;
  }

  function nextTaskForTrack(track) {
    var sched = findScheduleTrack(track.code);
    if (!sched || !sched.tasks || !sched.tasks.length) return null;
    var today = todayIso();
    var upcoming = sched.tasks.filter(function (task) { return task.date >= today; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (upcoming.length) return upcoming[0];
    var past = sched.tasks.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return past[0] || null;
  }

  function isTrackStuck(track) {
    return track.status !== "OK" && clampPercent(track.percent) <= 30;
  }

  function trackMatchesStatusFilter(track) {
    if (statusFilter === "__all__") return true;
    if (statusFilter === "__not_ok__") return track.status !== "OK";
    if (statusFilter === "__client_ok__") return isClientOk(track.client);
    if (statusFilter === "__client_not_ok__") return !isClientOk(track.client);
    return (track.status || "") === statusFilter;
  }

  function statusFilterLabel(filter) {
    if (filter === "__all__") return "すべて";
    if (filter === "__not_ok__") return "未OK";
    if (filter === "__client_ok__") return "Client OK";
    if (filter === "__client_not_ok__") return "Client未";
    return filter || "—";
  }

  function buildStatusCounts() {
    var counts = {};
    for (var i = 0; i < state.tracks.length; i++) {
      var key = state.tracks[i].status || "";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  function buildClientCounts() {
    var ok = 0;
    var pending = 0;
    for (var i = 0; i < state.tracks.length; i++) {
      if (isClientOk(state.tracks[i].client)) ok++;
      else pending++;
    }
    return { ok: ok, pending: pending, total: state.tracks.length };
  }

  function setStatusFilter(next) {
    statusFilter = next || "__all__";
    document.querySelectorAll(".status-filter-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-status-filter") === statusFilter);
    });
    document.querySelectorAll(".status-chip").forEach(function (chip) {
      chip.classList.toggle("is-active", chip.getAttribute("data-status-filter") === statusFilter);
    });
    renderTracks();
  }

  function updateOverallUI() {
    var root = $("status-breakdown");
    var counts = buildStatusCounts();
    var clients = buildClientCounts();
    var filters = [{ value: "__all__", label: "すべて", count: state.tracks.length, slug: "all" }];
    var known = {};

    CONFIG.statusOptions.forEach(function (option) {
      if (!option.value) return;
      known[option.value] = true;
      filters.push({
        value: option.value,
        label: option.label || option.value,
        count: counts[option.value] || 0,
        slug: option.slug || "unknown",
      });
    });
    Object.keys(counts).forEach(function (value) {
      if (value && !known[value]) filters.push({ value: value, label: value, count: counts[value], slug: "unknown" });
    });

    function chip(item, extraClass) {
      var active = statusFilter === item.value ? " is-active" : "";
      var zero = item.count ? "" : " is-zero";
      return '<button type="button" class="status-chip status-' + escapeHtml(item.slug) +
        (extraClass ? " " + extraClass : "") + active + zero +
        '" data-status-filter="' + escapeHtml(item.value) + '" aria-pressed="' +
        (active ? "true" : "false") + '"><span>' + escapeHtml(item.label) +
        '</span><span class="status-chip-count">' + item.count + "</span></button>";
    }

    if (root) {
      var progressHtml = filters.map(function (item) { return chip(item, ""); }).join("");
      var clientHtml = chip(
        { value: "__client_ok__", label: "Client OK", count: clients.ok, slug: "client-ok" },
        "status-client-ok"
      ) + chip(
        { value: "__client_not_ok__", label: "Client未", count: clients.pending, slug: "client-pending" },
        "status-client-pending"
      );
      var note = statusFilter === "__all__" ? "" :
        '<p class="status-filter-note">「' + escapeHtml(statusFilterLabel(statusFilter)) + '」で絞り込み中</p>';
      root.innerHTML =
        '<div class="status-breakdown-block"><span class="status-breakdown-label">進捗</span><div class="status-breakdown">' +
        progressHtml +
        '</div></div><div class="status-breakdown-block"><span class="status-breakdown-label">クライアント確認</span><div class="status-breakdown">' +
        clientHtml + "</div></div>" + note;
    }

    var countdown = $("countdown-overall-pct");
    if (countdown) countdown.textContent = String(overallPercent());
  }

  function parseSpreadsheetLocation(value, fallbackId, fallbackGid) {
    var text = String(value || "").trim();
    var id = String(fallbackId || "").trim();
    var gid = Number(fallbackGid || 0);
    var idMatch = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
    var gidMatch = text.match(/[?#&]gid=(\d+)/i);
    if (idMatch) id = idMatch[1];
    else if (/^[a-zA-Z0-9_-]{20,}$/.test(text)) id = text;
    if (gidMatch) gid = Number(gidMatch[1] || 0);
    return {
      id: id,
      gid: isFinite(gid) ? gid : 0,
      editUrl: id
        ? "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(id) + "/edit?gid=" + (isFinite(gid) ? gid : 0)
        : "",
    };
  }

  function isBuiltInProject(entry) {
    return !entry || entry.self === true || entry.id === "current-dashboard";
  }

  function getActiveProjectEntry() {
    return activeProjectEntry;
  }

  function applyProjectSheetSettings(entry) {
    if (isBuiltInProject(entry)) {
      CONFIG.sheet = { ...DEFAULT_SHEET_CONFIG };
      CONFIG.scheduleSheet = { ...DEFAULT_SCHEDULE_SHEET_CONFIG };
    } else {
      var progress = parseSpreadsheetLocation(
        entry.spreadsheetUrl || entry.spreadsheetId,
        entry.spreadsheetId,
        entry.sheetGid
      );
      var schedule = parseSpreadsheetLocation(
        entry.scheduleSpreadsheetUrl || entry.scheduleSpreadsheetId || progress.id,
        entry.scheduleSpreadsheetId || progress.id,
        entry.scheduleGid
      );
      CONFIG.sheet = {
        ...DEFAULT_SHEET_CONFIG,
        id: progress.id,
        gid: progress.gid,
        editUrl: progress.editUrl,
        webAppUrl: String(entry.webAppUrl || "").trim(),
      };
      CONFIG.scheduleSheet = {
        ...DEFAULT_SCHEDULE_SHEET_CONFIG,
        id: schedule.id || progress.id,
        gid: schedule.id ? schedule.gid : progress.gid,
        editUrl: schedule.editUrl || progress.editUrl,
      };
    }

    var progressLink = $("open-sheet-link");
    if (progressLink) {
      progressLink.href = CONFIG.sheet.editUrl || "#";
      progressLink.classList.toggle("is-disabled", !CONFIG.sheet.editUrl);
      progressLink.setAttribute("aria-disabled", CONFIG.sheet.editUrl ? "false" : "true");
    }
    var scheduleLink = $("open-schedule-link");
    if (scheduleLink) scheduleLink.href = CONFIG.scheduleSheet.editUrl || "#";
  }

  function openSheetSettingsDialog() {
    var entry = getActiveProjectEntry();
    var label = $("sheet-settings-project");
    if (label) label.textContent = entry ? "対象案件: " + (entry.name || "名称未設定") : "現在のダッシュボード設定";
    $("sheet-settings-progress").value =
      (entry && (entry.spreadsheetUrl || entry.spreadsheetId)) || CONFIG.sheet.editUrl || CONFIG.sheet.id || "";
    $("sheet-settings-progress-gid").value =
      (entry && entry.sheetGid != null) ? entry.sheetGid : (CONFIG.sheet.gid || 0);
    $("sheet-settings-track-name").value = (entry && entry.trackSheetName) || "進捗管理";
    $("sheet-settings-webapp").value = (entry && entry.webAppUrl) || CONFIG.sheet.webAppUrl || "";
    $("sheet-settings-schedule").value =
      (entry && (entry.scheduleSpreadsheetUrl || entry.scheduleSpreadsheetId)) ||
      CONFIG.scheduleSheet.editUrl || CONFIG.scheduleSheet.id || "";
    $("sheet-settings-schedule-gid").value =
      (entry && entry.scheduleGid != null) ? entry.scheduleGid : (CONFIG.scheduleSheet.gid || 0);
    $("sheet-settings-schedule-name").value = (entry && entry.scheduleSheetName) || "制作スケジュール";
    var dialog = $("sheet-settings-dialog");
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
  }

  function closeSheetSettingsDialog() {
    var dialog = $("sheet-settings-dialog");
    if (dialog && dialog.open && typeof dialog.close === "function") dialog.close();
  }

  function saveSheetSettings(event) {
    event.preventDefault();
    var entry = getActiveProjectEntry();
    var progress = parseSpreadsheetLocation(
      $("sheet-settings-progress").value,
      "",
      $("sheet-settings-progress-gid").value
    );
    var scheduleInput = $("sheet-settings-schedule").value.trim();
    var schedule = parseSpreadsheetLocation(
      scheduleInput || progress.id,
      progress.id,
      $("sheet-settings-schedule-gid").value
    );

    if (entry) {
      entry.spreadsheetId = progress.id;
      entry.spreadsheetUrl = progress.editUrl;
      entry.sheetGid = progress.gid;
      entry.trackSheetName = $("sheet-settings-track-name").value.trim() || "進捗管理";
      entry.webAppUrl = $("sheet-settings-webapp").value.trim();
      entry.scheduleSpreadsheetId = schedule.id || progress.id;
      entry.scheduleSpreadsheetUrl = schedule.editUrl || progress.editUrl;
      entry.scheduleGid = schedule.gid;
      entry.scheduleSheetName = $("sheet-settings-schedule-name").value.trim() || "制作スケジュール";
      entry.updatedAt = new Date().toISOString();

      if (window.WorksDBRegistry && typeof window.WorksDBRegistry.save === "function") {
        window.WorksDBRegistry.save("シート設定を保存しました");
      }
      if (window.WorksDBRegistry && typeof window.WorksDBRegistry.sync === "function") {
        window.WorksDBRegistry.sync(entry).catch(function () {
          showToast("管理シートへの同期は保留されました", "info");
        });
      }
    } else {
      CONFIG.sheet = {
        ...CONFIG.sheet,
        id: progress.id,
        gid: progress.gid,
        editUrl: progress.editUrl,
        webAppUrl: $("sheet-settings-webapp").value.trim(),
      };
      CONFIG.scheduleSheet = {
        ...CONFIG.scheduleSheet,
        id: schedule.id || progress.id,
        gid: schedule.gid,
        editUrl: schedule.editUrl || progress.editUrl,
      };
    }

    applyProjectSheetSettings(entry);
    resetProjectRuntime(entry);
    closeSheetSettingsDialog();
    if (CONFIG.sheet.id) loadAllSheets();
    else showToast("スプレッドシート未設定として保存しました", "info");
  }

  window.addEventListener("message", function(e) {
    if (!e.data) return;
    if (e.data.type === "scheduleMilestones" && Array.isArray(e.data.milestones)) {
      scheduleBoardMilestones = e.data.milestones;
      renderCountdown();
    }
  });

  function openDeadlineDialog() {
    var activeEntry = getActiveProjectEntry();
    var dateInput = $("deadline-input-date");
    var broadcastInput = $("deadline-input-broadcast");
    if (dateInput) dateInput.value = activeEntry ? (activeEntry.deadline || "") : (CONFIG.project.finalDeadline || "");
    if (broadcastInput) broadcastInput.value = activeEntry ? (activeEntry.broadcastDate || "") : (CONFIG.project.broadcastLabel || "");
    
    var dlg = $("deadline-dialog");
    if (dlg) {
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.hidden = false;
    }
  }

  function closeDeadlineDialog() {
    var dlg = $("deadline-dialog");
    if (dlg) {
      if (typeof dlg.close === "function") dlg.close();
      else dlg.hidden = true;
    }
  }

  function renderCountdown() {
    var now = new Date();
    var activeEntry = getActiveProjectEntry();
    var deadlineStr = activeEntry ? (activeEntry.deadline || "") : (CONFIG.project.finalDeadline || "");
    var deadlineTextEl = $("countdown-deadline-text");
    var digitsEl = $("countdown-digits");
    var broadcastLabel = $("broadcast-info-label");
    
    if (deadlineStr) {
      var deadlineDate = new Date(deadlineStr + "T23:59:59");
      var daysLeft = Math.max(0, daysBetween(now, deadlineDate));
      if (digitsEl) digitsEl.textContent = String(daysLeft);
      if (deadlineTextEl) deadlineTextEl.textContent = "完パケ/納品締切: " + deadlineStr;
      var hero = $("countdown-hero");
      if (hero) hero.classList.toggle("countdown-hero--urgent", daysLeft <= 7);
    } else {
      if (digitsEl) digitsEl.textContent = "--";
      if (deadlineTextEl) deadlineTextEl.textContent = "締切日: 未設定";
      var hero = $("countdown-hero");
      if (hero) hero.classList.remove("countdown-hero--urgent");
    }

    if (broadcastLabel) {
      var bText = activeEntry ? (activeEntry.broadcastDate || "") : (CONFIG.project.broadcastLabel || "");
      broadcastLabel.textContent = bText ? ("放送/公開: " + bText) : "";
    }

    var countdownPct = $("countdown-overall-pct");
    if (countdownPct) countdownPct.textContent = String(overallPercent());

    var isMainDashboard = !activeProjectEntry || activeEntry.id === "current-dashboard" || activeEntry.self;
    var activeProjName = (!isMainDashboard && activeEntry) ? activeEntry.name : "";
    var activeProjId = (!isMainDashboard && activeEntry) ? activeEntry.id : "";

    var filteredMilestones = scheduleBoardMilestones.filter(function(m) {
      if (!isMainDashboard && (activeProjName || activeProjId)) {
        var matchName = m.projectName && m.projectName === activeProjName;
        var matchId = m.projectId && m.projectId === activeProjId;
        if (!matchName && !matchId) return false;
      }
      return new Date(m.date + "T23:59:59") >= now;
    });

    var html = "";
    var shown = 0;
    for (var i = 0; i < filteredMilestones.length && shown < 6; i++) {
      var m = filteredMilestones[i];
      var dLeft = daysBetween(now, new Date(m.date + "T00:00:00"));
      var projTag = (isMainDashboard && m.projectName) ? ('<span style="opacity:0.75; font-size:0.75em; margin-right:4px;">[' + escapeHtml(m.projectName) + ']</span>') : "";
      html += '<li class="milestone-row' + (dLeft === 0 ? " milestone-row--today" : "") + '">' +
        '<span class="milestone-date">' + formatDateJa(m.date) + '</span>' +
        '<span class="milestone-label" title="' + escapeHtml(m.label) + '">' + projTag + escapeHtml(m.label) + '</span>' +
        '<span class="milestone-dleft">' + (dLeft === 0 ? "TODAY" : "D-" + dLeft) + '</span></li>';
      shown++;
    }

    if (!shown) {
      html = '<li class="text-muted text-small" style="padding:0.25rem 0;">直近予定なし（一括スケジュールに入力すると自動同期）</li>';
    }

    var list = $("milestone-list");
    if (list) list.innerHTML = html;
  }

  function renderTracks() {
    var done = 0;
    var list = $("track-list");
    if (!list) return;

    if (!state.tracks.length) {
      var emptyMessage = sheetMeta.loading
        ? "楽曲データを読み込み中…"
        : (!CONFIG.sheet.id
          ? "この案件にはスプレッドシートがまだ設定されていません。"
          : (sheetMeta.error
            ? "楽曲データを取得できませんでした。シート設定を確認してください。"
            : "この案件には楽曲がまだありません。"));
      list.innerHTML = '<p class="text-muted text-small" style="padding:0.75rem;">' + escapeHtml(emptyMessage) + '</p>';
      updateOverallUI();
      return;
    }

    var html = '<div class="track-table-head" aria-hidden="true">' +
      '<div class="track-col track-col--code">#</div>' +
      '<div class="track-col track-col--v">v</div>' +
      '<div class="track-col track-col--title">曲名</div>' +
      '<div class="track-col track-col--next">次の予定</div>' +
      '<div class="track-col track-col--instrument">収録楽器</div>' +
      '<div class="track-col track-col--client">Client</div>' +
      '<div class="track-col track-col--controls">操作</div>' +
      "</div>";

    for (var i = 0; i < state.tracks.length; i++) {
      var t = state.tracks[i];
      if (t.status === "OK") done++;
      var opts = "";
      for (var j = 0; j < CONFIG.statusOptions.length; j++) {
        var o = CONFIG.statusOptions[j];
        opts += '<option value="' + escapeHtml(o.value) + '"' + (t.status === o.value ? " selected" : "") + '>' + escapeHtml(o.label) + '</option>';
      }
      if (t.status && !isKnownStatus(t.status)) {
        opts += '<option value="' + escapeHtml(t.status) + '" selected>' + escapeHtml(t.status) + '（シート）</option>';
      }

      var next = nextTaskForTrack(t);
      var nextHtml = next
        ? '<div class="track-next" title="' + escapeHtml(next.date + " " + next.label) + '">' +
          '<span class="track-next-date">' + formatDateJa(next.date) + "</span>" +
          '<span class="track-next-label">' + escapeHtml(next.label) + "</span></div>"
        : '<span class="track-next--empty">—</span>';

      var sched = findScheduleTrack(t.code);
      var instrument = t.fromSheet
        ? (t.instrument || "").trim()
        : (t.instrument || (sched && sched.instrument) || "").trim();
      var instrumentHtml = instrument
        ? '<span class="track-instrument" title="' + escapeHtml(instrument) + '">' + escapeHtml(instrument) + "</span>"
        : '<span class="track-instrument track-instrument--empty">—</span>';

      var rowClass = "track-row";
      if (t.status === "OK") rowClass += " is-ok";
      else if (isTrackStuck(t)) rowClass += " is-stuck";
      if (isClientOk(t.client)) rowClass += " has-client-ok";
      if (!trackMatchesStatusFilter(t)) rowClass += " is-filtered-out";

      html += '<div class="' + rowClass + '" data-id="' + t.id + '">' +
        '<div class="track-col track-col--code"><span class="track-code">' + escapeHtml(t.code) + "</span></div>" +
        '<div class="track-col track-col--v">' +
        '<select class="' + versionInputClassName(t.version) + '" data-id="' + t.id + '" data-field="version"' +
        ' aria-label="' + escapeHtml(t.code) + ' バージョン" title="B列 v（1–10）">' +
        buildVersionOptions(t.version) + "</select></div>" +
        '<div class="track-col track-col--title">' +
        '<button type="button" class="track-title-btn" data-open-detail="' + t.id + '" title="詳細を開く">' +
        '<p class="track-title">' + escapeHtml(t.title) + "</p></button></div>" +
        '<div class="track-col track-col--next">' + nextHtml + "</div>" +
        '<div class="track-col track-col--instrument">' + instrumentHtml + "</div>" +
        '<div class="track-col track-col--client">' +
        renderClientCheckbox(t, { label: "Client", className: "client-ok-check--row" }) +
        "</div>" +
        '<div class="track-col track-col--controls"><div class="track-controls">' +
        (t.reference && youtubeEmbedUrl(t.reference) ?
          '<button type="button" class="track-preview-btn" data-open-detail="' + t.id +
          '" title="参考曲を聴く">▶ 参考</button>' : '') +
        '<div class="track-progress-row">' +
        '<div class="progress-bar progress-bar--sm progress-bar--interactive" role="slider" tabindex="0"' +
        ' data-id="' + t.id + '" data-field="percent" aria-valuemin="0" aria-valuemax="100" aria-valuestep="5"' +
        ' aria-valuenow="' + t.percent + '" aria-label="' + escapeHtml(t.code) + ' 進捗%"' +
        ' style="--progress-thumb:' + t.percent + '%"' +
        ' title="クリック／ドラッグで進捗%を変更（5%刻み）">' +
        '<div class="progress-fill" style="width:' + t.percent + '%"></div></div>' +
        '<input type="number" class="percent-input" min="0" max="100" step="5" value="' + t.percent +
        '" data-id="' + t.id + '" data-field="percent" aria-label="' + escapeHtml(t.code) + ' 進捗%">' +
        '<span class="percent-suffix">%</span></div>' +
        '<div class="track-version-row">' +
        '<select class="track-status-select status-' + statusSlug(t.status) + '" data-id="' + t.id +
        '" data-field="status">' + opts + "</select>" +
        "</div></div></div></div>";
    }

    list.innerHTML = html;
    $("msheet-badge").textContent = "Msheet V2 · " + done + "/" + state.tracks.length + " · " + overallPercent() + "%";
    var addBtn = $("add-track-btn");
    if (addBtn) addBtn.hidden = state.tracks.length >= CONFIG.maxTracks;
    updateOverallUI();
  }

  function renderStatic() {
    var ghtml = "";
    for (var i = 0; i < CONFIG.guidelines.length; i++) {
      var g = CONFIG.guidelines[i];
      ghtml += '<article class="sticky-note sticky-note--' + g.accent + '"><h3 class="sticky-note-title">' + g.title +
        '</h3><p class="sticky-note-body">' + g.body + '</p></article>';
    }
    var guidelinesGrid = $("guidelines-grid");
    if (guidelinesGrid) guidelinesGrid.innerHTML = ghtml;

    var chtml = "";
    for (var ci = 0; ci < CONFIG.characters.length; ci++) {
      var c = CONFIG.characters[ci];
      chtml += '<li class="story-item"><strong>' + c.name + '</strong> <span class="text-muted">— ' + c.detail + '</span></li>';
    }
    var characterList = $("character-list");
    if (characterList) characterList.innerHTML = chtml;

    var shtml = "";
    for (var si = 0; si < CONFIG.scenes.length; si++) {
      var s = CONFIG.scenes[si];
      shtml += '<li class="story-item">' + s.title + (s.tag ? '<span class="scene-tag">（' + s.tag + '）</span>' : '') + '</li>';
    }
    var sceneList = $("scene-list");
    if (sceneList) sceneList.innerHTML = shtml;

    var thtml = "";
    for (var ti = 0; ti < CONFIG.team.length; ti++) {
      var tm = CONFIG.team[ti];
      thtml += '<li class="team-row"><span class="team-role">' + tm.role + '</span><span>' + tm.name + '</span>' +
        (tm.note ? '<span class="text-muted text-small">（' + tm.note + '）</span>' : '') + '</li>';
    }
    var teamList = $("team-list");
    if (teamList) teamList.innerHTML = thtml;
  }

  function findTrack(id) {
    for (var i = 0; i < state.tracks.length; i++) if (state.tracks[i].id === id) return state.tracks[i];
    return null;
  }

  function getTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function updateThemeToggleUI(theme) {
    var darkBtn = $("theme-dark-btn");
    var lightBtn = $("theme-light-btn");
    if (darkBtn) darkBtn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    if (lightBtn) lightBtn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
  }

  function setTheme(theme) {
    if (theme !== "light" && theme !== "dark") return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(CONFIG.themeStorageKey, theme);
    updateThemeToggleUI(theme);
    renderGantt();
    var iframe = $("main-schedule-board-iframe");
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: "setTheme", theme: theme }, "*");
    }
  }

  function initTheme() {
    var theme = getTheme();
    updateThemeToggleUI(theme);
    document.querySelectorAll(".theme-toggle-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var t = btn.getAttribute("data-theme");
        if (t) setTheme(t);
      });
    });
    
    var iframes = [
      $("main-schedule-board-iframe"),
      $("registry-schedule-board-iframe")
    ];
    iframes.forEach(function(iframe) {
      if (iframe) {
        iframe.addEventListener("load", function() {
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: "setTheme", theme: getTheme() }, "*");
          }
        });
      }
    });
  }

  function init() {
    initTheme();

    var msheetHint = document.querySelector(".dashboard-area-tracks .msheet-hint");
    if (msheetHint) {
      msheetHint.textContent = CONFIG.sheet.webAppUrl
        ? "曲名クリックで詳細 — v・ステータス・進捗%・client(OK) を Msheet へ書き戻し（5%刻み）。ステータス集計チップで絞り込み可。"
        : "曲名クリックで詳細 — 読み取り専用（webAppUrl 未設定時はローカルのみ保存）。ステータス集計チップで絞り込み可。";
    }

    applyProjectSheetSettings(getActiveProjectEntry());
    var openSchedule = $("open-schedule-link");
    if (openSchedule && CONFIG.scheduleSheet.editUrl) openSchedule.href = CONFIG.scheduleSheet.editUrl;

    var sheetSettingsBtn = $("sheet-settings-btn");
    if (sheetSettingsBtn) sheetSettingsBtn.addEventListener("click", openSheetSettingsDialog);
    var sheetSettingsClose = $("sheet-settings-close");
    if (sheetSettingsClose) sheetSettingsClose.addEventListener("click", closeSheetSettingsDialog);
    var sheetSettingsCancel = $("sheet-settings-cancel");
    if (sheetSettingsCancel) sheetSettingsCancel.addEventListener("click", closeSheetSettingsDialog);
    var sheetSettingsForm = $("sheet-settings-form");
    if (sheetSettingsForm) sheetSettingsForm.addEventListener("submit", saveSheetSettings);
    var sheetSettingsDialog = $("sheet-settings-dialog");
    if (sheetSettingsDialog) sheetSettingsDialog.addEventListener("click", function (e) { if (e.target === sheetSettingsDialog) closeSheetSettingsDialog(); });

    renderCountdown();
    renderGantt();
    renderStatic();
    updateFooterStatus();

    var btnEditDeadline = $("btn-edit-deadline");
    if (btnEditDeadline) {
      btnEditDeadline.addEventListener("click", function(e) {
        e.preventDefault();
        openDeadlineDialog();
      });
    }
    var closeDeadlineBtn = $("deadline-dialog-close");
    if (closeDeadlineBtn) closeDeadlineBtn.addEventListener("click", closeDeadlineDialog);
    var cancelDeadlineBtn = $("deadline-cancel-btn");
    if (cancelDeadlineBtn) cancelDeadlineBtn.addEventListener("click", closeDeadlineDialog);

    var formDeadline = $("deadline-form");
    if (formDeadline) {
      formDeadline.addEventListener("submit", function(e) {
        e.preventDefault();
        var dateVal = ($("deadline-input-date").value || "").trim();
        var bVal = ($("deadline-input-broadcast").value || "").trim();
        
        var activeEntry = getActiveProjectEntry();
        if (activeEntry) {
          activeEntry.deadline = dateVal;
          activeEntry.broadcastDate = bVal;
          activeEntry.updatedAt = new Date().toISOString();
          if (window.WorksDBRegistry && typeof window.WorksDBRegistry.save === "function") {
            window.WorksDBRegistry.save("締切日を更新しました");
            if (typeof window.WorksDBRegistry.sync === "function") window.WorksDBRegistry.sync(activeEntry).catch(function(){ showToast("管理シートへの締切同期は保留されました", "info"); });
          }
        }
        CONFIG.project.finalDeadline = dateVal;
        CONFIG.project.broadcastLabel = bVal;
        
        renderCountdown();
        closeDeadlineDialog();
      });
    }

    loadAllSheets();

    var statusSummary = document.querySelector(".status-summary");
    if (statusSummary) {
      statusSummary.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-status-filter]");
        if (!btn) return;
        var next = btn.getAttribute("data-status-filter");
        if (next === statusFilter && next !== "__all__") next = "__all__";
        setStatusFilter(next);
      });
    }

    $("track-list").addEventListener("click", function (e) {
      var openBtn = e.target.closest("[data-open-detail]");
      if (openBtn) {
        openTrackDetail(openBtn.getAttribute("data-open-detail"));
        return;
      }
      if (e.target.closest("input, select, button, a, .progress-bar--interactive")) return;
      var row = e.target.closest(".track-row");
      if (!row || !row.dataset.id) return;
      if (e.target.closest(".track-col--title, .track-col--code, .track-col--next, .track-col--instrument, .track-col--client")) {
        if (e.target.closest("input, label.client-ok-check")) return;
        openTrackDetail(row.dataset.id);
      }
    });

    var ganttWrap = $("gantt-wrap");
    if (ganttWrap) {
      ganttWrap.addEventListener("click", function (e) {
        var row = e.target.closest(".gantt-track-row");
        if (!row) return;
        var id = row.getAttribute("data-id");
        if (id) {
          openTrackDetail(id);
          return;
        }
        var byCode = findTrackByCode(row.getAttribute("data-code"));
        if (byCode) openTrackDetail(byCode.id);
      });
    }

    function onProgressBarPointerDown(e) {
      var bar = e.target.closest(".progress-bar--interactive");
      if (!bar || !bar.dataset.id) return;
      e.preventDefault();
      e.stopPropagation();
      beginProgressBarDrag(bar, e.clientX, e.pointerId);
      window.addEventListener("pointermove", onWindowProgressDragMove);
      window.addEventListener("pointerup", onWindowProgressDragEnd);
      window.addEventListener("pointercancel", onWindowProgressDragEnd);
    }

    function onWindowProgressDragMove(e) {
      if (!progressDrag) return;
      e.preventDefault();
      moveProgressBarDrag(e.clientX);
    }

    function onWindowProgressDragEnd(e) {
      if (!progressDrag) return;
      e.preventDefault();
      window.removeEventListener("pointermove", onWindowProgressDragMove);
      window.removeEventListener("pointerup", onWindowProgressDragEnd);
      window.removeEventListener("pointercancel", onWindowProgressDragEnd);
      endProgressBarDrag();
    }

    function onProgressBarPointerMove(e) {
      if (!progressDrag) return;
      e.preventDefault();
      moveProgressBarDrag(e.clientX);
    }

    function onProgressBarPointerUp(e) {
      if (!progressDrag) return;
      e.preventDefault();
      window.removeEventListener("pointermove", onWindowProgressDragMove);
      window.removeEventListener("pointerup", onWindowProgressDragEnd);
      window.removeEventListener("pointercancel", onWindowProgressDragEnd);
      endProgressBarDrag();
    }

    function onProgressBarKeydown(e) {
      var bar = e.target.closest(".progress-bar--interactive");
      if (!bar || !bar.dataset.id) return;
      var track = findTrack(bar.dataset.id);
      if (!track) return;
      var step = e.shiftKey ? 10 : 5;
      var next = track.percent;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") next = clampPercent(track.percent + step);
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = clampPercent(track.percent - step);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = 100;
      else return;
      e.preventDefault();
      applyTrackPercentChange(track, next, { skipRender: true });
      setProgressBarVisual(bar, next);
    }

    $("track-list").addEventListener("pointerdown", onProgressBarPointerDown);
    $("track-list").addEventListener("pointermove", onProgressBarPointerMove);
    $("track-list").addEventListener("pointerup", onProgressBarPointerUp);
    $("track-list").addEventListener("pointercancel", onProgressBarPointerUp);
    $("track-list").addEventListener("keydown", onProgressBarKeydown);

    $("track-list").addEventListener("change", function (e) {
      var el = e.target;
      var id = el.dataset.id;
      var field = el.dataset.field;
      if (!id || !field) return;
      var track = findTrack(id);
      if (!track) return;
      if (field === "status") {
        applyTrackStatusChange(track, el.value, el);
        return;
      }
      if (field === "percent") {
        applyTrackPercentChange(track, el.value);
        return;
      }
      if (field === "version") {
        applyTrackVersionChange(track, el.value, el);
        return;
      }
      if (field === "client") {
        applyTrackClientChange(track, !!el.checked);
      }
    });

    var detailOverlay = $("track-detail-overlay");
    if (detailOverlay) {
      detailOverlay.addEventListener("click", function (e) {
        if (e.target === detailOverlay) closeTrackDetail();
        var aiGen = e.target.closest("#detail-ai-generate-btn, #detail-ai-generate-btn-aside");
        if (aiGen) {
          e.preventDefault();
          runDetailAiGenerate(aiGen.getAttribute("data-id") || activeDetailTrackId);
          return;
        }
        var aiSave = e.target.closest("#detail-ai-save-sheet-btn");
        if (aiSave) {
          e.preventDefault();
          saveDetailAiSummaryToSheet(aiSave.getAttribute("data-id") || activeDetailTrackId);
          return;
        }
        if (e.target.closest("#detail-ai-key-btn")) {
          e.preventDefault();
          openAiKeyDialog();
        }
      });
      detailOverlay.addEventListener("change", function (e) {
        var el = e.target;
        var track = findTrack(el.dataset.id);
        if (!track) return;
        if (el.id === "detail-status-select" || el.dataset.field === "status") {
          applyTrackStatusChange(track, el.value, el);
          return;
        }
        if (el.id === "detail-version-input" || el.dataset.field === "version") {
          applyTrackVersionChange(track, el.value, el);
          return;
        }
        if (el.id === "detail-client-input" || el.dataset.field === "client") {
          applyTrackClientChange(track, !!el.checked);
        }
      });
      detailOverlay.addEventListener("pointerdown", onProgressBarPointerDown);
      detailOverlay.addEventListener("pointermove", onProgressBarPointerMove);
      detailOverlay.addEventListener("pointerup", onProgressBarPointerUp);
      detailOverlay.addEventListener("pointercancel", onProgressBarPointerUp);
      detailOverlay.addEventListener("keydown", function (e) {
        if (e.target.classList && e.target.classList.contains("progress-bar--interactive")) {
          onProgressBarKeydown(e);
        }
      });
    }

    var detailClose = $("track-detail-close");
    if (detailClose) detailClose.addEventListener("click", closeTrackDetail);

    var aiKeySettingsBtn = $("ai-key-settings-btn");
    if (aiKeySettingsBtn) {
      // 組み込みキーがあるときはヘッダーの AI設定を隠す（上書きが必要なときだけ表示）
      aiKeySettingsBtn.hidden = hasBuiltinGeminiKey();
      aiKeySettingsBtn.addEventListener("click", function () { openAiKeyDialog(); });
    }
    var aiKeyOverlay = $("ai-key-overlay");
    if (aiKeyOverlay) {
      aiKeyOverlay.addEventListener("click", function (e) {
        if (e.target === aiKeyOverlay) closeAiKeyDialog();
      });
    }
    var aiKeySave = $("ai-key-save-btn");
    if (aiKeySave) {
      aiKeySave.addEventListener("click", function () {
        var input = $("ai-key-input");
        var key = input ? input.value.trim() : "";
        if (!key) {
          showToast("APIキーを入力してください", "err");
          return;
        }
        if (!setGeminiApiKey(key)) {
          showToast("キーの保存に失敗しました（ストレージ制限）", "err");
          return;
        }
        var onSave = aiKeyOverlay && aiKeyOverlay._aiKeyOnSave;
        closeAiKeyDialog();
        showToast("Gemini APIキーをこのブラウザに保存しました", "ok");
        if (typeof onSave === "function") onSave();
        else if (activeDetailTrackId) {
          var t = findTrack(activeDetailTrackId);
          if (t) refreshTrackDetailBody(t);
        }
      });
    }
    var aiKeyCancel = $("ai-key-cancel-btn");
    if (aiKeyCancel) aiKeyCancel.addEventListener("click", closeAiKeyDialog);
    var aiKeyClear = $("ai-key-clear-btn");
    if (aiKeyClear) {
      aiKeyClear.addEventListener("click", function () {
        setGeminiApiKey("");
        var input = $("ai-key-input");
        if (input) input.value = "";
        showToast("APIキーを削除しました", "info");
        if (activeDetailTrackId) {
          var t = findTrack(activeDetailTrackId);
          if (t) refreshTrackDetailBody(t);
        }
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var keyOverlay = $("ai-key-overlay");
        if (keyOverlay && !keyOverlay.hidden) {
          closeAiKeyDialog();
          return;
        }
        if (activeDetailTrackId) closeTrackDetail();
      }
    });

    window.addEventListener("resize", function () {
      if (activeDetailTrackId) layoutTrackDetailScroll();
    });

    $("reload-sheet-btn").addEventListener("click", function () {
      loadAllSheets();
    });

    $("add-track-btn").addEventListener("click", function () {
      if (state.tracks.length >= CONFIG.maxTracks) return;
      var next = state.extraTrackCount + 1;
      var num = state.tracks.filter(function (t) { return t.fromSheet; }).length + next;
      state.tracks.push({
        id: "m" + num,
        code: "M" + num,
        title: "追加曲 " + num,
        brief: "（未設定）",
        productionMemo: "",
        version: "",
        status: "",
        percent: 0,
        fromSheet: false,
      });
      state.extraTrackCount = next;
      saveState();
      renderTracks();
    });

    setInterval(renderCountdown, 60000);
  }

  window.WorksDBDashboard = {
    renderNativeScheduleBoard: renderNativeScheduleBoard,
    setActiveProject: function (entry) {
      activeProjectEntry = entry || null;
      var activeEntry = getActiveProjectEntry();
      applyProjectSheetSettings(activeEntry);
      resetProjectRuntime(activeEntry);
      renderCountdown();
      if (CONFIG.sheet.id) loadAllSheets();
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
