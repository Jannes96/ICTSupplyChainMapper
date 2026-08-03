import { useEffect, useMemo, useState } from 'react';
import { loadEditorState } from '../data/storage/registerStorage.ts';
import type { Register } from '../domain/model/register.ts';
import { validateRegister } from '../domain/validation/validateRegister.ts';
import { RadialSankey } from '../presentation/components/RadialSankey.tsx';
import { SupplyChainDiagram } from '../presentation/components/SupplyChainDiagram.tsx';
import { toLayoutGraph } from '../presentation/graph/layoutModel.ts';
import { buildDemoRegister, buildLargeDemoRegister } from './demoRegister.ts';
import { emptyEditorState, toRegister } from './state/editorState.ts';

/**
 * The separate window.
 *
 * It is a second entry point rather than a portal into a popup: the window
 * carries its own URL, so it can be reloaded, bookmarked and put on a second
 * screen, and it rebuilds the register from the parameters instead of depending
 * on a live reference into the opener. The demo register is seeded and therefore
 * reproducible; a hand-maintained one comes from the same local storage the main
 * window writes to.
 */

export type ChainWindowSource = 'demo' | 'demo-large' | 'own';

/**
 * Which drawing the window shows. Neither is a replacement for the other: the
 * layered view reads better for a short chain, where the levels sit in plain
 * rows, while the radial one only earns its keep once a contract has more
 * subcontractors than fit on a line.
 */
export type ChainWindowView = 'radial' | 'layered';

export interface ChainWindowParams {
  readonly source: ChainWindowSource;
  readonly withFaults: boolean;
  readonly contractRef: string | null;
  readonly view: ChainWindowView;
}

export const CHAIN_WINDOW_ROUTE = '#kette';

/** `#kette?quelle=demo&fehler=1&vertrag=C-2026000&ansicht=radial` */
export function parseChainWindowHash(hash: string): ChainWindowParams | null {
  if (!hash.startsWith(CHAIN_WINDOW_ROUTE)) return null;

  const query = new URLSearchParams(hash.slice(CHAIN_WINDOW_ROUTE.length).replace(/^\?/, ''));
  const source = query.get('quelle');

  return {
    source: source === 'eigen' ? 'own' : source === 'gross' ? 'demo-large' : 'demo',
    withFaults: query.get('fehler') !== '0',
    contractRef: query.get('vertrag'),
    view: query.get('ansicht') === 'ebenen' ? 'layered' : 'radial',
  };
}

export function buildChainWindowHash(params: ChainWindowParams): string {
  const query = new URLSearchParams();
  query.set('quelle', params.source === 'own' ? 'eigen' : params.source === 'demo-large' ? 'gross' : 'demo');
  query.set('fehler', params.withFaults ? '1' : '0');
  if (params.contractRef !== null) query.set('vertrag', params.contractRef);
  query.set('ansicht', params.view === 'layered' ? 'ebenen' : 'radial');
  return `${CHAIN_WINDOW_ROUTE}?${query.toString()}`;
}

const VIEW_DESCRIPTIONS: Record<ChainWindowView, string> = {
  radial:
    'Ringe sind Ränge: Finanzunternehmen im Zentrum, Rang 1 im ersten Ring, jede weitere Ebene eine Weiterverlagerung. Die Breite eines Bandes entspricht der Zahl der Dienstleister, die daran hängen.',
  layered:
    'Ebenen sind Ränge: Finanzunternehmen oben, direkte Dienstleister auf Rang 1, jede weitere Ebene eine Weiterverlagerung. Bei kurzen Ketten ist diese Ansicht die klarere.',
};

export function ChainWindow({ params }: { readonly params: ChainWindowParams }) {
  const [selectedRef, setSelectedRef] = useState<string | null>(params.contractRef);
  const [view, setView] = useState<ChainWindowView>(params.view);

  const report = useMemo(() => validateRegister(registerFor(params)), [params]);

  const contract = report.contracts.find((item) => item.ref === selectedRef) ?? report.contracts[0];
  const layout = contract ? toLayoutGraph(report.register, contract, report.findings) : null;

  // Keep the address honest: the window can be reloaded, bookmarked or moved to
  // another screen and comes back showing the same contract in the same view.
  useEffect(() => {
    if (!contract) return;
    window.history.replaceState(
      null,
      '',
      buildChainWindowHash({ ...params, contractRef: contract.ref, view }),
    );
  }, [params, contract, view]);

  return (
    <main className="window">
      <header className="window__head">
        <div>
          <h1>Lieferkette {contract?.ref ?? ''}</h1>
          <p className="note">{VIEW_DESCRIPTIONS[view]}</p>
        </div>

        <div className="window__tools">
          {report.contracts.length > 1 && contract && (
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
          )}

          <div className="tabs tabs--compact" role="group" aria-label="Darstellung">
            <button
              type="button"
              className={view === 'radial' ? 'tab tab--active' : 'tab'}
              aria-pressed={view === 'radial'}
              onClick={() => setView('radial')}
            >
              Radial (Sankey)
            </button>
            <button
              type="button"
              className={view === 'layered' ? 'tab tab--active' : 'tab'}
              aria-pressed={view === 'layered'}
              onClick={() => setView('layered')}
            >
              Ebenen
            </button>
          </div>
        </div>
      </header>

      {layout ? (
        <div className="window__view">
          {view === 'radial' ? (
            <RadialSankey layout={layout} />
          ) : (
            <SupplyChainDiagram layout={layout} />
          )}
        </div>
      ) : (
        <p className="empty">Für diese Auswahl liegt keine Lieferkette vor.</p>
      )}
    </main>
  );
}

function registerFor(params: ChainWindowParams): Register {
  switch (params.source) {
    case 'own': {
      const stored = loadEditorState(window.localStorage);
      return toRegister(stored ?? emptyEditorState({ ...PLACEHOLDER_ENTITY }));
    }
    case 'demo-large':
      return buildLargeDemoRegister();
    case 'demo':
      return buildDemoRegister(params.withFaults);
  }
}

const PLACEHOLDER_ENTITY = {
  id: 'FE' as Register['financialEntity']['id'],
  codeType: 'LEI' as const,
  legalName: 'Finanzunternehmen',
  country: 'DE',
};
