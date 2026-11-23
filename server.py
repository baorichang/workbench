# -*- coding: utf-8 -*-
"""我的工作台 · 本机小服务。

只监听 127.0.0.1，不联网、不对外暴露。
提供静态页面托管与 /api 本地接口，数据读写由 storage.py 完成。
"""
import json
import os
import threading
import webbrowser
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import storage

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
HOST = "127.0.0.1"
PORT = 8765

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}

ARRAY_RESOURCES = ["memos", "plans", "media", "dev-projects", "consults", "games"]
OBJECT_RESOURCES = ["fitness", "diet", "settings"]


# --------------------------------------------------------------------------
# 业务逻辑（模块级，便于测试直接调用）
# --------------------------------------------------------------------------

def _find_item(items, item_id):
    for idx, item in enumerate(items):
        if item.get("id") == item_id:
            return idx, item
    return -1, None


def create_item(resource, body):
    if resource not in ARRAY_RESOURCES:
        raise ValueError("该资源不支持通用新增")
    record = storage.stamp_new({k: v for k, v in body.items() if k not in ("id", "createdAt", "updatedAt")})
    items = storage.load(resource)
    items.append(record)
    storage.save(resource, items)
    return record


def update_item(resource, item_id, body):
    if resource not in ARRAY_RESOURCES:
        raise ValueError("该资源不支持通用编辑")
    items = storage.load(resource)
    idx, record = _find_item(items, item_id)
    if record is None:
        return None
    for k, v in body.items():
        if k not in ("id", "createdAt", "updatedAt"):
            record[k] = v
    storage.stamp_update(record)
    items[idx] = record
    storage.save(resource, items)
    return record


def delete_item(resource, item_id):
    if resource not in ARRAY_RESOURCES:
        raise ValueError("该资源不支持通用删除")
    items = storage.load(resource)
    idx, record = _find_item(items, item_id)
    if record is None:
        return False
    items.pop(idx)
    storage.save(resource, items)
    return True


def _block_data(resource, block):
    data = storage.load(resource)
    if block not in storage.SUB_BLOCKS[resource]:
        raise ValueError("非法子块")
    return data, data[block]


def create_in_block(resource, block, body):
    data, items = _block_data(resource, block)
    record = storage.stamp_new({k: v for k, v in body.items() if k not in ("id", "createdAt", "updatedAt")})
    items.append(record)
    storage.save(resource, data)
    return record


def update_in_block(resource, block, item_id, body):
    data, items = _block_data(resource, block)
    idx, record = _find_item(items, item_id)
    if record is None:
        return None
    for k, v in body.items():
        if k not in ("id", "createdAt", "updatedAt"):
            record[k] = v
    storage.stamp_update(record)
    items[idx] = record
    storage.save(resource, data)
    return record


def delete_in_block(resource, block, item_id):
    data, items = _block_data(resource, block)
    idx, record = _find_item(items, item_id)
    if record is None:
        return False
    items.pop(idx)
    storage.save(resource, data)
    return True


def add_todo(project_id, body):
    projects = storage.load("dev-projects")
    idx, project = _find_item(projects, project_id)
    if project is None:
        return None
    todo = {
        "id": storage.new_id(),
        "text": body.get("text", ""),
        "done": bool(body.get("done", False)),
        "createdAt": storage.now_iso(),
    }
    project.setdefault("todos", []).append(todo)
    storage.stamp_update(project)
    projects[idx] = project
    storage.save("dev-projects", projects)
    return todo


def update_todo(project_id, todo_id, body):
    projects = storage.load("dev-projects")
    idx, project = _find_item(projects, project_id)
    if project is None:
        return None
    todos = project.setdefault("todos", [])
    tidx, todo = _find_item(todos, todo_id)
    if todo is None:
        return None
    if "text" in body:
        todo["text"] = body["text"]
    if "done" in body:
        todo["done"] = bool(body["done"])
    storage.stamp_update(project)
    projects[idx] = project
    storage.save("dev-projects", projects)
    return todo


