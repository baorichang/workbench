/* 游戏娱乐 */
if (!window.Views) window.Views = {};

Views.games = {
  STATUSES: ["待玩", "在玩", "已通关", "弃坑"],
  state: { status: "全部", wishOnly: false, items: [] },

  async render(ctx) {
    this.ctx = ctx;
    const view = ctx.view;
    view.innerHTML = '<div class="placeholder">加载中...</div>';
    try {
      this.state.items = await Api.get("/api/games");
      this.renderView(view);
    } catch (e) {
      Components.toast(e.message, "danger");
      view.innerHTML = "";
    }
  },

  refresh() { if (this.ctx) this.render(this.ctx); },

  filtered() {
    return this.state.items.filter((g) => {
      if (this.state.status !== "全部" && g.status !== this.state.status) return false;
      if (this.state.wishOnly && !g.wishlist) return false;
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
        <label style="color:var(--text-sub);display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="wish-filter" ${this.state.wishOnly ? "checked" : ""}> 仅看愿望单
        </label>
        <button class="btn btn-primary" id="game-add">新增游戏</button>
      </div>
      <div class="card-grid" id="game-list"></div>`;

    const listEl = view.querySelector("#game-list");
    if (!items.length) {
      listEl.appendChild(Components.emptyState("暂无游戏记录", "新增游戏", () => this.openForm(null)));
    }
    items.forEach((g) => listEl.appendChild(this.card(g)));

    view.querySelectorAll("#status-tabs .filter-tab").forEach((btn) => {
      btn.onclick = () => { this.state.status = btn.dataset.status; this.renderView(view); };
    });
    view.querySelector("#wish-filter").onchange = (e) => {
      this.state.wishOnly = e.target.checked;
      this.renderView(view);
    };
    view.querySelector("#game-add").onclick = () => this.openForm(null);
  },

  card(g) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${g.wishlist ? "⭐ " : ""}${Components.escape(g.name)}</div>
      <div class="card-sub">${Components.escape(g.platform || "未填平台")}</div>
      <div>${Components.statusLabel(g.status)} ${g.progress ? `<span class="tag tag-gray">${Components.escape(g.progress)}</span>` : ""}</div>
      ${g.duration ? `<div class="card-sub">时长：${Components.escape(g.duration)}</div>` : ""}
      ${g.note ? `<div class="card-sub">${Components.escape(g.note)}</div>` : ""}
      <div class="card-actions">
        <button class="link-btn" data-act="wish">${g.wishlist ? "移出愿望单" : "加入愿望单"}</button>
        <button class="link-btn">编辑</button>
        <button class="link-btn danger">删除</button>
      </div>`;
    const [wishBtn, editBtn, delBtn] = card.querySelectorAll(".link-btn");
    wishBtn.onclick = async () => {
      try {
        await Api.put(`/api/games/${g.id}`, { wishlist: !g.wishlist });
        this.refresh();
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    editBtn.onclick = () => this.openForm(g);
    delBtn.onclick = async () => {
      const ok = await Components.confirm({ title: "删除游戏", message: `确定删除「${g.name}」吗？`, danger: true });
      if (!ok) return;
      try {
        await Api.del(`/api/games/${g.id}`);
        Components.toast("已删除", "success");
        this.refresh();
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    return card;
  },

  async openForm(g) {
    const isEdit = !!g;
    const result = await Components.openForm({
      title: isEdit ? "编辑游戏" : "新增游戏",
      initial: g || { status: "待玩", wishlist: false },
      fields: [
        { key: "name", label: "名称", type: "text", required: true },
        { key: "platform", label: "平台", type: "text" },
        { key: "status", label: "状态", type: "select", options: this.STATUSES },
        { key: "progress", label: "进度", type: "text" },
        { key: "duration", label: "时长", type: "text" },
        { key: "wishlist", label: "愿望单", type: "checkbox" },
        { key: "note", label: "笔记", type: "textarea" }
      ]
    });
    if (!result) return;
    try {
      if (isEdit) {
        await Api.put(`/api/games/${g.id}`, result.values);
        Components.toast("已保存", "success");
      } else {
        await Api.post("/api/games", result.values);
        Components.toast("已添加", "success");
      }
      this.refresh();
    } catch (err) { Components.toast(err.message, "danger"); }
  }
};
