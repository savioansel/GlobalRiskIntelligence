/**
 * CoverageStatusBadge.tsx
 *
 * Visual component for displaying marine insurance coverage lifecycle status.
 * Color-coded: ACTIVE (green) | WARNING (yellow) | BREACH (orange) | VOID (red)
 */

interface CoverageStatusBadgeProps {
  status: "ACTIVE" | "WARNING" | "BREACH" | "VOID";
  reason?: string;
  compact?: boolean;
}

export function CoverageStatusBadge({ status, reason, compact = false }: CoverageStatusBadgeProps) {
  const statusConfig = {
    ACTIVE: {
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-700",
      icon: "✓",
      label: "Coverage Active",
    },
    WARNING: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-700",
      icon: "⚠",
      label: "Coverage Warning",
    },
    BREACH: {
      bg: "bg-orange-50",
      border: "border-orange-200",
      text: "text-orange-700",
      icon: "!",
      label: "Policy Breach",
    },
    VOID: {
      bg: "bg-rose-50",
      border: "border-rose-200",
      text: "text-rose-700",
      icon: "✕",
      label: "Coverage Void",
    },
  };

  const config = statusConfig[status];

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-bold ${config.bg} ${config.border} ${config.text}`}>
        <span className="text-sm">{config.icon}</span>
        <span>{status}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${config.bg} ${config.border}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${config.text}`}>
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${config.text}`}>{config.label}</p>
        {reason && <p className={`text-xs ${config.text} opacity-75 mt-0.5`}>{reason}</p>}
      </div>
    </div>
  );
}
