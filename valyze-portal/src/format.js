// Shared display helpers for the portal. Kept here because the order form, the
// dashboard and the order detail view all have to label the same raw DB values
// the same way.

export const SERVICE_LEVELS = [
  { value: "basic", label: "Basic (5-7 days)" },
  { value: "standard", label: "Standard (3 days)" },
  { value: "express", label: "Express (1-2 days)" },
  { value: "urgent", label: "Urgent (24 hrs)" },
];

export function serviceLevelLabel(value) {
  const match = SERVICE_LEVELS.find((level) => level.value === value);
  return match ? match.label : value || "—";
}

// Dates arrive as ISO timestamps ("2026-08-03T00:00:00Z"); clients only care
// about the day.
export function shortDate(value) {
  if (!value) return "N/A";
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

export function statusLabel(value) {
  const text = String(value || "pending").toLowerCase();
  if (text === "in_progress") return "In Progress";
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, " ");
}

// Maps a raw status onto a CSS modifier so pills stay consistent everywhere.
export function statusTone(value) {
  const text = String(value || "pending").toLowerCase();
  if (text === "completed" || text === "invoiced") return "done";
  if (text === "in_progress") return "active";
  if (text === "cancelled") return "cancelled";
  return "waiting";
}
