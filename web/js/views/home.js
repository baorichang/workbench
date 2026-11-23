/* 首页总览 */
if (!window.Views) window.Views = {};

Views.home = {
  CARDS: [
    { key: "media", label: "自媒体", route: "#/media", hint: "待发布" },
    { key: "dev", label: "开发工作", route: "#/dev", hint: "进行中项目" },
    { key: "consult", label: "咨询工作", route: "#/consult", hint: "待跟进" },
    { key: "fitness", label: "健身计划", route: "#/fitness", hint: "本周打卡" },
    { key: "diet", label: "饮食计划", route: "#/diet", hint: "今日饮食" },
    { key: "games", label: "游戏娱乐", route: "#/games", hint: "在玩 / 待玩" }
  ],

  latestText(item) {
    if (!item) return "暂无记录";
    return item.title || item.name || item.content || item.food || "暂无记录";
  },

  async render(ctx) {
    this.ctx = ctx;
    const view = ctx.view;
    view.innerHTML = '<div class="placeholder">加载中...</div>';
    try {
      const [summary, memos, plans] = await Promise.all([
        Api.get("/api/summary"),
        Api.get("/api/memos"),
        Api.get("/api/plans")
      ]);
      this.renderView(view, summary, memos, plans);
    } catch (e) {
      Components.toast(e.message, "danger");
      view.innerHTML = "";
    }
  },

  refresh() {
    if (this.ctx) this.render(this.ctx);
  },

  renderView(view, summary, memos, plans) {
    const today = new Date().toISOString().slice(0, 10);
    const todayPlans = plans.filter((p) => p.date === today);
    const topPlans = todayPlans.slice(0, 5);

    view.innerHTML = `
      <div class="section">
        <div class="section-title">今日安排</div>
        <div>今日计划完成进度：<b>${summary.todayPlan.done} / ${summary.todayPlan.total}</b></div>
      </div>

      <div class="section">
        <div class="section-title">快速备忘录</div>
        <div class="toolbar">
          <input id="memo-input" type="text" placeholder="随手记一条，回车保存" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;">
          <button class="btn btn-primary" id="memo-add">添加</button>
        </div>
        <div id="memo-list"></div>
      </div>

      <div class="section">
        <div class="section-title">今日计划摘要</div>
        <div id="plan-summary"></div>
      </div>

      <div class="summary-grid" id="summary-cards"></div>
    `;

    this.bindMemos(view, memos);
    this.bindPlans(view, topPlans);
    this.bindCards(view, summary.cards);
  },

  bindMemos(view, memos) {
    const listEl = view.querySelector("#memo-list");
    const input = view.querySelector("#memo-input");
    const addBtn = view.querySelector("#memo-add");

    const draw = () => {
      const undone = memos.filter((m) => !m.done);
      const done = memos.filter((m) => m.done);
      listEl.innerHTML = "";
      if (!undone.length && !done.length) {
        listEl.innerHTML = '<div class="item-meta">暂无备忘</div>';
        return;
      }
      undone.forEach((m) => listEl.appendChild(this.memoRow(m, memos, false)));
      if (done.length) {
        const head = document.createElement("div");
        head.className = "item-meta";
        head.style.marginTop = "10px";
        head.textContent = `已完成（${done.length}）`;
        listEl.appendChild(head);
        done.forEach((m) => listEl.appendChild(this.memoRow(m, memos, true)));
      }
    };

    const add = async () => {
      const text = input.value.trim();
      if (!text) { Components.toast("请输入备忘内容", "danger"); return; }
      try {
        await Api.post("/api/memos", { text, done: false });
        this.refresh();
      } catch (e) { Components.toast(e.message, "danger"); }
    };

    addBtn.onclick = add;
    input.onkeydown = (e) => { if (e.key === "Enter") add(); };
    draw();
  },

  memoRow(memo, all, isDone) {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <input type="checkbox" ${memo.done ? "checked" : ""}>
      <div class="item-main"><div class="item-title ${memo.done ? "done" : ""}">${Components.escape(memo.text)}</div></div>
      <div class="item-actions"><button class="link-btn danger">删除</button></div>`;
    row.querySelector("input").onchange = async (e) => {
      try {
        await Api.put(`/api/memos/${memo.id}`, { done: e.target.checked });
        this.refresh();
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    row.querySelector(".link-btn").onclick = async () => {
      const ok = await Components.confirm({ title: "删除备忘", message: "确定删除这条备忘吗？", danger: true });
      if (!ok) return;
      try {
        await Api.del(`/api/memos/${memo.id}`);
        this.refresh();
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    return row;
  },

  bindPlans(view, topPlans) {
    const el = view.querySelector("#plan-summary");
    if (!topPlans.length) {
      el.innerHTML = '<div class="item-meta">今天暂无安排</div>';
    }
    topPlans.forEach((p) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `
        <input type="checkbox" ${p.done ? "checked" : ""}>
        <div class="item-main">
          <div class="item-title ${p.done ? "done" : ""}">${Components.escape(p.title)}</div>
          <div class="item-meta">${Components.escape(p.priority || "")} · ${Components.escape(p.date || "")}</div>
        </div>`;
      row.querySelector("input").onchange = async (e) => {
        try {
          await Api.put(`/api/plans/${p.id}`, { done: e.target.checked });
          this.refresh();
        } catch (err) { Components.toast(err.message, "danger"); }
      };
      el.appendChild(row);
    });
    const more = document.createElement("button");
    more.className = "link-btn";
    more.textContent = "查看全部 →";
    more.onclick = () => { location.hash = "#/plan"; };
    el.appendChild(more);
  },

  bindCards(view, cards) {
    const el = view.querySelector("#summary-cards");
    this.CARDS.forEach((c) => {
      const data = cards[c.key] || { count: "-", latest: null };
      const card = document.createElement("div");
      card.className = "summary-card";
      card.innerHTML = `
        <div class="card-sub">${c.label}</div>
        <div class="num">${Components.escape(String(data.count))}</div>
        <div class="latest">${Components.escape(this.latestText(data.latest))}</div>`;
      card.onclick = () => { location.hash = c.route; };
      el.appendChild(card);
    });
  }
};
