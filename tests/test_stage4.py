# -*- coding: utf-8 -*-
"""阶段 4 测试：自媒体 / 开发工作 / 咨询工作。"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

import server  # noqa: E402
import storage  # noqa: E402

WEB_JS = os.path.join(BASE_DIR, "web", "js", "views")


class Stage4Test(unittest.TestCase):
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
        for name in ["media.js", "dev.js", "consult.js"]:
            proc = subprocess.run(["node", "--check", os.path.join(WEB_JS, name)],
                                   capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, f"{name} 语法错误：{proc.stderr}")

    def test_media_structure(self):
        src = self._read("media.js")
        for status in ["构思中", "撰写中", "待发布", "已发布"]:
            self.assertIn(status, src)
        for platform in ["小红书", "公众号", "抖音", "B站"]:
            self.assertIn(platform, src)
        self.assertIn("publishedDate", src)

    def test_dev_structure(self):
        src = self._read("dev.js")
        for status in ["进行中", "搁置", "已完成"]:
            self.assertIn(status, src)
        self.assertIn("/todos", src)
        self.assertIn("#/dev/", src)

    def test_consult_structure(self):
        src = self._read("consult.js")
        for status in ["待联系", "沟通中", "待回复", "已结束"]:
            self.assertIn(status, src)
        self.assertIn("/notes", src)
        self.assertIn("#/consult/", src)

    def test_media_status_flow_api(self):
        _, body = self._req("POST", "/api/media", {"title": "选题", "status": "构思中"})
        mid = body["data"]["id"]
        for status in ["撰写中", "待发布", "已发布"]:
            _, body = self._req("PUT", f"/api/media/{mid}", {"status": status, "publishedDate": "2026-11-23"})
            self.assertEqual(body["data"]["status"], status)
        self.assertEqual(body["data"]["publishedDate"], "2026-11-23")

    def test_project_todos_via_api(self):
        _, body = self._req("POST", "/api/dev-projects", {"name": "项目", "status": "进行中"})
        pid = body["data"]["id"]
        _, todo = self._req("POST", f"/api/dev-projects/{pid}/todos", {"text": "事项"})
        tid = todo["data"]["id"]
        self._req("PUT", f"/api/dev-projects/{pid}/todos/{tid}", {"done": True})
        _, proj = self._req("GET", f"/api/dev-projects/{pid}")
        self.assertTrue(proj["data"]["todos"][0]["done"])
        self._req("DELETE", f"/api/dev-projects/{pid}/todos/{tid}")
        _, proj = self._req("GET", f"/api/dev-projects/{pid}")
        self.assertEqual(proj["data"]["todos"], [])

    def test_consult_notes_via_api(self):
        _, body = self._req("POST", "/api/consults", {"name": "客户", "status": "沟通中"})
        cid = body["data"]["id"]
        self._req("POST", f"/api/consults/{cid}/notes", {"text": "第一次沟通"})
        self._req("POST", f"/api/consults/{cid}/notes", {"text": "第二次沟通"})
        _, item = self._req("GET", f"/api/consults/{cid}")
        self.assertEqual(len(item["data"]["notes"]), 2)

    def test_project_todo_not_in_global_plans(self):
        # 项目待办独立于今日计划
        self._req("POST", "/api/dev-projects", {"name": "X"})
        _, plans = self._req("GET", "/api/plans")
        self.assertEqual(plans["data"], [])


if __name__ == "__main__":
    unittest.main()
