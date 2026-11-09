"""Snapshot intake for the pipeline. site/snapshot.js is the browser and Worker copy; the shared cases in
tests/fixtures/ keep both runtimes in agreement."""
import math
import re
from typing import Any, Callable, Iterable

ASSET_PATH = re.compile(r'assets/[a-f0-9]{64}\.[a-z0-9]{2,4}', re.IGNORECASE)
SCREENSHOT_ID = re.compile(r'[a-f0-9]{64}')
APPLE_SOURCE_URL = re.compile(r'https://(apps\.apple\.com|itunes\.apple\.com)/.*', re.DOTALL)
FULL_SIZE_URL = re.compile(r'https://is[0-9]+-ssl\.mzstatic\.com/image/thumb/[^?#]+/1290x2796bb\.png')

Record = dict[str, Any]


def _matches(pattern: re.Pattern, value: object) -> bool:
    return isinstance(value, str) and pattern.fullmatch(value) is not None


def is_asset_path(value: object) -> bool:
    return _matches(ASSET_PATH, value)


def is_screenshot_id(value: object) -> bool:
    return _matches(SCREENSHOT_ID, value)


def is_apple_source_url(value: object) -> bool:
    return _matches(APPLE_SOURCE_URL, value)


def is_full_size_url(value: object) -> bool:
    return _matches(FULL_SIZE_URL, value)


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def _number(value: object) -> float | int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        return value if math.isfinite(value) else None
    except OverflowError:
        # JSON integers are unbounded in Python; beyond float range they are as invalid as 1e999 is in the browser.
        return None


def chart_rank(value: object) -> int | None:
    """A chart rank is a whole number from 1. JSON 1.0 and 1 are the same rank, as in the browser."""
    number = _number(value)
    return int(number) if number is not None and number == int(number) and number >= 1 else None


def rating(value: object) -> float | int | None:
    """An App Store rating is a finite number on Apple's 0 to 5 scale."""
    number = _number(value)
    return number if number is not None and 0 <= number <= 5 else None


def _strings(value: object) -> list[str]:
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _unique_ids(value: object, accept: Callable[[object], bool] = lambda item: isinstance(item, str)) -> list[str]:
    return list(dict.fromkeys(item for item in value if accept(item))) if isinstance(value, list) else []


def _ranks(value: object) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}
    return {category: chart_rank(rank) for category, rank in value.items() if chart_rank(rank) is not None}


def _with(value: Record, **fields: Any) -> Record:
    record = {**value, **fields}
    return {key: item for key, item in record.items() if item is not None}


def read_screenshot(value: object) -> Record | None:
    if not isinstance(value, dict) or not is_screenshot_id(value.get('id')) or not is_asset_path(value.get('path')):
        return None
    if not value['path'].lower().startswith(f"assets/{value['id']}."):
        return None
    return _with(
        value,
        kind=_text(value.get('kind')),
        title=_text(value.get('title')),
        category=_text(value.get('category')),
        sourceUrl=value.get('sourceUrl') if is_apple_source_url(value.get('sourceUrl')) else None,
        fullSizeUrl=value.get('fullSizeUrl') if is_full_size_url(value.get('fullSizeUrl')) else None,
        reviewedAt=_text(value.get('reviewedAt')),
        curatedOnly=True if value.get('curatedOnly') is True else None,
    )


def is_reviewed_screenshot(value: object) -> bool:
    screenshot = read_screenshot(value)
    return screenshot is not None and 'sourceUrl' in screenshot


def read_app(value: object) -> Record | None:
    if not isinstance(value, dict):
        return None
    app_id, name = _text(value.get('id')), _text(value.get('name'))
    if not app_id or not name:
        return None
    return _with(
        value,
        id=app_id,
        name=name,
        category=_text(value.get('category')),
        categories=_strings(value.get('categories')),
        chartRank=chart_rank(value.get('chartRank')),
        chartRanks=_ranks(value.get('chartRanks')),
        assetIds=_unique_ids(value.get('assetIds'), is_screenshot_id),
        iconPath=value.get('iconPath') if is_asset_path(value.get('iconPath')) else None,
        url=value.get('url') if is_apple_source_url(value.get('url')) else None,
        rating=rating(value.get('rating')),
    )


