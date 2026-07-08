// src/features/visits/VisitRow.tsx

import { VisitRow as VisitRowType } from './api/useVisits';
import { formatLabel } from '../../lib/format';
import { fmtDate, resolveHappened, CameraIcon } from './_components';

interface Props {
  v: VisitRowType;
  isSelected: boolean;
  onClick: () => void;
}

export default function VisitRow({ v, isSelected, onClick }: Props) {
  const hap = resolveHappened(v.outreach_happened);
  const isUpdate = v.outreach_type?.toLowerCase().trim() === 'update';

  return (
    <div
      className={`ov-row${isSelected ? ' ov-row--selected' : ''}`}
      onClick={onClick}
    >
      <div className="ov-row__date" style={{ textAlign: 'center' }}>{fmtDate(v.date)}</div>

      <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center' }}>
        <div className="ov-row__practitioner">{v.practitioner?.name || 'Unknown'}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center' }}>
        <div className="ov-row__practitioner" style={{ color: 'var(--color-text-muted)' }}>{v.data_capturer?.name || 'Unknown'}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center' }}>
        <span className={`ov-row__type${isUpdate ? ' ov-row__type--update' : ''}`}>
          {formatLabel(v.outreach_type)}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'center' }}>
        <span className="ov-row__badge" style={{ background: hap.bg, color: hap.text }}>
          {hap.label}
        </span>
      </div>

      <div className="ov-row__metric" style={{ justifyContent: 'center', textAlign: 'center' }}>
        {v.parents_trained != null
          ? <><span className="ov-row__metric-val">{v.parents_trained}</span> parents</>
          : <span className="ov-row__dash">-</span>}
      </div>

      <div className="ov-row__metric" style={{ justifyContent: 'center', textAlign: 'center' }}>
        {v.children_books != null
          ? <><span className="ov-row__metric-val">{v.children_books}</span> books</>
          : <span className="ov-row__dash">-</span>}
      </div>

      <div className="ov-row__metric" style={{ justifyContent: 'center', textAlign: 'center' }}>
        {v.transport_km != null
          ? <><span className="ov-row__metric-val">{v.transport_km}</span> km</>
          : <span className="ov-row__dash">-</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
        <span className="ov-row__camera" style={{ opacity: 0 }} title=""><CameraIcon /></span>
        {v.comments && <span className="ov-row__comment">"{v.comments}"</span>}
      </div>
    </div>
  );
}
