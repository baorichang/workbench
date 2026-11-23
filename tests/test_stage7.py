# -*- coding: utf-8 -*-
"""阶段 7 综合验收：对照 PRD 第 10 节做可自动化检查的兜底走查。"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from datetime import date

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

import server  # noqa: E402
import storage  # noqa: E402

WEB_DIR = os.path.join(BASE_DIR, "web")
TODAY = date.today().isoformat()


class Stage7Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.make_server(0)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.httpd.server_address[1]
        cls.base = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._old = storage.DATA_DIR
        storage.DATA_DIR = self.tmp.name

    def tearDown(self):
        storage.DATA_DIR = self._old
        self.tmp.cleanup()

    def _req(self, method, path, body=None):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode("utf-8"))

    # ---- 交付文件完整性（验收 1、19）----
    def test_deliverables_present(self):
        for rel in ["server.py", "storage.py", "启动工作台.bat", "README.md", "PRD.md",
                    os.path.join("web", "index.html")]:
            self.assertTrue(os.path.isfile(os.path.join(BASE_DIR, rel)), f"缺少 {rel}")

    def test_all_js_syntax_valid(self):
        for root, _, files in os.walk(os.path.join(WEB_DIR, "js")):
            for name in files:
                if name.endswith(".js"):
                    path = os.path.join(root, name)
                    proc = subprocess.run(["node", "--check", path], capture_output=True, text=True)
                    self.assertEqual(proc.returncode, 0, f"{path} 语法错误：{proc.stderr}")

    def test_no_external_urls_in_source(self):
        for root, _, files in os.walk(WEB_DIR):
            for name in files:
                if name.endswith((".html", ".js", ".css")):
                    with open(os.path.join(root, name), encoding="utf-8") as f:
                        src = f.read()
                    self.assertNotIn("http://", src, f"{name} 含外部 http 引用")
                    self.assertNotIn("https://", src, f"{name} 含外部 https 引用")

    # ---- 空数据兜底（验收 18）----
    def test_empty_resources_return_valid_structure(self):
        for res in storage.all_resources():
            status, body = self._req("GET", f"/api/{res}")
            self.assertEqual(status, 200, f"{res} 空数据应可访问")
            self.assertIn("ok", body)

    def test_summary_on_empty_data(self):
        _, body = self._req("GET", "/api/summary")
        s = body["data"]
        self.assertEqual(s["todayPlan"], {"total": 0, "done": 0})
        self.assertEqual(s["cards"]["media"]["count"], 0)
        self.assertEqual(s["cards"]["dev"]["count"], 0)
        self.assertEqual(s["cards"]["consult"]["count"], 0)
        self.assertEqual(s["cards"]["fitness"]["count"], 0)
        self.assertEqual(s["cards"]["diet"]["count"], "未记录")
        self.assertEqual(s["cards"]["games"]["count"], 0)

    # ---- 备份闭环（验收 14、15）----
    def test_full_backup_restore_roundtrip(self):
        self._req("POST", "/api/memos", {"text": "备忘", "done": False})
        self._req("POST", "/api/plans", {"title": "任务", "date": TODAY, "done": False})
        self._req("POST", "/api/media", {"title": "选题", "status": "构思中"})
        self._req("POST", "/api/games", {"name": "游戏", "status": "在玩"})

        _, body = self._req("GET", "/api/backup/export")
        backup = body["data"]
        self.assertEqual(len(backup["data"]["plans"]), 1)

        for res in ["memos", "plans", "media", "games"]:
            self._req("POST", f"/api/{res}/clear")
        _, body = self._req("GET", "/api/plans")
        self.assertEqual(body["data"], [])

        status, _ = self._req("POST", "/api/backup/restore", backup)
        self.assertEqual(status, 200)
        _, body = self._req("GET", "/api/plans")
        self.assertEqual(body["data"][0]["title"], "任务")
        _, body = self._req("GET", "/api/games")
        self.assertEqual(body["data"][0]["name"], "游戏")

    # ---- 导航完整性（验收 5）----
    def test_index_nine_routes(self):
        with open(os.path.join(WEB_DIR, "index.html"), encoding="utf-8") as f:
            html = f.read()
        for route in ["home", "plan", "media", "dev", "consult", "fitness", "diet", "games", "settings"]:
            self.assertIn(f'data-route="{route}"', html)

    # ---- 静态首页可访问（验收 1）----
    def test_index_served(self):
        with urllib.request.urlopen(self.base + "/", timeout=5) as r:
            status = r.status
            body = r.read().decode("utf-8")
        self.assertEqual(status, 200)
        self.assertIn("<title>我的工作台</title>", body)


if __name__ == "__main__":
    unittest.main()
