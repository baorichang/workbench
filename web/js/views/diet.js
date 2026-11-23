/* 饮食计划 */
if (!window.Views) window.Views = {};

Views.diet = {
  MEALS: ["早餐", "午餐", "晚餐", "加餐"],
  state: { date: new Date().toISOString().slice(0, 10), meals: [], recipes: [] },

  async render(ctx) {
    this.ctx = ctx;
    const view = ctx.view;
    view.innerHTML = '<div class="placeholder">加载中...</div>';
    try {
      const data = await Api.get("/api/diet");
      this.state.meals = data.meals;
      this.state.recipes = data.recipes;
      this.renderView(view);
    } catch (e) {
      Components.toast(e.message, "danger");
      view.innerHTML = "";
    }
  },

  refresh() { if (this.ctx) this.render(this.ctx); },

  shiftDate(days) {
    const d = new Date(this.state.date + "T00:00:00");
    d.setDate(d.getDate() + days);
    this.state.date = d.toISOString().slice(0, 10);
    this.renderView(this.ctx.view);
  },

  renderView(view) {
    const dayMeals = this.state.meals.filter((m) => m.date === this.state.date);
    view.innerHTML = `
      <div class="toolbar">
        <div class="filter-tabs">
          <button class="filter-tab" id="prev-day">← 前一天</button>
          <button class="filter-tab active" id="cur-day">${this.state.date}</button>
          <button class="filter-tab" id="next-day">后一天 →</button>
        </div>
        <button class="btn btn-primary" id="add-meal">记录饮食</button>
      </div>
      <div id="meal-sections"></div>
      <div class="section">
        <div class="section-title">常吃搭配</div>
        <div class="toolbar"><button class="btn" id="add-recipe">新增搭配</button></div>
        <div id="recipe-list"></div>
      </div>`;

    view.querySelector("#prev-day").onclick = () => this.shiftDate(-1);
    view.querySelector("#next-day").onclick = () => this.shiftDate(1);
    view.querySelector("#cur-day").onclick = () => {
      this.state.date = new Date().toISOString().slice(0, 10);
      this.renderView(view);
    };
    view.querySelector("#add-meal").onclick = () => this.openMealForm(null);
    view.querySelector("#add-recipe").onclick = () => this.openRecipeForm(null);

    const sections = view.querySelector("#meal-sections");
    this.MEALS.forEach((meal) => {
      const items = dayMeals.filter((m) => m.meal === meal);
      const sec = document.createElement("div");
      sec.className = "section";
      sec.innerHTML = `<div class="section-title">${meal}（${items.length}）</div><div class="items"></div>`;
      const box = sec.querySelector(".items");
      if (!items.length) {
        box.innerHTML = '<div class="item-meta">暂无记录</div>';
      }
      items.forEach((m) => box.appendChild(this.mealRow(m)));
      sections.appendChild(sec);
    });

    const recipeList = view.querySelector("#recipe-list");
    if (!this.state.recipes.length) {
      recipeList.innerHTML = '<div class="item-meta">暂无常吃搭配</div>';
    }
    this.state.recipes.forEach((r) => recipeList.appendChild(this.recipeRow(r)));
  },

  mealRow(m) {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="item-main">
        <div class="item-title">${Components.escape(m.food)}</div>
        <div class="item-meta">${Components.escape(m.portion || "")}${m.tag ? ` · ${Components.escape(m.tag)}` : ""}${m.note ? ` · ${Components.escape(m.note)}` : ""}</div>
      </div>
      <div class="item-actions">
        <button class="link-btn">编辑</button>
        <button class="link-btn danger">删除</button>
      </div>`;
    const [editBtn, delBtn] = row.querySelectorAll(".link-btn");
    editBtn.onclick = () => this.openMealForm(m);
    delBtn.onclick = () => this.remove("meals", m);
    return row;
  },

  async openMealForm(m) {
    const isEdit = !!m;
    const result = await Components.openForm({
      title: isEdit ? "编辑饮食记录" : "记录饮食",
      initial: m || { date: this.state.date, meal: "午餐" },
      fields: [
        { key: "meal", label: "餐次", type: "select", options: this.MEALS },
        { key: "food", label: "食物", type: "text", required: true },
        { key: "portion", label: "份量", type: "text" },
        { key: "tag", label: "标签", type: "text", placeholder: "如：减脂 / 放纵餐" },
        { key: "note", label: "备注", type: "textarea" }
      ]
    });
    if (!result) return;
    const values = { ...result.values, date: this.state.date };
    await this.save("meals", m, values);
  },

  recipeRow(r) {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="item-main">
        <div class="item-title">${Components.escape(r.name)}</div>
        <div class="item-meta">${Components.escape(r.content || "")}</div>
      </div>
      <div class="item-actions">
        <button class="link-btn">编辑</button>
        <button class="link-btn danger">删除</button>
      </div>`;
    const [editBtn, delBtn] = row.querySelectorAll(".link-btn");
    editBtn.onclick = () => this.openRecipeForm(r);
    delBtn.onclick = () => this.remove("recipes", r);
    return row;
  },

  async openRecipeForm(r) {
    const isEdit = !!r;
    const result = await Components.openForm({
      title: isEdit ? "编辑搭配" : "新增常吃搭配",
      initial: r || {},
      fields: [
        { key: "name", label: "名称", type: "text", required: true },
        { key: "content", label: "搭配内容", type: "textarea" }
      ]
    });
    if (!result) return;
    await this.save("recipes", r, result.values);
  },

  async save(block, item, values) {
    try {
      if (item) {
        await Api.put(`/api/diet/${block}/${item.id}`, values);
        Components.toast("已保存", "success");
      } else {
        await Api.post(`/api/diet/${block}`, values);
        Components.toast("已添加", "success");
      }
      this.refresh();
    } catch (err) { Components.toast(err.message, "danger"); }
  },

  async remove(block, item) {
    const ok = await Components.confirm({ title: "删除记录", message: "确定删除这条记录吗？", danger: true });
    if (!ok) return;
    try {
      await Api.del(`/api/diet/${block}/${item.id}`);
      Components.toast("已删除", "success");
      this.refresh();
    } catch (err) { Components.toast(err.message, "danger"); }
  }
};
