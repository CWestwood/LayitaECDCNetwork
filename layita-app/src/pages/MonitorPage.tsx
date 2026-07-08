import KoboMonitor from "../features/layita/monitoring";
import QualityAuditShell from "../features/layita/QualityAuditShell";

export default function MonitorRoute() {
  return (
    <QualityAuditShell>
      <KoboMonitor />
    </QualityAuditShell>
  );
}
