(function () {
      "use strict";

      // --- CONFIG & STORAGE KEYS ---
      const CONFIG_KEY = "worksdb_master_config";
      const LOCAL_CACHE_KEY = "worksdb_unified_schedule_cache";
      const PENDING_EDITS_KEY = "worksdb_pending_edits";
      const REGISTRY_STORAGE_KEY = "worksdb-registry-v1";

      const DEFAULT_STATUSES = [
        { name: "作曲", color: "#ef4444" },
        { name: "アレンジ", color: "#22c55e" },
        { name: "REC", color: "#f472b6" },
        { name: "MIX", color: "#a855f7" },
        { name: "マスタリング", color: "#eab308" },
        { name: "浄書", color: "#f97316" },
        { name: "修正", color: "#ec4899" },
        { name: "打ち合わせ", color: "#3b82f6" }
      ];

      // SLEEK SVG ICON SVGS
      const SVG_ICONS = {
        sun: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
        moon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`,
        archive: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>`,
        restore: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>`,
        edit: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
        plus: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`
      };

      const $ = (id) => document.getElementById(id);

      // --- CONTRAST RATIO & COLOR AUTO-CORRECTION MATH ---
      function hexToRgb(hex) {
        if (!hex) return { r: 128, g: 128, b: 128 };
        hex = String(hex).replace(/^#/, '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const num = parseInt(hex, 16);
        if (isNaN(num)) return { r: 128, g: 128, b: 128 };
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
      }

      function rgbToHex(r, g, b) {
        const toHex = c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }

      function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
          h = s = 0;
        } else {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h /= 6;
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
      }

      function hslToRgb(h, s, l) {
        h /= 360; s /= 100; l /= 100;
        let r, g, b;
        if (s === 0) {
          r = g = b = l;
        } else {
          const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
          };
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          r = hue2rgb(p, q, h + 1/3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1/3);
        }
        return { r: r * 255, g: g * 255, b: b * 255 };
      }

      function getLuminance(r, g, b) {
        const a = [r, g, b].map(v => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
      }

      function getContrastRatio(hex1, hex2) {
        const rgb1 = hexToRgb(hex1);
        const rgb2 = hexToRgb(hex2);
        const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
        const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
        const l1 = Math.max(lum1, lum2);
        const l2 = Math.min(lum1, lum2);
        return (l1 + 0.05) / (l2 + 0.05);
      }

      function getReadableTextColor(statusHex, bgHex, minRatio = 4.5) {
        if (!statusHex) return statusHex;
        let ratio = getContrastRatio(statusHex, bgHex);
        if (ratio >= minRatio) return statusHex;

        const rgb = hexToRgb(statusHex);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        const bgRgb = hexToRgb(bgHex);
        const bgLum = getLuminance(bgRgb.r, bgRgb.g, bgRgb.b);

        const isDarkBg = (bgLum < 0.5);
        let step = isDarkBg ? 5 : -5;
        let currentL = hsl.l;

        for (let i = 0; i < 20; i++) {
          currentL += step;
          if (currentL > 98) { currentL = 98; break; }
          if (currentL < 2) { currentL = 2; break; }
          
          const newRgb = hslToRgb(hsl.h, hsl.s, currentL);
          const newHex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
          if (getContrastRatio(newHex, bgHex) >= minRatio) {
            return newHex;
          }
        }

        return isDarkBg ? "#f9fafb" : "#111827";
      }

      let state = {
        spreadsheetId: "",
        webAppUrl: "",
        daysToShow: 60,
        startDate: formatDateIso(new Date()),
        projects: [],
        schedule: {},
        statuses: DEFAULT_STATUSES,
        cellNotes: {},
        settings: {
          cellWidth: 76,
          cellHeight: 28,
          theme: "dark"
        }
      };

      let selectedProjectId = null;
      let viewOnlySelected = false;
      let searchQuery = "";
      
      // Selection & Drag State
      let selectedCells = new Set(); // "trackId|date"
      let lastFocusedCell = null; // { rowIndex, colIndex, trackId, date }
      let selectionAnchorCoords = null; // { rowIndex, colIndex }
      let isSelecting = false;
      let clipboardData = null; // Internal clipboard fallback { data: [[]], width, height }
      
      let undoStack = [];
      let redoStack = [];
      const UNDO_LIMIT = 30;

      let pendingEdits = [];
      let syncDebounceTimer = null;

      function parseDate(dateStr) {
        if (!dateStr) return new Date();
        const cleanStr = String(dateStr).replace(/\//g, "-");
        const parts = cleanStr.split("-").map(Number);
        if (parts.length === 3) {
          return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
        }
        return new Date();
      }

      function formatDateIso(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }

      function addDays(date, days) {
        const d = new Date(date.getTime());
        d.setDate(d.getDate() + days);
        return d;
      }

      function getWeekdays() {
        return ["日", "月", "火", "水", "木", "金", "土"];
      }

      function loadSettings() {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) {
          try {
            const data = JSON.parse(raw);
            state.spreadsheetId = data.spreadsheetId || "";
            state.webAppUrl = data.webAppUrl || "";
            state.settings.cellWidth = parseInt(data.cellWidth, 10) || 76;
            state.settings.cellHeight = parseInt(data.cellHeight, 10) || 28;
            
            let d = parseInt(data.daysToShow, 10);
            if (!d || d <= 30) d = 60; // Auto upgrade previous 30-day default to 60 days
            state.daysToShow = d;
            
            state.settings.theme = data.theme || "dark";
          } catch (e) {
            console.error("Failed to parse settings", e);
          }
        }
        saveSettings(); // Ensure 60-day upgrade is persisted to localStorage
        applyTheme(state.settings.theme);
        
        const cacheRaw = localStorage.getItem(LOCAL_CACHE_KEY);
        if (cacheRaw) {
          try {
            const cached = JSON.parse(cacheRaw);
            if (cached.projects) state.projects = cached.projects;
            if (cached.schedule) state.schedule = cached.schedule;
            if (cached.statuses) state.statuses = cached.statuses;
            if (cached.cellNotes) state.cellNotes = cached.cellNotes;
            if (cached.startDate) state.startDate = cached.startDate;
          } catch (e) {
            console.error("Failed to parse local cache", e);
          }
        }

        const pendingRaw = localStorage.getItem(PENDING_EDITS_KEY);
        if (pendingRaw) {
          try {
            pendingEdits = JSON.parse(pendingRaw) || [];
          } catch (e) {}
        }
      }

      function saveSettings() {
        const data = {
          spreadsheetId: state.spreadsheetId,
          webAppUrl: state.webAppUrl,
          cellWidth: state.settings.cellWidth,
          cellHeight: state.settings.cellHeight,
          daysToShow: state.daysToShow,
          theme: state.settings.theme
        };
        localStorage.setItem(CONFIG_KEY, JSON.stringify(data));
      }

      function saveLocalCache() {
        const cache = {
          projects: state.projects,
          schedule: state.schedule,
          statuses: state.statuses,
          cellNotes: state.cellNotes,
          startDate: state.startDate
        };
        localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
      }

      function savePendingEdits() {
        localStorage.setItem(PENDING_EDITS_KEY, JSON.stringify(pendingEdits));
      }

      function applyTheme(theme) {
        const iconEl = $("theme-btn-icon");
        const lblEl = $("theme-btn-label");
        if (theme === "light") {
          document.body.className = "theme-light";
          if (iconEl) iconEl.innerHTML = SVG_ICONS.sun;
          if (lblEl) lblEl.textContent = "ライト";
          state.settings.theme = "light";
        } else {
          document.body.className = "theme-dark";
          if (iconEl) iconEl.innerHTML = SVG_ICONS.moon;
          if (lblEl) lblEl.textContent = "ダーク";
          state.settings.theme = "dark";
        }
      }

      function toggleTheme() {
        const nextTheme = (state.settings.theme === "light") ? "dark" : "light";
        applyTheme(nextTheme);
        saveSettings();
        renderAll();
      }

      function pushUndo() {
        const snapshot = JSON.stringify({
          projects: state.projects,
          schedule: state.schedule,
          statuses: state.statuses,
          cellNotes: state.cellNotes,
          startDate: state.startDate
        });
        undoStack.push(snapshot);
        if (undoStack.length > UNDO_LIMIT) undoStack.shift();
        redoStack = [];
        updateUndoRedoButtons();
      }

      function undo() {
        if (undoStack.length === 0) return;
        const snapshot = undoStack.pop();
        
        const currentSnapshot = JSON.stringify({
          projects: state.projects,
          schedule: state.schedule,
          statuses: state.statuses,
          cellNotes: state.cellNotes,
          startDate: state.startDate
        });
        redoStack.push(currentSnapshot);

        const restored = JSON.parse(snapshot);
        state.projects = restored.projects;
        state.schedule = restored.schedule;
        state.statuses = restored.statuses;
        state.cellNotes = restored.cellNotes;
        state.startDate = restored.startDate;

        saveLocalCache();
        renderAll();
        updateUndoRedoButtons();
        syncGridStructure();
      }

      function redo() {
        if (redoStack.length === 0) return;
        const snapshot = redoStack.pop();
        
        const currentSnapshot = JSON.stringify({
          projects: state.projects,
          schedule: state.schedule,
          statuses: state.statuses,
          cellNotes: state.cellNotes,
          startDate: state.startDate
        });
        undoStack.push(currentSnapshot);

        const restored = JSON.parse(snapshot);
        state.projects = restored.projects;
        state.schedule = restored.schedule;
        state.statuses = restored.statuses;
        state.cellNotes = restored.cellNotes;
        state.startDate = restored.startDate;

        saveLocalCache();
        renderAll();
        updateUndoRedoButtons();
        syncGridStructure();
      }

      function updateUndoRedoButtons() {
        $("btn-undo").disabled = (undoStack.length === 0);
        $("btn-redo").disabled = (redoStack.length === 0);
      }

      // --- GAS API SYNC ---
      function setSyncStatus(status, text) {
        const led = $("sync-led");
        const lbl = $("sync-text");
        led.className = "led-dot " + status;
        lbl.textContent = text;
      }

      async function testConnectionHealth() {
        const url = $("fld-webapp-url").value.trim();
        if (!url) {
          alert("GAS Web App URLを入力してください。");
          return;
        }

        try {
          const res = await fetch(`${url}?action=ping`);
          const json = await res.json();
          if (json.ok) {
            alert("接続成功！Apps Script 差分同期サーバーは正常に稼働しています。");
          } else {
            alert("エラー: " + JSON.stringify(json));
          }
        } catch (e) {
          alert("接続失敗。ウェブアプリのデプロイ設定をご確認ください。\nエラー: " + e.message);
        }
      }

      async function fetchSpreadsheetData(isInitialLoad = true) {
        if (!state.webAppUrl || !state.spreadsheetId) {
          $("sheet-info-label").textContent = "スプレッドシート未連携";
          setSyncStatus("synced", "ローカル保存モード");
          return;
        }

        // If there are unsynced pending edits, push them first so they aren't lost
        if (pendingEdits.length > 0) {
          await pushPendingEdits();
        }

        $("grid-loading").classList.remove("hidden");
        setSyncStatus("saving", isInitialLoad ? "スプレッドシートから全件取得中..." : "差分読み込み中...");

        try {
          const endpoint = `${state.webAppUrl}?action=schedule&spreadsheetId=${encodeURIComponent(state.spreadsheetId)}`;
          const res = await fetch(endpoint);
          const json = await res.json();

          if (json.ok && json.grid) {
            parseSpreadsheetGrid(json.grid, json.statuses, json.projects, isInitialLoad);
            $("sheet-info-label").textContent = `接続中: ${json.sheetId ? json.sheetId.slice(0, 12) + "..." : state.spreadsheetId.slice(0, 12) + "..."}`;
            setSyncStatus("synced", isInitialLoad ? "全件同期完了" : "差分同期完了");
            saveLocalCache();
            renderAll();
          } else {
            setSyncStatus("error", "接続失敗 (設定確認)");
            $("sheet-info-label").textContent = "GAS応答エラー";
          }
        } catch (e) {
          console.error("Fetch error", e);
          setSyncStatus("error", "オフライン (待機中)");
          $("sheet-info-label").textContent = "接続エラー";
        } finally {
          $("grid-loading").classList.add("hidden");
        }
      }

      function parseSpreadsheetGrid(grid, statuses, projects, isInitialLoad = false) {
        if (!grid || grid.length === 0) return;

        const header = grid[0];
        const dateList = [];
        for (let c = 3; c < header.length; c++) {
          const rawD = String(header[c] || "").trim();
          if (rawD) dateList.push(rawD);
        }
        
        if (dateList.length > 0) {
          state.startDate = dateList[0];
          state.daysToShow = Math.max(state.daysToShow || 180, dateList.length);
        }
        
        if (statuses && statuses.length > 0) {
          state.statuses = statuses;
        }

        const projectMetadataMap = {};
        if (projects && projects.length > 0) {
          projects.forEach(p => {
            projectMetadataMap[p.name] = { id: p.id, color: p.color, archived: p.archived, order: p.order };
          });
        }
        
        const encounteredProj = {};
        const newSchedule = {};

        if (!isInitialLoad) {
          // Backup local projects and schedule only if NOT an initial full load
          const localProjectsBackup = JSON.parse(JSON.stringify(state.projects || []));
          const localScheduleBackup = JSON.parse(JSON.stringify(state.schedule || {}));
          
          localProjectsBackup.forEach(p => {
            encounteredProj[p.name] = {
              id: p.id,
              name: p.name,
              color: p.color || "#3b82f6",
              collapsed: !!p.collapsed,
              archived: !!p.archived,
              order: p.order || (Object.keys(encounteredProj).length + 1),
              tracks: [...p.tracks]
            };
          });

          Object.keys(localScheduleBackup).forEach(trackId => {
            newSchedule[trackId] = { ...localScheduleBackup[trackId] };
          });
        }
        
        for (let r = 1; r < grid.length; r++) {
          const row = grid[r];
          const projName = String(row[0] || "").trim();
          const trackName = String(row[1] || "").trim();
          const memo = String(row[2] || "").trim();
          
          if (!projName || !trackName) continue;
          
          let pMeta = projectMetadataMap[projName];
          if (!pMeta) {
            pMeta = {
              id: "proj_" + projName.replace(/\s+/g, "_"),
              color: "#3b82f6",
              archived: false,
              order: Object.keys(encounteredProj).length + 1
            };
          }
          
          if (!encounteredProj[projName]) {
            encounteredProj[projName] = {
              id: pMeta.id,
              name: projName,
              color: pMeta.color,
              collapsed: false,
              archived: pMeta.archived,
              order: pMeta.order,
              tracks: []
            };
          }
          
          const trackId = `${projName}||${trackName}`;
          if (!encounteredProj[projName].tracks.some(t => t.id === trackId)) {
            encounteredProj[projName].tracks.push({
              id: trackId,
              name: trackName,
              memo: memo
            });
          }
          
          if (!newSchedule[trackId]) newSchedule[trackId] = {};
          for (let c = 3; c < row.length; c++) {
            const rawDate = header[c];
            if (!rawDate) continue;
            const cleanDateStr = formatDateIso(parseDate(rawDate));
            const val = String(row[c] || "").trim();
            if (val || isInitialLoad) {
              newSchedule[trackId][cleanDateStr] = val;
            }
          }
        }
        
        // Layer any pending local edits on top
        if (pendingEdits.length > 0) {
          pendingEdits.forEach(edit => {
            const tId = `${edit.project}||${edit.track}`;
            if (!newSchedule[tId]) newSchedule[tId] = {};
            newSchedule[tId][edit.date] = edit.v;
          });
        }

        state.schedule = newSchedule;
        state.projects = Object.values(encounteredProj).sort((a, b) => a.order - b.order);
      }

      function queueCellEdit(trackId, dateStr, value) {
        const [project, track] = trackId.split("||");
        pendingEdits = pendingEdits.filter(e => !(e.project === project && e.track === track && e.date === dateStr));
        pendingEdits.push({
          project: project,
          track: track,
          date: dateStr,
          v: value
        });
        savePendingEdits();
        triggerSyncDebounce();
      }

      function triggerSyncDebounce() {
        setSyncStatus("saving", "差分保存待ち...");
        if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
        syncDebounceTimer = setTimeout(async () => {
          await pushPendingEdits();
        }, 1200);
      }

      async function pushPendingEdits() {
        if (!state.webAppUrl || !state.spreadsheetId || pendingEdits.length === 0) return;
        
        const editsToPush = [...pendingEdits];
        const payload = {
          action: "diff_sync",
          spreadsheetId: state.spreadsheetId,
          edits: editsToPush
        };
        
        setSyncStatus("saving", `差分同期中 (${editsToPush.length}件)...`);
        
        try {
          const res = await fetch(state.webAppUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
          });
          let json;
          try {
            json = await res.json();
          } catch (jsonErr) {
            console.warn("Non-JSON response from WebApp", jsonErr);
            setSyncStatus("error", "再試行待ち (Web App URL確認)");
            return;
          }
          
          if (json.ok) {
            // Remove pushed edits from pending array
            pendingEdits = pendingEdits.filter(pe => !editsToPush.some(ep => ep.project === pe.project && ep.track === pe.track && ep.date === pe.date));
            savePendingEdits();
            setSyncStatus("synced", "差分同期完了");
          } else {
            console.warn("Sync warning:", json);
            setSyncStatus("error", "再試行待ち (" + (json.error || "差分同期エラー") + ")");
          }
        } catch (e) {
          console.error("Push error", e);
          setSyncStatus("error", "オフライン (待機中)");
        }
      }

      async function syncGridStructure() {
        if (!state.webAppUrl || !state.spreadsheetId) return;
        
        const payload = {
          action: "diff_sync",
          spreadsheetId: state.spreadsheetId,
          statuses: state.statuses,
          projects: state.projects.map((p, idx) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            archived: p.archived,
            order: idx + 1
          }))
        };
        
        setSyncStatus("saving", "構造設定を同期中...");
        if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
        
        try {
          const res = await fetch(state.webAppUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (json.ok) {
            setSyncStatus("synced", "差分同期完了");
          } else {
            setSyncStatus("error", "構造同期失敗");
          }
        } catch (e) {
          console.error("Sync structure error", e);
          setSyncStatus("error", "オフライン (待機中)");
        }
      }

      function getSpreadsheetGridArray() {
        const header = ["Project", "Track", "Memo"];
        const dates = getDatesList();
        dates.forEach(d => header.push(formatDateIso(d)));
        
        const rows = [header];
        state.projects.forEach(project => {
          project.tracks.forEach(track => {
            const row = [project.name, track.name, track.memo || ""];
            dates.forEach(d => {
              const dateStr = formatDateIso(d);
              const val = (state.schedule[track.id] || {})[dateStr] || "";
              row.push(val);
            });
            rows.push(row);
          });
        });
        return rows;
      }

      // --- GRID SELECTION & DRAG ENGINE ---
      function cellKey(trackId, dateStr) {
        return `${trackId}|${dateStr}`;
      }

      function parseCellKey(key) {
        const lastIdx = key.lastIndexOf("|");
        if (lastIdx === -1) return { trackId: key, date: "" };
        const trackId = key.substring(0, lastIdx);
        const date = key.substring(lastIdx + 1);
        return { trackId, date };
      }

      function updateSelectionStyles() {
        document.querySelectorAll(".cell").forEach(cell => {
          const t = cell.dataset.trackId;
          const d = cell.dataset.date;
          const key = cellKey(t, d);
          if (selectedCells.has(key)) {
            cell.classList.add("selected");
          } else {
            cell.classList.remove("selected");
          }
        });
      }

      function getSelectedCellCoords() {
        const coords = [];
        const flatRows = getFlatRowsList();
        const dates = getDatesList();

        selectedCells.forEach(key => {
          const { trackId, date } = parseCellKey(key);
          let rowIndex = -1;
          let colIndex = -1;
          
          for (let r = 0; r < flatRows.length; r++) {
            if (flatRows[r].track.id === trackId) {
              rowIndex = r;
              break;
            }
          }
          for (let c = 0; c < dates.length; c++) {
            if (formatDateIso(dates[c]) === date) {
              colIndex = c;
              break;
            }
          }
          if (rowIndex !== -1 && colIndex !== -1) {
            coords.push({ trackId, date, rowIndex, colIndex });
          }
        });
        return coords;
      }

      function setSelectionRectangle(anchor, target) {
        const flatRows = getFlatRowsList();
        const dates = getDatesList();
        if (!flatRows.length || !dates.length) return;
        
        const minRow = Math.min(anchor.rowIndex, target.rowIndex);
        const maxRow = Math.max(anchor.rowIndex, target.rowIndex);
        const minCol = Math.min(anchor.colIndex, target.colIndex);
        const maxCol = Math.max(anchor.colIndex, target.colIndex);
        
        selectedCells.clear();
        for (let r = minRow; r <= maxRow; r++) {
          if (!flatRows[r]) continue;
          const track = flatRows[r].track;
          for (let c = minCol; c <= maxCol; c++) {
            if (!dates[c]) continue;
            const dateIso = formatDateIso(dates[c]);
            selectedCells.add(cellKey(track.id, dateIso));
          }
        }
        updateSelectionStyles();
      }

      // BATCH APPLY STATUS TO SELECTED CELLS
      function applyStatusToSelection(statusName) {
        let coords = getSelectedCellCoords();
        if (!coords.length && lastFocusedCell) coords = [lastFocusedCell];
        if (!coords.length) return;

        pushUndo();
        coords.forEach(c => {
          if (!state.schedule[c.trackId]) state.schedule[c.trackId] = {};
          state.schedule[c.trackId][c.date] = statusName;
          queueCellEdit(c.trackId, c.date, statusName);
        });

        saveLocalCache();
        renderGrid();
      }

      // --- ZERO-WARNING CLIPBOARD ENGINE (NO PERMISSION PROMPTS) ---
      function copySelectionToClipboard() {
        let coords = getSelectedCellCoords();
        if (!coords.length && lastFocusedCell) coords = [lastFocusedCell];
        if (!coords.length) return "";

        const rowIndices = coords.map(c => c.rowIndex);
        const colIndices = coords.map(c => c.colIndex);
        const minRow = Math.min(...rowIndices);
        const maxRow = Math.max(...rowIndices);
        const minCol = Math.min(...colIndices);
        const maxCol = Math.max(...colIndices);

        const h = maxRow - minRow + 1;
        const w = maxCol - minCol + 1;
        const matrix = Array.from({ length: h }, () => Array.from({ length: w }, () => ""));

        coords.forEach(c => {
          const rOffset = c.rowIndex - minRow;
          const cOffset = c.colIndex - minCol;
          const val = (state.schedule[c.trackId] || {})[c.date] || "";
          matrix[rOffset][cOffset] = val;
        });

        const tsvText = matrix.map(row => row.join("\t")).join("\n");
        clipboardData = { data: matrix, width: w, height: h, tsv: tsvText };
        return tsvText;
      }

      function pasteClipboardAtAnchor(rawTsvText) {
        if (!lastFocusedCell && getFlatRowsList().length > 0) {
          const firstRow = getFlatRowsList()[0];
          const firstDate = getDatesList()[0];
          lastFocusedCell = { rowIndex: 0, colIndex: 0, trackId: firstRow.track.id, date: formatDateIso(firstDate) };
        }
        if (!lastFocusedCell) return;

        let matrix = null;
        let width = 0;
        let height = 0;

        let tsvText = rawTsvText || "";

        if (tsvText) {
          const lines = tsvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
          if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
          matrix = lines.map(line => line.split("\t"));
          height = matrix.length;
          width = Math.max(...matrix.map(row => row.length));
        } else if (clipboardData) {
          matrix = clipboardData.data;
          width = clipboardData.width;
          height = clipboardData.height;
        }

        if (!matrix || !height || !width) return;

        const flatRows = getFlatRowsList();
        const dates = getDatesList();
        const anchor = lastFocusedCell;

        pushUndo();

        selectedCells.clear();
        for (let r = 0; r < height; r++) {
          const targetRowIdx = anchor.rowIndex + r;
          if (!flatRows[targetRowIdx]) continue;
          const trackId = flatRows[targetRowIdx].track.id;

          for (let c = 0; c < width; c++) {
            const targetColIdx = anchor.colIndex + c;
            if (!dates[targetColIdx]) continue;
            const dateStr = formatDateIso(dates[targetColIdx]);
            const val = (matrix[r][c] || "").trim();
            
            if (!state.schedule[trackId]) state.schedule[trackId] = {};
            state.schedule[trackId][dateStr] = val;
            queueCellEdit(trackId, dateStr, val);

            selectedCells.add(cellKey(trackId, dateStr));
          }
        }

        saveLocalCache();
        renderGrid();
        updateSelectionStyles();
      }

      function clearSelectedCells() {
        let coords = getSelectedCellCoords();
        if (!coords.length && lastFocusedCell) coords = [lastFocusedCell];
        if (!coords.length) return;

        pushUndo();
        coords.forEach(c => {
          if (state.schedule[c.trackId]) {
            state.schedule[c.trackId][c.date] = "";
            queueCellEdit(c.trackId, c.date, "");
          }
        });
        saveLocalCache();
        renderGrid();
      }

      // --- KEY NAVIGATION & SHORTCUTS ---
      function scrollCellIntoView(r, c) {
        const cellEl = document.querySelector(`.cell[data-row-index="${r}"][data-col-index="${c}"]`);
        if (!cellEl) return;
        const rightPane = $("gridRightPane");
        if (!rightPane) return;
        
        const cellRect = cellEl.getBoundingClientRect();
        const paneRect = rightPane.getBoundingClientRect();
        
        if (cellRect.left < paneRect.left) {
          rightPane.scrollLeft -= (paneRect.left - cellRect.left + 20);
        } else if (cellRect.right > paneRect.right) {
          rightPane.scrollLeft += (cellRect.right - paneRect.right + 20);
        }
        
        if (cellRect.top < paneRect.top + 32) {
          rightPane.scrollTop -= (paneRect.top + 32 - cellRect.top + 20);
        } else if (cellRect.bottom > paneRect.bottom) {
          rightPane.scrollTop += (cellRect.bottom - paneRect.bottom + 20);
        }
      }

      function handleKeyDown(ev) {
        const meta = ev.ctrlKey || ev.metaKey;
        const tag = ev.target.tagName;
        
        if (tag === "INPUT" || tag === "TEXTAREA" || ev.target.isContentEditable) {
          if (ev.key === "Escape") ev.target.blur();
          return;
        }

        if (meta && (ev.key === "z" || ev.key === "Z")) {
          ev.preventDefault();
          undo();
          return;
        }
        if (meta && (ev.key === "y" || ev.key === "Y")) {
          ev.preventDefault();
          redo();
          return;
        }

        if (ev.key === "Delete" || ev.key === "Backspace") {
          ev.preventDefault();
          clearSelectedCells();
          return;
        }

        // Direct Status Filling via Number Keys (1-9)
        if (!meta && ev.key >= "1" && ev.key <= "9") {
          const num = parseInt(ev.key, 10);
          if (num <= state.statuses.length) {
            ev.preventDefault();
            applyStatusToSelection(state.statuses[num - 1].name);
            return;
          }
        }

        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(ev.key)) {
          if (!lastFocusedCell) return;
          ev.preventDefault();
          
          let { rowIndex, colIndex } = lastFocusedCell;
          const flatRows = getFlatRowsList();
          const dates = getDatesList();
          
          if (ev.key === "ArrowUp") rowIndex = Math.max(0, rowIndex - 1);
          else if (ev.key === "ArrowDown") rowIndex = Math.min(flatRows.length - 1, rowIndex + 1);
          else if (ev.key === "ArrowLeft") colIndex = Math.max(0, colIndex - 1);
          else if (ev.key === "ArrowRight") colIndex = Math.min(dates.length - 1, colIndex + 1);
          else if (ev.key === "Tab") {
            if (ev.shiftKey) colIndex = Math.max(0, colIndex - 1);
            else colIndex = Math.min(dates.length - 1, colIndex + 1);
          }
          
          const track = flatRows[rowIndex].track;
          const dateIso = formatDateIso(dates[colIndex]);
          
          if (ev.shiftKey && selectionAnchorCoords) {
            setSelectionRectangle(selectionAnchorCoords, { rowIndex, colIndex });
          } else {
            selectedCells.clear();
            selectedCells.add(cellKey(track.id, dateIso));
            selectionAnchorCoords = { rowIndex, colIndex };
          }
          
          lastFocusedCell = { rowIndex, colIndex, trackId: track.id, date: dateIso };
          updateSelectionStyles();
          scrollCellIntoView(rowIndex, colIndex);
          return;
        }

        if (ev.key === "Enter") {
          ev.preventDefault();
          openStatusDialog();
        }
      }

      function openStatusDialog() {
        const list = $("status-dialog-list");
        list.innerHTML = "";
        const bgHex = (state.settings.theme === "light") ? "#ffffff" : "#121824";
        
        state.statuses.forEach(s => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn";
          
          const textColor = getReadableTextColor(s.color, bgHex, 4.5);
          btn.style.cssText = `justify-content: flex-start; gap: 8px; padding: 8px 12px; font-weight: 600; border-left: 4px solid ${s.color}; background: rgba(0,0,0,0.02); color: ${textColor};`;
          btn.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${s.color};"></span> ${escapeHtml(s.name)}`;
          
          btn.addEventListener("click", () => {
            applyStatusToSelection(s.name);
            closeDialog("dlg-status-selector");
          });
          list.appendChild(btn);
        });
        
        openDialog("dlg-status-selector");
      }

      // --- RENDERING ---
      function getDatesList() {
        const list = [];
        const start = parseDate(state.startDate);
        for (let i = 0; i < state.daysToShow; i++) {
          list.push(addDays(start, i));
        }
        return list;
      }

      function getFlatRowsList() {
        const rows = [];
        state.projects.forEach(project => {
          if (project.archived) return;
          if (viewOnlySelected && selectedProjectId && project.id !== selectedProjectId) return;
          
          project.tracks.forEach(track => {
            if (searchQuery && !track.name.toLowerCase().includes(searchQuery.toLowerCase())) return;
            rows.push({ project, track });
          });
        });
        return rows;
      }

      function notifyParentMilestones() {
        if (!window.parent || window.parent === window) return;
        
        const milestones = [];
        const todayStr = formatDateIso(new Date());

        state.projects.forEach(project => {
          project.tracks.forEach(track => {
            const sched = state.schedule[track.id] || {};
            Object.keys(sched).forEach(dateStr => {
              const val = String(sched[dateStr] || "").trim();
              if (val && dateStr >= todayStr) {
                milestones.push({
                  projectId: project.id,
                  projectName: project.name,
                  trackName: track.name,
                  date: dateStr,
                  label: (track.name === "EVT" || track.name === "イベント・共通") ? val : `${track.name}: ${val}`
                });
              }
            });
          });
        });

        milestones.sort((a, b) => (a.date < b.date ? -1 : (a.date > b.date ? 1 : 0)));

        try {
          window.parent.postMessage({
            type: "scheduleMilestones",
            milestones: milestones
          }, "*");
        } catch (e) {}
      }

      function renderAll() {
        applyGridCSSDimensions();
        renderProjectList();
        renderStatusSidebarList();
        renderGrid();
        notifyParentMilestones();
      }

      function applyGridCSSDimensions() {
        const root = document.documentElement;
        root.style.setProperty("--cell-width", state.settings.cellWidth + "px");
        root.style.setProperty("--cell-height", state.settings.cellHeight + "px");
        
        let fs = 0.72;
        if (state.settings.cellWidth < 65) fs = 0.65;
        if (state.settings.cellWidth < 45) fs = 0.58;
        root.style.setProperty("--cell-font-size", fs + "rem");
      }

      function renderProjectList() {
        const container = $("project-list-container");
        container.innerHTML = "";
        
        state.projects.forEach(proj => {
          const item = document.createElement("div");
          item.className = "project-item" + (selectedProjectId === proj.id ? " active" : "") + (proj.archived ? " archived" : "");
          item.innerHTML = `
            <div class="project-name" title="${proj.name}">
              <span class="project-color-dot" style="background-color: ${proj.color || "#3b82f6"};"></span>
              <span style="${proj.archived ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${escapeHtml(proj.name)}</span>
            </div>
            <div class="project-actions">
              <button type="button" class="btn-icon-sm btn-proj-up" data-id="${proj.id}">▲</button>
              <button type="button" class="btn-icon-sm btn-proj-down" data-id="${proj.id}">▼</button>
              <button type="button" class="btn-icon-sm btn-proj-archive" data-id="${proj.id}" title="${proj.archived ? '解除' : 'アーカイブ'}">
                ${proj.archived ? SVG_ICONS.restore : SVG_ICONS.archive}
              </button>
              <button type="button" class="btn-icon-sm btn-proj-edit" data-id="${proj.id}">
                ${SVG_ICONS.edit}
              </button>
              <button type="button" class="btn-icon-sm btn-proj-del" data-id="${proj.id}" style="color:var(--danger); font-weight:bold;">&times;</button>
            </div>
          `;
          
          item.addEventListener("click", (e) => {
            if (e.target.closest(".project-actions")) return;
            selectedProjectId = (selectedProjectId === proj.id) ? null : proj.id;
            renderProjectList();
            renderGrid();
          });
          container.appendChild(item);
        });
        
        container.querySelectorAll(".btn-proj-up").forEach(btn => btn.addEventListener("click", () => moveProjectIndex(btn.dataset.id, -1)));
        container.querySelectorAll(".btn-proj-down").forEach(btn => btn.addEventListener("click", () => moveProjectIndex(btn.dataset.id, 1)));
        container.querySelectorAll(".btn-proj-archive").forEach(btn => btn.addEventListener("click", () => toggleProjectArchive(btn.dataset.id)));
        container.querySelectorAll(".btn-proj-edit").forEach(btn => btn.addEventListener("click", () => openProjectEditDialog(btn.dataset.id)));
        container.querySelectorAll(".btn-proj-del").forEach(btn => btn.addEventListener("click", () => deleteProject(btn.dataset.id)));
      }

      function renderStatusSidebarList() {
        const container = $("status-sidebar-list");
        container.innerHTML = "";
        const bgHex = (state.settings.theme === "light") ? "#f8fafc" : "#151c2c";
        
        state.statuses.forEach(s => {
          const pill = document.createElement("div");
          pill.className = "status-sidebar-pill";
          pill.title = "クリックで選択中のセルに適用";
          
          const textColor = getReadableTextColor(s.color, bgHex, 4.5);
          pill.style.borderColor = s.color + "44";
          pill.style.color = textColor;

          pill.innerHTML = `
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background-color:${s.color};"></span>
            <span>${escapeHtml(s.name)}</span>
            <span class="status-del-btn" data-name="${escapeHtml(s.name)}" title="この項目を削除">&times;</span>
          `;
          
          pill.addEventListener("click", (e) => {
            if (e.target.classList.contains("status-del-btn")) return;
            applyStatusToSelection(s.name);
          });

          container.appendChild(pill);
        });

        container.querySelectorAll(".status-del-btn").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const name = btn.dataset.name;
            if (confirm(`予定項目「${name}」を削除しますか？`)) {
              pushUndo();
              state.statuses = state.statuses.filter(s => s.name !== name);
              saveLocalCache();
              renderAll();
              syncGridStructure();
            }
          });
        });
      }

      function renderGrid() {
        const leftBody = $("tbody-left");
        const rightHead = $("thead-right");
        const rightBody = $("tbody-right");
        
        leftBody.innerHTML = "";
        rightHead.innerHTML = "";
        rightBody.innerHTML = "";
        
        const dates = getDatesList();
        const flatRows = getFlatRowsList();
        const todayStr = formatDateIso(new Date());
        const cellBgHex = (state.settings.theme === "light") ? "#ffffff" : "#121824";

        let headRowHtml = "<tr>";
        dates.forEach(d => {
          const dateStr = formatDateIso(d);
          const isToday = (dateStr === todayStr);
          const dayOfWeek = d.getDay();
          const wdayClass = (dayOfWeek === 0) ? "wday-sun" : ((dayOfWeek === 6) ? "wday-sat" : "");
          const wdayNames = getWeekdays();
          
          headRowHtml += `
            <th class="date-header${isToday ? ' today' : ''}" data-date="${dateStr}">
              <span class="date-header-text">${d.getMonth() + 1}/${d.getDate()}</span>
              <span class="date-header-wday ${wdayClass}">${wdayNames[dayOfWeek]}</span>
            </th>
          `;
        });
        headRowHtml += "</tr>";
        rightHead.innerHTML = headRowHtml;

        let leftRowsHtml = "";
        let rightRowsHtml = "";
        
        const visibleProjectsMap = new Map();
        flatRows.forEach(row => {
          if (!visibleProjectsMap.has(row.project.id)) {
            visibleProjectsMap.set(row.project.id, { project: row.project, tracks: [] });
          }
          visibleProjectsMap.get(row.project.id).tracks.push(row.track);
        });
        
        let currentLocalRowIdx = 0;

        visibleProjectsMap.forEach((group) => {
          const project = group.project;
          const isCollapsed = !!project.collapsed;
          
          leftRowsHtml += `
            <tr class="project-group-row" data-project-id="${project.id}">
              <td class="row-header-cell">
                <div class="project-group-inner">
                  <span class="project-group-toggle">${isCollapsed ? "▶" : "▼"}</span>
                  <span class="project-color-dot" style="background-color: ${project.color || '#3b82f6'};"></span>
                  <span class="project-name" style="font-weight:700;">${escapeHtml(project.name)}</span>
                  <button type="button" class="btn-icon-sm btn-add-row-in-proj" data-proj-id="${project.id}" title="この案件に行を追加" style="margin-left:auto;">
                    ${SVG_ICONS.plus}
                  </button>
                </div>
              </td>
            </tr>
          `;
          
          rightRowsHtml += `
            <tr class="project-group-row" data-project-id="${project.id}">
              <td colspan="${dates.length}"></td>
            </tr>
          `;
          
          if (isCollapsed) return;

          group.tracks.forEach(track => {
            const sched = state.schedule[track.id] || {};
            const memoTitle = track.memo ? escapeHtml(track.memo) : "メモを追加...";
            
            leftRowsHtml += `
              <tr data-track-id="${track.id}">
                <td class="row-header-cell">
                  <div class="row-header-inner">
                    <span class="row-header-title" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</span>
                    <div style="display:flex; align-items:center; gap:3px;">
                      <button type="button" class="row-header-memo-btn" data-track-id="${track.id}" title="${memoTitle}">
                        ${SVG_ICONS.edit}
                      </button>
                      <button type="button" class="btn-icon-sm btn-track-up" data-proj-id="${project.id}" data-track-id="${track.id}">▲</button>
                      <button type="button" class="btn-icon-sm btn-track-down" data-proj-id="${project.id}" data-track-id="${track.id}">▼</button>
                      <button type="button" class="btn-icon-sm btn-track-del" data-track-id="${track.id}" style="color:var(--danger); font-weight:bold;">&times;</button>
                    </div>
                  </div>
                </td>
              </tr>
            `;
            
            let cellRowHtml = `<tr data-track-id="${track.id}">`;
            dates.forEach((d, colIndex) => {
              const dateStr = formatDateIso(d);
              const val = sched[dateStr] || "";
              const hasNote = state.cellNotes[cellKey(track.id, dateStr)];
              const isToday = (dateStr === todayStr);
              
              const statusCfg = state.statuses.find(s => s.name === val);
              let cellStyle = "";
              let labelColorStyle = "";

              if (statusCfg) {
                const rawColor = statusCfg.color || "#3b82f6";
                const readableColor = getReadableTextColor(rawColor, cellBgHex, 4.5);
                cellStyle = `background-color: ${readableColor}18; border-left: 3px solid ${rawColor};`;
                labelColorStyle = `color: ${readableColor};`;
              }
              
              cellRowHtml += `
                <td class="cell${isToday ? ' today' : ''}${hasNote ? ' has-note' : ''}" 
                    data-track-id="${track.id}" 
                    data-date="${dateStr}"
                    data-row-index="${currentLocalRowIdx}"
                    data-col-index="${colIndex}"
                    style="${cellStyle}"
                    title="${hasNote ? escapeHtml(hasNote) : ''}">
                  <div class="cell-inner">
                    <span class="cell-label" style="${labelColorStyle}">${escapeHtml(val)}</span>
                  </div>
                </td>
              `;
            });
            cellRowHtml += "</tr>";
            rightRowsHtml += cellRowHtml;
            
            currentLocalRowIdx++;
          });
        });

        leftRowsHtml += `
          <tr>
            <td class="row-header-cell" style="padding: 0 !important;">
              <button type="button" id="btn-add-row-table-bottom" class="add-row-table-btn">
                ${SVG_ICONS.plus} 新しい行（曲）を追加...
              </button>
            </td>
          </tr>
        `;
        rightRowsHtml += `
          <tr>
            <td colspan="${dates.length}" style="height: var(--cell-height); background: transparent;"></td>
          </tr>
        `;

        leftBody.innerHTML = leftRowsHtml;
        rightBody.innerHTML = rightRowsHtml;
        
        syncRowHeights();
        attachGridEvents();
        updateSelectionStyles();
      }

      function syncRowHeights() {
        const leftRows = document.querySelectorAll("#tbody-left tr");
        const rightRows = document.querySelectorAll("#tbody-right tr");
        const count = Math.min(leftRows.length, rightRows.length);
        
        for (let i = 0; i < count; i++) {
          leftRows[i].style.height = "auto";
          rightRows[i].style.height = "auto";
          
          const lh = leftRows[i].getBoundingClientRect().height;
          const rh = rightRows[i].getBoundingClientRect().height;
          const maxH = Math.max(lh, rh, state.settings.cellHeight);
          
          leftRows[i].style.height = maxH + "px";
          rightRows[i].style.height = maxH + "px";
        }
      }

      // --- GRID DRAG & CLICK EVENT ATTACHMENTS ---
      function attachGridEvents() {
        document.querySelectorAll(".project-group-row").forEach(row => {
          row.addEventListener("click", (e) => {
            if (e.target.closest(".btn-add-row-in-proj")) return;
            const pid = row.dataset.projectId;
            const proj = state.projects.find(p => p.id === pid);
            if (proj) {
              pushUndo();
              proj.collapsed = !proj.collapsed;
              saveLocalCache();
              renderGrid();
              syncGridStructure();
            }
          });
        });

        document.querySelectorAll(".btn-add-row-in-proj").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            openTrackAddDialog(btn.dataset.projId);
          });
        });

        const bottomAddBtn = $("btn-add-row-table-bottom");
        if (bottomAddBtn) {
          bottomAddBtn.addEventListener("click", () => openTrackAddDialog());
        }

        document.querySelectorAll(".cell").forEach(cell => {
          cell.addEventListener("mousedown", handleCellMouseDown);
          cell.addEventListener("mouseenter", handleCellMouseEnter);
          
          cell.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            openStatusDialog();
          });
        });

        document.querySelectorAll(".row-header-memo-btn").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            openTrackMemoDialog(btn.dataset.trackId);
          });
        });
        document.querySelectorAll(".btn-track-up").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            moveTrackIndex(btn.dataset.projId, btn.dataset.trackId, -1);
          });
        });
        document.querySelectorAll(".btn-track-down").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            moveTrackIndex(btn.dataset.projId, btn.dataset.trackId, 1);
          });
        });
        document.querySelectorAll(".btn-track-del").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteTrack(btn.dataset.trackId);
          });
        });
      }

      function handleCellMouseDown(ev) {
        if (ev.button !== 0) return;
        
        const cell = ev.currentTarget;
        const trackId = cell.dataset.trackId;
        const date = cell.dataset.date;
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        const colIndex = parseInt(cell.dataset.colIndex, 10);
        
        isSelecting = true;
        selectionAnchorCoords = { rowIndex, colIndex };
        
        const isMulti = ev.ctrlKey || ev.metaKey;
        const key = cellKey(trackId, date);

        if (isMulti) {
          if (selectedCells.has(key)) {
            selectedCells.delete(key);
          } else {
            selectedCells.add(key);
          }
        } else if (ev.shiftKey && lastFocusedCell) {
          setSelectionRectangle(lastFocusedCell, { rowIndex, colIndex });
        } else {
          selectedCells.clear();
          selectedCells.add(key);
        }

        lastFocusedCell = { rowIndex, colIndex, trackId, date };
        updateSelectionStyles();
      }

      function handleCellMouseEnter(ev) {
        if (!isSelecting || !selectionAnchorCoords) return;
        const cell = ev.currentTarget;
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        const colIndex = parseInt(cell.dataset.colIndex, 10);
        setSelectionRectangle(selectionAnchorCoords, { rowIndex, colIndex });
      }

      // --- PROJECT & TRACK CONFIGS ---
      function createProject(name, color) {
        if (!name) return;
        pushUndo();
        const id = "proj_" + Math.random().toString(36).slice(2, 9);
        state.projects.push({
          id: id,
          name: name,
          color: color || "#3b82f6",
          collapsed: false,
          archived: false,
          tracks: []
        });
        saveLocalCache();
        renderAll();
        syncGridStructure();
      }

      function updateProject(id, name, color) {
        pushUndo();
        const proj = state.projects.find(p => p.id === id);
        if (proj) {
          const oldName = proj.name;
          proj.name = name;
          proj.color = color;
          
          if (oldName !== name) {
            proj.tracks.forEach(track => {
              const oldId = track.id;
              const newId = `${name}||${track.name}`;
              track.id = newId;
              
              if (state.schedule[oldId]) {
                state.schedule[newId] = state.schedule[oldId];
                delete state.schedule[oldId];
              }
              Object.keys(state.cellNotes).forEach(key => {
                if (key.startsWith(oldId + "|")) {
                  const datePart = key.split("|")[1];
                  state.cellNotes[cellKey(newId, datePart)] = state.cellNotes[key];
                  delete state.cellNotes[key];
                }
              });
            });
          }
        }
        saveLocalCache();
        renderAll();
        syncGridStructure();
      }

      function deleteProject(id) {
        const proj = state.projects.find(p => p.id === id);
        if (!proj) return;
        if (!confirm(`案件「${proj.name}」を削除しますか？`)) return;
        
        pushUndo();
        proj.tracks.forEach(track => {
          delete state.schedule[track.id];
        });
        state.projects = state.projects.filter(p => p.id !== id);
        
        saveLocalCache();
        renderAll();
        syncGridStructure();
      }

      function toggleProjectArchive(id) {
        pushUndo();
        const proj = state.projects.find(p => p.id === id);
        if (proj) {
          proj.archived = !proj.archived;
          if (selectedProjectId === id) selectedProjectId = null;
        }
        saveLocalCache();
        renderAll();
        syncGridStructure();
      }

      function moveProjectIndex(id, delta) {
        const idx = state.projects.findIndex(p => p.id === id);
        if (idx === -1) return;
        const targetIdx = idx + delta;
        if (targetIdx < 0 || targetIdx >= state.projects.length) return;
        
        pushUndo();
        const [proj] = state.projects.splice(idx, 1);
        state.projects.splice(targetIdx, 0, proj);
        
        saveLocalCache();
        renderProjectList();
        renderGrid();
        syncGridStructure();
      }

      async function createTrack(projId, name, memo) {
        if (!name) return;
        const proj = state.projects.find(p => p.id === projId);
        if (!proj) return;
        
        pushUndo();
        const trackId = `${proj.name}||${name}`;
        proj.tracks.push({
          id: trackId,
          name: name,
          memo: memo || ""
        });
        state.schedule[trackId] = {};
        
        saveLocalCache();
        renderAll();
        
        if (state.webAppUrl && state.spreadsheetId) {
          setSyncStatus("saving", "差分行追加中...");
          try {
            await fetch(state.webAppUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                action: "add_track",
                spreadsheetId: state.spreadsheetId,
                project: proj.name,
                track: name,
                memo: memo || ""
              })
            });
            setSyncStatus("synced", "差分同期完了");
          } catch (e) {
            syncGridStructure();
          }
        }
      }

      function updateTrack(trackId, name, memo) {
        const [projName, oldName] = trackId.split("||");
        const proj = state.projects.find(p => p.name === projName);
        if (!proj) return;
        
        const track = proj.tracks.find(t => t.id === trackId);
        if (!track) return;

        pushUndo();
        track.memo = memo || "";
        
        if (oldName !== name) {
          const newId = `${projName}||${name}`;
          track.id = newId;
          track.name = name;
          
          if (state.schedule[trackId]) {
            state.schedule[newId] = state.schedule[trackId];
            delete state.schedule[trackId];
          }
          Object.keys(state.cellNotes).forEach(key => {
            if (key.startsWith(trackId + "|")) {
              const dt = key.split("|")[1];
              state.cellNotes[cellKey(newId, dt)] = state.cellNotes[key];
              delete state.cellNotes[key];
            }
          });
        }
        saveLocalCache();
        renderAll();
        syncGridStructure();
      }

      async function deleteTrack(trackId) {
        const [projName, name] = trackId.split("||");
        const proj = state.projects.find(p => p.name === projName);
        if (!proj) return;
        if (!confirm(`曲「${name}」を削除しますか？`)) return;
        
        pushUndo();
        proj.tracks = proj.tracks.filter(t => t.id !== trackId);
        delete state.schedule[trackId];
        
        saveLocalCache();
        renderAll();
        
        if (state.webAppUrl && state.spreadsheetId) {
          setSyncStatus("saving", "差分行削除中...");
          try {
            await fetch(state.webAppUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                action: "delete_track",
                spreadsheetId: state.spreadsheetId,
                project: projName,
                track: name
              })
            });
            setSyncStatus("synced", "差分同期完了");
          } catch (e) {
            syncGridStructure();
          }
        }
      }

      function moveTrackIndex(projId, trackId, delta) {
        const proj = state.projects.find(p => p.id === projId);
        if (!proj) return;
        
        const idx = proj.tracks.findIndex(t => t.id === trackId);
        if (idx === -1) return;
        const targetIdx = idx + delta;
        if (targetIdx < 0 || targetIdx >= proj.tracks.length) return;
        
        pushUndo();
        const [track] = proj.tracks.splice(idx, 1);
        proj.tracks.splice(targetIdx, 0, track);
        
        saveLocalCache();
        renderGrid();
        syncGridStructure();
      }

      // --- MODALS ---
      function openDialog(id) {
        $(id).classList.remove("hidden");
      }

      function closeDialog(id) {
        $(id).classList.add("hidden");
      }

      function openGridSettingsDialog() {
        $("cfg-cell-width").value = state.settings.cellWidth;
        $("cfg-cell-height").value = state.settings.cellHeight;
        $("cfg-days-to-show").value = state.daysToShow;
        openDialog("dlg-grid-settings");
      }

      function openWebappSettings() {
        $("fld-spreadsheet-id").value = state.spreadsheetId;
        $("fld-webapp-url").value = state.webAppUrl;
        openDialog("dlg-webapp");
      }

      function openProjectEditDialog(projId) {
        const proj = state.projects.find(p => p.id === projId);
        if (proj) {
          $("dlg-project-title").textContent = "案件設定の編集";
          $("fld-proj-id").value = proj.id;
          $("fld-proj-name").value = proj.name;
          $("fld-proj-color").value = proj.color || "#3b82f6";
        } else {
          $("dlg-project-title").textContent = "新しい案件の追加";
          $("fld-proj-id").value = "";
          $("fld-proj-name").value = "";
          $("fld-proj-color").value = "#3b82f6";
        }
        openDialog("dlg-project");
      }

      function openTrackAddDialog(defaultProjId) {
        if (!state.projects.length) {
          alert("先に案件を作成してください。");
          return;
        }

        const sel = $("fld-track-proj-select");
        sel.innerHTML = "";
        state.projects.forEach(p => {
          if (p.archived) return;
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name;
          if ((defaultProjId && p.id === defaultProjId) || (selectedProjectId && p.id === selectedProjectId)) {
            opt.selected = true;
          }
          sel.appendChild(opt);
        });

        $("dlg-track-title").textContent = "行（曲）の追加";
        $("fld-track-old-name").value = "";
        $("fld-track-name").value = "";
        $("fld-track-memo").value = "";
        $("fld-track-proj-select-group").style.display = "flex";
        openDialog("dlg-track");
      }

      function openTrackMemoDialog(trackId) {
        const [projName, name] = trackId.split("||");
        const proj = state.projects.find(p => p.name === projName);
        if (!proj) return;
        
        const track = proj.tracks.find(t => t.id === trackId);
        if (track) {
          $("dlg-track-title").textContent = "曲メモ・名称の編集";
          $("fld-track-old-name").value = track.id;
          $("fld-track-name").value = track.name;
          $("fld-track-memo").value = track.memo || "";
          $("fld-track-proj-select-group").style.display = "none";
        }
        openDialog("dlg-track");
      }

      function openCellNoteDialog(trackId, dateStr) {
        const [projName, name] = trackId.split("||");
        $("note-track-label").textContent = `${projName} > ${name}`;
        $("note-date-label").textContent = dateStr;
        $("fld-note-track-id").value = trackId;
        $("fld-note-date").value = dateStr;
        
        const key = cellKey(trackId, dateStr);
        $("fld-cell-note-text").value = state.cellNotes[key] || "";
        openDialog("dlg-cell-note");
      }

      function showContextMenu(x, y) {
        const menu = $("contextMenu");
        menu.classList.remove("hidden");
        const rect = menu.getBoundingClientRect();
        
        let left = x;
        let top = y;
        if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 6;
        if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 6;
        
        menu.style.left = left + "px";
        menu.style.top = top + "px";
      }

      function hideContextMenu() {
        $("contextMenu").classList.add("hidden");
      }

      // --- INITIALIZE BINDINGS & GLOBAL EVENT LISTENERS ---
      function initializeEvents() {
        $("btn-toggle-theme").addEventListener("click", toggleTheme);
        
        document.addEventListener("mouseup", () => { isSelecting = false; });
        document.addEventListener("mouseleave", () => { isSelecting = false; });
        document.addEventListener("keydown", handleKeyDown);

        // NATIVE COPY & PASTE EVENT (Sets/reads OS clipboard payload WITHOUT browser permission warning popups!)
        document.addEventListener("copy", (ev) => {
          const tag = ev.target.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || ev.target.isContentEditable) return;
          const tsvText = copySelectionToClipboard();
          if (tsvText !== null && tsvText !== undefined && ev.clipboardData) {
            ev.clipboardData.setData("text/plain", tsvText);
            ev.preventDefault();
          }
        });

        document.addEventListener("paste", (ev) => {
          const tag = ev.target.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || ev.target.isContentEditable) return;
          ev.preventDefault();
          // Extract text from native paste event payload synchronously
          const tsv = ev.clipboardData ? ev.clipboardData.getData("text/plain") : "";
          pasteClipboardAtAnchor(tsv);
        });

        const leftPane = $("gridLeftPane");
        const rightPane = $("gridRightPane");
        if (leftPane && rightPane) {
          rightPane.addEventListener("scroll", () => {
            if (leftPane.scrollTop !== rightPane.scrollTop) {
              leftPane.scrollTop = rightPane.scrollTop;
            }
          });
          leftPane.addEventListener("scroll", () => {
            if (rightPane.scrollTop !== leftPane.scrollTop) {
              leftPane.scrollTop = leftPane.scrollTop;
            }
          });
        }

        $("btn-jump-today").addEventListener("click", () => {
          const dates = getDatesList();
          const todayIso = formatDateIso(new Date());
          const colIdx = dates.findIndex(d => formatDateIso(d) === todayIso);
          if (colIdx !== -1) {
            const headerCell = document.querySelector(`.date-header[data-date="${todayIso}"]`);
            if (headerCell) {
              headerCell.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
            }
          }
        });

        $("btn-undo").addEventListener("click", undo);
        $("btn-redo").addEventListener("click", redo);
        $("btn-sync-now").addEventListener("click", fetchSpreadsheetData);
        $("sync-status-bar").addEventListener("click", openWebappSettings);
        
        $("btn-copy-gas").addEventListener("click", () => {
          $("txt-gas-code").value = getGasScriptTemplate();
          openDialog("dlg-gas-code");
        });
        
        $("btn-copy-gas-clipboard").addEventListener("click", () => {
          $("txt-gas-code").select();
          document.execCommand("copy");
          alert("Apps Scriptのコードをコピーしました！「更新」ボタン横の「GASコード」ダイアログに最新版が生成されます。");
          closeDialog("dlg-gas-code");
        });

        $("btn-add-row-top").addEventListener("click", () => openTrackAddDialog());
        $("btn-add-row-sidebar").addEventListener("click", () => openTrackAddDialog());
        $("btn-add-row-grid-head").addEventListener("click", () => openTrackAddDialog());

        $("btn-open-grid-settings").addEventListener("click", openGridSettingsDialog);
        
        $("btn-save-grid-settings").addEventListener("click", () => {
          let w = parseInt($("cfg-cell-width").value, 10);
          if (isNaN(w) || w < 40) w = 40; if (w > 150) w = 150;
          state.settings.cellWidth = w;
          
          let h = parseInt($("cfg-cell-height").value, 10);
          if (isNaN(h) || h < 20) h = 20; if (h > 60) h = 60;
          state.settings.cellHeight = h;
          
          let d = parseInt($("cfg-days-to-show").value, 10);
          if (isNaN(d) || d < 7) d = 7; if (d > 365) d = 365;
          state.daysToShow = d;
          
          saveSettings();
          closeDialog("dlg-grid-settings");
          renderAll();
          syncGridStructure();
        });

        $("btn-clear-status-dialog").addEventListener("click", () => {
          applyStatusToSelection("");
          closeDialog("dlg-status-selector");
        });

        $("btn-filter-all").addEventListener("click", () => {
          viewOnlySelected = false;
          $("btn-filter-all").classList.add("active");
          $("btn-filter-selected").classList.remove("active");
          renderGrid();
        });

        $("btn-filter-selected").addEventListener("click", () => {
          viewOnlySelected = true;
          $("btn-filter-selected").classList.add("active");
          $("btn-filter-all").classList.remove("active");
          renderGrid();
        });

        $("search-tracks-input").addEventListener("input", (e) => {
          searchQuery = e.target.value;
          renderGrid();
        });

        document.querySelectorAll(".btn-close-dialog").forEach(btn => {
          btn.addEventListener("click", () => {
            const overlay = btn.closest(".overlay");
            if (overlay) overlay.classList.add("hidden");
          });
        });

        $("btn-open-webapp-settings").addEventListener("click", openWebappSettings);
        $("btn-test-health").addEventListener("click", testConnectionHealth);
        
        $("btn-save-webapp").addEventListener("click", () => {
          state.spreadsheetId = $("fld-spreadsheet-id").value.trim();
          state.webAppUrl = $("fld-webapp-url").value.trim();
          saveSettings();
          closeDialog("dlg-webapp");
          fetchSpreadsheetData();
        });

        $("btn-add-project").addEventListener("click", () => openProjectEditDialog(""));
        
        $("btn-save-project").addEventListener("click", () => {
          const id = $("fld-proj-id").value;
          const name = $("fld-proj-name").value.trim();
          const color = $("fld-proj-color").value;
          
          if (!name) {
            alert("案件名を入力してください。");
            return;
          }
          
          if (id) {
            updateProject(id, name, color);
          } else {
            createProject(name, color);
          }
          closeDialog("dlg-project");
        });

        $("btn-save-track").addEventListener("click", () => {
          const oldId = $("fld-track-old-name").value;
          const name = $("fld-track-name").value.trim();
          const memo = $("fld-track-memo").value.trim();
          
          if (!name) {
            alert("曲名を入力してください。");
            return;
          }
          
          if (oldId) {
            updateTrack(oldId, name, memo);
          } else {
            const projId = $("fld-track-proj-select").value;
            createTrack(projId, name, memo);
          }
          closeDialog("dlg-track");
        });

        $("btn-save-cell-note").addEventListener("click", () => {
          const trackId = $("fld-note-track-id").value;
          const date = $("fld-note-date").value;
          const text = $("fld-cell-note-text").value.trim();
          
          pushUndo();
          const key = cellKey(trackId, date);
          if (text) {
            state.cellNotes[key] = text;
          } else {
            delete state.cellNotes[key];
          }
          
          saveLocalCache();
          closeDialog("dlg-cell-note");
          renderGrid();
          syncGridStructure();
        });

        $("btn-add-status-quick").addEventListener("click", () => {
          const name = $("input-new-status-name").value.trim();
          const color = $("input-new-status-color").value;
          
          if (!name) {
            alert("項目名を入力してください。");
            return;
          }
          
          if (state.statuses.some(s => s.name === name)) {
            alert("項目名は既に登録されています。");
            return;
          }

          pushUndo();
          state.statuses.push({ name, color });
          $("input-new-status-name").value = "";
          
          saveLocalCache();
          renderAll();
          syncGridStructure();
        });

        document.addEventListener("contextmenu", (ev) => {
          const cell = ev.target.closest(".cell");
          if (!cell) {
            hideContextMenu();
            return;
          }
          ev.preventDefault();
          
          const trackId = cell.dataset.trackId;
          const date = cell.dataset.date;
          const rowIndex = parseInt(cell.dataset.rowIndex, 10);
          const colIndex = parseInt(cell.dataset.colIndex, 10);
          
          lastFocusedCell = { rowIndex, colIndex, trackId, date };
          if (!selectedCells.has(cellKey(trackId, date))) {
            selectedCells.clear();
            selectedCells.add(cellKey(trackId, date));
            updateSelectionStyles();
          }
          
          showContextMenu(ev.clientX, ev.clientY);
        });

        document.addEventListener("mousedown", (ev) => {
          if (!ev.target.closest("#contextMenu")) {
            hideContextMenu();
          }
        });

        document.querySelectorAll("#contextMenu .context-menu-item").forEach(item => {
          item.addEventListener("click", () => {
            const action = item.dataset.action;
            if (action === "status-select") {
              openStatusDialog();
            } else if (action === "add-row") {
              const currentTrackId = lastFocusedCell ? lastFocusedCell.trackId : null;
              let defaultProjId = null;
              if (currentTrackId) {
                const projName = currentTrackId.split("||")[0];
                const p = state.projects.find(proj => proj.name === projName);
                if (p) defaultProjId = p.id;
              }
              openTrackAddDialog(defaultProjId);
            } else if (action === "copy") {
              const tsvText = copySelectionToClipboard();
              try { document.execCommand("copy"); } catch (e) {}
            } else if (action === "paste") {
              pasteClipboardAtAnchor();
            } else if (action === "clear") {
              clearSelectedCells();
            } else if (action === "note") {
              if (lastFocusedCell) openCellNoteDialog(lastFocusedCell.trackId, lastFocusedCell.date);
            }
            hideContextMenu();
          });
        });
      }

      function escapeHtml(str) {
        if (!str) return "";
        return String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      function resolveProjectReference(reference) {
        let project = state.projects.find(item => item.name === reference || item.id === reference);
        if (project || !reference) return project || null;
        try {
          const saved = JSON.parse(localStorage.getItem(REGISTRY_STORAGE_KEY));
          const entry = saved && Array.isArray(saved.entries) ? saved.entries.find(item => item && item.id === reference) : null;
          if (entry) project = state.projects.find(item => item.name === entry.name || item.id === entry.id);
        } catch (e) {}
        return project || null;
      }
      // --- Apps Script Template Generator ---
      function getGasScriptTemplate() {
        return `var CONFIG = {
  scheduleSheetName: "スケジュール_データ",
  statusSheetName: "設定_ステータス",
  projectSheetName: "設定_案件",
  trackSheetName: "進捗管理"
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("WorksDB")
    .addItem("初期レイアウトを作成/再生成", "setupWorksDB")
    .addItem("接続情報を表示", "showWorksDBInfo_")
    .addToUi();
}

function showWorksDBInfo_() {
  var url = ScriptApp.getService().getUrl() || "未デプロイ";
  SpreadsheetApp.getUi().alert(
    "WorksDB 接続情報",
    "WebアプリURL:\\n" + url + "\\n\\n" +
      "メインDBシート: " + CONFIG.scheduleSheetName + "\\n" +
      "ステータス設定: " + CONFIG.statusSheetName + "\\n" +
      "案件設定: " + CONFIG.projectSheetName + "\\n" +
      "Engine: WorksDB Normalized Record Database",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function setupWorksDB() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    "WorksDB 一括スケジュール管理セットアップ",
    "「スケジュール_データ」シート、「設定_ステータス」シート、「設定_案件」シートを初期化または再作成します。続行しますか？",
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var recordSheet = setupNormalizedRecordsSheet_(ss);
    var statusSheet = setupStatusSheet_(ss);
    var projectSheet = setupProjectSheet_(ss);
    
    SpreadsheetApp.flush();
    ui.alert(
      "セットアップ完了",
      "「スケジュール_データ」シートを中心にセットアップが完了しました。",
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert("セットアップエラー", String(err.message || err), ui.ButtonSet.OK);
    throw err;
  }
}

function setupNormalizedRecordsSheet_(ss) {
  var name = CONFIG.scheduleSheetName;
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  var headers = ["案件名", "曲名・項目", "日付(YYYY-MM-DD)", "工程・ステータス", "メモ", "更新日時"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground("#10243d").setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  return sheet;
}

function setupStatusSheet_(ss) {
  var name = CONFIG.statusSheetName;
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  var headers = ["工程名", "カラーHEX"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground("#10243d").setFontColor("#ffffff");
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
  return sheet;
}

function setupProjectSheet_(ss) {
  var name = CONFIG.projectSheetName;
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  var headers = ["案件ID", "案件名", "カラーHEX", "アーカイブ", "表示順"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground("#10243d").setFontColor("#ffffff");
  sheet.getRange("D2:D100").setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  return sheet;
}

function normalizeDateStr_(d) {
  if (!d) return "";
  if (d instanceof Date) {
    var y = d.getFullYear();
    var m = ("0" + (d.getMonth() + 1)).slice(-2);
    var day = ("0" + d.getDate()).slice(-2);
    return y + "-" + m + "-" + day;
  }
  var str = String(d).trim().split("/").join("-");
  var parts = str.split("-");
  if (parts.length === 3) {
    var y = parts[0];
    var m = ("0" + parts[1]).slice(-2);
    var day = ("0" + parts[2]).slice(-2);
    return y + "-" + m + "-" + day;
  }
  return str;
}

function doGet(e) {
  return handleRequest_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  var params = {};
  try {
    if (e && e.postData && e.postData.contents) params = JSON.parse(e.postData.contents);
  } catch (err) {}
  return handleRequest_(params);
}

function handleRequest_(params) {
  var action = String(params.action || "read").toLowerCase();
  try {
    if (action === "ping") return jsonResponse_({ ok: true });
    if (action === "schedule" || action === "read") return jsonResponse_(readUnifiedScheduleGrid_());
    if (action === "write_schedule" || action === "diff_sync") return jsonResponse_(writeDifferentialUpdates_(params));
    if (action === "add_track") return jsonResponse_(addTrackRow_(params));
    if (action === "delete_track") return jsonResponse_(deleteTrackRow_(params));
    if (action === "write_track_field") return jsonResponse_(writeTrackField_(params));
    throw new Error("Unknown action: " + action);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

function readUnifiedScheduleGrid_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var recSheet = ss.getSheetByName(CONFIG.scheduleSheetName) || ss.getSheetByName("スケジュール_データ");
  
  if (!recSheet) {
    var legacySheet = ss.getSheetByName("スケジュール");
    if (legacySheet) {
      return { ok: true, grid: legacySheet.getDataRange().getDisplayValues(), statuses: readStatuses_(ss), projects: readProjects_(ss) };
    }
    return { ok: true, grid: [], statuses: readStatuses_(ss), projects: readProjects_(ss) };
  }
  
  var records = recSheet.getDataRange().getDisplayValues();
  var grid = buildGridFromRecordTable_(records);
  return { ok: true, grid: grid, statuses: readStatuses_(ss), projects: readProjects_(ss) };
}

function buildGridFromRecordTable_(records) {
  if (!records || records.length <= 1) {
    return [["Project", "Track", "Memo"]];
  }

  var datesSet = {};
  var trackMap = {};
  var trackOrder = [];

  for (var r = 1; r < records.length; r++) {
    var proj = String(records[r][0] || "").trim();
    var track = String(records[r][1] || "").trim();
    var dateStr = normalizeDateStr_(records[r][2]);
    var status = String(records[r][3] || "").trim();
    var memo = String(records[r][4] || "").trim();

    if (!proj || !track) continue;

    var key = proj + "||" + track;
    if (!trackMap[key]) {
      trackMap[key] = { proj: proj, track: track, memo: memo, tasks: {} };
      trackOrder.push(key);
    }
    if (memo && !trackMap[key].memo) trackMap[key].memo = memo;

    if (dateStr) {
      datesSet[dateStr] = true;
      if (status) trackMap[key].tasks[dateStr] = status;
    }
  }

  var dates = Object.keys(datesSet).sort();
  var header = ["Project", "Track", "Memo"].concat(dates);
  var grid = [header];

  for (var i = 0; i < trackOrder.length; i++) {
    var tKey = trackOrder[i];
    var item = trackMap[tKey];
    var row = [item.proj, item.track, item.memo];
    for (var d = 0; d < dates.length; d++) {
      var dIso = dates[d];
      row.push(item.tasks[dIso] || "");
    }
    grid.push(row);
  }

  return grid;
}

function readStatuses_(ss) {
  var statusSheet = ss.getSheetByName(CONFIG.statusSheetName);
  var statuses = [];
  if (statusSheet) {
    var vals = statusSheet.getDataRange().getDisplayValues();
    for (var r = 1; r < vals.length; r++) {
      if (vals[r][0]) statuses.push({ name: vals[r][0], color: vals[r][1] || "#3b82f6" });
    }
  }
  return statuses;
}

function readProjects_(ss) {
  var projSheet = ss.getSheetByName(CONFIG.projectSheetName);
  var projects = [];
  if (projSheet) {
    var vals = projSheet.getDataRange().getDisplayValues();
    for (var r = 1; r < vals.length; r++) {
      if (vals[r][1]) {
        projects.push({
          id: vals[r][0] || "proj_" + r,
          name: vals[r][1],
          color: vals[r][2] || "#3b82f6",
          archived: String(vals[r][3]).toUpperCase() === "TRUE",
          order: parseInt(vals[r][4], 10) || r
        });
      }
    }
  }
  return projects;
}

function writeDifferentialUpdates_(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = { ok: true, updates: {} };
  
  var recSheet = ss.getSheetByName(CONFIG.scheduleSheetName) || ss.getSheetByName("スケジュール_データ");
  if (!recSheet) {
    recSheet = setupNormalizedRecordsSheet_(ss);
  }

  if (params.edits && params.edits.length > 0) {
    var updatedCellsCount = 0;
    var recValues = recSheet.getDataRange().getDisplayValues();

    for (var i = 0; i < params.edits.length; i++) {
      var edit = params.edits[i];
      if (edit.project && edit.track && edit.date) {
        var normEditDate = normalizeDateStr_(edit.date);
        var proj = edit.project;
        var track = edit.track;
        var val = edit.v || "";

        var foundRow = -1;
        for (var r = 1; r < recValues.length; r++) {
          if (recValues[r][0] === proj && recValues[r][1] === track && normalizeDateStr_(recValues[r][2]) === normEditDate) {
            foundRow = r + 1;
            break;
          }
        }

        if (val) {
          if (foundRow > 0) {
            recSheet.getRange(foundRow, 4).setValue(val);
            recSheet.getRange(foundRow, 6).setValue(new Date());
          } else {
            recSheet.appendRow([proj, track, normEditDate, val, "", new Date()]);
            recValues = recSheet.getDataRange().getDisplayValues();
          }
        } else {
          if (foundRow > 0) {
            recSheet.deleteRow(foundRow);
            recValues = recSheet.getDataRange().getDisplayValues();
          }
        }
        updatedCellsCount++;
      }
    }
    result.updates.editsCount = updatedCellsCount;
  }

  if (params.statuses) {
    var statusSheet = ss.getSheetByName(CONFIG.statusSheetName);
    if (statusSheet) {
      statusSheet.clear();
      var headers = ["工程名", "カラーHEX"];
      statusSheet.getRange(1, 1, 1, 2).setValues([headers]).setBackground("#10243d").setFontColor("#ffffff");
      var vals = [];
      for (var i = 0; i < params.statuses.length; i++) {
        if (params.statuses[i].name) vals.push([params.statuses[i].name, params.statuses[i].color]);
      }
      if (vals.length) statusSheet.getRange(2, 1, vals.length, 2).setValues(vals);
    }
  }

  if (params.projects) {
    var projSheet = ss.getSheetByName(CONFIG.projectSheetName);
    if (projSheet) {
      projSheet.clear();
      var headers = ["案件ID", "案件名", "カラーHEX", "アーカイブ", "表示順"];
      projSheet.getRange(1, 1, 1, 5).setValues([headers]).setBackground("#10243d").setFontColor("#ffffff");
      var vals = [];
      for (var i = 0; i < params.projects.length; i++) {
        var p = params.projects[i];
        vals.push([p.id, p.name, p.color, p.archived ? "TRUE" : "FALSE", p.order]);
      }
      if (vals.length) {
        projSheet.getRange(2, 1, vals.length, 5).setValues(vals);
        projSheet.getRange(2, 4, vals.length, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      }
    }
  }
  
  SpreadsheetApp.flush();
  return result;
}



function addTrackRow_(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.scheduleSheetName);
  if (!sheet) throw new Error("Schedule sheet not found");
  
  var projName = params.project;
  var trackName = params.track;
  var memo = params.memo || "";
  
  var lastCol = sheet.getLastColumn();
  var newRow = [projName, trackName, memo];
  for (var c = 4; c <= lastCol; c++) newRow.push("");
  sheet.appendRow(newRow);
  SpreadsheetApp.flush();
  return { ok: true, action: "add_track" };
}

function deleteTrackRow_(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.scheduleSheetName);
  if (!sheet) throw new Error("Schedule sheet not found");
  
  var projName = params.project;
  var trackName = params.track;
  var values = sheet.getDataRange().getDisplayValues();
  for (var r = 1; r < values.length; r++) {
    if (values[r][0] === projName && values[r][1] === trackName) {
      sheet.deleteRow(r + 1);
      SpreadsheetApp.flush();
      return { ok: true, action: "delete_track" };
    }
  }
  return { ok: false, error: "Track not found" };
}

function writeTrackField_(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.trackSheetName || "進捗管理");
  if (!sheet) throw new Error("Track sheet not found");
  
  var code = params.code;
  var field = params.field;
  var value = params.value;
  
  var colMap = { version: 2, status: 9, percent: 10, client: 11, overallSummary: 12 };
  var colIdx = colMap[field];
  if (!colIdx) throw new Error("Invalid field: " + field);
  
  var values = sheet.getDataRange().getDisplayValues();
  for (var r = 1; r < values.length; r++) {
    if (values[r][0] === code) {
      sheet.getRange(r + 1, colIdx).setValue(value);
      SpreadsheetApp.flush();
      return { ok: true, code: code, field: field, value: value };
    }
  }
  return { ok: false, error: "Track code not found" };
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}`;
      }

      window.addEventListener("DOMContentLoaded", () => {
        loadSettings();
        
        // Parse URL query parameter for project filtering (?project=...)
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const projParam = urlParams.get("project") || urlParams.get("projName");
          if (projParam) {
            const p = resolveProjectReference(projParam);
            if (p) {
              selectedProjectId = p.id;
              viewOnlySelected = true;
              const btnAll = $("btn-filter-all");
              const btnSel = $("btn-filter-selected");
              if (btnAll && btnSel) {
                btnSel.classList.add("active");
                btnAll.classList.remove("active");
              }
            }
          }
        } catch(e) {}

        initializeEvents();
        renderAll();
        
        if (state.spreadsheetId && state.webAppUrl) {
          fetchSpreadsheetData();
        } else {
          setSyncStatus("synced", "ローカル保存モード");
        }
      });

      // PostMessage API listener for iframe integration
      window.addEventListener("message", (ev) => {
        if (!ev.data) return;
        if (ev.data.type === "filterProject") {
          const projName = ev.data.project;
          if (projName) {
            const p = resolveProjectReference(projName);
            if (p) {
              selectedProjectId = p.id;
              viewOnlySelected = true;
            } else {
              selectedProjectId = null;
              viewOnlySelected = false;
            }
          } else {
            selectedProjectId = null;
            viewOnlySelected = false;
          }
          const btnAll = $("btn-filter-all");
          const btnSel = $("btn-filter-selected");
          if (btnAll && btnSel) {
            if (viewOnlySelected) {
              btnSel.classList.add("active");
              btnAll.classList.remove("active");
            } else {
              btnAll.classList.add("active");
              btnSel.classList.remove("active");
            }
          }
          renderGrid();
          renderProjectList();
        }
      });

    })();
