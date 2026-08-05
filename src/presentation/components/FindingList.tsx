import type { Finding } from '../../domain/validation/Finding.ts';
import type { FindingFocus } from '../findingFocus.ts';
import type { NameResolver } from '../i18n/de.ts';
import { FINDING_TITLES, SEVERITY_LABELS, describeFinding } from '../i18n/de.ts';

export interface LocatedFinding {
  readonly finding: Finding;
  /** `null` when the finding cannot be shown in any chain. */
  readonly focus: FindingFocus | null;
}

interface FindingListProps {
  readonly items: readonly LocatedFinding[];
  /** Index of the selected entry in `items`, or `null`. */
  readonly selected?: number | null;
  readonly onSelect?: (index: number) => void;
  /** Turns identification codes into company names for the finding texts. */
  readonly nameOf?: NameResolver;
}

/**
 * The findings.
 *
 * A locatable entry is a button: choosing it switches the diagram to the right
 * contract and marks the nodes the finding is about. Entries that sit in no
 * chain — a provider nobody contracts, for instance — stay plain text, because
 * an inert button is worse than none.
 */
export function FindingList({ items, selected = null, onSelect, nameOf }: FindingListProps) {
  if (items.length === 0) {
    return <p className="empty">Keine Befunde — Register ist in sich konsistent.</p>;
  }

  return (
    <ul className="findings">
      {items.map(({ finding, focus }, index) => {
        const isSelected = selected === index;
        const isLocatable = focus !== null && onSelect !== undefined;

        const content = (
          <>
            <div className="finding__head">
              <span className="badge">{SEVERITY_LABELS[finding.severity]}</span>
              <strong>{FINDING_TITLES[finding.code]}</strong>
              {finding.contractRef !== null && (
                <span className="contract">Vertrag {finding.contractRef}</span>
              )}
            </div>
            <p className="finding__text">{describeFinding(finding, nameOf)}</p>
          </>
        );

        const classes = [
          'finding',
          `finding--${finding.severity}`,
          isLocatable ? 'finding--locatable' : '',
          isSelected ? 'finding--selected' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <li key={`${finding.code}-${index}`} className={classes}>
            {isLocatable ? (
              <button
                type="button"
                className="finding__button"
                aria-pressed={isSelected}
                onClick={() => onSelect(index)}
              >
                {content}
                <span className="finding__hint">
                  {isSelected ? 'Markierung aufheben' : 'Im Diagramm zeigen'}
                </span>
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
