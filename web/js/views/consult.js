/* 咨询工作 */
if (!window.Views) window.Views = {};

Views.consult = {
  STATUSES: ["待联系", "沟通中", "待回复", "已结束"],
  state: { status: "全部", items: [] },

  async render(ctx) {
    this.ctx = ctx;
    const view = ctx.view;
    view.innerHTML = '<div class="placeholder">加载中...</div>';
    try {
      const id = ctx.params[0];
      if (id) {
        const item = await Api.get(`/api/consults/${id}`);
        this.renderDetail(view, item);
      } else {
        this.state.items = await Api.get("/api/consults");
        this.renderList(view);
      }
    } catch (e) {
      Components.toast(e.message, "danger");
      view.innerHTML = "";
    }
  },

  refresh() { if (this.ctx) this.render(this.ctx); },

  filtered() {
    return this.state.items.filter((c) =>
      this.state.status === "全部" || c.status === this.state.status);
  },

  renderList(view) {
    const items = this.filtered();
    view.innerHTML = `
      <div class="toolbar">
        <div class="filter-tabs" id="status-tabs">
          ${["全部", ...this.STATUSES].map((s) =>
            `<button class="filter-tab ${this.state.status === s ? "active" : ""}" data-status="${s}">${s}</button>`).join("")}
        </div>
        <button class="btn btn-primary" id="consult-add">新增对象</button>
      </div>
      <div id="consult-list"></div>`;
    const listEl = view.querySelector("#consult-list");
    if (!items.length) {
      listEl.appendChild(Components.emptyState("暂无咨询对象", "新增对象", () => this.openForm(null)));
    }
    items.forEach((c) => listEl.appendChild(this.row(c)));

    view.querySelectorAll("#status-tabs .filter-tab").forEach((btn) => {
      btn.onclick = () => { this.state.status = btn.dataset.status; this.renderList(view); };
    });
    view.querySelector("#consult-add").onclick = () => this.openForm(null);
  },

  row(c) {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="item-main">
        <div class="item-title">${Components.escape(c.name)}</div>
        <div class="item-meta">
          ${Components.statusLabel(c.status)}
          ${c.topic ? ` · ${Components.escape(c.topic)}` : ""}
          ${c.appointment ? ` · 约定 ${Components.escape(c.appointment)}` : ""}
          ${c.nextFollow ? ` · 下次跟进 ${Components.escape(c.nextFollow)}` : ""}
        </div>
      </div>
      <div class="item-actions">
        <button class="link-btn">详情</button>
        <button class="link-btn">编辑</button>
        <button class="link-btn danger">删除</button>
      </div>`;
    const [detailBtn, editBtn, delBtn] = row.querySelectorAll(".link-btn");
    detailBtn.onclick = () => { location.hash = `#/consult/${c.id}`; };
    editBtn.onclick = () => this.openForm(c);
    delBtn.onclick = async () => {
      const ok = await Components.confirm({ title: "删除对象", message: `确定删除「${c.name}」及其笔记吗？`, danger: true });
      if (!ok) return;
      try {
        await Api.del(`/api/consults/${c.id}`);
        Components.toast("已删除", "success");
        this.refresh();
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    return row;
  },

  renderDetail(view, c) {
    const notes = (c.notes || []).slice().reverse();
    view.innerHTML = `
      <div class="detail-head">
        <button class="btn back-btn" id="back">← 返回列表</button>
        <div class="card-title">${Components.escape(c.name)}</div>
        ${Components.statusLabel(c.status)}
      </div>
      <div class="section">
        <div class="section-title">基本信息</div>
        <div class="item-meta">联系方式：${Components.escape(c.contact || "未填")}</div>
        <div class="item-meta">主题：${Components.escape(c.topic || "未填")}</div>
        <div class="item-meta">来源：${Components.escape(c.source || "未填")}</div>
        <div class="item-meta">约定时间：${Components.escape(c.appointment || "未填")}</div>
        <div class="item-meta">下次跟进：${Components.escape(c.nextFollow || "未填")}</div>
        ${c.note ? `<p class="card-sub">${Components.escape(c.note)}</p>` : ""}
        <div class="card-actions" style="margin-top:12px;">
          <button class="link-btn" id="edit-consult">编辑信息</button>
        </div>
      </div>
      <div class="section">
        <div class="section-title">跟进笔记（${notes.length}）</div>
        <div class="toolbar">
          <input id="note-input" type="text" placeholder="记录一次跟进内容" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;">
          <button class="btn btn-primary" id="note-add">追加笔记</button>
        </div>
        <div id="note-list"></div>
      </div>`;

    view.querySelector("#back").onclick = () => { location.hash = "#/consult"; };
    view.querySelector("#edit-consult").onclick = () => this.openForm(c);

    const noteList = view.querySelector("#note-list");
    const drawNotes = () => {
      noteList.innerHTML = "";
      if (!notes.length) {
        noteList.innerHTML = '<div class="item-meta">暂无笔记</div>';
        return;
      }
      notes.forEach((n) => {
        const item = document.createElement("div");
        item.className = "item-row";
        item.innerHTML = `
          <div class="item-main">
            <div>${Components.escape(n.text)}</div>
            <div class="item-meta">${Components.escape(n.createdAt || "")}</div>
          </div>`;
        noteList.appendChild(item);
      });
    };
    drawNotes();

    const addNote = async () => {
      const text = view.querySelector("#note-input").value.trim();
      if (!text) { Components.toast("请输入笔记内容", "danger"); return; }
      try {
        await Api.post(`/api/consults/${c.id}/notes`, { text });
        Components.toast("已记录", "success");
        this.refresh();
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    view.querySelector("#note-add").onclick = addNote;
    view.querySelector("#note-input").onkeydown = (e) => { if (e.key === "Enter") addNote(); };
  },

  async openForm(c) {
    const isEdit = !!c;
    const result = await Components.openForm({
      title: isEdit ? "编辑对象" : "新增对象",
      submitText: isEdit ? "保存" : "添加",
      initial: c || { status: "待联系" },
      fields: [
        { key: "name", label: "称呼 / 代号", type: "text", required: true },
        { key: "contact", label: "联系方式", type: "text" },
        { key: "topic", label: "咨询主题", type: "text" },
        { key: "source", label: "来源", type: "text" },
        { key: "status", label: "状态", type: "select", options: this.STATUSES },
        { key: "appointment", label: "约定时间", type: "date" },
        { key: "nextFollow", label: "下次跟进日期", type: "date" },
        { key: "note", label: "备注", type: "textarea" }
      ]
    });
    if (!result) return;
    try {
      if (isEdit) {
        await Api.put(`/api/consults/${c.id}`, result.values);
        Components.toast("已保存", "success");
      } else {
        await Api.post("/api/consults", result.values);
        Components.toast("已添加", "success");
      }
      this.refresh();
    } catch (err) { Components.toast(err.message, "danger"); }
  }
};