def delete_todo(project_id, todo_id):
    projects = storage.load("dev-projects")
    idx, project = _find_item(projects, project_id)
    if project is None:
        return False
    todos = project.setdefault("todos", [])
    tidx, _ = _find_item(todos, todo_id)
    if tidx < 0:
        return False
    todos.pop(tidx)
    storage.stamp_update(project)
    projects[idx] = project
    storage.save("dev-projects", projects)
    return True


def add_note(consult_id, body):
    consults = storage.load("consults")
    idx, consult = _find_item(consults, consult_id)
    if consult is None:
        return None
    note = {
        "id": storage.new_id(),
        "text": body.get("text", ""),
        "createdAt": storage.now_iso(),
    }
    consult.setdefault("notes", []).append(note)
    storage.stamp_update(consult)
    consults[idx] = consult
    storage.save("consults", consults)
    return note


def _latest(items):
    if not items:
        return None
    return max(items, key=lambda x: x.get("updatedAt") or x.get("createdAt") or "")


def build_summary():
    plans = storage.load("plans")
    today = date.today().isoformat()
    today_plans = [p for p in plans if p.get("date") == today]
    done = sum(1 for p in today_plans if p.get("done"))

    media = storage.load("media")
    dev = storage.load("dev-projects")
    consults = storage.load("consults")
    fitness = storage.load("fitness")
    diet = storage.load("diet")
    games = storage.load("games")

    monday = (date.today() - timedelta(days=date.today().weekday())).isoformat()
    week_logs = [l for l in fitness["logs"] if l.get("date") and l["date"] >= monday]
    today_meals = [m for m in diet["meals"] if m.get("date") == today]

    return {
        "todayPlan": {"total": len(today_plans), "done": done},
        "cards": {
            "media": {"count": sum(1 for m in media if m.get("status") == "待发布"), "latest": _latest(media)},
            "dev": {"count": sum(1 for d in dev if d.get("status") == "进行中"), "latest": _latest(dev)},
            "consult": {"count": sum(1 for c in consults if c.get("status") in ("待联系", "沟通中", "待回复")), "latest": _latest(consults)},
            "fitness": {"count": len(week_logs), "latest": _latest(fitness["logs"])},
            "diet": {"count": "已记录" if today_meals else "未记录", "latest": _latest(diet["meals"])},
            "games": {"count": sum(1 for g in games if g.get("status") in ("待玩", "在玩")), "latest": _latest(games)},
        },
    }


def resource_counts():
    """返回各板块条目数与最新一条记录的保存时间。"""
    counts = {}
    last_ts = ""
    for res in storage.all_resources():
        payload = storage.load(res)
        if isinstance(payload, list):
            counts[res] = len(payload)
            for item in payload:
                ts = item.get("updatedAt") or item.get("createdAt") or ""
                if ts > last_ts:
                    last_ts = ts
        elif isinstance(payload, dict):
            total = 0
            for value in payload.values():
                if isinstance(value, list):
                    total += len(value)
                    for item in value:
                        ts = item.get("updatedAt") or item.get("createdAt") or ""
                        if ts > last_ts:
                            last_ts = ts
                elif isinstance(value, dict):
                    total += 1
            counts[res] = total
    return counts, last_ts


def export_backup():
    data = {res: storage.load(res) for res in storage.all_resources()}
    return {"app": "我的工作台", "version": 1, "exportedAt": storage.now_iso(), "data": data}


def _validate_backup(payload):
    """校验备份结构，返回 (data, 概览)；不合法抛 ValueError。"""
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
        raise ValueError("备份文件格式不正确")
    data = payload["data"]
    overview = {}
    for res in storage.all_resources():
        if res not in data:
            raise ValueError(f"备份缺少板块：{res}")
        default = storage.DEFAULTS[res]
        if isinstance(default, list):
            if not isinstance(data[res], list):
                raise ValueError(f"板块 {res} 结构不正确")
            overview[res] = len(data[res])
        elif res == "settings":
            if not isinstance(data[res], dict):
                raise ValueError(f"板块 {res} 结构不正确")
            overview[res] = len(data[res])
        else:
            if not isinstance(data[res], dict):
                raise ValueError(f"板块 {res} 结构不正确")
            overview[res] = sum(len(v) for v in data[res].values() if isinstance(v, list))
    return data, overview


