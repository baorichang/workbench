# -*- coding: utf-8 -*-
"""阶段 1 测试：数据层与后端 API。"""
import json
import os
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

TODAY = date.today().isoformat()


class Stage1Test(unittest.TestCase):
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
        self._old_data_dir = storage.DATA_DIR
        storage.DATA_DIR = self.tmp.name

    def tearDown(self):
        storage.DATA_DIR = self._old_data_dir
        self.tmp.cleanup()

    def _req(self, method, path, body=None):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            self.base + path, data=data, method=method,
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode("utf-8"))

    # ---------- 数据层 ----------
    def test_default_structures(self):
        for res, default in storage.DEFAULTS.items():
            payload = storage.load(res)
            self.assertEqual(type(payload), type(default))

    def test_corrupt_file_recovered(self):
        storage.save("plans", [{"id": "x", "title": "旧任务"}])
        path = os.path.join(storage.DATA_DIR, storage.RESOURCE_FILES["plans"])
        with open(path, "w", encoding="utf-8") as f:
            f.write("{坏 JSON")
        payload = storage.load("plans")
        self.assertEqual(payload, [])
        self.assertTrue(os.path.exists(path + ".bak"))

    # ---------- 数组资源 CRUD ----------
    def test_crud_array_resource(self):
        status, body = self._req("POST", "/api/plans", {"title": "写周报", "date": TODAY, "priority": "高"})
        self.assertEqual(status, 200)
        item_id = body["data"]["id"]

        status, body = self._req("GET", "/api/plans")
        self.assertEqual(status, 200)
        self.assertEqual(len(body["data"]), 1)

        status, body = self._req("PUT", f"/api/plans/{item_id}", {"title": "写月报", "done": True})
        self.assertEqual(status, 200)
        self.assertEqual(body["data"]["title"], "写月报")
        self.assertTrue(body["data"]["done"])

        status, body = self._req("DELETE", f"/api/plans/{item_id}")
        self.assertEqual(status, 200)
        status, body = self._req("GET", "/api/plans")
        self.assertEqual(body["data"], [])

    def test_create_stamps_and_protects_id(self):
        status, body = self._req("POST", "/api/memos", {"id": "fake", "createdAt": "fake", "text": "备忘"})
        self.assertEqual(status, 200)
        record = body["data"]
        self.assertTrue(record["id"])
        self.assertNotEqual(record["id"], "fake")
        self.assertTrue(record["createdAt"])
        self.assertNotEqual(record["createdAt"], "fake")
        self.assertEqual(record["text"], "备忘")

    def test_update_delete_missing_returns_404(self):
        status, _ = self._req("PUT", "/api/plans/nope", {"title": "x"})
        self.assertEqual(status, 404)
        status, _ = self._req("DELETE", "/api/plans/nope")
        self.assertEqual(status, 404)

    # ---------- 子资源 ----------
    def test_project_todo_subresource(self):
        _, body = self._req("POST", "/api/dev-projects", {"name": "工作台"})
        pid = body["data"]["id"]

        status, body = self._req("POST", f"/api/dev-projects/{pid}/todos", {"text": "搭骨架"})
        self.assertEqual(status, 200)
        tid = body["data"]["id"]

        status, body = self._req("PUT", f"/api/dev-projects/{pid}/todos/{tid}", {"done": True})
        self.assertEqual(status, 200)
        self.assertTrue(body["data"]["done"])

        status, body = self._req("GET", f"/api/dev-projects/{pid}")
        self.assertEqual(body["data"]["todos"][0]["done"], True)

        status, _ = self._req("DELETE", f"/api/dev-projects/{pid}/todos/{tid}")
        self.assertEqual(status, 200)
        status, body = self._req("GET", f"/api/dev-projects/{pid}")
        self.assertEqual(body["data"]["todos"], [])

    def test_consult_note_subresource(self):
        _, body = self._req("POST", "/api/consults", {"name": "客户A"})
        cid = body["data"]["id"]
        status, body = self._req("POST", f"/api/consults/{cid}/notes", {"text": "首次沟通"})
        self.assertEqual(status, 200)
        status, body = self._req("GET", f"/api/consults/{cid}")
        self.assertEqual(len(body["data"]["notes"]), 1)
        self.assertEqual(body["data"]["notes"][0]["text"], "首次沟通")

    # ---------- 对象资源子块 ----------
    def test_fitness_and_diet_blocks(self):
        status, body = self._req("POST", "/api/fitness/logs", {"date": TODAY, "content": "胸推"})
        self.assertEqual(status, 200)
        lid = body["data"]["id"]
        status, body = self._req("PUT", f"/api/fitness/logs/{lid}", {"content": "胸推 + 三头"})
        self.assertEqual(body["data"]["content"], "胸推 + 三头")

        status, body = self._req("POST", "/api/diet/meals", {"date": TODAY, "meal": "午餐", "food": "沙拉"})
        self.assertEqual(status, 200)
        mid = body["data"]["id"]
        status, _ = self._req("DELETE", f"/api/diet/meals/{mid}")
        self.assertEqual(status, 200)

        status, body = self._req("GET", "/api/fitness")
        self.assertIn("plans", body["data"])
        self.assertIn("logs", body["data"])
        self.assertIn("body", body["data"])

    # ---------- 摘要口径 ----------
    def test_summary_counts(self):
        self._req("POST", "/api/plans", {"title": "今日任务", "date": TODAY, "done": True})
        self._req("POST", "/api/plans", {"title": "未完成", "date": TODAY, "done": False})
        self._req("POST", "/api/media", {"title": "选题1", "status": "待发布"})
        self._req("POST", "/api/media", {"title": "选题2", "status": "构思中"})
        self._req("POST", "/api/dev-projects", {"name": "项目甲", "status": "进行中"})
        self._req("POST", "/api/dev-projects", {"name": "项目乙", "status": "已完成"})
        self._req("POST", "/api/consults", {"name": "A", "status": "沟通中"})
        self._req("POST", "/api/consults", {"name": "B", "status": "已结束"})
        self._req("POST", "/api/fitness/logs", {"date": TODAY, "content": "训练"})
        self._req("POST", "/api/diet/meals", {"date": TODAY, "meal": "早餐", "food": "鸡蛋"})
        self._req("POST", "/api/games", {"name": "游戏1", "status": "在玩"})
        self._req("POST", "/api/games", {"name": "游戏2", "status": "已通关"})

        status, body = self._req("GET", "/api/summary")
        self.assertEqual(status, 200)
        s = body["data"]
        self.assertEqual(s["todayPlan"], {"total": 2, "done": 1})
        self.assertEqual(s["cards"]["media"]["count"], 1)
        self.assertEqual(s["cards"]["dev"]["count"], 1)
        self.assertEqual(s["cards"]["consult"]["count"], 1)
        self.assertEqual(s["cards"]["fitness"]["count"], 1)
        self.assertEqual(s["cards"]["diet"]["count"], "已记录")
        self.assertEqual(s["cards"]["games"]["count"], 1)

    # ---------- 备份与恢复 ----------
    def test_backup_export_preview_restore(self):
        self._req("POST", "/api/plans", {"title": "要保住的任务", "date": TODAY})
        status, body = self._req("GET", "/api/backup/export")
        self.assertEqual(status, 200)
        backup = body["data"]
        self.assertIn("plans", backup["data"])

        status, body = self._req("POST", "/api/backup/import", backup)
        self.assertEqual(status, 200)
        self.assertGreaterEqual(body["data"]["plans"], 1)

        self._req("POST", "/api/plans/clear")
        status, body = self._req("GET", "/api/plans")
        self.assertEqual(body["data"], [])

        status, body = self._req("POST", "/api/backup/restore", backup)
        self.assertEqual(status, 200)
        status, body = self._req("GET", "/api/plans")
        self.assertEqual(len(body["data"]), 1)
        self.assertEqual(body["data"][0]["title"], "要保住的任务")

    def test_invalid_backup_does_not_destroy_data(self):
        self._req("POST", "/api/plans", {"title": "原有任务", "date": TODAY})
        bad = {"app": "x", "data": {"plans": "不是数组"}}
        status, _ = self._req("POST", "/api/backup/restore", bad)
        self.assertEqual(status, 400)
        status, body = self._req("GET", "/api/plans")
        self.assertEqual(len(body["data"]), 1)

    def test_clear_isolated_per_resource(self):
        self._req("POST", "/api/memos", {"text": "备忘1"})
        self._req("POST", "/api/plans", {"title": "任务1", "date": TODAY})
        status, _ = self._req("POST", "/api/memos/clear")
        self.assertEqual(status, 200)
        status, body = self._req("GET", "/api/memos")
        self.assertEqual(body["data"], [])
        status, body = self._req("GET", "/api/plans")
        self.assertEqual(len(body["data"]), 1)


if __name__ == "__main__":
    unittest.main()
