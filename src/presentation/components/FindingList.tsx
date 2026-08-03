import type { Finding } from '../../domain/validation/Finding.ts';
import { FINDING_TITLES, SEVERITY_LABELS, describeFinding } from '../i18n/de.ts';

interface FindingListProps {
  readonly findings: readonly Finding[];
}

export function FindingList({ findings }: FindingListProps) {
  if (findings.length === 0) {
    return <p className="empty">Keine Befunde — Register ist in sich konsistent.</p>;
  }

  return (
    <ul className="findings">
      {findings.map((finding, index) => (
        <li key={`${finding.code}-${index}`} className={`finding finding--${finding.severity}`}>
          <div className="finding__head">
            <span className="badge">{SEVERITY_LABELS[finding.severity]}</span>
            <strong>{FINDING_TITLES[finding.code]}</strong>
            {finding.contractRef !== null && <span className="contract">Vertrag {finding.contractRef}</span>}
          </div>
          <p className="finding__text">{describeFinding(finding)}</p>
        </li>
      ))}
    </ul>
  );
}
