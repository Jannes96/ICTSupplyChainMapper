import { useState, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '../../app/state/editorState.ts';
import { nodeId } from '../../domain/model/ids.ts';
import type { CodeType, PersonType, Provider } from '../../domain/model/register.ts';
import { CODE_TYPES, PERSON_TYPES } from '../../domain/model/register.ts';
import { CODE_TYPE_LABELS, PERSON_TYPE_LABELS } from '../i18n/de.ts';

interface ProviderSectionProps {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
}

const EMPTY_FORM = {
  id: '',
  codeType: 'LEI' as CodeType,
  legalName: '',
  country: '',
  personType: 'LEGAL_PERSON' as PersonType,
};

/**
 * Master data of the ICT third-party service providers — template B_05.01.
 *
 * The form doubles as the edit form: picking a row fills it, and saving replaces
 * the provider carrying that code. One code, one provider, one node in the graph.
 */
export function ProviderSection({ state, dispatch }: ProviderSectionProps) {
  const [form, setForm] = useState(EMPTY_FORM);

  const trimmedId = form.id.trim().toUpperCase();
  const isKnown = state.providers.some((provider) => provider.id === nodeId(trimmedId));
  const canSubmit = trimmedId !== '' && form.legalName.trim() !== '' && /^[A-Za-z]{2}$/.test(form.country);
  const isDirty = form.id !== '' || form.legalName !== '' || form.country !== '';

  const submit = (): void => {
    if (!canSubmit) return;
    const provider: Provider = {
      id: nodeId(trimmedId),
      codeType: form.codeType,
      legalName: form.legalName.trim(),
      country: form.country.trim().toUpperCase(),
      personType: form.personType,
    };
    dispatch({ type: 'provider/upsert', provider });
    setForm(EMPTY_FORM);
  };

  const usageOf = (provider: Provider): number =>
    state.links.filter(
      (link) => link.providerId === provider.id || link.contractedBy === provider.id,
    ).length;

  return (
    <section className="editor-block">
      <h3>Dienstleister (B_05.01)</h3>

      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label>
          Kennung
          <input
            value={form.id}
            onChange={(event) => setForm({ ...form, id: event.target.value })}
            placeholder="z. B. LEI"
            required
          />
        </label>

        <label>
          Art der Kennung
          <select
            value={form.codeType}
            onChange={(event) => setForm({ ...form, codeType: event.target.value as CodeType })}
          >
            {CODE_TYPES.map((value) => (
              <option key={value} value={value}>
                {CODE_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="form-grid__wide">
          Firmierung
          <input
            value={form.legalName}
            onChange={(event) => setForm({ ...form, legalName: event.target.value })}
            required
          />
        </label>

        <label>
          Sitzland
          <input
            value={form.country}
            onChange={(event) => setForm({ ...form, country: event.target.value })}
            placeholder="DE"
            maxLength={2}
            required
          />
        </label>

        <label>
          Art der Rechtsperson
          <select
            value={form.personType}
            onChange={(event) => setForm({ ...form, personType: event.target.value as PersonType })}
          >
            {PERSON_TYPES.map((value) => (
              <option key={value} value={value}>
                {PERSON_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <div className="form-grid__actions">
          <button type="submit" disabled={!canSubmit}>
            {isKnown ? 'Dienstleister aktualisieren' : 'Dienstleister aufnehmen'}
          </button>
          {isDirty && (
            <button type="button" className="ghost" onClick={() => setForm(EMPTY_FORM)}>
              Formular leeren
            </button>
          )}
        </div>
      </form>

      {state.providers.length === 0 ? (
        <p className="empty">Noch kein Dienstleister erfasst.</p>
      ) : (
        <div className="grid-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th scope="col">Kennung</th>
              <th scope="col">Firmierung</th>
              <th scope="col">Land</th>
              <th scope="col">Beziehungen</th>
              <th scope="col">
                <span className="visually-hidden">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {state.providers.map((provider) => (
              <tr key={provider.id}>
                <td className="mono">{provider.id}</td>
                <td>{provider.legalName}</td>
                <td>{provider.country}</td>
                <td>{usageOf(provider)}</td>
                <td className="grid__actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      setForm({
                        id: provider.id,
                        codeType: provider.codeType,
                        legalName: provider.legalName,
                        country: provider.country,
                        personType: provider.personType,
                      })
                    }
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => {
                      const uses = usageOf(provider);
                      const question =
                        uses === 0
                          ? `${provider.legalName} entfernen?`
                          : `${provider.legalName} entfernen? ${uses} Beziehung(en) in Lieferketten werden mit gelöscht.`;
                      if (window.confirm(question)) dispatch({ type: 'provider/remove', id: provider.id });
                    }}
                  >
                    Entfernen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
