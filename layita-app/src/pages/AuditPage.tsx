import AuditLogs from "../features/layita/audit";
import QualityAuditShell from "../features/layita/QualityAuditShell";

export default function AuditRoute() {
  return (
    <QualityAuditShell>
      <AuditLogs />
    </QualityAuditShell>
  );
}
