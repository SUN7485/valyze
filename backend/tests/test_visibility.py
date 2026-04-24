"""
Unit tests for backend/utils/visibility.py
Run with: pytest backend/tests/test_visibility.py -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest
from utils.visibility import is_field_empty, filter_visible_fields, is_section_empty


class TestIsFieldEmpty:
    def test_none(self):
        assert is_field_empty(None) is True

    def test_empty_string(self):
        assert is_field_empty("") is True

    def test_whitespace_only(self):
        assert is_field_empty("   ") is True
        assert is_field_empty("\t\n\r  ") is True

    def test_na_variants(self):
        for val in ["N/A", "n/a", "NA", "na", "N/A ", " N/A"]:
            assert is_field_empty(val) is True, f"Failed for {repr(val)}"

    def test_none_text(self):
        assert is_field_empty("none") is True
        assert is_field_empty("None") is True
        assert is_field_empty(" NONE ") is True

    def test_dash(self):
        assert is_field_empty("-") is True

    def test_not_applicable(self):
        assert is_field_empty("not applicable") is True
        assert is_field_empty("Not Applicable") is True
        assert is_field_empty("not available") is True

    def test_zero_is_not_empty(self):
        assert is_field_empty(0) is False
        assert is_field_empty(0.0) is False

    def test_positive_numbers(self):
        assert is_field_empty(1) is False
        assert is_field_empty(3.14) is False

    def test_non_empty_strings(self):
        assert is_field_empty("Yes") is False
        assert is_field_empty("Active") is False
        assert is_field_empty("Compliant") is False
        assert is_field_empty("  Valid  ") is False

    def test_rich_text_with_content(self):
        assert is_field_empty("<p>Some text</p>") is False
        assert is_field_empty("<div>Content</div>") is False

    def test_rich_text_empty(self):
        assert is_field_empty("<p></p>") is True
        assert is_field_empty("<div>   </div>") is True

    def test_empty_list(self):
        assert is_field_empty([]) is True
        assert is_field_empty(()) is True

    def test_non_empty_list(self):
        assert is_field_empty(["a"]) is False
        assert (
            is_field_empty([""]) is False
        )  # list with empty string still counts as non-empty? Actually should consider content? This edge case: list with falsy item – we consider list non-empty, let item filtering handle
        # In our filter_visible_fields, we treat list separately – length check
        # is_field_empty([]) → True; is_field_empty(["x"]) → False

    def test_empty_dict(self):
        assert is_field_empty({}) is True

    def test_non_empty_dict(self):
        assert is_field_empty({"a": 1}) is False

    def test_fielddata_object(self):
        class MockFieldData:
            def __init__(self, value):
                self.value = value

        assert is_field_empty(MockFieldData(None)) is True
        assert is_field_empty(MockFieldData("")) is True
        assert is_field_empty(MockFieldData("N/A")) is True
        assert is_field_empty(MockFieldData("valid")) is False


class TestFilterVisibleFields:
    def test_basic(self):
        fields = {
            "a": {"value": "hello"},
            "b": {"value": ""},
            "c": {"value": "N/A"},
            "d": {"value": None},
        }
        hidden = []
        visible = filter_visible_fields(fields, hidden)
        assert visible == {"a"}

    def test_with_hidden(self):
        fields = {
            "a": {"value": "hello"},
            "b": {"value": "world"},
        }
        hidden = ["b"]
        visible = filter_visible_fields(fields, hidden)
        assert visible == {"a"}

    def test_with_mixed_types(self):
        fields = {
            "num": 42,
            "zero": 0,
            "lst": [],
            "filled_list": ["x"],
        }
        visible = filter_visible_fields(fields, [])
        # num (42) visible, zero (0) visible (not empty), filled_list visible (list length >0), lst hidden
        assert "num" in visible
        assert "zero" in visible
        assert "lst" not in visible
        assert "filled_list" in visible

    def test_raw_values(self):
        # When fields dict values are raw scalars, not FieldData
        fields = {"a": "data", "b": ""}
        visible = filter_visible_fields(fields, [])
        assert visible == {"a"}


class TestIsSectionEmpty:
    def test_all_empty(self):
        fields = {"a": "", "b": "N/A", "c": None}
        assert is_section_empty(fields, ["a", "b", "c"]) is True

    def test_one_visible(self):
        fields = {"a": "", "b": "value", "c": None}
        assert is_section_empty(fields, ["a", "b", "c"]) is False

    def test_with_hidden(self):
        fields = {"a": "val", "b": "other"}
        hidden = ["a"]  # a is hidden
        # Section is empty if only a was visible but hidden, and b is empty? Actually b empty → hidden → section empty
        assert is_section_empty(fields, ["a", "b"], hidden) is True

    def test_non_empty_visible(self):
        fields = {"a": "val", "b": "N/A"}
        hidden = []
        assert is_section_empty(fields, ["a", "b"], hidden) is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
