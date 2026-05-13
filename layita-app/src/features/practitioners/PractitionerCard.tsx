// src/features/practitioners/PractitionerCard.tsx

import { resolveGroupColor, resolveGroupNameShortForm } from "../../lib/Groupcolors";
import { TRAINING_FILTERS } from "../../lib/Trainingfilters";
import { Practitioner } from "./types";
import {
  daysSince,
  urgency,
  trainingCount,
  VisitBadge,
} from "./_components";

interface Props {
  p: Practitioner;
  selected: Practitioner | null;
  lastVisit: string | undefined;
  onClick: () => void;
  isMultiSelected?: boolean;
}

export default function PractitionerCard({ p, selected, lastVisit, onClick, isMultiSelected, onMultiSelectToggle }: Props) {
  const color          = resolveGroupColor(p.group?.group_name);
  const shortGroupName = resolveGroupNameShortForm(p.group?.group_name);
  const days           = daysSince(lastVisit);
  const count          = trainingCount(p);
  const isSelected     = selected?.id === p.id;

  return (
    <div
      className={`p2-card ${isSelected ? "p2-card--selected" : ""}`}
      onClick={onClick}
      style={{ "--group-color": color.fill } as React.CSSProperties}
    >
      <div className="p2-card__stripe" />

      {onMultiSelectToggle && (
        <div className="p2-card__checkbox" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 2 }}>
          <input type="checkbox" checked={isMultiSelected || false} onChange={onMultiSelectToggle} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
        </div>
      )}

      <div className="p2-card__header">
        <div className="p2-card__initials">
          {(p.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
        </div>
        <div className="p2-card__title">
          <div className="p2-card__name">{p.name || "—"}</div>
          {p.ecdc?.name && <div className="p2-card__ecdc">{p.ecdc.name}</div>}
        </div>
      </div>

      {shortGroupName && (
        <div className="p2-card__group" style={{ background: color.glow, color: color.fill }}>
          <span className="p2-card__group-dot" style={{ background: color.fill }} />
          {shortGroupName}
        </div>
      )}

      <div className="p2-card__footer">
        <VisitBadge days={days} />
        <div className="p2-card__training-row">
          {TRAINING_FILTERS.map((f) => (
            <span
              key={f.key}
              className={`p2-training-dot ${p.training?.[f.key] ? "p2-training-dot--has" : ""}`}
              title={f.label}
            />
          ))}
          <span className="p2-training-count">{count}/{TRAINING_FILTERS.length}</span>
        </div>
      </div>
    </div>
  );
}