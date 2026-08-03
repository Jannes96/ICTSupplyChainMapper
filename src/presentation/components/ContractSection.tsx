import { useState, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '../../app/state/editorState.ts';
import { previewRank } from '../../app/state/editorState.ts';
import type { ContractAnalysis } from '../../domain/analysis/ContractAnalysis.ts';
import { contractRef, nodeId } from '../../domain/model/ids.ts';
import type { SupplyChainLink } from '../../domain/model/register.ts';
import { formatRank } from '../i18n/de.ts';

interface ContractSectionProps {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
  readonly contracts: readonly ContractAnalysis[];
  readonly selectedRef: string | null;
  readonly onSelect: (ref: string) => void;
}

/**
 * The supply chain — template B_05.02.
 *
 * The rank is not a field of the form. What is maintained is the relationship:
 * which provider is contracted by whom, inside which contract. The resulting rank
 * appears live while the selection is made. The one rank that *can* be typed is
 * the reported one, and only so the tool has something to compare against when an
 * existing register entry is transcribed.
 */
export function ContractSection({
  state,
  dispatch,
  contracts,
  selectedRef,
  onSelect,
}: ContractSectionProps) {
  const [newContract, setNewContract] = useState('');
  const [providerId, setProviderId] = useState('');
  const [contractedBy, setContractedBy] = useState('');
  const [reportedRank, setReportedRank] = useState('');

  const activeRef = selectedRef ?? state.contractRefs[0] ?? null;
  const analysis = contracts.find((contract) => contract.ref === activeRef) ?? null;
  const links = activeRef === null ? [] : state.links.filter((link) => link.contractRef === activeRef);

  const candidate: SupplyChainLink | null =
    activeRef === null || providerId === ''
      ? null
      : {
          contractRef: contractRef(activeRef),
          providerId: nodeId(providerId),
          contractedBy: contractedBy === '' ? null : nodeId(contractedBy),
          reportedRank: reportedRank === '' ? null : Number(reportedRank),
        };

  const preview = candidate ? previewRank(state, candidate) : null;
  const wouldDeviate =
    candidate?.reportedRank != null && preview !== null && candidate.reportedRank !== preview;

  const addLink = (): void => {
    if (!candidate) return;
    dispatch({ type: 'link/upsert', link: candidate });
    setProviderId('');
    setContractedBy('');
    setReportedRank('');
  };

  return (
    <section className="editor-block">
      <h3>Lieferketten (B_05.02)</h3>

      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = newContract.trim();
          if (trimmed === '') return;
          dispatch({ type: 'contract/add', ref: contractRef(trimmed) });
          onSelect(trimmed);
          setNewContract('');
        }}
      >
        <label>
          Neue Vertragsreferenz
          <input
            value={newContract}
            onChange={(event) => setNewContract(event.target.value)}
            placeholder="z. B. C-2026001"
          />
        </label>
        <button type="submit" disabled={newContract.trim() === ''}>
          Vertrag anlegen
        </button>
      </form>

      {state.contractRefs.length === 0 ? (
        <p className="empty">Noch kein Vertrag angelegt.</p>
      ) : (
        <>
          <div className="inline-form">
            <label>
              Vertrag
              <select value={activeRef ?? ''} onChange={(event) => onSelect(event.target.value)}>
                {state.contractRefs.map((ref) => (
                  <option key={ref} value={ref}>
                    {ref}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ghost danger"
              onClick={() => {
                if (activeRef === null) return;
                const count = links.length;
                const question =
                  count === 0
                    ? `Vertrag ${activeRef} löschen?`
                    : `Vertrag ${activeRef} löschen? ${count} Beziehung(en) werden mit gelöscht.`;
                if (window.confirm(question)) {
                  dispatch({ type: 'contract/remove', ref: contractRef(activeRef) });
                }
              }}
            >
              Vertrag löschen
            </button>
          </div>

          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              addLink();
            }}
          >
            <label>
              Dienstleister
              <select value={providerId} onChange={(event) => setProviderId(event.target.value)} required>
                <option value="">— bitte wählen —</option>
                {state.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.legalName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              wird beauftragt von
              <select value={contractedBy} onChange={(event) => setContractedBy(event.target.value)}>
                <option value="">{state.financialEntity.legalName} (Finanzunternehmen)</option>
                {state.providers
                  .filter((provider) => provider.id !== providerId)
                  .map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.legalName}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Gemeldeter Rang <span className="hint">optional</span>
              <input
                type="number"
                min={1}
                value={reportedRank}
                onChange={(event) => setReportedRank(event.target.value)}
                placeholder="leer = nicht gemeldet"
              />
            </label>

            <p className={wouldDeviate ? 'preview preview--deviation' : 'preview'}>
              Berechneter Rang: <strong>{candidate ? formatRank(preview) : '—'}</strong>
              {wouldDeviate && ' — weicht vom gemeldeten Rang ab'}
            </p>

            <div className="form-grid__actions">
              <button type="submit" disabled={!candidate}>
                Beziehung aufnehmen
              </button>
            </div>
          </form>

          {links.length === 0 ? (
            <p className="empty">In diesem Vertrag ist noch keine Beziehung erfasst.</p>
          ) : (
            <table className="grid">
              <thead>
                <tr>
                  <th scope="col">Dienstleister</th>
                  <th scope="col">beauftragt von</th>
                  <th scope="col">gemeldet</th>
                  <th scope="col">berechnet</th>
                  <th scope="col">
                    <span className="visually-hidden">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => {
                  const computed = analysis?.ranks.get(link.providerId) ?? null;
                  const deviates = link.reportedRank !== null && link.reportedRank !== computed;

                  return (
                    <tr key={`${link.providerId}-${link.contractedBy ?? 'FU'}`}>
                      <td>{nameOf(state, link.providerId)}</td>
                      <td>
                        {link.contractedBy === null
                          ? `${state.financialEntity.legalName} (FU)`
                          : nameOf(state, link.contractedBy)}
                      </td>
                      <td className={deviates ? 'cell--deviation' : undefined}>
                        {link.reportedRank ?? '—'}
                      </td>
                      <td className={deviates ? 'cell--deviation' : undefined}>
                        {formatRank(computed)}
                      </td>
                      <td className="grid__actions">
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => dispatch({ type: 'link/remove', link })}
                        >
                          Entfernen
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

function nameOf(state: EditorState, id: string): string {
  return state.providers.find((provider) => provider.id === id)?.legalName ?? id;
}
