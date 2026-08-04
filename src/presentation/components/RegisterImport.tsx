import { useRef, useState, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '../../app/state/editorState.ts';
import type { CsvIssue, TemplateId } from '../../data/csv/registerCsv.ts';
import {
  detectTemplate,
  parseProvidersCsv,
  parseSupplyChainCsv,
  TEMPLATES,
} from '../../data/csv/registerCsv.ts';
import { describeCsvIssue } from '../i18n/de.ts';

interface RegisterImportProps {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
}

interface FileOutcome {
  readonly fileName: string;
  readonly template: TemplateId | null;
  readonly accepted: number;
  readonly issues: readonly CsvIssue[];
}

/**
 * Reading B_05.01 and B_05.02 from files.
 *
 * The parsing itself lives in `data/csv` and is unit-tested; this component only
 * gets the text out of the file and hands the result to the reducer. From there
 * an imported register runs through exactly the same checks as a hand-typed one
 * — there is no second code path for imported data.
 *
 * Each file replaces its own template. A new upload therefore takes the place of
 * the previous register, but the two files can still arrive one at a time.
 */
export function RegisterImport({ state, dispatch }: RegisterImportProps) {
  const [outcomes, setOutcomes] = useState<readonly FileOutcome[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isEmpty = state.providers.length === 0 && state.links.length === 0;

  const handleFiles = async (files: readonly File[]): Promise<void> => {
    const read = await Promise.all(
      files.map(async (file) => ({ file, text: await file.text() })),
    );

    const recognised = read.filter(({ text }) => detectTemplate(text) !== null);
    // One question for the whole selection, and only when there is something to
    // lose: this is the moment where hand-made corrections would disappear.
    if (recognised.length > 0 && !isEmpty) {
      const confirmed = window.confirm(
        `Das aktuelle Register wird ersetzt: ${state.providers.length} Dienstleister, ` +
          `${state.contractRefs.length} Verträge, ${state.links.length} Beziehungen. Fortfahren?`,
      );
      if (!confirmed) return;
    }

    const results: FileOutcome[] = [];

    for (const { file, text } of read) {
      const template = detectTemplate(text);

      if (template === TEMPLATES.providers) {
        const { rows, issues } = parseProvidersCsv(text);
        dispatch({ type: 'providers/replace', providers: rows });
        results.push({ fileName: file.name, template, accepted: rows.length, issues });
      } else if (template === TEMPLATES.supplyChain) {
        const { rows, issues } = parseSupplyChainCsv(text);
        dispatch({ type: 'links/replace', links: rows });
        results.push({ fileName: file.name, template, accepted: rows.length, issues });
      } else {
        results.push({ fileName: file.name, template: null, accepted: 0, issues: [] });
      }
    }

    setOutcomes(results);
    // Clearing the field lets the same file be picked again after it was fixed.
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <>
      <div className="inline-form">
        <label>
          CSV-Dateien wählen
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void handleFiles(files);
            }}
          />
        </label>
      </div>

      <p className="note">
        B_05.01 und B_05.02 lassen sich zusammen oder einzeln wählen — welche Vorlage eine Datei
        enthält, wird an ihrer Kopfzeile erkannt. Aus Excel bitte als „CSV UTF-8" speichern, sonst
        kommen Umlaute in den Firmierungen falsch an.
      </p>

      {outcomes && <ImportReport outcomes={outcomes} />}
    </>
  );
}

function ImportReport({ outcomes }: { readonly outcomes: readonly FileOutcome[] }) {
  return (
    <ul className="import-report">
      {outcomes.map((outcome) => (
        <li key={outcome.fileName} className={`import-report__item import-report__item--${statusOf(outcome)}`}>
          <strong>{outcome.fileName}</strong>{' '}
          <span className="mono">{outcome.template ?? 'unbekannt'}</span>
          <p>{summarise(outcome)}</p>

          {outcome.issues.length > 0 && (
            <ul className="import-report__issues">
              {outcome.issues.map((issue, index) => (
                <li key={`${issue.line}-${issue.column}-${index}`}>{describeCsvIssue(issue)}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

type ImportStatus = 'rejected' | 'partial' | 'accepted';

/**
 * Three outcomes that feel very different and must not be worded alike: a file
 * that was not a template at all, one whose missing column left nothing to take,
 * and one where individual rows were skipped but the rest arrived.
 */
function statusOf(outcome: FileOutcome): ImportStatus {
  if (outcome.template === null || outcome.accepted === 0) return 'rejected';
  return outcome.issues.length > 0 ? 'partial' : 'accepted';
}

function summarise(outcome: FileOutcome): string {
  if (outcome.template === null) {
    return 'Keine der beiden Meldevorlagen erkannt. Erwartet wird eine Kopfzeile mit „contract_ref“ (B_05.02) oder „person_type“ (B_05.01).';
  }
  if (outcome.accepted === 0) {
    return 'Nicht übernommen — keine verwertbare Zeile. Siehe die Meldungen unten.';
  }

  const unit = outcome.template === TEMPLATES.providers ? 'Dienstleister' : 'Beziehungen';
  if (outcome.issues.length === 0) return `${outcome.accepted} ${unit} übernommen.`;

  // Deliberately vague about what became of the offending rows: a missing
  // identifier skips the row, an invalid field value does not. Each message
  // below says which of the two it was.
  return `${outcome.accepted} ${unit} übernommen, ${outcome.issues.length} Anmerkung(en) zur Datei:`;
}
