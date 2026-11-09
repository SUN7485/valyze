"""Custom exceptions for duplicate report handling."""


class DuplicateReportError(Exception):
    """Raised when attempting to set a CR number that already exists on another report."""
    pass


class InvalidReportDataError(ValueError):
    """The report row exists but its report_json is empty or fails validation."""

    def __init__(self, report_id: str):
        super().__init__(f"Report {report_id} has empty or invalid report data")
        self.report_id = report_id


class ReportConflictError(Exception):
    """The report changed since the version the caller based its edit on."""

    def __init__(self, current_updated_at):
        super().__init__("Report was modified concurrently")
        self.current_updated_at = current_updated_at


class UnknownFieldError(ValueError):
    """One or more field names are neither on the report nor known to the app."""

    def __init__(self, names):
        self.names = sorted(names)
        super().__init__(f"Unknown field(s): {', '.join(self.names)}")


class FieldLockedError(ValueError):
    """The field is locked and cannot be edited."""

    def __init__(self, name: str):
        super().__init__(f"Field '{name}' is locked")
        self.name = name


class InvalidArrayDataError(ValueError):
    """The items sent for a report array don't match its schema."""
