/* 开发工作 */
if (!window.Views) window.Views = {};

Views.dev = {
  STATUSES: ["进行中", "搁置", "已完成"],

  async render(ctx) {
    this.ctx = ctx;
    const view = ctx.view;
    view.innerHTML = '<div class="placeholder">加载中...</div>';
    try {
      const id = ctx.params[0];
      if (id) {
        const project = await Api.get(`/api/dev-projects/${id}`);
        this.renderDetail(view, project);
      } else {
        const projects = await Api.get("/api/dev-projects");
        this.renderList(view, projects);
      }
    } catch (e) {
      Components.toast(e.message, "danger");
      view.innerHTML = "";
    }
  },

  refresh() { if (this.ctx) this.render(this.ctx); },

  renderList(view, projects) {
    view.innerHTML = `
      <div class="toolbar">
        <div class="filter-tabs"></div>
        <button class="btn btn-primary" id="project-add">新增项目</button>
      </div>
      <div class="card-grid" id="project-list"></div>`;
    const listEl = view.querySelector("#project-list");
    if (!projects.length) {
      listEl.appendChild(Components.emptyState("暂无项目", "新增项目", () => this.openForm(null)));
    }
    projects.forEach((p) => listEl.appendChild(this.card(p)));
    view.querySelector("#project-add").onclick = () => this.openForm(null);
  },

  card(p) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${Components.escape(p.name)}</div>
      <div class="card-sub">${Components.statusLabel(p.status)} ${Components.statusLabel(p.priority)}</div>
      ${p.nextStep ? `<div class="card-sub">下一步：${Components.escape(p.nextStep)}</div>` : ""}
      <div class="card-actions">
        <button class="link-btn">进入详情</button>
        <button class="link-btn">编辑</button>
        <button class="link-btn danger">删除</button>
      </div>`;
    const [detailBtn, editBtn, delBtn] = card.querySelectorAll(".link-btn");
    detailBtn.onclick = () => { location.hash = `#/dev/${p.id}`; };
    editBtn.onclick = () => this.openForm(p);
    delBtn.onclick = async () => {
      const ok = await Components.confirm({ title: "删除项目", message: `确定删除项目「${p.name}」及其待办吗？`, danger: true });
      if (!ok) return;
      try {
        await Api.del(`/api/dev-projects/${p.id}`);
        Components.toast("已删除", "success");
        this.refresh();
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    return card;
  },

  renderDetail(view, p) {
    const todos = p.todos || [];
    view.innerHTML = `
      <div class="detail-head">
        <button class="btn back-btn" id="back">← 返回列表</button>
        <div class="card-title">${Components.escape(p.name)}</div>
        ${Components.statusLabel(p.status)}
      </div>
      <div class="section">
        <div class="section-title">项目信息</div>
        <div class="item-meta">优先级：${Components.escape(p.priority || "未设")}</div>
        ${p.link ? `<div class="item-meta"><a href="${Components.escape(p.link)}" target="_blank" rel="noopener">仓库 / 文档链接</a></div>` : ""}
        ${p.intro ? `<p>${Components.escape(p.intro)}</p>` : ""}
        ${p.nextStep ? `<p>下一步：${Components.escape(p.nextStep)}</p>` : ""}
        ${p.note ? `<p class="card-sub">${Components.escape(p.note)}</p>` : ""}
        <div class="card-actions" style="margin-top:12px;">
          <button class="link-btn" id="edit-project">编辑项目</button>
        </div>
      </div>
      <div class="section">
        <div class="section-title">项目待办（${todos.length}）</div>
        <div class="toolbar">
          <input id="todo-input" type="text" placeholder="待办内容" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;">
          <button class="btn btn-primary" id="todo-add">添加</button>
        </div>
        <div id="todo-list"></div>
      </div>`;

    view.querySelector("#back").onclick = () => { location.hash = "#/dev"; };
    view.querySelector("#edit-project").onclick = () => this.openForm(p);

    const todoList = view.querySelector("#todo-list");
    const drawTodos = () => {
      todoList.innerHTML = "";
      if (!todos.length) {
        todoList.innerHTML = '<div class="item-meta">暂无待办</div>';
        return;
      }
      todos.forEach((t) => todoList.appendChild(this.todoRow(p, t, todos)));
    };
    drawTodos();

    const addTodo = async () => {
      const text = view.querySelector("#todo-input").value.trim();
      if (!text) { Components.toast("请输入待办内容", "danger"); return; }
      try {
        const todo = await Api.post(`/api/dev-projects/${p.id}/todos`, { text, done: false });
        todos.push(todo);
        view.querySelector("#todo-input").value = "";
        drawTodos();
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    view.querySelector("#todo-add").onclick = addTodo;
    view.querySelector("#todo-input").onkeydown = (e) => { if (e.key === "Enter") addTodo(); };
  },

  todoRow(p, todo, todos) {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <input type="checkbox" ${todo.done ? "checked" : ""}>
      <div class="item-main"><div class="item-title ${todo.done ? "done" : ""}">${Components.escape(todo.text)}</div></div>
      <div class="item-actions"><button class="link-btn danger">删除</button></div>`;
    row.querySelector("input").onchange = async (e) => {
      try {
        await Api.put(`/api/dev-projects/${p.id}/todos/${todo.id}`, { done: e.target.checked });
        todo.done = e.target.checked;
        this.renderDetail(this.ctx.view, p);
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    row.querySelector(".link-btn").onclick = async () => {
      const ok = await Components.confirm({ title: "删除待办", message: "确定删除这条待办吗？", danger: true });
      if (!ok) return;
      try {
        await Api.del(`/api/dev-projects/${p.id}/todos/${todo.id}`);
        this.refresh();
      } catch (err) { Components.toast(err.message, "danger"); }
    };
    return row;
  },

  async openForm(p) {
    const isEdit = !!p;
    const result = await Components.openForm({
      title: isEdit ? "编辑项目" : "新增项目",
      submitText: isEdit ? "保存" : "添加",
      initial: p || { status: "进行中", priority: "中" },
      fields: [
        { key: "name", label: "项目名称", type: "text", required: true },
        { key: "status", label: "状态", type: "select", options: this.STATUSES },
        { key: "priority", label: "优先级", type: "select", options: ["高", "中", "低"] },
        { key: "link", label: "仓库 / 文档链接", type: "url" },
        { key: "nextStep", label: "下一步", type: "text" },
        { key: "intro", label: "简介", type: "textarea" },
        { key: "note", label: "备注", type: "textarea" }
      ]
    });
    if (!result) return;
    try {
      if (isEdit) {
        await Api.put(`/api/dev-projects/${p.id}`, result.values);
        Components.toast("已保存", "success");
      } else {
        await Api.post("/api/dev-projects", result.values);
        Components.toast("已添加", "success");
      }
      this.refresh();
    } catch (err) { Components.toast(err.message, "danger"); }
  }
};
