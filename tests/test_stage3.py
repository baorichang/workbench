# -*- coding: utf-8 -*-
"""阶段 3 测试：首页总览与今日计划。"""
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

WEB_JS = os.path.join(BASE_DIR, "web", "js", "views")
TODAY = date.today().isoformat()


class Stage3Test(unittest.TestCase):
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

    def _read(self, name):
        with open(os.path.join(WEB_JS, name), encoding="utf-8") as f:
            return f.read()

    def test_js_syntax_valid(self):
        for name in ["home.js", "plan.js"]:
            proc = subprocess.run(["node", "--check", os.path.join(WEB_JS, name)],
                                   capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, f"{name} 语法错误：{proc.stderr}")

    def test_home_cards_and_summary(self):
        src = self._read("home.js")
        for route in ["#/media", "#/dev", "#/consult", "#/fitness", "#/diet", "#/games"]:
            self.assertIn(route, src)
        self.assertIn("/api/summary", src)
        self.assertIn("/api/memos", src)

    def test_plan_views_and_fields(self):
        src = self._read("plan.js")
        for mode in ["today", "week", "all"]:
            self.assertIn(mode, src)
        for prio in ["高", "中", "低"]:
            self.assertIn(prio, src)
        self.assertIn("/api/plans", src)
        self.assertIn("expired", src)

    def test_home_dependent_apis_work(self):
        self._req("POST", "/api/memos", {"text": "备忘", "done": False})
        self._req("POST", "/api/plans", {"title": "任务", "date": TODAY, "priority": "中", "done": False})
        _, summary = self._req("GET", "/api/summary")
        self.assertEqual(summary["data"]["todayPlan"]["total"], 1)
        _, memos = self._req("GET", "/api/memos")
        self.assertEqual(len(memos["data"]), 1)

    def test_plan_toggle_persists(self):
        _, body = self._req("POST", "/api/plans", {"title": "任务", "date": TODAY, "done": False})
        pid = body["data"]["id"]
        self._req("PUT", f"/api/plans/{pid}", {"done": True})
        _, body = self._req("GET", f"/api/plans/{pid}")
        self.assertTrue(body["data"]["done"])


if __name__ == "__main__":
    unittest.main()
