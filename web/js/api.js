/* 本地接口封装（阶段 2 补全错误处理与细节） */
const Api = {
  async request(method, url, body) {
    const opt = { method, headers: { "Content-Type": "application/json" } };
    if (body !== undefined) opt.body = JSON.stringify(body);
    const resp = await fetch(url, opt);
    const data = await resp.json().catch(() => ({ ok: false, error: "响应解析失败" }));
    if (!data.ok) throw new Error(data.error || "请求失败");
    return data.data;
  },
  get(url) { return this.request("GET", url); },
  post(url, body) { return this.request("POST", url, body); },
  put(url, body) { return this.request("PUT", url, body); },
  del(url) { return this.request("DELETE", url); }
};
