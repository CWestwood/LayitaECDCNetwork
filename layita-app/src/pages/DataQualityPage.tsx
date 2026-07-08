import DataQualityPage from '../features/layita/data-quality';
import QualityAuditShell from '../features/layita/QualityAuditShell';

export default function DataQualityRoute() {
  return (
    <QualityAuditShell>
      <DataQualityPage />
    </QualityAuditShell>
  );
}
