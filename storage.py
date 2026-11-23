# -*- coding: utf-8 -*-
"""本地 JSON 数据层：读写 data/ 目录下的各板块文件。

- 每条记录由接口层补 id、创建时间、更新时间
- 写入采用临时文件 + 替换的原子方式，避免中断损坏
- 文件损坏时备份为 .bak 并重建空结构，服务不崩溃
"""
import copy
import json
import os
import uuid
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")

RESOURCE_FILES = {
    "memos": "memos.json",
    "plans": "plans.json",
    "media": "media.json",
    "dev-projects": "dev_projects.json",
    "consults": "consults.json",
    "fitness": "fitness.json",
    "diet": "diet.json",
    "games": "games.json",
    "settings": "settings.json",
}

DEFAULTS = {
    "memos": [],
    "plans": [],
    "media": [],
    "dev-projects": [],
    "consults": [],
    "fitness": {"plans": [], "logs": [], "body": []},
    "diet": {"meals": [], "recipes": []},
    "games": [],
    "settings": {},
}

# 对象型资源的合法子块（fitness / diet）
SUB_BLOCKS = {
    "fitness": ["plans", "logs", "body"],
    "diet": ["meals", "recipes"],
}


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def _path(resource):
    return os.path.join(DATA_DIR, RESOURCE_FILES[resource])


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def new_id():
    return uuid.uuid4().hex[:12]


def load(resource):
    """读取某板块数据；文件缺失或损坏时返回默认空结构。"""
    ensure_data_dir()
    path = _path(resource)
    if not os.path.isfile(path):
        return copy.deepcopy(DEFAULTS[resource])
    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        default = DEFAULTS[resource]
        if isinstance(default, list) and not isinstance(payload, list):
            raise ValueError("结构应为数组")
        if isinstance(default, dict) and not isinstance(payload, dict):
            raise ValueError("结构应为对象")
        return payload
    except (json.JSONDecodeError, ValueError, OSError):
        try:
            os.replace(path, path + ".bak")
        except OSError:
            pass
        return copy.deepcopy(DEFAULTS[resource])


def save(resource, payload):
    """原子写入某板块数据。"""
    ensure_data_dir()
    path = _path(resource)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def reset(resource):
    """清空某板块为默认结构。"""
    payload = copy.deepcopy(DEFAULTS[resource])
    save(resource, payload)
    return payload


def stamp_new(record):
    record = dict(record)
    record["id"] = new_id()
    ts = now_iso()
    record["createdAt"] = ts
    record["updatedAt"] = ts
    return record


def stamp_update(record):
    record["updatedAt"] = now_iso()
    return record


def all_resources():
    return list(RESOURCE_FILES.keys())
