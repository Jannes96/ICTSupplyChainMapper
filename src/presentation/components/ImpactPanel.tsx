import type { ContractAnalysis } from '../../domain/analysis/ContractAnalysis.ts';
import { analyseImpact } from '../../domain/analysis/impact.ts';
import type { NodeId } from '../../domain/model/ids.ts';
import type { NameResolver } from '../i18n/de.ts';
import { formatProvider, formatRank } from '../i18n/de.ts';

/** German takes an umlaut in the plural, so the count cannot just gain an "e". */
function contractsLabel(count: number): string {
  return count === 1 ? '1 Vertrag' : `${count} Verträge`;
}

interface ImpactPanelProps {
  readonly contracts: readonly ContractAnalysis[];
  readonly providerId: NodeId;
  /** Providers in the register, to say what share of it depends on this one. */
  readonly providerCount: number;
  readonly nameOf?: NameResolver;
  readonly onClose: () => void;
  /** Jumps the diagram to another contract this provider takes part in. */
  readonly onSelectContract: (ref: string) => void;
}

/**
 * "If this provider stops, what stops with it?"
 *
 * The checks say whether the register is correct; this says what is in it. The
 * figure is taken across all contracts on purpose — a provider in one chain is a
 * dependency, the same provider carrying four is a concentration, and only the
 * combined view tells them apart.
 */
export function ImpactPanel({
  contracts,
  providerId,
  providerCount,
  nameOf,
  onClose,
  onSelectContract,
}: ImpactPanelProps) {
  const impact = analyseImpact(contracts, providerId);
  const affected = impact.downstream.length;
  const share = providerCount > 0 ? Math.round((affected / providerCount) * 100) : 0;

  return (
    <section className="impact">
      <div className="impact__head">
        <h3>Wenn {formatProvider(providerId, nameOf)} ausfällt</h3>
        <button type="button" className="ghost" onClick={onClose}>
          Schließen
        </button>
      </div>

      {affected === 0 ? (
        <p className="note">
          Kein Dienstleister hängt an diesem — er steht am Ende jeder Kette, in der er vorkommt.
          {impact.contracts.length > 0 &&
            ` Er selbst ist in ${contractsLabel(impact.contracts.length)} beauftragt.`}
        </p>
      ) : (
        <p className="impact__lead">
          <strong>
            {affected} von {providerCount} Dienstleistern
          </strong>{' '}
          des Registers hängen an ihm ({share} %), verteilt auf{' '}
          <strong>{contractsLabel(impact.contracts.length)}</strong>.
        </p>
      )}

      <ul className="impact__contracts">
        {impact.contracts.map((item) => (
          <li key={item.contractRef}>
            <div className="impact__contract-head">
              <button
                type="button"
                className="ghost"
                onClick={() => onSelectContract(item.contractRef)}
              >
                Vertrag {item.contractRef}
              </button>
              <span className="note">
                Rang {formatRank(item.rank)} · {item.downstream.length} nachgelagert
              </span>
            </div>

            {item.downstream.length > 0 && (
              // Nearest first, which is the order reachableFrom returns: the
              // providers directly under it matter most when the phone rings.
              <p className="impact__names">
                {item.downstream.map((id) => nameOf?.(id) ?? id).join(' · ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
