// src/features/practitioners/PractitionerRow.tsx

import { resolveGroupColor, resolveGroupNameShortForm } from "../../lib/Groupcolors";
import { formatDate } from "../../lib/format";
import { Practitioner } from "./types";
import {
  daysSince,
  VisitBadge,
  TrainingDots,
  WhatsAppIcon,
} from "./_components";

interface Props {
  p: Practitioner;
  selected: Practitioner | null;
  lastVisit: string | undefined;
  onClick: () => void;
  isMultiSelected?: boolean;
  onMultiSelectToggle?: (e: React.SyntheticEvent) => void;
}

export default function PractitionerRow({
  p,
  selected,
  lastVisit,
  onClick,
  isMultiSelected,
  onMultiSelectToggle,
}: Props) {
  const color = resolveGroupColor(p.group?.group_name);
  const group = p.group?.group_name;
  const days = daysSince(lastVisit);
  const isSelected = selected?.id === p.id;
  const anySelected = !!selected;
  const attendanceDate = p.ecdc?.attendance_updated || p.ecdc?.created_at;

  return (
    <div
      className={`p2-row ${isSelected ? "p2-row--selected" : ""}`}
      onClick={onClick}
      style={{ "--group-color": color.fill } as React.CSSProperties}
    >
      <div className="p2-row__indicator" />

      {onMultiSelectToggle ? (
        <div className="p2-row__checkbox" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <input type="checkbox" checked={isMultiSelected || false} onChange={onMultiSelectToggle} style={{ cursor: 'pointer', width: '15px', height: '15px' }} />
        </div>
      ) : (
        <div />
      )}

      <div className="p2-row__name-col">
        <span className="p2-row__name">{p.name || "-"}</span>
        {group && (
          <span className="p2-row__group" style={{ color: color.fill }}>
            <span className="p2-row__group-full">{anySelected ? resolveGroupNameShortForm(group) : group}</span>
            <span className="p2-row__group-short">{resolveGroupNameShortForm(group)}</span>
          </span>
        )}
        <span className="p2-row__ecdc-name">Club</span>
      </div>

      <div className="p2-row__ecdc">
        <span className="p2-row__ecdc-name">{p.ecdc?.name || <em>No ECDC</em>}</span>
        {p.ecdc?.area && <span className="p2-row__ecdc-area">{p.ecdc.area}</span>}
      </div>

      <div className="p2-row__ecdc">
        <span className="p2-row__ecdc-name">{p.ecdc?.chief || <em>No Chief</em>}</span>
        <span className="p2-row__ecdc-name">{p.ecdc?.headman || <em>No Headman</em>}</span>
      </div>

      <div className="p2-row__visit">
        <VisitBadge days={days} />
      </div>

      <div className="p2-row__training">
        <TrainingDots practitioner={p} />
      </div>

      <div className="p2-row__children-count">
        {p.ecdc?.number_children ?? "-"}
        <div className="p2-row__children-updated">
          {formatDate(attendanceDate)}
        </div>
      </div>

      <div className="p2-row__flags">
        {p.has_whatsapp && (
          <span className="p2-row__whatsapp" title="Has WhatsApp">
            <WhatsAppIcon size={13} />
          </span>
        )}
        {p.dsd_funded && (
          <span className="p2-row__tag" title="DSD Funded">DSD</span>
        )}
      </div>
    </div>
  );
}
