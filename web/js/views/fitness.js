/* 健身计划 */
if (!window.Views) window.Views = {};

Views.fitness = {
  TABS: [
    { key: "plans", label: "训练计划" },
    { key: "logs", label: "训练日志" },
    { key: "body", label: "身体数据" }
  ],
  state: { tab: "plans", data: { plans: [], logs: [], body: [] } },

  async render(ctx) {
    this.ctx = ctx;
    const view = ctx.view;
    view.innerHTML = '<div class="placeholder">加载中...</div>';
    try {
      this.state.data = await Api.get("/api/fitness");
      this.renderView(view);
    } catch (e) {
      Components.toast(e.message, "danger");
      view.innerHTML = "";
    }
  },

  refresh() { if (this.ctx) this.render(this.ctx); },

  renderView(view) {
    const tab = this.state.tab;
    view.innerHTML = `
      <div class="tabs">
        ${this.TABS.map((t) => `<button class="tab ${tab === t.key ? "active" : ""}" data-tab="${t.key}">${t.label}</button>`).join("")}
      </div>
      <div id="tab-body"></div>`;
    view.querySelectorAll(".tab").forEach((btn) => {
      btn.onclick = () => { this.state.tab = btn.dataset.tab; this.renderView(view); };
    });
    const body = view.querySelector("#tab-body");
    if (tab === "plans") this.renderPlans(body);
    else if (tab === "logs") this.renderLogs(body);
    else this.renderBody(body);
  },

  // ---------- 训练计划 ----------
  renderPlans(body) {
    const plans = this.state.data.plans;
    body.innerHTML = `
      <div class="toolbar"><button class="btn btn-primary" id="add-plan">新增动作</button></div>
      <div id="plan-list"></div>`;
    const listEl = body.querySelector("#plan-list");
    const groups = {};
    plans.forEach((p) => { (groups[p.day || "未分类"] = groups[p.day || "未分类"] || []).push(p); });
    const days = Object.keys(groups).sort();
    if (!days.length) {
      listEl.appendChild(Components.emptyState("还没有训练计划", "新增动作", () => this.openPlanForm(null)));
    }
    days.forEach((day) => {
      const head = document.createElement("div");
      head.className = "section-title";
      head.style.margin = "14px 0 8px";
      head.textContent = day;
      listEl.appendChild(head);
      groups[day].forEach((p) => listEl.appendChild(this.planRow(p)));
    });
    body.querySelector("#add-plan").onclick = () => this.openPlanForm(null);
  },

  planRow(p) {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="item-main">
        <div class="item-title">${Components.escape(p.name)}</div>
        <div class="item-meta">${Components.escape(p.sets || "")} 组 · ${Components.escape(p.reps || "")} 次 · ${Components.escape(p.weight || "")}${p.note ? ` · ${Components.escape(p.note)}` : ""}</div>
      </div>
      <div class="item-actions">
        <button class="link-btn">编辑</button>
        <button class="link-btn danger">删除</button>
      </div>`;
    const [editBtn, delBtn] = row.querySelectorAll(".link-btn");
    editBtn.onclick = () => this.openPlanForm(p);
    delBtn.onclick = () => this.remove("plans", p);
    return row;
  },

  async openPlanForm(p) {
    const isEdit = !!p;
    const result = await Components.openForm({
      title: isEdit ? "编辑动作" : "新增动作",
      initial: p || {},
      fields: [
        { key: "day", label: "训练日", type: "text", placeholder: "如：胸 / 背 / 腿" },
        { key: "name", label: "动作名", type: "text", required: true },
        { key: "sets", label: "组数", type: "text" },
        { key: "reps", label: "次数", type: "text" },
        { key: "weight", label: "重量", type: "text" },
        { key: "note", label: "备注", type: "textarea" }
      ]
    });
    if (!result) return;
    await this.save("plans", p, result.values);
  },

  // ---------- 训练日志 ----------
  renderLogs(body) {
    const logs = this.state.data.logs.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    body.innerHTML = `
      <div class="toolbar"><button class="btn btn-primary" id="add-log">打卡训练</button></div>
      <div id="log-list"></div>`;
    const listEl = body.querySelector("#log-list");
    if (!logs.length) {
      listEl.appendChild(Components.emptyState("还没有训练记录", "打卡训练", () => this.openLogForm(null)));
    }
    logs.forEach((l) => listEl.appendChild(this.logRow(l)));
    body.querySelector("#add-log").onclick = () => this.openLogForm(null);
  },

  logRow(l) {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="item-main">
        <div class="item-title">${Components.escape(l.date || "")}</div>
        <div class="item-meta">${Components.escape(l.content || "")}${l.feeling ? ` · ${Components.escape(l.feeling)}` : ""}</div>
      </div>
      <div class="item-actions">
        <button class="link-btn">编辑</button>
        <button class="link-btn danger">删除</button>
      </div>`;
    const [editBtn, delBtn] = row.querySelectorAll(".link-btn");
    editBtn.onclick = () => this.openLogForm(l);
    delBtn.onclick = () => this.remove("logs", l);
    return row;
  },

  async openLogForm(l) {
    const isEdit = !!l;
    const planText = this.state.data.plans
      .map((p) => `${p.name}${p.sets ? ` ${p.sets}组` : ""}${p.reps ? `x${p.reps}` : ""}`)
      .join("、");
    const result = await Components.openForm({
      title: isEdit ? "编辑日志" : "训练打卡",
      initial: l || { date: new Date().toISOString().slice(0, 10), content: planText },
      fields: [
        { key: "date", label: "日期", type: "date", required: true },
        { key: "content", label: "训练内容", type: "textarea", placeholder: "练了哪些动作" },
        { key: "feeling", label: "完成情况 / 感受", type: "text" }
      ]
    });
    if (!result) return;
    await this.save("logs", l, result.values);
  },

  // ---------- 身体数据 ----------
  renderBody(body) {
    const rows = this.state.data.body.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    body.innerHTML = `
      <div class="toolbar"><button class="btn btn-primary" id="add-body">记录数据</button></div>
      <div id="body-list"></div>`;
    const listEl = body.querySelector("#body-list");
    if (!rows.length) {
      listEl.appendChild(Components.emptyState("还没有身体数据", "记录数据", () => this.openBodyForm(null)));
    }
    rows.forEach((b) => listEl.appendChild(this.bodyRow(b)));
    body.querySelector("#add-body").onclick = () => this.openBodyForm(null);
  },

  bodyRow(b) {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="item-main">
        <div class="item-title">${Components.escape(b.date || "")}</div>
        <div class="item-meta">体重：${Components.escape(b.weight || "未填")}${b.note ? ` · ${Components.escape(b.note)}` : ""}</div>
      </div>
      <div class="item-actions">
        <button class="link-btn">编辑</button>
        <button class="link-btn danger">删除</button>
      </div>`;
    const [editBtn, delBtn] = row.querySelectorAll(".link-btn");
    editBtn.onclick = () => this.openBodyForm(b);
    delBtn.onclick = () => this.remove("body", b);
    return row;
  },

  async openBodyForm(b) {
    const isEdit = !!b;
    const result = await Components.openForm({
      title: isEdit ? "编辑数据" : "记录身体数据",
      initial: b || { date: new Date().toISOString().slice(0, 10) },
      fields: [
        { key: "date", label: "日期", type: "date", required: true },
        { key: "weight", label: "体重", type: "text" },
        { key: "note", label: "备注（围度 / 状态）", type: "textarea" }
      ]
    });
    if (!result) return;
    await this.save("body", b, result.values);
  },

  // ---------- 子块通用操作 ----------
  async save(block, item, values) {
    try {
      if (item) {
        await Api.put(`/api/fitness/${block}/${item.id}`, values);
        Components.toast("已保存", "success");
      } else {
        await Api.post(`/api/fitness/${block}`, values);
        Components.toast("已添加", "success");
      }
      this.refresh();
    } catch (err) { Components.toast(err.message, "danger"); }
  },

  async remove(block, item) {
    const ok = await Components.confirm({ title: "删除记录", message: "确定删除这条记录吗？", danger: true });
    if (!ok) return;
    try {
      await Api.del(`/api/fitness/${block}/${item.id}`);
      Components.toast("已删除", "success");
      this.refresh();
    } catch (err) { Components.toast(err.message, "danger"); }
  }
};