def _reviewed_fields(value: Record) -> dict[str, Any]:
    return {
        'category': _text(value.get('category')),
        'appName': _text(value.get('appName')),
        'description': _text(value.get('description')),
        'sourceUrl': value.get('sourceUrl') if is_apple_source_url(value.get('sourceUrl')) else None,
        'reviewedAt': _text(value.get('reviewedAt')),
        'tags': _strings(value.get('tags')),
    }


def _read_collection(value: object, known: set[str]) -> Record | None:
    if not isinstance(value, dict):
        return None
    record_id, title = _text(value.get('id')), _text(value.get('title'))
    asset_ids = [item for item in _unique_ids(value.get('assetIds')) if item in known]
    if not record_id or not title or len(asset_ids) < 2:
        return None
    evidence = _text(value.get('evidence')) or 'listing-collection'
    return _with(value, id=record_id, title=title, assetIds=asset_ids, evidence=evidence, **_reviewed_fields(value))


def _read_ui_element(value: object, known: set[str]) -> Record | None:
    if not isinstance(value, dict):
        return None
    record_id, title, screen_id = _text(value.get('id')), _text(value.get('title')), value.get('screenId')
    if not record_id or not title or not isinstance(screen_id, str) or screen_id not in known:
        return None
    evidence = _text(value.get('evidence')) or 'visual-review'
    return _with(value, id=record_id, title=title, screenId=screen_id, evidence=evidence, **_reviewed_fields(value))


def _read_list(value: object, read: Callable[[object], Record | None], seen: set[str] | None = None) -> list[Record]:
    seen = set() if seen is None else seen
    out = []
    for item in value if isinstance(value, list) else []:
        record = read(item)
        if record and record['id'] not in seen:
            seen.add(record['id'])
            out.append(record)
    return out


def _ids(records: Iterable[Record]) -> set[str]:
    return {record['id'] for record in records}


def read_snapshot(value: object) -> dict[str, Any]:
    """Invalid records are skipped, invalid optional fields are dropped, and the first record with an id wins."""
    if not isinstance(value, dict):
        raise TypeError('Snapshot must be an object')
    screens = _read_list(value.get('screens'), read_screenshot)
    known = _ids(screens)
    coverage = value.get('coverage') if isinstance(value.get('coverage'), dict) else {}
    return {
        'apps': _read_list(value.get('apps'), read_app),
        'screens': screens,
        'flows': _read_list(value.get('flows'), lambda item: _read_collection(item, known)),
        'elements': _read_list(value.get('elements'), lambda item: _read_ui_element(item, known)),
        'coverage': _with(coverage, generatedAt=_text(coverage.get('generatedAt')), rankBasis=_text(coverage.get('rankBasis'))),
    }


def merge_reviewed_library(snapshot: dict[str, Any], reviewed: object) -> dict[str, Any]:
    """A reviewed Screenshot fills in only when the Snapshot lacks that id, so fresher listing metadata wins."""
    if not isinstance(reviewed, dict) or not isinstance(reviewed.get('flows'), list) or not isinstance(reviewed.get('elements'), list):
        raise TypeError('Reviewed library must list flows and elements')
    pinned = _read_list(
        reviewed.get('screens'),
        lambda item: read_screenshot(item) if is_reviewed_screenshot(item) else None,
        _ids(snapshot['screens']),
    )
    screens = [*snapshot['screens'], *pinned]
    known = _ids(screens)
    return {
        **snapshot,
        'screens': screens,
        'flows': _read_list([*snapshot['flows'], *reviewed['flows']], lambda item: _read_collection(item, known)),
        'elements': _read_list([*snapshot['elements'], *reviewed['elements']], lambda item: _read_ui_element(item, known)),
    }
