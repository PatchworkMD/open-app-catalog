"""Snapshot record rules shared by the pipeline. site/snapshot.js holds the browser and Worker copy;
tests/fixtures/snapshot-rule-cases.json keeps both in agreement."""
import re

ASSET_PATH = re.compile(r'assets/[a-f0-9]{64}\.[a-z0-9]{2,4}', re.IGNORECASE)
SCREENSHOT_ID = re.compile(r'[a-f0-9]{64}')
APPLE_SOURCE_URL = re.compile(r'https://(apps\.apple\.com|itunes\.apple\.com)/.*', re.DOTALL)
FULL_SIZE_URL = re.compile(r'https://is[0-9]+-ssl\.mzstatic\.com/image/thumb/[^?#]+/1290x2796bb\.png')


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


def is_reviewed_screenshot(record: object) -> bool:
    return (
        isinstance(record, dict)
        and is_screenshot_id(record.get('id'))
        and is_asset_path(record.get('path'))
        and record['path'].lower().startswith(f"assets/{record['id']}.")
        and is_apple_source_url(record.get('sourceUrl'))
    )
