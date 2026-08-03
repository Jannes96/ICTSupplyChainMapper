import { useMemo, useState } from 'react';
import { generateRegister } from '../data/generator/generateRegister.ts';
import { validateRegister } from '../domain/validation/validateRegister.ts';
import { ContractRankTable } from '../presentation/components/ContractRankTable.tsx';
import { FindingList } from '../presentation/components/FindingList.tsx';
import { toLayoutGraph } from '../presentation/graph/layoutModel.ts';

/**
 * Provisional shell.
 *
 * Its only job at this stage is to prove the wiring end to end: generate a
 * register, run the core logic, render findings and ranks. CSV import/export and
 * the React Flow view plug into exactly these two calls.
 */
export function App() {
  const [withFaults, setWithFaults] = useState(true);

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

      <section>
        <h2>Befunde</h2>
        <FindingList findings={report.findings} />
      </section>

      <section>
        <h2>Berechnete Ränge je Vertrag</h2>
        <p className="note">
          Platzhalter für die Graphdarstellung. Die Tabelle nutzt bereits das Layout-Modell, das
          später React Flow und dagre versorgt.
        </p>
        {report.contracts.map((contract) => (
          <article key={contract.ref}>
            <h3>Vertrag {contract.ref}</h3>
            <ContractRankTable layout={toLayoutGraph(report.register, contract, report.findings)} />
          </article>
        ))}
      </section>
    </main>
  );
}
