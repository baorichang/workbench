/* 今日计划 */
if (!window.Views) window.Views = {};

Views.plan = {
  state: { mode: "today", priority: "全部", items: [] },

  async render(ctx) {
    this.ctx = ctx;
    const view = ctx.view;
    view.innerHTML = '<div class="placeholder">加载中...</div>';
    try {
      this.state.items = await Api.get("/api/plans");
      this.renderView(view);
    } catch (e) {
      Components.toast(e.message, "danger");
      view.innerHTML = "";
    }
  },

  refresh() { if (this.ctx) this.render(this.ctx); },

  today() { return new Date().toISOString().slice(0, 10); },

  filtered() {
    const today = this.today();
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    return this.state.items.filter((p) => {
      if (this.state.mode === "today" && p.date !== today) return false;
      if (this.state.mode === "week" && (p.date < today || p.date > weekEndStr)) return false;
      if (this.state.priority !== "全部" && p.priority !== this.state.priority) return false;
      return true;
    }).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  },

  renderView(view) {
    const items = this.filtered();
    const groups = {};
    items.forEach((p) => {
      const key = p.date || "未排期";
      (groups[key] = groups[key] || []).push(p);
    });

    view.innerHTML = `
      <div class="toolbar">
        <div class="filter-tabs" id="mode-tabs">
          <button class="filter-tab ${this.state.mode === "today" ? "active" : ""}" data-mode="today">今天</button>
          <button class="filter-tab ${this.state.mode === "week" ? "active" : ""}" data-mode="week">近 7 天</button>
          <button class="filter-tab ${this.state.mode === "all" ? "active" : ""}" data-mode="all">全部</button>
        </div>
        <select id="priority-filter" style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;">
          ${["全部", "高", "中", "低"].map((x) => `<option ${this.state.priority === x ? "selected" : ""}>${x}</option>`).join("")}
        </select>
        <button class="btn btn-primary" id="plan-add">新增任务</button>
      </div>
      <div id="plan-list"></div>`;

    const listEl = view.querySelector("#plan-list");
    const dates = Object.keys(groups).sort();
    if (!dates.length) {
      listEl.appendChild(Components.emptyState("暂无任务，新增一条安排吧", "新增任务", () => this.openForm(null)));
    }
    dates.forEach((date) => {
      const head = document.createElement("div");
      head.className = "section-title";
      head.style.margin = "14px 0 8px";
      head.textContent = date;
      listEl.appendChild(head);
      groups[date].forEach((p) => listEl.appendChild(this.row(p)));
    });

    view.querySelectorAll("#mode-tabs .filter-tab").forEach((btn) => {
      btn.onclick = () => { this.state.mode = btn.dataset.mode; this.refresh(); };
    });
    view.querySelector("#priority-filter").onchange = (e) => {
      this.state.priority = e.target.value;
      this.renderView(view);
    };
    view.querySelector("#plan-add").onclick = () => this.openForm(null);
  },

  row(p) {
    const today = this.today();
    const expired = !p.done && p.date && p.date < today;
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <input type="checkbox" ${p.done ? "checked" : ""}>
      <div class="item-main">
        <div class="item-title ${p.done ? "done" : ""}">${Components.escape(p.title)}</div>
        <div class="item-meta">
          ${Components.statusLabel(p.priority)}
          <span style="${expired ? "color:var(--danger);" : ""}">${Components.escape(p.date || "")}</span>
          ${p.note ? ` · ${Components.escape(p.note)}` : ""}
        </div>
      </div>
      <div class="item-actions">
        <button class="link-btn">编辑</button>
        <button class="link-btn danger">删除</button>
      </div>`;

    row.querySelector("input").onchange = async (e) => {
      try {
        await Api.put(`/api/plans/${p.id}`, { done: e.target.checked });
        p.done = e.target.checked;
        this.renderView(this.ctx.view);
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    row.querySelectorAll(".link-btn")[0].onclick = () => this.openForm(p);
    row.querySelectorAll(".link-btn")[1].onclick = async () => {
      const ok = await Components.confirm({ title: "删除任务", message: `确定删除「${p.title}」吗？`, danger: true });
      if (!ok) return;
      try {
        await Api.del(`/api/plans/${p.id}`);
        Components.toast("已删除", "success");
        this.refresh();
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    return row;
  },

  async openForm(p) {
    const isEdit = !!p;
    const result = await Components.openForm({
      title: isEdit ? "编辑任务" : "新增任务",
      submitText: isEdit ? "保存" : "添加",
      initial: p || { date: this.today(), priority: "中" },
      fields: [
        { key: "title", label: "标题", type: "text", required: true, placeholder: "要做什么" },
        { key: "date", label: "日期", type: "date", required: true },
        { key: "priority", label: "优先级", type: "select", options: ["高", "中", "低"] },
        { key: "note", label: "备注", type: "textarea", placeholder: "选填" }
      ]
    });
    if (!result) return;
    try {
      if (isEdit) {
        await Api.put(`/api/plans/${p.id}`, result.values);
        Components.toast("已保存", "success");
      } else {
        await Api.post("/api/plans", { ...result.values, done: false });
        Components.toast("已添加", "success");
      }
      this.refresh();
    } catch (err) { Components.toast(err.message, "danger"); }
  }
};
