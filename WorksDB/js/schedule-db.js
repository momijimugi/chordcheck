(function () {
      "use strict";

      // --- CONFIG & CONSTANTS ---
      const PROJECT_STORAGE_KEY = "worksdb-schedule-projects";
      const REGISTRY_STORAGE_KEY = "worksdb-registry-v1";
      const THEME_STORAGE_KEY = "worksdb-schedule-theme";
      const SELECTED_PROJECT_KEY = "worksdb-schedule-selected-id";

      // Typical task labels and their background / foreground styles in light/dark
      const TASK_PALETTE = {
        "START": { darkBg: "#4a3c1c", darkFg: "#ffe599", lightBg: "#fff2cc", lightFg: "#b45f06" },
        "demoup": { darkBg: "#1f3a52", darkFg: "#c9daf8", lightBg: "#d9e1f2", lightFg: "#1f4e79" },
        "作曲": { darkBg: "#1c3f24", darkFg: "#b6d7a8", lightBg: "#d9ead3", lightFg: "#274e13" },
        "編曲": { darkBg: "#2c2a5c", darkFg: "#d9d2e9", lightBg: "#e2f0d9", lightFg: "#385723" },
        "譜面制作": { darkBg: "#3a1c4a", darkFg: "#ead1dc", lightBg: "#f5e6ff", lightFg: "#7030a0" },
        "録音": { darkBg: "#4a2a1a", darkFg: "#fce5cd", lightBg: "#fce5cd", lightFg: "#a64d79" },
        "修正": { darkBg: "#1b3c3e", darkFg: "#d0e0e3", lightBg: "#d0e0e3", lightFg: "#134f5c" },
        "仮MIX": { darkBg: "#333333", darkFg: "#cccccc", lightBg: "#f3f3f3", lightFg: "#666666" },
        "本MIX": { darkBg: "#453f1a", darkFg: "#ffe599", lightBg: "#fff2cc", lightFg: "#7f6000" },
        "FIX": { darkBg: "#0f3a1f", darkFg: "#93c47d", lightBg: "#d9ead3", lightFg: "#385723" },
        "Check": { darkBg: "#1f3a52", darkFg: "#a4c2f4", lightBg: "#cfe2f3", lightFg: "#0b5394" },
        "DEADLINE": { darkBg: "#521f1f", darkFg: "#f4cccc", lightBg: "#f4cccc", lightFg: "#cc0000" },
        "休み": { darkBg: "#2b2b2b", darkFg: "#999999", lightBg: "#e7e7e7", lightFg: "#7f7f7f" },
        "打ち合わせ": { darkBg: "#1c4a4e", darkFg: "#a2e4e8", lightBg: "#e2f0d9", lightFg: "#1f4e79" },
        "リハーサル": { darkBg: "#3a3c20", darkFg: "#e2e5a8", lightBg: "#f9cb9c", lightFg: "#783f04" }
      };

      // Default fallback style
      const DEFAULT_TASK_STYLE = { darkBg: "#2d3748", darkFg: "#e2e8f0", lightBg: "#edf2f7", lightFg: "#4a5568" };

      // App state
      let state = {
        projects: [],
        currentProjectId: null,
        gridData: null, // { rawGrid: 2D array, numRows, numCols, dateCols: [] }
        activeCell: null, // { r: row, c: col }
        editCell: null, // { r: row, c: col, val: string }
        history: [], // Stack of deep copies of grid content edits
        historyIndex: -1,
        pendingEdits: {}, // Keyed by "r,c" -> { r, c, v }
        syncState: "synced", // "synced" | "saving" | "error"
        saveTimeoutId: null
      };

      // --- UTILITIES ---
      function $(id) { return document.getElementById(id); }

      function showToast(text, duration = 3000) {
        const toast = $("toast-notify");
        $("toast-text").textContent = text;
        toast.classList.add("active");
        setTimeout(() => toast.classList.remove("active"), duration);
      }

      function openModal(id) {
        $(id).classList.add("active");
      }

      function closeModal(id) {
        $(id).classList.remove("active");
      }
      
      window.closeModal = closeModal; // Expose to HTML inline onclick

      function getTaskStyle(label, isDark = true) {
        if (!label) return "";
        const cleanLabel = label.trim();
        const palette = TASK_PALETTE[cleanLabel];
        if (palette) {
          return `background-color: ${isDark ? palette.darkBg : palette.lightBg}; color: ${isDark ? palette.darkFg : palette.lightFg};`;
        }
        // Custom labels get a fallback hash color
        return `background-color: ${isDark ? DEFAULT_TASK_STYLE.darkBg : DEFAULT_TASK_STYLE.lightBg}; color: ${isDark ? DEFAULT_TASK_STYLE.darkFg : DEFAULT_TASK_STYLE.lightFg};`;
      }

      function parseDate(isoStr) {
        // Safe parser for YYYY-MM-DD to local Date object
        const parts = isoStr.split("-");
        if (parts.length === 3) {
          return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
        }
        return new Date();
      }

      function formatDateIso(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }

      // Deep clone helper
      function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
      }

      // --- THEME ENGINE ---
      function initTheme() {
        const darkBtn = $("theme-dark");
        const lightBtn = $("theme-light");
        
        function setTheme(theme) {
          document.documentElement.setAttribute("data-theme", theme);
          localStorage.setItem(THEME_STORAGE_KEY, theme);
          darkBtn.classList.toggle("active", theme === "dark");
          lightBtn.classList.toggle("active", theme === "light");
          
          // Re-render spreadsheet grid if active to apply theme colors properly
          if (state.currentProjectId && state.gridData) {
            renderEditorGrid();
          }
        }

        darkBtn.addEventListener("click", () => setTheme("dark"));
        lightBtn.addEventListener("click", () => setTheme("light"));
        
        const currentTheme = document.documentElement.getAttribute("data-theme");
        darkBtn.classList.toggle("active", currentTheme === "dark");
        lightBtn.classList.toggle("active", currentTheme === "light");
      }

      function isDarkTheme() {
        return document.documentElement.getAttribute("data-theme") === "dark";
      }

      // --- PROJECT STORAGE ---
      function loadProjects() {
        try {
          const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
          state.projects = raw ? JSON.parse(raw) : [];
        } catch (e) {
          state.projects = [];
          showToast("プロジェクトの読み込みに失敗しました。");
        }
      }

      function extractSpreadsheetId(value) {
        const text = String(value || "").trim();
        const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
        return match ? match[1] : (/^[a-zA-Z0-9_-]{20,}$/.test(text) ? text : "");
      }

      function pairRegistryProjects() {
        let registryEntries = [];
        try {
          const saved = JSON.parse(localStorage.getItem(REGISTRY_STORAGE_KEY));
          registryEntries = saved && Array.isArray(saved.entries) ? saved.entries : [];
        } catch (e) {
          registryEntries = [];
        }
        if (!registryEntries.length) return 0;

        let pairedCount = 0;
        registryEntries.forEach(entry => {
          if (!entry || !entry.id || !entry.name) return;
          const existingIndex = state.projects.findIndex(project => project.id === entry.id || project.registryProjectId === entry.id);
          const existing = existingIndex >= 0 ? state.projects[existingIndex] : {};
          const bridge = entry.bridge || {};
          const progressId = entry.spreadsheetId || extractSpreadsheetId(entry.spreadsheetUrl);
          const scheduleId = entry.scheduleSpreadsheetId || extractSpreadsheetId(entry.scheduleSpreadsheetUrl) || progressId || existing.scheduleSpreadsheetId || existing.spreadsheetId || "";
          const daysCount = Math.max(7, Math.min(120, Number(bridge.scheduleDays || entry.scheduleDays || existing.daysCount || 30)));
          const paired = Object.assign({}, existing, {
            id: entry.id,
            registryProjectId: entry.id,
            pairedWithWorksDB: true,
            name: entry.name,
            spreadsheetId: scheduleId,
            scheduleSpreadsheetId: scheduleId,
            webAppUrl: entry.webAppUrl || existing.webAppUrl || "",
            startDate: bridge.scheduleStartDate || entry.scheduleStartDate || existing.startDate || formatDateIso(new Date()),
            daysCount,
            trackSheetName: entry.trackSheetName || bridge.trackSheetName || existing.trackSheetName || "進捗管理",
            scheduleSheetName: entry.scheduleSheetName || bridge.scheduleSheetName || existing.scheduleSheetName || "制作スケジュール",
            scheduleGid: Math.max(0, Number(entry.scheduleGid != null ? entry.scheduleGid : (bridge.scheduleSheetGid != null ? bridge.scheduleSheetGid : existing.scheduleGid)) || 0),
            cachedProgress: existing.cachedProgress || { percent: 0, tracksCount: 0, milestones: [] }
          });
          if (existingIndex >= 0) state.projects[existingIndex] = paired;
          else state.projects.push(paired);
          pairedCount++;
        });
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(state.projects));
        return pairedCount;
      }

      function projectRequestParams(project) {
        return {
          spreadsheetId: project.scheduleSpreadsheetId || project.spreadsheetId || "",
          sheetId: project.scheduleSpreadsheetId || project.spreadsheetId || "",
          sheetName: project.scheduleSheetName || "制作スケジュール",
          gid: Math.max(0, Number(project.scheduleGid) || 0)
        };
      }
      function saveProjects() {
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(state.projects));
        updateDashboardView();
      }

      // --- VIEW NAVIGATION ---
      function showView(viewName) {
        if (viewName === "dashboard") {
          $("dashboard-view").classList.remove("hidden");
          $("editor-view").classList.add("hidden");
          $("back-to-dashboard").classList.add("hidden");
          $("active-project-sync").classList.add("hidden");
          state.currentProjectId = null;
          localStorage.removeItem(SELECTED_PROJECT_KEY);
          updateDashboardView();
        } else if (viewName === "editor") {
          $("dashboard-view").classList.add("hidden");
          $("editor-view").classList.remove("hidden");
          $("back-to-dashboard").classList.remove("hidden");
          $("active-project-sync").classList.remove("hidden");
        }
      }

      // --- SYNC LED INDICATOR ---
      function setSyncState(newState, text = "") {
        state.syncState = newState;
        const led = $("sync-led");
        const statusText = $("sync-text");
        
        led.className = "led-dot " + newState;
        
        if (newState === "synced") {
          statusText.textContent = text || "Synced";
        } else if (newState === "saving") {
          statusText.textContent = text || "Saving...";
        } else if (newState === "error") {
          statusText.textContent = text || "Offline";
        }
      }

      // --- DASHBOARD CONTROLLER ---
      function updateDashboardView() {
        const grid = $("project-cards-grid");
        
        // Remove existing project cards (exclude create card placeholder)
        const cards = grid.querySelectorAll(".project-card");
        cards.forEach(card => card.remove());
        
        // Populate stats
        $("stat-total-projects").textContent = state.projects.length;
        
        let totalTracksCount = 0;

        state.projects.forEach(project => {
          // Compute mock / cached progress metrics
          const cachedProgress = project.cachedProgress || { percent: 0, tracksCount: 0, milestones: [] };
          totalTracksCount += cachedProgress.tracksCount;

          const card = document.createElement("div");
          card.className = "project-card";
          
          let milestonesHtml = "";
          if (cachedProgress.milestones && cachedProgress.milestones.length > 0) {
            milestonesHtml = cachedProgress.milestones.slice(0, 2).map(m => `
              <div class="milestone-item">
                <span class="lbl">${m.label}</span>
                <span class="date">${m.date.slice(5)}</span>
              </div>
            `).join("");
          } else {
            milestonesHtml = `<span class="text-small text-muted" style="font-size:0.75rem;">マイルストーンはありません。</span>`;
          }

          card.innerHTML = `
            <div class="project-card-header">
              <div>
                <h3 class="project-title">${escapeHtml(project.name)}</h3>
                ${project.registryProjectId ? `<div class="project-date-range" style="color:var(--cyan);">WORKSDB PAIRED · ${escapeHtml(project.registryProjectId)}</div>` : ""}
                <div class="project-date-range">START: ${project.startDate} (${project.daysCount} DAYS)</div>
              </div>
              <span class="project-badge">${cachedProgress.tracksCount} TRK</span>
            </div>
            
            <div class="project-progress-container">
              <div class="progress-labels">
                <span>全体進捗</span>
                <strong>${cachedProgress.percent}%</strong>
              </div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill" style="width: ${cachedProgress.percent}%"></div>
              </div>
            </div>

            <div class="project-milestones">
              <h4>直近のマイルストーン</h4>
              ${milestonesHtml}
            </div>

            <div class="project-actions">
              <button type="button" class="btn btn--primary btn-open-editor" data-id="${project.id}">編集を開く</button>
              <button type="button" class="btn btn-edit-settings" data-id="${project.id}">設定</button>
              <button type="button" class="btn btn--danger btn-delete-project" data-id="${project.id}">&times;</button>
            </div>
          `;

          // Add card before the add placeholder
          grid.insertBefore(card, $("btn-open-create-modal"));
        });

        $("stat-total-tracks").textContent = totalTracksCount;

        // Register card actions
        grid.querySelectorAll(".btn-open-editor").forEach(btn => {
          btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            openProjectEditor(id);
          });
        });

        grid.querySelectorAll(".btn-edit-settings").forEach(btn => {
          btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            openProjectSettings(id);
          });
        });

        grid.querySelectorAll(".btn-delete-project").forEach(btn => {
          btn.addEventListener("click", (e) => {
            const id = e.target.getAttribute("data-id");
            deleteProject(id);
          });
        });

        renderMasterTimeline();
      }

      function renderMasterTimeline() {
        const panel = $("master-timeline-panel");
        const chart = $("master-timeline-chart");
        
        if (state.projects.length === 0) {
          panel.classList.add("hidden");
          return;
        }

        // Find min start date and max end date across all projects
        let minStart = null;
        let maxEnd = null;

        state.projects.forEach(p => {
          if (!p.startDate) return;
          const start = parseDate(p.startDate);
          const days = p.daysCount || 30;
          const end = new Date(start.getTime());
          end.setDate(start.getDate() + days - 1);

          if (!minStart || start < minStart) minStart = start;
          if (!maxEnd || end > maxEnd) maxEnd = end;
        });

        if (!minStart || !maxEnd) {
          panel.classList.add("hidden");
          return;
        }

        // Generate date headers in between (limit to 90 days max to prevent page crash)
        const dateList = [];
        let curr = new Date(minStart.getTime());
        const maxDays = 90;
        let dayCounter = 0;
        
        while (curr <= maxEnd && dayCounter < maxDays) {
          dateList.push(new Date(curr.getTime()));
          curr.setDate(curr.getDate() + 1);
          dayCounter++;
        }

        panel.classList.remove("hidden");

        let html = `<table class="spreadsheet-table" style="width: 100%; border-collapse: collapse;"><thead><tr>`;
        html += `<th style="width: 150px; background: var(--grid-header-bg); text-align: left; padding: 0.5rem; font-size: 0.72rem; border-bottom: 1px solid var(--border-color); position: sticky; left:0; z-index: 10;">案件名</th>`;
        
        dateList.forEach(date => {
          const m = String(date.getMonth() + 1).padStart(2, "0");
          const d = String(date.getDate()).padStart(2, "0");
          const wd = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
          const isWe = date.getDay() === 0 || date.getDay() === 6;
          const wdayClass = date.getDay() === 0 ? "wday-sun" : (date.getDay() === 6 ? "wday-sat" : "");
          
          html += `<th style="width: 50px; text-align: center; font-size: 0.65rem; padding: 0.25rem 0.1rem; background: var(--grid-header-bg); border-bottom: 1px solid var(--border-color); ${isWe ? 'opacity: 0.9;' : ''}">
            <div style="font-family: var(--font-mono); font-weight:700;">${m}/${d}</div>
            <div class="${wdayClass}" style="font-size:0.55rem; scale: 0.95;">(${wd})</div>
          </th>`;
        });
        html += `</tr></thead><tbody>`;

        const todayStr = formatDateIso(new Date());

        state.projects.forEach(p => {
          const cached = p.cachedProgress || { percent: 0, tracksCount: 0, milestones: [] };
          const pStart = p.startDate ? parseDate(p.startDate) : null;
          const pEnd = pStart ? new Date(pStart.getTime()) : null;
          if (pEnd) pEnd.setDate(pStart.getDate() + (p.daysCount || 30) - 1);

          html += `<tr>`;
          // Locked project title column
          html += `<td style="font-weight: 600; font-size: 0.78rem; padding: 0.5rem; background: var(--surface-glass); border-bottom: 1px solid var(--grid-border); position: sticky; left:0; z-index: 5; border-right: 1px solid var(--grid-border); max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; text-decoration: underline;" class="btn-timeline-open" data-id="${p.id}" title="クリックして編集を開く">
            ${escapeHtml(p.name)}
          </td>`;

          dateList.forEach(date => {
            const dateStr = formatDateIso(date);
            const isToday = dateStr === todayStr;
            const inRange = pStart && pEnd && date >= pStart && date <= pEnd;
            
            let bgStyle = "";
            let innerContent = "";

            if (inRange) {
              bgStyle = `background-color: rgba(111, 214, 255, 0.08);`;
            }
            if (isToday) {
              bgStyle += ` outline: 1px dashed var(--cyan); outline-offset: -1px;`;
            }

            // Find milestones in this project on this date
            const ms = cached.milestones ? cached.milestones.filter(m => m.date === dateStr) : [];
            if (ms.length > 0) {
              // Draw a glowing milestone indicator
              const label = ms.map(m => m.label).join(", ");
              bgStyle += `background-color: rgba(255, 179, 71, 0.25);`;
              innerContent = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--amber); font-weight:700; cursor: pointer; font-size:0.65rem;" title="${escapeHtml(label)}">✦</div>`;
            }

            html += `<td style="text-align: center; border-bottom: 1px solid var(--grid-border); border-right: 1px solid var(--grid-border); padding:0; height:32px; ${bgStyle}">
              ${innerContent}
            </td>`;
          });

          html += `</tr>`;
        });

        html += `</tbody></table>`;
        chart.innerHTML = html;

        // Add action listener
        chart.querySelectorAll(".btn-timeline-open").forEach(el => {
          el.addEventListener("click", () => {
            const id = el.getAttribute("data-id");
            openProjectEditor(id);
          });
        });
      }

      function openProjectSettings(id) {
        const project = state.projects.find(p => p.id === id);
        if (!project) return;
        
        $("field-project-id").value = project.id;
        $("field-project-name").value = project.name;
        $("field-spreadsheet-id").value = project.scheduleSpreadsheetId || project.spreadsheetId;
        $("field-webapp-url").value = project.webAppUrl;
        $("field-start-date").value = project.startDate;
        $("field-days-count").value = project.daysCount;
        $("field-track-sheet").value = project.trackSheetName || "進捗管理";
        $("field-schedule-sheet").value = project.scheduleSheetName || "制作スケジュール";
        
        $("modal-title").textContent = "案件設定を編集";
        openModal("project-modal");
      }

      function deleteProject(id) {
        const project = state.projects.find(p => p.id === id);
        if (!project) return;
        
        if (confirm(`本当に案件「${project.name}」を削除しますか？\n(この操作は元に戻せません。Googleスプレッドシートのデータは削除されません。)`)) {
          state.projects = state.projects.filter(p => p.id !== id);
          saveProjects();
          showToast("案件を削除しました。");
        }
      }

      // --- IMPORT / EXPORT CONFIG ---
      $("btn-export-config").addEventListener("click", () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.projects, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `worksdb-schedule-config-${formatDateIso(new Date())}.json`);
        dlAnchorElem.click();
      });

      $("btn-import-config").addEventListener("click", () => {
        $("file-import").click();
      });

      $("file-import").addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
          try {
            const imported = JSON.parse(event.target.result);
            if (Array.isArray(imported)) {
              // Simple validation
              const valid = imported.every(p => p.id && p.name && p.webAppUrl);
              if (valid) {
                if (confirm(`${imported.length} 件の案件設定を取り込みますか？ 現在の設定は上書きされます。`)) {
                  state.projects = imported;
                  saveProjects();
                  showToast("構成をインポートしました。");
                }
              } else {
                alert("インポートされたJSONファイルの構造が正しくありません。");
              }
            } else {
              alert("ファイル形式が正しくありません。");
            }
          } catch (err) {
            alert("ファイルの解析に失敗しました: " + err);
          }
        };
        reader.readAsText(file);
      });

      // --- EDIT/CREATE MODAL CONTROLLER ---
      $("btn-open-create-modal").addEventListener("click", () => {
        $("field-project-id").value = "";
        $("field-project-name").value = "";
        $("field-spreadsheet-id").value = "";
        $("field-webapp-url").value = "";
        
        // Auto default start date to today
        $("field-start-date").value = formatDateIso(new Date());
        $("field-days-count").value = "30";
        $("field-track-sheet").value = "進捗管理";
        $("field-schedule-sheet").value = "制作スケジュール";
        
        $("modal-title").textContent = "新しい案件を登録";
        openModal("project-modal");
      });

      $("project-form").addEventListener("submit", (e) => {
        e.preventDefault();
        
        const id = $("field-project-id").value || "project-" + Date.now();
        const name = $("field-project-name").value.trim();
        const spreadsheetId = $("field-spreadsheet-id").value.trim();
        const webAppUrl = $("field-webapp-url").value.trim();
        const startDate = $("field-start-date").value;
        const daysCount = parseInt($("field-days-count").value, 10) || 30;
        const trackSheetName = $("field-track-sheet").value.trim() || "進捗管理";
        const scheduleSheetName = $("field-schedule-sheet").value.trim() || "制作スケジュール";
        
        const existingIdx = state.projects.findIndex(p => p.id === id);
        
        const existingProject = existingIdx >= 0 ? state.projects[existingIdx] : null;
        const projectData = Object.assign({}, existingProject || {}, {
          id,
          name,
          spreadsheetId,
          scheduleSpreadsheetId: spreadsheetId,
          webAppUrl,
          startDate,
          daysCount,
          trackSheetName,
          scheduleSheetName,
          cachedProgress: existingProject ? existingProject.cachedProgress : { percent: 0, tracksCount: 0, milestones: [] }
        });
        
        if (existingIdx >= 0) {
          state.projects[existingIdx] = projectData;
          showToast("案件設定を更新しました。");
        } else {
          state.projects.push(projectData);
          showToast("新しい案件を登録しました。");
        }
        
        saveProjects();
        closeModal("project-modal");
      });

      // --- GRID EDITOR CONTROLLER ---
      function openProjectEditor(projectId) {
        state.currentProjectId = projectId;
        localStorage.setItem(SELECTED_PROJECT_KEY, projectId);
        
        const project = state.projects.find(p => p.id === projectId);
        if (!project) return;

        $("active-project-name").textContent = project.name;
        $("active-project-info").textContent = `${project.daysCount} DAYS`;

        showView("editor");
        loadGridFromGoogleSheet(project);
      }

      $("back-to-dashboard").addEventListener("click", () => {
        // If there are unsaved edits, warn user
        if (Object.keys(state.pendingEdits).length > 0) {
          if (!confirm("未保存のデータがあります。ダッシュボードに戻ると保存されるまで一時保存されますが、ブラウザを閉じると失われる可能性があります。戻りますか？")) {
            return;
          }
        }
        
        // Save outstanding edits immediately
        forceSavePendingEdits();
        
        showView("dashboard");
      });

      $("btn-reload-grid").addEventListener("click", () => {
        const project = state.projects.find(p => p.id === state.currentProjectId);
        if (project) {
          loadGridFromGoogleSheet(project);
        }
      });

      // Load Grid from GAS
      function loadGridFromGoogleSheet(project) {
        setSyncState("saving", "Loading sheet...");
        
        const params = new URLSearchParams(Object.assign({ action: "schedule", t: Date.now() }, projectRequestParams(project)));
        const url = `${project.webAppUrl}${project.webAppUrl.includes("?") ? "&" : "?"}${params.toString()}`;
        
        fetch(url)
          .then(res => res.json())
          .then(data => {
            if (data.ok && data.grid) {
              // Success!
              parseGoogleSheetGrid(data.grid, project);
              
              // Cache stats to dashboard
              cacheProjectStats(project, data.grid);
              
              // Clear active cell focus
              state.activeCell = null;
              state.editCell = null;
              state.pendingEdits = {};
              
              // Reset Undo/Redo history with the newly loaded grid
              state.history = [deepClone(state.gridData.rawGrid)];
              state.historyIndex = 0;
              updateHistoryButtons();

              setSyncState("synced", "Synced");
              showToast("最新データを読み込みました。");
            } else {
              throw new Error(data.error || "データが正しくありません。");
            }
          })
          .catch(err => {
            console.error(err);
            setSyncState("error", "Sync Error");
            showToast("データの取得に失敗しました。ローカルストレージ情報から復元します。");
            
            // Fallback load local grid
            loadLocalFallbackGrid(project);
          });
      }

      function parseGoogleSheetGrid(rawGrid, project) {
        const numRows = rawGrid.length;
        const numCols = rawGrid[0] ? rawGrid[0].length : 0;
        
        // Collect date columns
        const dateCols = [];
        // Header dates start at column 6 (0-indexed: 7th column)
        const dateColStart = 6;
        for (let col = dateColStart; col < numCols; col++) {
          const rawDateStr = rawGrid[0][col];
          const parsed = parseDateText(rawDateStr);
          
          let dayStr = "";
          let wdayStr = "";
          let isWeekend = false;
          let wdayClass = "";
          
          if (parsed) {
            dayStr = `${String(parsed.getMonth() + 1).padStart(2, "0")}/${String(parsed.getDate()).padStart(2, "0")}`;
            const wdIndex = parsed.getDay();
            const wdays = ["日", "月", "火", "水", "木", "金", "土"];
            wdayStr = wdays[wdIndex];
            isWeekend = (wdIndex === 0 || wdIndex === 6);
            if (wdIndex === 0) wdayClass = "wday-sun";
            else if (wdIndex === 6) wdayClass = "wday-sat";
          } else {
            dayStr = rawDateStr || `Col ${col + 1}`;
          }

          dateCols.push({
            colIndex: col,
            dateStr: rawDateStr,
            displayDay: dayStr,
            displayWday: wdayStr,
            isWeekend: isWeekend,
            wdayClass: wdayClass
          });
        }

        state.gridData = {
          rawGrid: rawGrid,
          numRows: numRows,
          numCols: numCols,
          dateCols: dateCols
        };

        renderEditorGrid();
      }

      function parseDateText(text) {
        if (!text) return null;
        
        // Matches yyyy-mm-dd, yyyy/mm/dd, or Date(2026, 6, 7) from GViz
        let m = String(text).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (m) {
          return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
        }
        
        m = String(text).match(/^Date\((\d+),.*?(\d+),.*?(\d+)\)/);
        if (m) {
          return new Date(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0, 0);
        }

        // Try standard Date parse
        const d = new Date(text);
        if (!isNaN(d.getTime())) return d;

        return null;
      }

      function loadLocalFallbackGrid(project) {
        // If there's locally stored layout grid, use it, otherwise create an empty layout based on settings
        const localKey = `worksdb-grid-fallback-${project.id}`;
        const stored = localStorage.getItem(localKey);
        if (stored) {
          try {
            const rawGrid = JSON.parse(stored);
            parseGoogleSheetGrid(rawGrid, project);
            
            state.history = [deepClone(state.gridData.rawGrid)];
            state.historyIndex = 0;
            updateHistoryButtons();
            return;
          } catch(e) {}
        }
        
        // Create initial empty structure
        const days = project.daysCount;
        const columnsCount = 6 + days;
        const rowsCount = 17; // Header + EVT + 15 Tracks
        const grid = [];
        
        // Row 0: Headers
        const header = ["code", "title", "memo", "収録楽器", "sec", "担当"];
        const start = parseDate(project.startDate);
        for (let d = 0; d < days; d++) {
          const date = new Date(start.getTime());
          date.setDate(start.getDate() + d);
          header.push(formatDateIso(date));
        }
        grid.push(header);

        // Row 1: EVT
        const evtRow = new Array(columnsCount).fill("");
        evtRow[0] = "EVT";
        evtRow[1] = "イベント・共通";
        grid.push(evtRow);

        // Rows 2-16: M1-M15
        for (let i = 1; i <= 15; i++) {
          const row = new Array(columnsCount).fill("");
          row[0] = "M" + i;
          row[1] = `M${i}（タイトル未定）`;
          grid.push(row);
        }

        parseGoogleSheetGrid(grid, project);
        state.history = [deepClone(state.gridData.rawGrid)];
        state.historyIndex = 0;
        updateHistoryButtons();
      }

      function cacheProjectStats(project, rawGrid) {
        const tracksCount = rawGrid.length - 2; // header + EVT excluded
        
        // Calculate milestones
        const milestones = [];
        const dateColStart = 6;
        const numCols = rawGrid[0] ? rawGrid[0].length : 0;
        
        // Check EVT row for deadlines/milestones
        if (rawGrid[1]) {
          for (let col = dateColStart; col < numCols; col++) {
            const val = rawGrid[1][col];
            if (val) {
              milestones.push({
                date: rawGrid[0][col],
                label: val
              });
            }
          }
        }

        // Search tracks for "DEADLINE"
        for (let r = 2; r < rawGrid.length; r++) {
          for (let col = dateColStart; col < numCols; col++) {
            const val = rawGrid[r][col];
            if (val === "DEADLINE" || val === "FIX") {
              milestones.push({
                date: rawGrid[0][col],
                label: `${rawGrid[r][0]} ${val}`
              });
            }
          }
        }

        // Sort milestones by date
        milestones.sort((a,b) => a.date.localeCompare(b.date));

        // Progress calc mock: Check percentage of cell filled in dates
        let totalCells = 0;
        let filledCells = 0;
        for (let r = 2; r < rawGrid.length; r++) {
          for (let col = dateColStart; col < numCols; col++) {
            totalCells++;
            if (rawGrid[r][col]) {
              filledCells++;
            }
          }
        }
        // Simplified progress ratio: percentage of completed tasks (e.g. cells having "FIX", "OK", "本MIX" etc.)
        let fixTasks = 0;
        for (let r = 2; r < rawGrid.length; r++) {
          for (let col = dateColStart; col < numCols; col++) {
            const task = rawGrid[r][col];
            if (task === "FIX" || task === "OK" || task === "本MIX") {
              fixTasks++;
            }
          }
        }
        const progressPercentage = tracksCount > 0 ? Math.min(100, Math.round((fixTasks / (tracksCount * 2)) * 100)) : 0;

        project.cachedProgress = {
          percent: progressPercentage,
          tracksCount: tracksCount > 0 ? tracksCount : 0,
          milestones: milestones
        };

        // Cache grid fallback locally
        localStorage.setItem(`worksdb-grid-fallback-${project.id}`, JSON.stringify(rawGrid));
        
        saveProjects();
      }

      // Render Table Grid
      function renderEditorGrid() {
        const data = state.gridData;
        if (!data) return;

        $("editor-grid-dimensions").textContent = `${data.numRows} rows x ${data.numCols} cols`;

        const isDark = isDarkTheme();
        const table = $("editor-table");
        table.innerHTML = "";

        // Createcolgroup for widths
        const colgroup = document.createElement("colgroup");
        // Locked metadata column widths
        colgroup.innerHTML = `
          <col class="col-code">
          <col class="col-title">
          <col class="col-memo">
          <col class="col-instrument">
          <col class="col-length">
          <col class="col-assignee">
        `;
        for (let c = 6; c < data.numCols; c++) {
          const colEl = document.createElement("col");
          colEl.className = "col-date";
          colgroup.appendChild(colEl);
        }
        table.appendChild(colgroup);

        // Header Row
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        
        // Locked headers
        const metaHeaders = ["コード", "曲名・タイトル", "要約・メモ", "使用楽器", "尺", "担当"];
        metaHeaders.forEach((lbl, idx) => {
          const th = document.createElement("th");
          let classList = ["col-locked", "col-locked-header"];
          if (idx === 0) classList.push("col-code");
          else if (idx === 1) classList.push("col-title");
          else if (idx === 2) classList.push("col-memo");
          else if (idx === 3) classList.push("col-instrument");
          else if (idx === 4) classList.push("col-length");
          else if (idx === 5) classList.push("col-assignee", "col-lock-boundary");

          th.className = classList.join(" ");
          th.innerHTML = `<div class="cell-inner" style="justify-content: center; font-weight:700;">${lbl}</div>`;
          headerRow.appendChild(th);
        });

        // Date headers
        data.dateCols.forEach(dc => {
          const th = document.createElement("th");
          th.className = "col-date";
          if (dc.isWeekend) th.classList.add(dc.displayWday === "土" ? "col-date-sat" : "col-date-sun");
          
          th.innerHTML = `
            <div class="date-header-inner" title="${dc.dateStr}">
              <span class="day">${dc.displayDay}</span>
              <span class="wday ${dc.wdayClass}">(${dc.displayWday})</span>
            </div>
          `;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Table Body
        const tbody = document.createElement("tbody");
        
        for (let r = 1; r < data.numRows; r++) {
          const tr = document.createElement("tr");
          if (r === 1) tr.className = "row-evt";

          // Locked cells
          for (let c = 0; c < 6; c++) {
            const td = document.createElement("td");
            let classList = ["grid-cell", "col-locked"];
            if (c === 0) classList.push("col-code");
            else if (c === 1) classList.push("col-title");
            else if (c === 2) classList.push("col-memo");
            else if (c === 3) classList.push("col-instrument");
            else if (c === 4) classList.push("col-length");
            else if (c === 5) classList.push("col-assignee", "col-lock-boundary");
            
            td.className = classList.join(" ");
            td.setAttribute("data-r", r);
            td.setAttribute("data-c", c);
            
            const cellValue = data.rawGrid[r][c] || "";
            td.innerHTML = `<div class="cell-inner">${escapeHtml(cellValue)}</div>`;
            tr.appendChild(td);
          }

          // Date cells
          for (let c = 6; c < data.numCols; c++) {
            const td = document.createElement("td");
            td.className = "grid-cell";
            td.setAttribute("data-r", r);
            td.setAttribute("data-c", c);
            
            const dc = data.dateCols[c - 6];
            if (dc && dc.isWeekend) {
              td.classList.add(dc.displayWday === "土" ? "col-date-sat" : "col-date-sun");
            }

            const cellValue = data.rawGrid[r][c] || "";
            if (cellValue) {
              const style = getTaskStyle(cellValue, isDark);
              td.innerHTML = `
                <div class="cell-inner" style="justify-content: center;">
                  <span class="task-pill" style="${style}">${escapeHtml(cellValue)}</span>
                </div>
              `;
            } else {
              td.innerHTML = `<div class="cell-inner"></div>`;
            }

            tr.appendChild(td);
          }
          
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);

        // Restore active focus cell class if still valid
        if (state.activeCell) {
          const r = state.activeCell.r;
          const c = state.activeCell.c;
          if (r < data.numRows && c < data.numCols) {
            const el = table.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
            if (el) el.classList.add("active-cell");
          } else {
            state.activeCell = null;
          }
        }
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

      // --- SPREADSHEET CELL INTERACTION CONTROLLER ---
      const table = $("editor-table");
      
      table.addEventListener("click", (e) => {
        const td = e.target.closest("td.grid-cell");
        if (!td) return;
        
        // If we are currently editing another cell, commit it first
        if (state.editCell) {
          commitCellEdit();
        }

        const r = parseInt(td.getAttribute("data-r"), 10);
        const c = parseInt(td.getAttribute("data-c"), 10);

        selectCell(r, c);
      });

      table.addEventListener("dblclick", (e) => {
        const td = e.target.closest("td.grid-cell");
        if (!td) return;
        
        const r = parseInt(td.getAttribute("data-r"), 10);
        const c = parseInt(td.getAttribute("data-c"), 10);

        startCellEdit(r, c);
      });

      function selectCell(r, c) {
        // Clear active cell focus
        const active = table.querySelector(".active-cell");
        if (active) active.classList.remove("active-cell");

        state.activeCell = { r, c };
        
        const nextActive = table.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
        if (nextActive) {
          nextActive.classList.add("active-cell");
          scrollCellIntoView(nextActive);
        }
      }

      function scrollCellIntoView(cellEl) {
        const outer = $("grid-scroll-wrap");
        const cellRect = cellEl.getBoundingClientRect();
        const outerRect = outer.getBoundingClientRect();
        
        const offsetLeft = cellEl.offsetLeft;
        const offsetTop = cellEl.offsetTop;
        const cellWidth = cellEl.offsetWidth;
        const cellHeight = cellEl.offsetHeight;

        // Date columns check (horizontal scroll)
        // Adjust for locked left column boundaries (column 6 starts date columns offset)
        // Sum of locked columns width is 62+180+140+100+55+80 = 617px
        const lockedOffset = 617; 

        if (cellEl.offsetLeft < outer.scrollLeft + lockedOffset) {
          // If active cell is scrolled under locked panel
          if (cellEl.offsetLeft > lockedOffset) {
            outer.scrollLeft = cellEl.offsetLeft - lockedOffset;
          } else {
            outer.scrollLeft = 0;
          }
        } else if (cellEl.offsetLeft + cellWidth > outer.scrollLeft + outerRect.width) {
          outer.scrollLeft = cellEl.offsetLeft + cellWidth - outerRect.width;
        }

        // Vertical scroll check
        const headerHeight = 42; // header height approx
        if (cellEl.offsetTop < outer.scrollTop + headerHeight) {
          if (cellEl.offsetTop > headerHeight) {
            outer.scrollTop = cellEl.offsetTop - headerHeight;
          } else {
            outer.scrollTop = 0;
          }
        } else if (cellEl.offsetTop + cellHeight > outer.scrollTop + outer.offsetHeight) {
          outer.scrollTop = cellEl.offsetTop + cellHeight - outer.offsetHeight;
        }
      }

      // Edit Mode
      function startCellEdit(r, c, initialValue = null) {
        const td = table.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
        if (!td) return;

        // If we are already editing this cell, do nothing
        if (state.editCell && state.editCell.r === r && state.editCell.c === c) return;
        
        // Commit any other cell being edited
        if (state.editCell) {
          commitCellEdit();
        }

        const currentValue = initialValue !== null ? initialValue : (state.gridData.rawGrid[r][c] || "");
        state.editCell = { r, c, val: currentValue };

        // Render input element
        td.innerHTML = "";
        
        const input = document.createElement("input");
        input.type = "text";
        input.className = "cell-editor";
        input.value = currentValue;
        td.appendChild(input);
        
        input.focus();
        if (initialValue === null) {
          input.select();
        } else {
          // Move cursor to end if user started typing over
          input.selectionStart = input.selectionEnd = input.value.length;
        }

        // Dropdown setup for date columns (c >= 6)
        if (c >= 6) {
          renderTaskDropdown(td, input, r, c);
        }

        // Close dropdown / commit on blur (with delay to allow clicking dropdown options)
        input.addEventListener("blur", (e) => {
          setTimeout(() => {
            // Check if we are still editing this cell (wasn't cancelled)
            if (state.editCell && state.editCell.r === r && state.editCell.c === c) {
              commitCellEdit();
            }
          }, 150);
        });

        // Key listeners inside the editor
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitCellEdit();
            // Move selection down on Enter
            moveSelection("down");
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelCellEdit();
          } else if (e.key === "Tab") {
            e.preventDefault();
            commitCellEdit();
            // Move selection right/left on Tab
            moveSelection(e.shiftKey ? "left" : "right");
          }
        });
      }

      function renderTaskDropdown(td, input, r, c) {
        const dropdown = document.createElement("div");
        dropdown.className = "cell-dropdown";
        
        const tasks = Object.keys(TASK_PALETTE);
        
        tasks.forEach(t => {
          const opt = document.createElement("div");
          opt.className = "dropdown-opt";
          const style = getTaskStyle(t, isDarkTheme());
          opt.innerHTML = `<span class="task-pill" style="${style}">${t}</span>`;
          
          opt.addEventListener("mousedown", (e) => {
            e.preventDefault(); // Prevent input blur
            input.value = t;
            commitCellEdit();
          });
          
          dropdown.appendChild(opt);
        });
        
        td.appendChild(dropdown);
      }

      function commitCellEdit() {
        if (!state.editCell) return;
        
        const { r, c, val: oldVal } = state.editCell;
        const input = table.querySelector(`td[data-r="${r}"][data-c="${c}"] input`);
        if (!input) return;

        const newVal = input.value.trim();
        state.editCell = null;

        if (newVal !== oldVal) {
          updateGridCellData(r, c, newVal);
        } else {
          // Re-render only that cell to discard editor layout
          reRenderGridCell(r, c);
        }
        
        // Refocus on cell
        selectCell(r, c);
      }

      function cancelCellEdit() {
        if (!state.editCell) return;
        const { r, c } = state.editCell;
        state.editCell = null;
        reRenderGridCell(r, c);
        selectCell(r, c);
      }

      function updateGridCellData(r, c, value, isUndoRedoOperation = false) {
        const oldValue = state.gridData.rawGrid[r][c] || "";
        state.gridData.rawGrid[r][c] = value;
        reRenderGridCell(r, c);

        // Register edit for GAS sync
        const key = `${r},${c}`;
        state.pendingEdits[key] = { r, c, v: value };
        
        // Push to history for undo-redo if not already in an undo-redo flow
        if (!isUndoRedoOperation) {
          // Truncate any forward history if we were in the middle of undo stack
          if (state.historyIndex < state.history.length - 1) {
            state.history = state.history.slice(0, state.historyIndex + 1);
          }
          state.history.push(deepClone(state.gridData.rawGrid));
          state.historyIndex = state.history.length - 1;
          updateHistoryButtons();
        }

        // Trigger debounced save
        triggerDebouncedSave();
      }

      function reRenderGridCell(r, c) {
        const td = table.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
        if (!td) return;

        const value = state.gridData.rawGrid[r][c] || "";
        const isDark = isDarkTheme();
        
        if (c < 6) {
          // Locked cells
          td.innerHTML = `<div class="cell-inner">${escapeHtml(value)}</div>`;
        } else {
          // Date cells
          if (value) {
            const style = getTaskStyle(value, isDark);
            td.innerHTML = `
              <div class="cell-inner" style="justify-content: center;">
                <span class="task-pill" style="${style}">${escapeHtml(value)}</span>
              </div>
            `;
          } else {
            td.innerHTML = `<div class="cell-inner"></div>`;
          }
        }
      }

      // --- KEYBOARD NAVIGATION ENGINE ---
      document.addEventListener("keydown", (e) => {
        // If modals are open, do not trigger grid keyboard navigation
        if (document.querySelector(".modal-overlay.active")) return;
        
        // If focus is in input form fields elsewhere (e.g. project modals), skip
        if (e.target.tagName === "INPUT" && !e.target.classList.contains("cell-editor")) return;
        if (e.target.tagName === "TEXTAREA") return;

        if (!state.currentProjectId || !state.gridData) return;

        const active = state.activeCell;
        
        // 1. Grid editing active triggers
        if (state.editCell) {
          // Let cell editor handle its keys, escape exits
          return;
        }

        if (!active) return;

        const r = active.r;
        const c = active.c;
        const maxRows = state.gridData.numRows;
        const maxCols = state.gridData.numCols;

        // Navigation keys
        if (e.key === "ArrowUp") {
          e.preventDefault();
          moveSelection("up");
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          moveSelection("down");
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          moveSelection("left");
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          moveSelection("right");
        } else if (e.key === "Tab") {
          e.preventDefault();
          moveSelection(e.shiftKey ? "left" : "right");
        } else if (e.key === "Enter") {
          e.preventDefault();
          startCellEdit(r, c);
        } else if (e.key === "F2") {
          e.preventDefault();
          startCellEdit(r, c);
        } else if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          // Clear cell value
          if (state.gridData.rawGrid[r][c]) {
            updateGridCellData(r, c, "");
          }
        } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          triggerUndo();
        } else if (e.key === "y" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          triggerRedo();
        } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
          // Copy cell
          e.preventDefault();
          const val = state.gridData.rawGrid[r][c] || "";
          navigator.clipboard.writeText(val)
            .then(() => showToast(`コピーしました: "${val}"`))
            .catch(() => showToast("コピーに失敗しました。"));
        } else if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
          // Paste cell
          e.preventDefault();
          navigator.clipboard.readText()
            .then(text => {
              const cleaned = text.trim();
              updateGridCellData(r, c, cleaned);
              showToast(`貼り付けました: "${cleaned}"`);
            })
            .catch(() => showToast("貼り付けに失敗しました。クリップボードへのアクセス権限を確認してください。"));
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          // If user starts typing direct characters, start edit instantly replacing content
          e.preventDefault();
          startCellEdit(r, c, e.key);
        }
      });

      function moveSelection(direction) {
        if (!state.activeCell || !state.gridData) return;
        
        let { r, c } = state.activeCell;
        const maxRows = state.gridData.numRows;
        const maxCols = state.gridData.numCols;

        if (direction === "up" && r > 1) r--;
        else if (direction === "down" && r < maxRows - 1) r++;
        else if (direction === "left" && c > 0) c--;
        else if (direction === "right" && c < maxCols - 1) c++;

        selectCell(r, c);
      }

      // --- UNDO / REDO ENGINE ---
      function triggerUndo() {
        if (state.historyIndex > 0) {
          state.historyIndex--;
          restoreHistoryState();
          showToast("元に戻しました。");
        }
      }

      function triggerRedo() {
        if (state.historyIndex < state.history.length - 1) {
          state.historyIndex++;
          restoreHistoryState();
          showToast("やり直しました。");
        }
      }

      function restoreHistoryState() {
        const historyGrid = state.history[state.historyIndex];
        
        // Find changes between current grid and target history state to sync them to sheet
        const currentGrid = state.gridData.rawGrid;
        
        for (let r = 0; r < state.gridData.numRows; r++) {
          for (let c = 0; c < state.gridData.numCols; c++) {
            const histVal = historyGrid[r][c] || "";
            const currVal = currentGrid[r][c] || "";
            
            if (histVal !== currVal) {
              // Write changes to state & register for sync
              state.gridData.rawGrid[r][c] = histVal;
              reRenderGridCell(r, c);
              
              const key = `${r},${c}`;
              state.pendingEdits[key] = { r, c, v: histVal };
            }
          }
        }

        updateHistoryButtons();
        triggerDebouncedSave();
      }

      function updateHistoryButtons() {
        $("btn-undo").disabled = (state.historyIndex <= 0);
        $("btn-redo").disabled = (state.historyIndex >= state.history.length - 1);
      }

      $("btn-undo").addEventListener("click", triggerUndo);
      $("btn-redo").addEventListener("click", triggerRedo);

      // --- DEBOUNCED SYNC ENGINE ---
      function triggerDebouncedSave() {
        setSyncState("saving", "Saving changes in background...");
        
        if (state.saveTimeoutId) {
          clearTimeout(state.saveTimeoutId);
        }
        
        state.saveTimeoutId = setTimeout(() => {
          forceSavePendingEdits();
        }, 2000); // 2-second debounce
      }

      function forceSavePendingEdits() {
        const editsToSync = Object.values(state.pendingEdits);
        if (editsToSync.length === 0) {
          setSyncState("synced", "Synced");
          return;
        }

        if (state.saveTimeoutId) {
          clearTimeout(state.saveTimeoutId);
          state.saveTimeoutId = null;
        }

        const project = state.projects.find(p => p.id === state.currentProjectId);
        if (!project) return;

        setSyncState("saving", `Syncing ${editsToSync.length} edits...`);
        
        const payload = Object.assign({
          action: "write_schedule",
          edits: editsToSync
        }, projectRequestParams(project));

        fetch(project.webAppUrl, {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "text/plain" // Prevents CORS preflight OPTIONS check
          },
          body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
          if (data.ok) {
            // Success! Remove synced items from pending
            editsToSync.forEach(e => {
              const key = `${e.r},${e.c}`;
              // Make sure we don't delete an edit that was updated while network request was in-flight
              if (state.pendingEdits[key] && state.pendingEdits[key].v === e.v) {
                delete state.pendingEdits[key];
              }
            });

            // Update stats
            cacheProjectStats(project, state.gridData.rawGrid);

            // Recheck if any edits arrived while we were saving
            const remainCount = Object.keys(state.pendingEdits).length;
            if (remainCount > 0) {
              setSyncState("saving", `${remainCount} updates pending...`);
              triggerDebouncedSave();
            } else {
              setSyncState("synced", "Synced");
              showToast("すべての変更が保存されました。");
            }
          } else {
            throw new Error(data.error || "GAS returned error status.");
          }
        })
        .catch(err => {
          console.error(err);
          setSyncState("error", `Sync Failed! (${editsToSync.length} unsaved)`);
          showToast("ネットワークエラー。自動保存に失敗しました。再試行します。");
        });
      }

      $("btn-manual-sync").addEventListener("click", () => {
        forceSavePendingEdits();
      });

      // --- GAS SETUP DIALOG CONTROLLER ---
      $("btn-gas-setup").addEventListener("click", () => {
        const project = state.projects.find(p => p.id === state.currentProjectId);
        if (!project) return;
        
        // Generate Setup GAS code block
        const templateOutput = $("gas-code-output");
        
        // Fetch original raw Code.gs contents (we will embed standard GAS structure with replacements)
        // Since we are inside a single HTML file, let's inject a string representation of Code.gs
        // customized with the project's sheet names
        const gasCode = getGasScriptTemplate(project);
        templateOutput.value = gasCode;
        
        $("copy-success-text").textContent = "";
        openModal("gas-modal");
      });

      $("btn-copy-gas").addEventListener("click", () => {
        const output = $("gas-code-output");
        output.select();
        document.execCommand("copy");
        $("copy-success-text").textContent = "コピーしました！";
        setTimeout(() => $("copy-success-text").textContent = "", 3000);
      });

      function getGasScriptTemplate(project) {
        // Generates the Code.gs script replacing config variables
        return `/**
 * WorksDB Google Sheets Bridge
 * 案件名: ${project.name}
 *
 * スプレッドシートのApps Scriptエディタにこのコードを貼り付けて保存してください。
 */

var BRIDGE_CONFIG = {
  trackSheetName: "${project.trackSheetName || '進捗管理'}",
  scheduleSheetName: "${project.scheduleSheetName || '制作スケジュール'}",
  trackRowOffset: 1,
  columns: {
    version: 2,
    progress: 9,
    percent: 10,
    client: 11,
    overallSummary: 12
  }
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
      "進捗シート: " + BRIDGE_CONFIG.trackSheetName + "\\n" +
      "スケジュール: " + BRIDGE_CONFIG.scheduleSheetName + "\\n" +
      "Bridge: worksdb-bridge-v3-multi",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function getSpreadsheet_(params) {
  var id = String(params.spreadsheetId || params.sheetId || "").trim();
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch(e) {}
  }
  var cfgId = String(BRIDGE_CONFIG.scheduleSpreadsheetId || "").trim();
  if (cfgId) {
    try {
      return SpreadsheetApp.openById(cfgId);
    } catch(e) {}
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getScheduleSheet_(ss, params) {
  if (params.gid !== undefined && String(params.gid).trim() !== "") {
    var gid = Number(params.gid);
    if (!isNaN(gid)) {
      var sheets = ss.getSheets();
      for (var i = 0; i < sheets.length; i++) {
        if (sheets[i].getSheetId() === gid) return sheets[i];
      }
    }
  }
  
  var name = String(params.sheetName || BRIDGE_CONFIG.scheduleSheetName || "制作スケジュール").trim();
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  
  return ss.getSheets()[0];
}

function setupWorksDB() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    "WorksDB 初期セットアップ",
    "進捗管理表と制作スケジュール表を作成します。\\n" +
      "既存の同名シートがある場合は、WorksDB形式でなければエラーになります。続行しますか？",
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    var trackSheet = setupTrackSheet_(active);
    var scheduleSheet = setupScheduleSheet_(active, trackSheet);
    SpreadsheetApp.flush();
    ui.alert(
      "セットアップ完了",
      "進捗シート: " + trackSheet.getName() + "\\n" +
        "スケジュールシート: " + scheduleSheet.getName() + "\\n\\n" +
        "シートを再読み込みすると、カスタムメニュー「WorksDB」が表示されます。",
      ui.ButtonSet.OK
    );
  } catch (err) {
    ui.alert("セットアップエラー", String(err.message || err), ui.ButtonSet.OK);
    throw err;
  }
}

function setupTrackSheet_(ss) {
  var name = BRIDGE_CONFIG.trackSheetName;
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    var sheets = ss.getSheets();
    if (sheets.length === 1 && isBlankSheet_(sheets[0])) {
      sheet = sheets[0];
      sheet.setName(name);
    } else {
      sheet = ss.insertSheet(name);
    }
  }

  var fresh = isBlankSheet_(sheet);
  if (!fresh && String(sheet.getRange("A1").getDisplayValue()).trim() !== "No.") {
    throw new Error("「" + name + "」にはすでに異なるデータが存在します。空のシートにしてください。");
  }

  var headers = [
    "No.", "v", "code", "demo", "title", "scene", "cue", "sec",
    "進捗", "進捗%", "client", "全体要約", "初稿memo", "制作資料",
    "打ち合わせ時メモ", "リハメモ", "要約", "FB_v1", "FB_v2", "FB_v3",
    "FB_v4", "収録楽器", "予備1", "予備2", "予備3", "予備4", "予備5",
    "予備6", "予備7", "予備8", "参考曲"
  ];
  var count = 15;
  ensureSheetSize_(sheet, count + 1, headers.length);

  if (fresh) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var rows = [];
    for (var i = 1; i <= count; i++) {
      var row = new Array(headers.length).fill("");
      row[0] = i;
      row[2] = "M" + i;
      row[4] = "M" + i + "（タイトル未定）";
      row[9] = 0;
      rows.push(row);
    }
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    formatTrackSheet_(sheet, count, headers.length);
  }
  return sheet;
}

function formatTrackSheet_(sheet, count, columnCount) {
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(3);
  sheet.setRowHeight(1, 38);
  sheet.getRange(1, 1, 1, columnCount)
    .setBackground("#10243d")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.setColumnWidth(1, 45);
  sheet.setColumnWidth(2, 45);
  sheet.setColumnWidth(3, 60);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 200);
  sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(7, 60);
  sheet.setColumnWidth(8, 60);
  sheet.setColumnWidth(9, 90);
  sheet.setColumnWidth(10, 70);
  sheet.setColumnWidth(11, 70);
  
  for (var c = 12; c <= columnCount; c++) sheet.setColumnWidth(c, 180);
  for (var r = 2; r <= count + 1; r++) sheet.setRowHeight(r, 38);

  var body = sheet.getRange(2, 1, count, columnCount);
  body.setVerticalAlignment("middle").setWrap(true);
  body.applyRowBanding(SpreadsheetApp.BandingTheme.BLUE, false, false);
  sheet.getRange(2, 10, count, 1).setNumberFormat('0"%"');

  var versions = ["1","2","3","4","5","6","7","8","9","10"];
  sheet.getRange(2, 2, count, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(versions, true).setAllowInvalid(true).build()
  );
  sheet.getRange(2, 9, count, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["作曲", "編曲", "宅録", "譜面制作", "修正", "Mix", "fix", "確認中", "OK"], true)
      .setAllowInvalid(true).build()
  );
  sheet.getRange(2, 10, count, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(0, 100).setAllowInvalid(false).build()
  );
  sheet.getRange(2, 11, count, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(["OK"], true).setAllowInvalid(true).build()
  );

  if (!sheet.getFilter()) sheet.getRange(1, 1, count + 1, columnCount).createFilter();
  
  var statusRange = sheet.getRange(2, 9, count, 1);
  var percentRange = sheet.getRange(2, 10, count, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("OK")
      .setBackground("#d9ead3").setFontColor("#274e13").setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("確認中")
      .setBackground("#fff2cc").setFontColor("#7f6000").setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().setGradientMinpoint("#f4cccc")
      .setGradientMidpointWithValue("#fff2cc", SpreadsheetApp.InterpolationType.NUMBER, "50")
      .setGradientMaxpoint("#d9ead3").setRanges([percentRange]).build()
  ]);
}

function setupScheduleSheet_(ss, trackSheet) {
  var name = BRIDGE_CONFIG.scheduleSheetName;
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  var fresh = isBlankSheet_(sheet);
  if (!fresh && String(sheet.getRange("A1").getDisplayValue()).trim().toLowerCase() !== "code") {
    throw new Error("「" + name + "」には既存の異なるデータが存在します。空のシートにしてください。");
  }

  var count = 15;
  var days = ${project.daysCount};
  var columns = 6 + days;
  ensureSheetSize_(sheet, count + 2, columns);

  if (fresh) {
    sheet.clear();
    var header = ["code", "title", "memo", "収録楽器", "sec", "担当"];
    
    var start = new Date("${project.startDate}");
    if (isNaN(start.getTime())) {
      start = new Date();
    }
    start = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0);
    
    for (var d = 0; d < days; d++) {
      var date = new Date(start.getTime());
      date.setDate(start.getDate() + d);
      header.push(date);
    }
    sheet.getRange(1, 1, 1, columns).setValues([header]);
    sheet.getRange(1, 7, 1, days).setNumberFormat("yyyy-mm-dd");

    var rows = [];
    var eventRow = new Array(columns).fill("");
    eventRow[0] = "EVT";
    eventRow[1] = "イベント・共通";
    rows.push(eventRow);
    
    for (var i = 1; i <= count; i++) {
      var row = new Array(columns).fill("");
      row[0] = "M" + i;
      row[1] = "M" + i + "（タイトル未定）";
      rows.push(row);
    }
    sheet.getRange(2, 1, rows.length, columns).setValues(rows);
    formatScheduleSheet_(sheet, count, days);
  }
  return sheet;
}

function formatScheduleSheet_(sheet, count, days) {
  var columns = 6 + days;
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  sheet.setRowHeight(1, 42);
  sheet.getRange(1, 1, 1, columns)
    .setBackground("#10243d")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  
  sheet.getRange(2, 1, 1, columns).setBackground("#fff2cc").setFontWeight("bold");
  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 55);
  sheet.setColumnWidth(6, 80);
  for (var c = 7; c <= columns; c++) sheet.setColumnWidth(c, 80);
  for (var r = 2; r <= count + 2; r++) sheet.setRowHeight(r, 38);

  var taskRange = sheet.getRange(2, 7, count + 1, days);
  taskRange.setWrap(true).setHorizontalAlignment("center").setVerticalAlignment("middle");
  taskRange.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList([
        "START", "demoup", "作曲", "編曲", "譜面制作", "録音", "修正",
        "仮MIX", "本MIX", "FIX", "Check", "DEADLINE", "休み", "打ち合わせ", "リハーサル"
      ], true).setAllowInvalid(true).build()
  );

  var condRange = sheet.getRange(2, 7, count + 1, days);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("DEADLINE")
      .setBackground("#f4cccc").setFontColor("#990000").setRanges([condRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("録音")
      .setBackground("#fce5cd").setFontColor("#783f04").setRanges([condRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("作曲")
      .setBackground("#d9ead3").setFontColor("#274e13").setRanges([condRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("修正")
      .setBackground("#d0e0e3").setFontColor("#134f5c").setRanges([condRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("本MIX")
      .setBackground("#fff2cc").setFontColor("#7f6000").setRanges([condRange]).build()
  ]);
}

function isBlankSheet_(sheet) {
  return sheet.getLastRow() <= 1 && sheet.getLastColumn() <= 1 &&
    String(sheet.getRange("A1").getDisplayValue()).trim() === "";
}

function ensureSheetSize_(sheet, rows, columns) {
  if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  if (sheet.getMaxColumns() < columns) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
}

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

function handleRequest_(params) {
  var action = String(params.action || "read").toLowerCase();
  
  try {
    if (action === "ping" || action === "health") {
      return jsonResponse_({ ok: true, action: "ping", version: "worksdb-bridge-v3" });
    }
    
    if (action === "schedule") {
      return jsonResponse_(readScheduleGrid_(params));
    }
    
    if (action === "write_schedule") {
      return jsonResponse_(writeScheduleGrid_(params));
    }
    
    if (action === "write_track") {
      return jsonResponse_(writeTrackProgress_(params));
    }
    
    if (action === "setup") {
      setupWorksDB();
      return jsonResponse_({ ok: true, action: "setup" });
    }

    throw new Error("Unknown action: " + action);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

function readScheduleGrid_(params) {
  var ss = getSpreadsheet_(params);
  var sheet = getScheduleSheet_(ss, params);
  if (!sheet) throw new Error("Schedule sheet not found");

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var values = lastRow > 0 && lastCol > 0 ? sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues() : [];

  return {
    ok: true,
    action: "schedule",
    sheetId: ss.getId(),
    gid: sheet.getSheetId(),
    sheetName: sheet.getName(),
    rows: values.length,
    cols: values.length ? values[0].length : 0,
    grid: values,
    syncedAt: new Date().toISOString()
  };
}

function writeScheduleGrid_(params) {
  var ss = getSpreadsheet_(params);
  var sheet = getScheduleSheet_(ss, params);
  if (!sheet) throw new Error("Schedule sheet not found");

  var edits = params.edits;
  if (!edits || !edits.length) throw new Error("No edits found in request payload");

  for (var i = 0; i < edits.length; i++) {
    var edit = edits[i];
    var r = parseInt(edit.r, 10);
    var c = parseInt(edit.c, 10);
    var v = String(edit.v);

    var row = r + 1;
    var col = c + 1;

    ensureSheetSize_(sheet, row, col);

    sheet.getRange(row, col).setValue(v);
  }

  return {
    ok: true,
    action: "write_schedule",
    count: edits.length,
    syncedAt: new Date().toISOString()
  };
}

function writeTrackProgress_(params) {
  var trackNo = parseInt(params.trackNo, 10);
  if (!trackNo || trackNo < 1) throw new Error("trackNo is required and must be positive");
  
  var ss = getSpreadsheet_(params);
  var name = BRIDGE_CONFIG.trackSheetName;
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Progress sheet not found: " + name);

  var row = trackNo + Number(BRIDGE_CONFIG.trackRowOffset || 1);
  var cols = BRIDGE_CONFIG.columns;
  var updated = [];

  if (params.version !== undefined) {
    sheet.getRange(row, cols.version).setValue(String(params.version));
    updated.push("version");
  }
  if (params.progress !== undefined) {
    sheet.getRange(row, cols.progress).setValue(String(params.progress));
    updated.push("progress");
  }
  if (params.percent !== undefined) {
    var pct = Math.max(0, Math.min(100, parseInt(params.percent, 10) || 0));
    sheet.getRange(row, cols.percent).setValue(pct / 100);
    updated.push("percent");
  }
  if (params.client !== undefined) {
    var clientVal = String(params.client).trim().toUpperCase() === "OK" ? "OK" : "";
    sheet.getRange(row, cols.client).setValue(clientVal);
    updated.push("client");
  }
  if (params.overallSummary !== undefined) {
    sheet.getRange(row, cols.overallSummary).setValue(String(params.overallSummary));
    updated.push("overallSummary");
  }

  if (!updated.length) throw new Error("No fields to update");

  return {
    ok: true,
    action: "write_track",
    trackNo: trackNo,
    row: row,
    updated: updated,
    syncedAt: new Date().toISOString()
  };
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
      }

      // --- INITIALIZE APPLICATION ---
      window.addEventListener("DOMContentLoaded", () => {
        loadProjects();
        pairRegistryProjects();
        initTheme();

        let routeProject = "";
        try { routeProject = new URLSearchParams(window.location.search).get("project") || ""; } catch (e) {}
        const routed = routeProject && state.projects.find(project => project.id === routeProject || project.registryProjectId === routeProject || project.name === routeProject);
        const lastSelected = localStorage.getItem(SELECTED_PROJECT_KEY);
        if (routed) {
          openProjectEditor(routed.id);
        } else if (lastSelected && state.projects.some(project => project.id === lastSelected)) {
          openProjectEditor(lastSelected);
        } else {
          showView("dashboard");
        }
      });

      window.addEventListener("storage", event => {
        if (event.key !== REGISTRY_STORAGE_KEY) return;
        const currentId = state.currentProjectId;
        pairRegistryProjects();
        updateDashboardView();
        if (currentId && state.projects.some(project => project.id === currentId)) openProjectEditor(currentId);
      });

    })();
