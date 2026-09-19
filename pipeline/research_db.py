#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
  url TEXT NOT NULL, description TEXT, raw_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS screens (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, title TEXT NOT NULL, source_url TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_screens (
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  screen_id TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  PRIMARY KEY (app_id, screen_id)
);
CREATE VIRTUAL TABLE IF NOT EXISTS apps_fts USING fts5(
  name, category, description, content='apps', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS apps_ai AFTER INSERT ON apps BEGIN
  INSERT INTO apps_fts(rowid, name, category, description)
  VALUES (new.rowid, new.name, new.category, COALESCE(new.description, ''));
END;
CREATE TRIGGER IF NOT EXISTS apps_ad AFTER DELETE ON apps BEGIN
  INSERT INTO apps_fts(apps_fts, rowid, name, category, description)
  VALUES ('delete', old.rowid, old.name, old.category, COALESCE(old.description, ''));
END;
CREATE TRIGGER IF NOT EXISTS apps_au AFTER UPDATE ON apps BEGIN
  INSERT INTO apps_fts(apps_fts, rowid, name, category, description)
  VALUES ('delete', old.rowid, old.name, old.category, COALESCE(old.description, ''));
  INSERT INTO apps_fts(rowid, name, category, description)
  VALUES (new.rowid, new.name, new.category, COALESCE(new.description, ''));
END;
"""


def _text(value: Any, field: str, *, required: bool = True) -> str:
    if not isinstance(value, str) or (required and not value):
        raise ValueError(f"{field} must be a non-empty string")
    return value


def import_catalog(catalog_path: str | Path, db_path: str | Path) -> int:
    data = json.loads(Path(catalog_path).read_text())
    if not isinstance(data, dict) or not isinstance(data.get("apps"), list) or not isinstance(data.get("screens"), list):
        raise ValueError("catalog must contain apps and screens arrays")
    if not data["apps"] or not data["screens"]:
        raise ValueError("catalog apps and screens must not be empty")
    generated = data.get("coverage", {}).get("generatedAt") if isinstance(data.get("coverage"), dict) else None
    generated = _text(generated, "generatedAt")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA)
        with conn:
            conn.execute("DELETE FROM metadata")
            conn.execute("DELETE FROM app_screens")
            conn.execute("DELETE FROM apps")
            conn.execute("DELETE FROM screens")
            seen: dict[str, tuple[str, str, str]] = {}
            for item in data["screens"]:
                if not isinstance(item, dict):
                    raise ValueError("screen must be an object")
                sid = _text(item.get("id"), "screen.id")
                row = (_text(item.get("path"), "screen.path"), _text(item.get("title"), "screen.title"), _text(item.get("sourceUrl"), "screen.sourceUrl"))
                if sid in seen and seen[sid] != row:
                    raise ValueError(f"conflicting duplicate screen: {sid}")
                if sid not in seen:
                    seen[sid] = row
                    conn.execute("INSERT INTO screens VALUES (?, ?, ?, ?)", (sid, *row))
            app_ids: set[str] = set()
            for item in data["apps"]:
                if not isinstance(item, dict):
                    raise ValueError("app must be an object")
                aid = _text(item.get("id"), "app.id")
                if aid in app_ids:
                    raise ValueError(f"duplicate app: {aid}")
                app_ids.add(aid)
                assets = item.get("assetIds")
                if not isinstance(assets, list) or any(not isinstance(x, str) or not x for x in assets):
                    raise ValueError(f"app.assetIds must be strings: {aid}")
                missing = set(assets) - set(seen)
                if missing:
                    raise ValueError(f"dangling screen reference: {sorted(missing)[0]}")
                description = item.get("description")
                if description is not None and not isinstance(description, str):
                    raise ValueError(f"app.description must be a string: {aid}")
                conn.execute("INSERT INTO apps VALUES (?, ?, ?, ?, ?, ?)", (aid, _text(item.get("name"), "app.name"), _text(item.get("category"), "app.category"), _text(item.get("url"), "app.url"), description, json.dumps(item, sort_keys=True, separators=(",", ":"))))
                conn.executemany("INSERT INTO app_screens VALUES (?, ?)", ((aid, sid) for sid in dict.fromkeys(assets)))
            conn.execute("INSERT INTO metadata VALUES ('generatedAt', ?)", (generated,))
            observed = data.get("coverage", {}).get("researchObservedAt")
            if observed is not None:
                conn.execute("INSERT INTO metadata VALUES ('researchObservedAt', ?)", (_text(observed, "researchObservedAt"),))
            conn.execute("INSERT INTO metadata VALUES ('appCount', ?)", (str(len(app_ids)),))
            conn.execute("INSERT INTO metadata VALUES ('screenCount', ?)", (str(len(seen)),))
        return len(app_ids)
    finally:
        conn.close()


def search(db_path: str | Path, query: str, limit: int = 20) -> list[dict[str, str]]:
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    conn = sqlite3.connect(f"file:{Path(db_path).resolve()}?mode=ro", uri=True)
    try:
        rows = conn.execute("SELECT a.id, a.name, a.category, a.url FROM apps_fts JOIN apps a ON a.rowid=apps_fts.rowid WHERE apps_fts MATCH ? ORDER BY bm25(apps_fts) LIMIT ?", (query, limit)).fetchall()
        return [{"id": r[0], "name": r[1], "category": r[2], "url": r[3]} for r in rows]
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    imp = sub.add_parser("import")
    imp.add_argument("--catalog", required=True)
    imp.add_argument("--db", required=True)
    find = sub.add_parser("search")
    find.add_argument("--db", required=True)
    find.add_argument("--query", required=True)
    find.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    result = import_catalog(args.catalog, args.db) if args.command == "import" else search(args.db, args.query, args.limit)
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
