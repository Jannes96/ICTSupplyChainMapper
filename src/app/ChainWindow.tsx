import { useMemo, useState } from 'react';
import { loadEditorState } from '../data/storage/registerStorage.ts';
import type { Register } from '../domain/model/register.ts';
import { validateRegister } from '../domain/validation/validateRegister.ts';
import { RadialSankey } from '../presentation/components/RadialSankey.tsx';
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

export interface ChainWindowParams {
  readonly source: ChainWindowSource;
  readonly withFaults: boolean;
  readonly contractRef: string | null;
}

export const CHAIN_WINDOW_ROUTE = '#kette';

/** `#kette?quelle=demo&fehler=1&vertrag=C-2026000` */
export function parseChainWindowHash(hash: string): ChainWindowParams | null {
  if (!hash.startsWith(CHAIN_WINDOW_ROUTE)) return null;

  const query = new URLSearchParams(hash.slice(CHAIN_WINDOW_ROUTE.length).replace(/^\?/, ''));
  const source = query.get('quelle');

  return {
    source: source === 'eigen' ? 'own' : source === 'gross' ? 'demo-large' : 'demo',
    withFaults: query.get('fehler') !== '0',
    contractRef: query.get('vertrag'),
  };
}

export function buildChainWindowHash(params: ChainWindowParams): string {
  const query = new URLSearchParams();
  query.set('quelle', params.source === 'own' ? 'eigen' : params.source === 'demo-large' ? 'gross' : 'demo');
  query.set('fehler', params.withFaults ? '1' : '0');
  if (params.contractRef !== null) query.set('vertrag', params.contractRef);
  return `${CHAIN_WINDOW_ROUTE}?${query.toString()}`;
}

export function ChainWindow({ params }: { readonly params: ChainWindowParams }) {
  const [selectedRef, setSelectedRef] = useState<string | null>(params.contractRef);

  const report = useMemo(() => validateRegister(registerFor(params)), [params]);

  const contract = report.contracts.find((item) => item.ref === selectedRef) ?? report.contracts[0];
  const layout = contract ? toLayoutGraph(report.register, contract, report.findings) : null;

  return (
    <main className="window">
      <header className="window__head">
        <div>
          <h1>Lieferkette {contract?.ref ?? ''}</h1>
          <p className="note">
            Ringe sind Ränge: Finanzunternehmen im Zentrum, Rang 1 im ersten Ring, jede weitere Ebene
            eine Weiterverlagerung. Die Breite eines Bandes entspricht der Zahl der Dienstleister,
            die daran hängen.
          </p>
        </div>

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
      </header>

      {layout ? (
        <RadialSankey layout={layout} />
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
