#!/usr/bin/env python
"""
Quick standalone test of visibility module without pytest.
Run: python test_visibility_manual.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from utils.visibility import is_field_empty, filter_visible_fields, is_section_empty


def test_is_field_empty():
    cases = [
        (None, True),
        ("", True),
        ("   ", True),
        ("N/A", True),
        ("n/a", True),
        ("NA", True),
        ("none", True),
        ("-", True),
        ("not applicable", True),
        ("not available", True),
        (0, False),
        (0.0, False),
        (1, False),
        ("Valid", False),
        ("  Valid  ", False),
        (["a"], False),
        ([], True),
        ({}, True),
        ({"a": 1}, False),
        ("<p>text</p>", False),
        ("<p></p>", True),
    ]
    passed = 0
    for val, expected in cases:
        result = is_field_empty(val)
        if result != expected:
            print(f"FAIL is_field_empty({val!r}) = {result}, expected {expected}")
        else:
            passed += 1
    print(f"is_field_empty: {passed}/{len(cases)} passed")


def test_filter_visible_fields():
    fields = {
        "a": {"value": "hello"},
        "b": {"value": ""},
        "c": {"value": "N/A"},
        "d": {"value": None},
    }
    visible = filter_visible_fields(fields, [])
    assert visible == {"a"}, f"Expected {{'a'}}, got {visible}"
    print("filter_visible_fields: basic OK")

    fields_raw = {"x": "data", "y": "", "z": "N/A"}
    visible = filter_visible_fields(fields_raw, [])
    assert visible == {"x"}, f"Expected {{'x'}}, got {visible}"
    print("filter_visible_fields: raw values OK")

    # with hidden
    fields2 = {"a": {"value": "hello"}, "b": {"value": "world"}}
    visible = filter_visible_fields(fields2, ["b"])
    assert visible == {"a"}
    print("filter_visible_fields: hidden OK")


def test_is_section_empty():
    fields = {"a": "", "b": "N/A", "c": None}
    assert is_section_empty(fields, ["a", "b", "c"]) is True
    print("is_section_empty: all empty OK")

    fields = {"a": "", "b": "value", "c": None}
    assert is_section_empty(fields, ["a", "b", "c"]) is False
    print("is_section_empty: one visible OK")


if __name__ == "__main__":
    print("=== Visibility Module Tests ===")
    test_is_field_empty()
    test_filter_visible_fields()
    test_is_section_empty()
    print("All tests passed!")
