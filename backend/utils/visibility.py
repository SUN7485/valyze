"""
Visibility and emptiness detection utilities.

This module provides a single source of truth for determining whether
a field value should be considered "empty" and thus hidden from reports.
"""

from __future__ import annotations

from typing import Any, Sequence


# Values that are considered "empty" or "not applicable"
EMPTY_VALUES = frozenset(
    [
        "",
        "n/a",
        "na",
        "none",
        "-",
        "null",
        "not applicable",
        "not available",
        "not specified",
    ]
)


def is_field_empty(value: Any, field_name: str | None = None) -> bool:
    """
    Determine if a field value should be considered empty for reporting purposes.

    Empty means:
    - None, null-like
    - Empty string or whitespace-only string
    - Case-insensitive match to EMPTY_VALUES (e.g., "N/A", "na", "None")
    - Empty list, tuple, dict
    - For rich text: string with only HTML whitespace tags (simple heuristic)

    Parameters
    ----------
    value: Any
        The field value to check (could be str, int, float, list, dict, None, etc.)
    field_name: str | None
        Optional field name for special-case handling (e.g., fields that should
        never be auto-hidden even if zero/empty). Currently unused.

    Returns
    -------
    bool
        True if the value is considered empty and should be hidden; False otherwise.
    """
    if value is None:
        return True

    # Flatten FieldData objects if passed directly
    # (Defensive: typically we receive .value already)
    if hasattr(value, "value"):
        value = value.value

    # Handle lists/arrays
    if isinstance(value, (list, tuple)):
        return len(value) == 0

    # Handle dicts (e.g., field objects from report.fields)
    if isinstance(value, dict):
        # If it's a FieldData-like dict, extract 'value'
        if "value" in value:
            inner = value["value"]
            return is_field_empty(inner, field_name)
        # Empty dict means no data
        return len(value) == 0

    # Convert to string for comparison; numbers are NOT empty
    if not isinstance(value, str):
        # For numbers (int, float, Decimal), zero is valid data
        return False

    # Strip whitespace
    stripped = value.strip()
    if not stripped:
        return True

    # Case-insensitive check against empty values set
    lowered = stripped.lower()
    if lowered in EMPTY_VALUES:
        return True

    # Rich text heuristic: if it looks like HTML with only <p></p> or whitespace
    # Simple check: remove common HTML tags and re-check emptiness
    # This is lightweight and covers most template-rich text cases
    import re

    # Strip tags like <p>, <div>, <br>, </p>, etc.
    text_only = re.sub(r"<[^>]+>", "", stripped)
    text_only = text_only.strip()
    if not text_only or text_only.lower() in EMPTY_VALUES:
        return True

    return False


def filter_visible_fields(
    fields: dict[str, Any],
    hidden_field_names: Sequence[str] | None = None,
) -> set[str]:
    """
    Given a dict of field values, return a set of field names that are non-empty
    and not explicitly hidden.

    Parameters
    ----------
    fields: dict[str, Any]
        The report fields dictionary (keys → FieldData or raw values).
    hidden_field_names: Sequence[str] | None
        List/array of field names that user explicitly hidden via eye icon.

    Returns
    -------
    set[str]
        Set of field names that should be visible in output.
    """
    hidden = set(hidden_field_names or [])
    visible = set()

    for name, val in fields.items():
        if name in hidden:
            continue
        if not is_field_empty(val, name):
            visible.add(name)

    return visible


def is_section_empty(
    fields: dict[str, Any],
    section_field_names: list[str],
    hidden_field_names: Sequence[str] | None = None,
) -> bool:
    """
    Determine if an entire section (group of fields) is empty.

    Section is considered empty if ALL its fields are either:
    - empty (per is_field_empty)
    - explicitly hidden
    - missing from fields dict

    Parameters
    ----------
    fields: dict[str, Any]
        Full report fields dictionary.
    section_field_names: list[str]
        List of field names that belong to this section.
    hidden_field_names: Sequence[str] | None
        User-hidden field names.

    Returns
    -------
    bool
        True if section has no visible data; False if at least one field is visible.
    """
    hidden = set(hidden_field_names or [])

    for name in section_field_names:
        if name in hidden:
            continue
        val = fields.get(name)
        if not is_field_empty(val, name):
            return False  # found at least one visible field

    return True
