"""Custom exceptions for duplicate report handling."""


class DuplicateReportError(Exception):
    """Raised when attempting to set a CR number that already exists on another report."""
    pass
