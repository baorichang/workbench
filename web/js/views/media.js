/* 自媒体 */
if (!window.Views) window.Views = {};

Views.media = {
  STATUSES: ["构思中", "撰写中", "待发布", "已发布"],
  PLATFORMS: ["小红书", "公众号", "抖音", "B站", "其他"],
  state: { status: "全部", platform: "全部", items: [] },

  async render(ctx) {
    this.ctx = ctx;
    const view = ctx.view;
    view.innerHTML = '<div class="placeholder">加载中...</div>';
    try {
      this.state.items = await Api.get("/api/media");
      this.renderView(view);
    } catch (e) {
      Components.toast(e.message, "danger");
      view.innerHTML = "";
    }
  },

  refresh() { if (this.ctx) this.render(this.ctx); },

  parsePlatforms(text) {
    return String(text || "").split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  },

  filtered() {
    return this.state.items.filter((m) => {
      if (this.state.status !== "全部" && m.status !== this.state.status) return false;
      if (this.state.platform !== "全部" && !(m.platforms || []).includes(this.state.platform)) return false;
      return true;
    });
  },

  renderView(view) {
    const items = this.filtered();
    view.innerHTML = `
      <div class="toolbar">
        <div class="filter-tabs" id="status-tabs">
          ${["全部", ...this.STATUSES].map((s) =>
            `<button class="filter-tab ${this.state.status === s ? "active" : ""}" data-status="${s}">${s}</button>`).join("")}
        </div>
        <select id="platform-filter" style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;">
          ${["全部", ...this.PLATFORMS].map((p) =>
            `<option ${this.state.platform === p ? "selected" : ""}>${p}</option>`).join("")}
        </select>
        <button class="btn btn-primary" id="media-add">新增内容</button>
      </div>
      <div class="card-grid" id="media-list"></div>`;

    const listEl = view.querySelector("#media-list");
    if (!items.length) {
      listEl.appendChild(Components.emptyState("暂无内容选题", "新增内容", () => this.openForm(null)));
    }
    items.forEach((m) => listEl.appendChild(this.card(m)));

    view.querySelectorAll("#status-tabs .filter-tab").forEach((btn) => {
      btn.onclick = () => { this.state.status = btn.dataset.status; this.renderView(view); };
    });
    view.querySelector("#platform-filter").onchange = (e) => {
      this.state.platform = e.target.value;
      this.renderView(view);
    };
    view.querySelector("#media-add").onclick = () => this.openForm(null);
  },

  card(m) {
    const card = document.createElement("div");
    card.className = "card";
    const platforms = (m.platforms || []).map((p) => `<span class="tag tag-gray">${Components.escape(p)}</span>`).join(" ");
    const link = m.link ? `<a href="${Components.escape(m.link)}" target="_blank" rel="noopener" class="card-sub">素材链接</a>` : "";
    card.innerHTML = `
      <div class="card-title">${Components.escape(m.title)}</div>
      <div class="card-sub">${Components.escape(m.format || "")} · 计划 ${Components.escape(m.planDate || "未定")}</div>
      <div>${Components.statusLabel(m.status)} ${platforms}</div>
      ${m.draft ? `<div class="card-sub">${Components.escape(m.draft)}</div>` : ""}
      ${link}
      <div class="card-actions">
        <button class="link-btn">编辑</button>
        <button class="link-btn danger">删除</button>
      </div>`;
    card.querySelectorAll(".link-btn")[0].onclick = () => this.openForm(m);
    card.querySelectorAll(".link-btn")[1].onclick = async () => {
      const ok = await Components.confirm({ title: "删除内容", message: `确定删除「${m.title}」吗？`, danger: true });
      if (!ok) return;
      try {
        await Api.del(`/api/media/${m.id}`);
        Components.toast("已删除", "success");
        this.refresh();
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    return card;
  },

  async openForm(m) {
    const isEdit = !!m;
    const initial = m ? {
      ...m,
      platforms: (m.platforms || []).join("、")
    } : { format: "图文", status: "构思中" };
    const result = await Components.openForm({
      title: isEdit ? "编辑内容" : "新增内容",
      submitText: isEdit ? "保存" : "添加",
      initial,
      fields: [
        { key: "title", label: "标题", type: "text", required: true },
        { key: "format", label: "形式", type: "select", options: ["图文", "短视频", "脚本"] },
        { key: "platforms", label: "平台（顿号或逗号分隔）", type: "text", placeholder: "小红书、公众号" },
        { key: "status", label: "状态", type: "select", options: this.STATUSES },
        { key: "planDate", label: "计划发布日期", type: "date" },
        { key: "link", label: "素材链接", type: "url" },
        { key: "draft", label: "草稿备注", type: "textarea" }
      ]
    });
    if (!result) return;
    const values = result.values;
    values.platforms = this.parsePlatforms(values.platforms);
    // 变为已发布时记录发布日期
    if (values.status === "已发布" && (!m || m.status !== "已发布")) {
      values.publishedDate = new Date().toISOString().slice(0, 10);
    }
    try {
      if (isEdit) {
        await Api.put(`/api/media/${m.id}`, values);
        Components.toast("已保存", "success");
      } else {
        await Api.post("/api/media", values);
        Components.toast("已添加", "success");
      }
      this.refresh();
    } catch (err) { Components.toast(err.message, "danger"); }
  }
};