def preview_backup(payload):
    _, overview = _validate_backup(payload)
    return overview


def restore_backup(payload):
    data, _ = _validate_backup(payload)
    # 全部校验通过后再逐块写入，失败时保留原数据
    for res, payload_res in data.items():
        storage.save(res, payload_res)
    return True


def clear_resource(resource):
    if resource not in storage.RESOURCE_FILES:
        raise ValueError("未知板块")
    return storage.reset(resource)


# --------------------------------------------------------------------------
# HTTP 处理
# --------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    # ---------- 响应 ----------
    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _ok(self, data):
        self._send_json({"ok": True, "data": data})

    def _err(self, msg, status=400):
        self._send_json({"ok": False, "error": msg}, status)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
            return body, None
        except json.JSONDecodeError:
            return None, "请求内容不是有效 JSON"

    def _parts(self):
        path = self.path.split("?")[0]
        return [p for p in path.split("/") if p]

    def _serve_static(self, rel_path):
        rel_path = rel_path.lstrip("/")
        if rel_path == "":
            rel_path = "index.html"
        full_path = os.path.normpath(os.path.join(WEB_DIR, rel_path))
        if not full_path.startswith(WEB_DIR):
            self._err("非法路径", 403)
            return
        if not os.path.isfile(full_path):
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write("404 Not Found".encode("utf-8"))
            return
        ext = os.path.splitext(full_path)[1].lower()
        ctype = CONTENT_TYPES.get(ext, "application/octet-stream")
        with open(full_path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    # ---------- GET ----------
    def do_GET(self):
        parts = self._parts()
        if not parts or parts[0] != "api":
            self._serve_static(self.path.split("?")[0])
            return

        if len(parts) == 2 and parts[1] == "health":
            self._ok({"status": "up", "host": HOST, "port": PORT})
            return
        if len(parts) == 2 and parts[1] == "summary":
            self._ok(build_summary())
            return
        if len(parts) == 3 and parts[1] == "system" and parts[2] == "info":
            counts, last_ts = resource_counts()
            self._ok({"dataDir": storage.DATA_DIR, "counts": counts, "lastSavedAt": last_ts})
            return
        if len(parts) == 3 and parts[1] == "backup" and parts[2] == "export":
            self._ok(export_backup())
            return

        if len(parts) >= 2:
            res = parts[1]
            if res not in storage.RESOURCE_FILES:
                self._err("未知资源", 404)
                return
            try:
                if len(parts) == 2:
                    self._ok(storage.load(res))
                    return
                if len(parts) == 3:
                    item_id = parts[2]
                    items = storage.load(res)
                    if isinstance(items, list):
                        _, record = _find_item(items, item_id)
                        if record is None:
                            self._err("记录不存在", 404)
                        else:
                            self._ok(record)
                        return
                self._err("接口不存在", 404)
            except ValueError as e:
                self._err(str(e))
            return

        self._err("接口不存在", 404)

    # ---------- POST ----------
    def do_POST(self):
        parts = self._parts()
        body, err = self._read_body()
        if err:
            self._err(err)
            return

        if len(parts) >= 2 and parts[1] == "backup":
            if len(parts) == 3 and parts[2] == "import":
                try:
                    self._ok(preview_backup(body))
                except ValueError as e:
                    self._err(str(e))
                return
            if len(parts) == 3 and parts[2] == "restore":
                try:
                    restore_backup(body)
                    self._ok({"restored": True})
                except ValueError as e:
                    self._err(str(e))
                return
            self._err("接口不存在", 404)
            return

        if len(parts) < 2:
            self._err("接口不存在", 404)
            return
        res = parts[1]
        if res not in storage.RESOURCE_FILES:
            self._err("未知资源", 404)
            return

        try:
            # 清空板块：/api/<res>/clear
            if len(parts) == 3 and parts[2] == "clear":
                self._ok(clear_resource(res))
                return
            # 通用新增：/api/<res>
            if len(parts) == 2:
                self._ok(create_item(res, body))
                return
            # 子资源：/api/<res>/<id>/todos | notes
            if len(parts) == 4 and parts[3] in ("todos", "notes"):
                item_id = parts[2]
                if parts[3] == "todos":
                    todo = add_todo(item_id, body)
                    if todo is None:
                        self._err("项目不存在", 404)
                    else:
                        self._ok(todo)
                else:
                    note = add_note(item_id, body)
                    if note is None:
                        self._err("对象不存在", 404)
                    else:
                        self._ok(note)
                return
            # 对象资源子块新增：/api/<res>/<block>
            if len(parts) == 3 and res in OBJECT_RESOURCES and res != "settings":
                block = parts[2]
                self._ok(create_in_block(res, block, body))
                return
            self._err("接口不存在", 404)
        except ValueError as e:
            self._err(str(e))

    # ---------- PUT ----------
    def do_PUT(self):
        parts = self._parts()
        body, err = self._read_body()
        if err:
            self._err(err)
            return
        if len(parts) < 2:
            self._err("接口不存在", 404)
            return
        res = parts[1]
        if res not in storage.RESOURCE_FILES:
            self._err("未知资源", 404)
            return
        try:
            # settings 整体合并更新
            if res == "settings" and len(parts) == 2:
                current = storage.load("settings")
                current.update(body)
                storage.save("settings", current)
                self._ok(current)
                return
            # 子资源待办：/api/dev-projects/<id>/todos/<todoId>
            if len(parts) == 5 and parts[3] == "todos":
                todo = update_todo(parts[2], parts[4], body)
                if todo is None:
                    self._err("记录不存在", 404)
                else:
                    self._ok(todo)
                return
            # 对象资源子块更新：/api/<res>/<block>/<id>
            if len(parts) == 4 and res in OBJECT_RESOURCES and res != "settings":
                record = update_in_block(res, parts[2], parts[3], body)
                if record is None:
                    self._err("记录不存在", 404)
                else:
                    self._ok(record)
                return
            # 通用更新：/api/<res>/<id>
            if len(parts) == 3:
                record = update_item(res, parts[2], body)
                if record is None:
                    self._err("记录不存在", 404)
                else:
                    self._ok(record)
                return
            self._err("接口不存在", 404)
        except ValueError as e:
            self._err(str(e))

    # ---------- DELETE ----------
    def do_DELETE(self):
        parts = self._parts()
        if len(parts) < 2:
            self._err("接口不存在", 404)
            return
        res = parts[1]
        if res not in storage.RESOURCE_FILES:
            self._err("未知资源", 404)
            return
        try:
            # 待办删除
            if len(parts) == 5 and parts[3] == "todos":
                ok = delete_todo(parts[2], parts[4])
                if not ok:
                    self._err("记录不存在", 404)
                else:
                    self._ok({"deleted": True})
                return
            # 对象资源子块删除：/api/<res>/<block>/<id>
            if len(parts) == 4 and res in OBJECT_RESOURCES and res != "settings":
                ok = delete_in_block(res, parts[2], parts[3])
                if not ok:
                    self._err("记录不存在", 404)
                else:
                    self._ok({"deleted": True})
                return
            # 通用删除：/api/<res>/<id>
            if len(parts) == 3:
                ok = delete_item(res, parts[2])
                if not ok:
                    self._err("记录不存在", 404)
                else:
                    self._ok({"deleted": True})
                return
            self._err("接口不存在", 404)
        except ValueError as e:
            self._err(str(e))


def make_server(port=PORT, host=HOST):
    return ThreadingHTTPServer((host, port), Handler)


def main():
    storage.ensure_data_dir()
    try:
        server = make_server()
    except OSError as e:
        print(f"启动失败：端口 {PORT} 被占用或无法监听（{e}）。")
        print("请关闭其他占用该端口的程序后重试。")
        input("按回车退出...")
        return
    url = f"http://{HOST}:{server.server_address[1]}/"

    def open_browser():
        webbrowser.open(url)

    threading.Timer(0.8, open_browser).start()
    print(f"我的工作台已启动：{url}")
    print("关闭本窗口即可退出服务。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
