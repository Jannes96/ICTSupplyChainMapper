import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DEMO_FINANCIAL_ENTITY } from '../data/generator/generateRegister.ts';
import {
  clearEditorState,
  loadEditorState,
  saveEditorState,
} from '../data/storage/registerStorage.ts';
import type { NodeId } from '../domain/model/ids.ts';
import { providerIndex } from '../domain/model/register.ts';
import { validateRegister } from '../domain/validation/validateRegister.ts';
import { ContractRankTable } from '../presentation/components/ContractRankTable.tsx';
import { FindingList, type LocatedFinding } from '../presentation/components/FindingList.tsx';
import { ImpactPanel } from '../presentation/components/ImpactPanel.tsx';
import { RegisterEditor } from '../presentation/components/RegisterEditor.tsx';
import { SupplyChainDiagram } from '../presentation/components/SupplyChainDiagram.tsx';
import { locateFinding } from '../presentation/findingFocus.ts';
import { toLayoutGraph } from '../presentation/graph/layoutModel.ts';
import { buildChainWindowHash, type ChainWindowParams } from './ChainWindow.tsx';
import { buildDemoRegister } from './demoRegister.ts';
import { editorReducer, emptyEditorState, toRegister, type EditorState } from './state/editorState.ts';

/**
 * Opens the radial view in a window of its own.
 *
 * The window gets a URL rather than a reference into this document: it survives a
 * reload, can be dropped on a second screen and rebuilds the register from the
 * parameters. Naming the window means a second click reuses it instead of
 * scattering copies across the desktop.
 */
function openChainWindow(params: ChainWindowParams): void {
  const url = new URL(window.location.href);
  url.hash = buildChainWindowHash(params);
  window.open(url.toString(), `kette-${params.source}`, 'popup=yes,width=1320,height=960');
}

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
  /** Index of the finding whose nodes are marked in the diagram. */
  const [selectedFinding, setSelectedFinding] = useState<number | null>(null);
  /** Provider the impact question is being asked about. */
  const [inspected, setInspected] = useState<NodeId | null>(null);
  const diagramRef = useRef<HTMLElement>(null);

  // A stored register is read once, before the first render of the editor.
  const [editorState, dispatch] = useReducer(
    editorReducer,
    EMPTY_STATE,
    (fallback) => loadEditorState(window.localStorage) ?? fallback,
  );

  useEffect(() => {
    saveEditorState(window.localStorage, editorState);
  }, [editorState]);

  const demoReport = useMemo(() => validateRegister(buildDemoRegister(withFaults)), [withFaults]);

  const ownReport = useMemo(() => validateRegister(toRegister(editorState)), [editorState]);
  const report = mode === 'demo' ? demoReport : ownReport;

  // Falling back to the first contract keeps the selection valid when the
  // register changes — no effect needed to reset it.
  const contract = report.contracts.find((item) => item.ref === selectedRef) ?? report.contracts[0];
  const layout = contract ? toLayoutGraph(report.register, contract, report.findings) : null;
  const contractFindings = contract
    ? report.findings.filter((finding) => finding.contractRef === contract.ref)
    : [];

  const located: LocatedFinding[] = useMemo(
    () => report.findings.map((finding) => ({ finding, focus: locateFinding(report, finding) })),
    [report],
  );

  // Findings carry identification codes; the reader needs company names. The
  // lookup belongs here rather than in the domain — a finding points at the key,
  // and what that key is called today is a question of presentation.
  const nameOf = useMemo(() => {
    const providers = providerIndex(report.register);
    const { id, legalName } = report.register.financialEntity;
    return (node: NodeId): string | null =>
      node === id ? legalName : (providers.get(node)?.legalName ?? null);
  }, [report]);

  // Only mark nodes while the diagram actually shows the finding's contract —
  // otherwise a stale selection would light up whatever node happens to share
  // an identifier in another chain.
  const selectedFocus = selectedFinding === null ? null : located[selectedFinding]?.focus ?? null;
  const focusedNodes =
    selectedFocus && contract && selectedFocus.contractRef === contract.ref
      ? new Set(selectedFocus.nodeIds)
      : null;

  const showFinding = (index: number): void => {
    if (index === selectedFinding) {
      setSelectedFinding(null);
      return;
    }
    const focus = located[index]?.focus;
    if (!focus) return;

    setSelectedFinding(index);
    setSelectedRef(focus.contractRef);
    // One thing at a time: a dimmed diagram and an open impact panel would be
    // two different answers to two different questions on the same picture.
    setInspected(null);
    // The findings sit below the diagram, so the diagram has to be brought back
    // into view — otherwise the marking happens off screen.
    diagramRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const switchRegister = (next: Mode): void => {
    setMode(next);
    setSelectedRef(null);
    setSelectedFinding(null);
    setInspected(null);
  };

  const inspectNode = (id: NodeId): void => {
    setInspected((current) => (current === id ? null : id));
    setSelectedFinding(null);
  };

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
            switchRegister('demo');
          }}
        >
          Beispielregister
        </button>
        <button
          type="button"
          className={mode === 'own' ? 'tab tab--active' : 'tab'}
          onClick={() => {
            switchRegister('own');
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
              onChange={(event) => {
                setWithFaults(event.target.checked);
                setSelectedFinding(null);
              }}
            />
            Beispielregister mit eingebauten Fehlern
          </label>
          <p className="note">
            <button
              type="button"
              className="ghost"
              onClick={() =>
                openChainWindow({
                  source: 'demo-large',
                  withFaults: false,
                  contractRef: null,
                  view: 'radial',
                })
              }
            >
              Beispiel mit 100 Dienstleistern öffnen
            </button>{' '}
            — zeigt, wofür die radiale Ansicht gedacht ist: eine Kette, die als Ebenendiagramm
            unlesbar wird.
          </p>
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
        <section ref={diagramRef}>
          <div className="section-head">
            <h2>Lieferkette</h2>
            <div className="section-head__tools">
              <label className="select">
                Vertrag
                <select
                  value={contract.ref}
                  onChange={(event) => setSelectedRef(event.target.value)}
                >
                  {report.contracts.map((item) => (
                    <option key={item.ref} value={item.ref}>
                      {item.ref} ({item.links.length} Beziehungen)
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  openChainWindow({
                    source: mode === 'demo' ? 'demo' : 'own',
                    withFaults,
                    contractRef: contract.ref,
                    view: 'radial',
                  })
                }
              >
                Als Sankey in eigenem Fenster
              </button>
            </div>
          </div>

          <p className="note">
            Die Ebene entspricht dem berechneten Rang: Finanzunternehmen oben, direkte Dienstleister
            auf Rang 1, jede weitere Ebene ist eine Weiterverlagerung. Rot umrandete Knoten tragen
            einen Fehlerbefund.
          </p>

          <SupplyChainDiagram
            layout={layout}
            focused={focusedNodes}
            onSelectNode={inspectNode}
          />

          {inspected && (
            <ImpactPanel
              contracts={report.contracts}
              providerId={inspected}
              providerCount={report.register.providers.length}
              nameOf={nameOf}
              onClose={() => setInspected(null)}
              onSelectContract={setSelectedRef}
            />
          )}

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
            <ContractRankTable layout={layout} focused={focusedNodes} />
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
        <FindingList
          items={located}
          selected={selectedFinding}
          onSelect={showFinding}
          nameOf={nameOf}
        />
      </section>
    </main>
  );
}
