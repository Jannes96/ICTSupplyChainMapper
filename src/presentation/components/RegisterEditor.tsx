import type { Dispatch } from 'react';
import type { EditorAction, EditorState } from '../../app/state/editorState.ts';
import { toRegister } from '../../app/state/editorState.ts';
import { exportProvidersCsv, exportSupplyChainCsv } from '../../data/csv/registerCsv.ts';
import type { ContractAnalysis } from '../../domain/analysis/ContractAnalysis.ts';
import { nodeId } from '../../domain/model/ids.ts';
import { downloadText } from '../download.ts';
import { ContractSection } from './ContractSection.tsx';
import { ProviderSection } from './ProviderSection.tsx';
import { RegisterImport } from './RegisterImport.tsx';

interface RegisterEditorProps {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
  readonly contracts: readonly ContractAnalysis[];
  readonly selectedRef: string | null;
  readonly onSelect: (ref: string) => void;
  readonly onClear: () => void;
}

/**
 * The maintenance screen: financial entity, providers, supply chains.
 *
 * It only ever dispatches actions — the register itself is checked and ranked by
 * the same core the demo register goes through. There is no second code path for
 * hand-maintained data.
 */
export function RegisterEditor({
  state,
  dispatch,
  contracts,
  selectedRef,
  onSelect,
  onClear,
}: RegisterEditorProps) {
  const register = toRegister(state);

  return (
    <div className="editor">
      <section className="editor-block">
        <h3>Finanzunternehmen</h3>
        <p className="note">
          Die meldende Institution selbst. Sie steht in keiner der beiden Meldevorlagen, ist aber die
          Wurzel jeder Kette — Rang 0.
        </p>

        <div className="form-grid">
          <label className="form-grid__wide">
            Firmierung
            <input
              value={state.financialEntity.legalName}
              onChange={(event) =>
                dispatch({
                  type: 'financialEntity/set',
                  entity: { ...state.financialEntity, legalName: event.target.value },
                })
              }
            />
          </label>
          <label>
            Kennung
            <input
              value={state.financialEntity.id}
              onChange={(event) =>
                dispatch({
                  type: 'financialEntity/set',
                  entity: { ...state.financialEntity, id: nodeId(event.target.value) },
                })
              }
            />
          </label>
          <label>
            Sitzland
            <input
              value={state.financialEntity.country}
              maxLength={2}
              onChange={(event) =>
                dispatch({
                  type: 'financialEntity/set',
                  entity: { ...state.financialEntity, country: event.target.value.toUpperCase() },
                })
              }
            />
          </label>
        </div>
      </section>

      <ProviderSection state={state} dispatch={dispatch} />

      <ContractSection
        state={state}
        dispatch={dispatch}
        contracts={contracts}
        selectedRef={selectedRef}
        onSelect={onSelect}
      />

      <section className="editor-block">
        <h3>Register laden</h3>
        <RegisterImport state={state} dispatch={dispatch} />
      </section>

      <section className="editor-block">
        <h3>Register sichern</h3>
        <p className="note">
          Das Register liegt im Browser dieses Rechners und wird beim nächsten Öffnen
          wiederhergestellt. Es verlässt das Gerät nicht. Der CSV-Export liefert beide Meldevorlagen
          in genau dem Format, das der Import oben wieder liest.
        </p>
        <div className="inline-form">
          <button
            type="button"
            onClick={() => downloadText('providers.csv', exportProvidersCsv(register.providers))}
            disabled={register.providers.length === 0}
          >
            B_05.01 exportieren
          </button>
          <button
            type="button"
            onClick={() => downloadText('supply_chain.csv', exportSupplyChainCsv(register.links))}
            disabled={register.links.length === 0}
          >
            B_05.02 exportieren
          </button>
          <button type="button" className="ghost danger" onClick={onClear}>
            Register leeren
          </button>
        </div>
      </section>
    </div>
  );
}
