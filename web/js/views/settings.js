/* 数据设置 */
if (!window.Views) window.Views = {};

Views.settings = {
  RES_LABELS: [
    { res: "memos", label: "快速备忘" },
    { res: "plans", label: "今日计划" },
    { res: "media", label: "自媒体" },
    { res: "dev-projects", label: "开发工作" },
    { res: "consults", label: "咨询工作" },
    { res: "fitness", label: "健身计划" },
    { res: "diet", label: "饮食计划" },
    { res: "games", label: "游戏娱乐" }
  ],
  pendingBackup: null,

  async render(ctx) {
    this.ctx = ctx;
    const view = ctx.view;
    view.innerHTML = '<div class="placeholder">加载中...</div>';
    try {
      const info = await Api.get("/api/system/info");
      this.renderView(view, info);
    } catch (e) {
      Components.toast(e.message, "danger");
      view.innerHTML = "";
    }
  },

  refresh() { if (this.ctx) this.render(this.ctx); },

  renderView(view, info) {
    const countsRows = this.RES_LABELS.map((r) =>
      `<div class="item-row">
        <div class="item-main">${Components.escape(r.label)}</div>
        <div class="item-meta">${info.counts[r.res] ?? 0} 条</div>
        <div class="item-actions"><button class="link-btn danger" data-clear="${r.res}" data-label="${Components.escape(r.label)}">清空</button></div>
      </div>`).join("");

    view.innerHTML = `
      <div class="section">
        <div class="section-title">数据概览</div>
        <div class="item-meta">数据存放位置：${Components.escape(info.dataDir)}</div>
        <div class="item-meta">最后保存时间：${Components.escape(info.lastSavedAt || "暂无记录")}</div>
        <div style="margin-top:12px;">${countsRows}</div>
      </div>

      <div class="section">
        <div class="section-title">备份与恢复</div>
        <div class="toolbar">
          <button class="btn btn-primary" id="export-btn">导出备份</button>
          <button class="btn" id="import-btn">选择备份文件</button>
          <input type="file" id="import-file" accept="application/json" hidden>
        </div>
        <div id="import-preview"></div>
      </div>

      <div class="section">
        <div class="section-title">关于</div>
        <div class="item-meta">我的工作台 · 本机运行，未连接网络；数据仅保存在这台电脑上。</div>
      </div>`;

    view.querySelector("#export-btn").onclick = () => this.exportBackup();
    const fileInput = view.querySelector("#import-file");
    view.querySelector("#import-btn").onclick = () => fileInput.click();
    fileInput.onchange = () => this.readBackup(fileInput);

    view.querySelectorAll("[data-clear]").forEach((btn) => {
      btn.onclick = () => this.clearResource(btn.dataset.clear, btn.dataset.label);
    });
  },

  async exportBackup() {
    try {
      const backup = await Api.get("/api/backup/export");
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const a = document.createElement("a");
      a.href = url;
      a.download = `工作台备份-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Components.toast("备份已导出", "success");
    } catch (err) {
      Components.toast(err.message, "danger");
    }
  },

  readBackup(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const payload = JSON.parse(reader.result);
        const overview = await Api.post("/api/backup/import", payload);
        this.pendingBackup = payload;
        const previewEl = this.ctx.view.querySelector("#import-preview");
        const rows = Object.entries(overview).map(([res, n]) => {
          const label = (this.RES_LABELS.find((r) => r.res === res) || {}).label || res;
          return `<div class="item-meta">${Components.escape(label)}：${n} 条</div>`;
        }).join("");
        previewEl.innerHTML = `
          <div class="section" style="margin:12px 0 0;">
            <div class="section-title">备份内容概览</div>
            ${rows}
            <div class="toolbar" style="margin-top:12px;">
              <button class="btn btn-danger" id="restore-btn">确认覆盖恢复</button>
            </div>
          </div>`;
        previewEl.querySelector("#restore-btn").onclick = () => this.restore();
      } catch (err) {
        Components.toast(err.message, "danger");
      } finally {
        fileInput.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  },

  async restore() {
    if (!this.pendingBackup) return;
    const ok = await Components.confirm({
      title: "覆盖恢复",
      message: "恢复将覆盖当前全部数据，确定继续吗？",
      danger: true
    });
    if (!ok) return;
    try {
      await Api.post("/api/backup/restore", this.pendingBackup);
      this.pendingBackup = null;
      Components.toast("数据已恢复", "success");
      this.refresh();
    } catch (err) {
      Components.toast(err.message, "danger");
    }
  },

  async clearResource(res, label) {
    const ok = await Components.confirm({
      title: "清空板块",
      message: `确定清空「${label}」的全部数据吗？此操作不可恢复。`,
      danger: true
    });
    if (!ok) return;
    try {
      await Api.post(`/api/${res}/clear`);
      Components.toast(`「${label}」已清空`, "success");
      this.refresh();
    } catch (err) {
      Components.toast(err.message, "danger");
    }
  }
};
