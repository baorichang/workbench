/* 应用外壳：hash 路由、导航高亮、视图调度 */
const App = {
  titles: {
    home: "首页总览",
    plan: "今日计划",
    media: "自媒体",
    dev: "开发工作",
    consult: "咨询工作",
    fitness: "健身计划",
    diet: "饮食计划",
    games: "游戏娱乐",
    settings: "数据设置"
  },

  init() {
    window.addEventListener("hashchange", () => this.render());
    const memoBtn = document.getElementById("quick-memo-btn");
    if (memoBtn) memoBtn.onclick = () => { location.hash = "#/home"; };
    this.render();
  },

  currentRoute() {
    const hash = (location.hash || "#/home").replace(/^#\//, "");
    const seg = hash.split("/");
    return { route: seg[0] || "home", params: seg.slice(1) };
  },

  render() {
    const { route, params } = this.currentRoute();
    const viewEl = document.getElementById("view");

    document.querySelectorAll(".nav-item").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === route);
    });

    const view = (window.Views && Views[route]) || Views.home;
    const ctx = { params, view: viewEl, route };
    view.render(ctx);

    document.getElementById("page-title").textContent = this.titles[route] || "我的工作台";
    const dateEl = document.getElementById("today-date");
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString("zh-CN", {
        year: "numeric", month: "long", day: "numeric", weekday: "long"
      });
    }
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
