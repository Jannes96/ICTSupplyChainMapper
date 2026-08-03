import { useMemo, useState } from 'react';
import { generateRegister } from '../data/generator/generateRegister.ts';
import { validateRegister } from '../domain/validation/validateRegister.ts';
import { ContractRankTable } from '../presentation/components/ContractRankTable.tsx';
import { FindingList } from '../presentation/components/FindingList.tsx';
import { SupplyChainDiagram } from '../presentation/components/SupplyChainDiagram.tsx';
import { toLayoutGraph } from '../presentation/graph/layoutModel.ts';

/**
 * Provisional shell.
 *
 * Everything it does goes through the two calls that make up the public surface
 * of the core: `validateRegister` for the analysis, `toLayoutGraph` for the view.
 * CSV import and provider maintenance will plug into exactly the same two.
 */
export function App() {
  const [withFaults, setWithFaults] = useState(true);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  const report = useMemo(() => {
    const register = generateRegister({
      seed: 42,
      contractCount: 3,
      maxDepth: 4,
      faults: withFaults
        ? { rankDeviations: 2, cycles: 1, orphans: 1, danglingReferences: 1, missingRanks: 1 }
        : undefined,
    });
    return validateRegister(register);
  }, [withFaults]);

  // Falling back to the first contract keeps the selection valid when the
  // register is regenerated — no effect needed to reset it.
  const contract = report.contracts.find((item) => item.ref === selectedRef) ?? report.contracts[0];
  const layout = contract ? toLayoutGraph(report.register, contract, report.findings) : null;
  const contractFindings = contract
    ? report.findings.filter((finding) => finding.contractRef === contract.ref)
    : [];

  return (
    <main className="app">
      <header>
        <h1>IKT-Lieferketten-Mapper</h1>
        <p className="lead">
          Prüfung von Weiterverlagerungsketten im Informationsregister nach DORA Art. 28 Abs. 3
          (Meldevorlagen B_05.01 und B_05.02). Der Rang wird aus den erfassten Beziehungen berechnet
          und dem gemeldeten Rang gegenübergestellt.
        </p>
        <p className="note">
          Alle angezeigten Daten sind synthetisch erzeugt. Es werden keine echten Unternehmens- oder
          Vertragsdaten verarbeitet.
        </p>
      </header>

      <section>
        <label className="toggle">
          <input
            type="checkbox"
            checked={withFaults}
            onChange={(event) => setWithFaults(event.target.checked)}
          />
          Beispielregister mit eingebauten Fehlern
        </label>

        <p className="summary">
          Fehler: {report.summary.error} · Hinweise: {report.summary.warning} · Informationen:{' '}
          {report.summary.info} · Verträge: {report.contracts.length} · Dienstleister:{' '}
          {report.register.providers.length}
        </p>
      </section>

      {contract && layout && (
        <section>
          <div className="section-head">
            <h2>Lieferkette</h2>
            <label className="select">
              Vertrag
              <select value={contract.ref} onChange={(event) => setSelectedRef(event.target.value)}>
                {report.contracts.map((item) => (
                  <option key={item.ref} value={item.ref}>
                    {item.ref} ({item.links.length} Beziehungen)
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="note">
            Die Ebene entspricht dem berechneten Rang: Finanzunternehmen oben, direkte Dienstleister
            auf Rang 1, jede weitere Ebene ist eine Weiterverlagerung. Rot umrandete Knoten tragen
            einen Fehlerbefund.
          </p>

          <SupplyChainDiagram layout={layout} />

          <ul className="legend">
            <li>
              <span className="swatch swatch--root" /> Finanzunternehmen (Rang 0)
            </li>
            <li>
              <span className="swatch swatch--provider" /> Dienstleister
            </li>
            <li>
              <span className="swatch swatch--error" /> Fehlerbefund
            </li>
            <li>
              <span className="swatch swatch--warning" /> Hinweis
            </li>
          </ul>

          <details className="details">
            <summary>
              Ränge als Tabelle — {contractFindings.length} Befunde in diesem Vertrag
            </summary>
            <ContractRankTable layout={layout} />
          </details>
        </section>
      )}

      <section>
        <h2>Befunde</h2>
        <FindingList findings={report.findings} />
      </section>
    </main>
  );
}
