import { useEffect, useMemo, useReducer, useState } from 'react';
import { generateRegister, DEMO_FINANCIAL_ENTITY } from '../data/generator/generateRegister.ts';
import {
  clearEditorState,
  loadEditorState,
  saveEditorState,
} from '../data/storage/registerStorage.ts';
import { validateRegister } from '../domain/validation/validateRegister.ts';
import { ContractRankTable } from '../presentation/components/ContractRankTable.tsx';
import { FindingList } from '../presentation/components/FindingList.tsx';
import { RegisterEditor } from '../presentation/components/RegisterEditor.tsx';
import { SupplyChainDiagram } from '../presentation/components/SupplyChainDiagram.tsx';
import { toLayoutGraph } from '../presentation/graph/layoutModel.ts';
import { editorReducer, emptyEditorState, toRegister, type EditorState } from './state/editorState.ts';

type Mode = 'demo' | 'own';

const EMPTY_STATE: EditorState = emptyEditorState({
  ...DEMO_FINANCIAL_ENTITY,
  legalName: 'Mein Finanzunternehmen',
});

/**
 * Composition root.
 *
 * Both modes run through the same core: the demo register and the hand-maintained
 * one are checked by the same `validateRegister` and drawn by the same layout.
 * Nothing below `app/` knows where a register came from.
 */
export function App() {
  const [mode, setMode] = useState<Mode>('demo');
  const [withFaults, setWithFaults] = useState(true);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  // A stored register is read once, before the first render of the editor.
  const [editorState, dispatch] = useReducer(
    editorReducer,
    EMPTY_STATE,
    (fallback) => loadEditorState(window.localStorage) ?? fallback,
  );

  useEffect(() => {
    saveEditorState(window.localStorage, editorState);
  }, [editorState]);

  const demoReport = useMemo(
    () =>
      validateRegister(
        generateRegister({
          seed: 42,
          contractCount: 3,
          maxDepth: 4,
          faults: withFaults
            ? { rankDeviations: 2, cycles: 1, orphans: 1, danglingReferences: 1, missingRanks: 1 }
            : undefined,
        }),
      ),
    [withFaults],
  );

  const ownReport = useMemo(() => validateRegister(toRegister(editorState)), [editorState]);
  const report = mode === 'demo' ? demoReport : ownReport;

  // Falling back to the first contract keeps the selection valid when the
  // register changes — no effect needed to reset it.
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
          Die Beispieldaten sind synthetisch erzeugt. Selbst erfasste Register bleiben im Browser
          dieses Rechners.
        </p>
      </header>

      <nav className="tabs">
        <button
          type="button"
          className={mode === 'demo' ? 'tab tab--active' : 'tab'}
          onClick={() => {
            setMode('demo');
            setSelectedRef(null);
          }}
        >
          Beispielregister
        </button>
        <button
          type="button"
          className={mode === 'own' ? 'tab tab--active' : 'tab'}
          onClick={() => {
            setMode('own');
            setSelectedRef(null);
          }}
        >
          Eigenes Register
        </button>
      </nav>

      {mode === 'demo' ? (
        <section>
          <label className="toggle">
            <input
              type="checkbox"
              checked={withFaults}
              onChange={(event) => setWithFaults(event.target.checked)}
            />
            Beispielregister mit eingebauten Fehlern
          </label>
        </section>
      ) : (
        <RegisterEditor
          state={editorState}
          dispatch={dispatch}
          contracts={ownReport.contracts}
          selectedRef={selectedRef}
          onSelect={setSelectedRef}
          onClear={() => {
            if (!window.confirm('Das erfasste Register vollständig löschen?')) return;
            clearEditorState(window.localStorage);
            dispatch({ type: 'state/replace', state: EMPTY_STATE });
            setSelectedRef(null);
          }}
        />
      )}

      <section>
        <p className="summary">
          Fehler: {report.summary.error} · Hinweise: {report.summary.warning} · Informationen:{' '}
          {report.summary.info} · Verträge: {report.contracts.length} · Dienstleister:{' '}
          {report.register.providers.length}
        </p>
      </section>

      {contract && layout ? (
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
      ) : (
        <section>
          <h2>Lieferkette</h2>
          <p className="empty">
            Noch keine Beziehung erfasst — sobald ein Vertrag eine Beauftragung enthält, erscheint
            hier die Kette.
          </p>
        </section>
      )}

      <section>
        <h2>Befunde</h2>
        <FindingList findings={report.findings} />
      </section>
    </main>
  );
}
