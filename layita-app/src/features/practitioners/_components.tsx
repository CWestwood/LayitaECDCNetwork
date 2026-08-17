// src/features/practitioners/_components.tsx
// ─── Shared atoms used across Practitioners feature ───────────────────────────

import { TRAINING_FILTERS } from "../../lib/Trainingfilters";
import { formatDate } from "../../lib/format";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupColor {
  fill: string;
  glow: string;
}

// ─── Pure helpers (exported so row/card/panel can use them) 

export const fmtDate = (iso: string | null | undefined): string | null => {
  const formatted = formatDate(iso);
  return formatted === "-" ? null : formatted;
};

export const daysSince = (iso: string | null | undefined): number => {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86_400_000);
};

export const urgency = (days: number): { level: "none" | "danger" | "warning" | "ok"; label: string } => {
  if (days === Infinity) return { level: "none",    label: "Never visited" };
  if (days > 365)        return { level: "danger",  label: `${days}d ago`  };
  if (days > 180)        return { level: "warning", label: `${days}d ago`  };
  return                        { level: "ok",      label: `${days}d ago`  };
};

export const trainingCount = (p: { training?: Record<string, boolean | string | null> | null }): number =>
  TRAINING_FILTERS.filter((f) => p.training?.[f.key] === true).length;

// ─── Icon ─────────────────────────────────────────────────────────────────────

interface IconProps extends React.SVGProps<SVGSVGElement> {
  d: string;
  size?: number;
}

export const Icon = ({ d, size = 14, ...props }: IconProps) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    {...props}
  >
    <path d={d} />
  </svg>
);

export const Icons = {
  check:    "M20 6 9 17l-5-5",
  x:        "M18 6 6 18M6 6l12 12",
  close:    "M18 6 6 18M6 6l12 12",
  pencil:   "M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z",
  phone:    "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.57 3.24 2 2 0 0 1 3.54 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.5a16 16 0 0 0 6 6l.87-.87a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16z",
} as const;

export const GridIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3"  y="3"  width="7" height="7" rx="1" />
    <rect x="14" y="3"  width="7" height="7" rx="1" />
    <rect x="3"  y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

export const ListIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6"  x2="21" y2="6"  />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3" cy="6"  r="1" fill="currentColor" />
    <circle cx="3" cy="12" r="1" fill="currentColor" />
    <circle cx="3" cy="18" r="1" fill="currentColor" />
  </svg>
);

export const WhatsAppIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
  </svg>
);

// ─── VisitBadge ───────────────────────────────────────────────────────────────

export function VisitBadge({ days }: { days: number }) {
  const { level, label } = urgency(days);
  return <span className={`p2-visit-badge p2-visit-badge--${level}`}>{label}</span>;
}

// ─── TrainingDots ─────────────────────────────────────────────────────────────

export function TrainingDots({ practitioner }: { practitioner: { training?: Record<string, boolean | string | null> | null } }) {
  const count = trainingCount(practitioner);
  return (
    <div className="p2-training-dots">
      {TRAINING_FILTERS.map((f) => (
        <span
          key={f.key}
          className={`p2-training-dot ${practitioner.training?.[f.key] === true ? "p2-training-dot--has" : ""}`}
          title={f.label}
        />
      ))}
      <span className="p2-training-count">{count}/{TRAINING_FILTERS.length}</span>
    </div>
  );
}

// ─── FlagPill ─────────────────────────────────────────────────────────────────

export function FlagPill({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span className={`p2-flag ${active ? "p2-flag--yes" : "p2-flag--no"}`}>
      {active
        ? <Icon d={Icons.check} size={9} />
        : <Icon d={Icons.x}     size={9} />}
      {children}
    </span>
  );
}
