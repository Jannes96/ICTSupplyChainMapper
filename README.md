# ICT Supply Chain Mapper

Prüfwerkzeug für IKT-Weiterverlagerungsketten im Informationsregister nach **DORA Art. 28 Abs. 3**
(Meldevorlagen **B_05.01** und **B_05.02**).

> Portfolio-Projekt. Es verarbeitet ausschließlich synthetische Daten — keine echten Unternehmens-,
> Vertrags- oder Registerdaten. Die Oberfläche ist deutsch, Code und Bezeichner sind englisch.

---

## Problemstellung

Finanzunternehmen müssen jeden IKT-Drittdienstleister im Informationsregister erfassen — und mit ihm
die gesamte Kette der Weiterverlagerungen. B_05.02 verlangt dafür je Vertrag einen **Rang**:

| Rang | Bedeutung |
| ---- | --------- |
| 1 | direkter Dienstleister des Finanzunternehmens |
| > 1 | Unterauftragnehmer (Weiterverlagerung) |

Für jeden Dienstleister mit Rang > 1 ist anzugeben, von wem er beauftragt wird. Diese Angabe ist die
Kante, die die Kette zusammenhält.

In der Praxis wird der Rang manuell gepflegt, oft aus Zulieferungen mehrerer Fachbereiche. Das geht
regelmäßig schief: Ein Dienstleister wird als Rang 1 gemeldet, obwohl er von einem anderen
Dienstleister beauftragt wird; eine Kette bricht ab, weil der Auftraggeber nie erfasst wurde; eine
Kennung in B_05.02 hat keinen Stammdatensatz in B_05.01.

## Zielbild

**Der Rang wird nicht gepflegt, sondern gerechnet.**

Gepflegt werden nur Beziehungen — „A beauftragt B“. Der Rang eines Knotens ist die Länge des
**längsten** Pfades vom Finanzunternehmen zu diesem Knoten. Wird ein bestehendes Register importiert,
stellt das Werkzeug den gemeldeten dem berechneten Rang gegenüber und meldet jede Abweichung als
Befund. Es ist damit kein Zeichenprogramm, sondern ein Prüfwerkzeug mit Visualisierung.

Warum der **längste** Pfad: Ist ein Dienstleister sowohl direkt beauftragt als auch über einen
anderen Dienstleister eingebunden, sitzt das Weiterverlagerungsrisiko an der tieferen Position. Das
Maximum macht den Rang außerdem entlang jeder Kante monoton — die Voraussetzung für eine Darstellung
in sauberen Ebenen ohne Rückwärtskanten.

### Prüfungen

| Befund (`code`) | Schweregrad | Bedeutung |
| --------------- | ----------- | --------- |
| `RANK_DEVIATION` | Fehler | Gemeldeter und berechneter Rang weichen ab |
| `UNKNOWN_PROVIDER_REFERENCE` | Fehler | Kennung aus B_05.02 fehlt in B_05.01 |
| `CYCLE_DETECTED` | Fehler | Kette schließt sich zum Kreis (A → B → A) |
| `ORPHAN_NODE` | Fehler | Unterauftragnehmer ohne eingehende Kante |
| `RANK_NOT_COMPUTABLE` | Fehler | Kein Pfad vom Finanzunternehmen (Zyklus oder Bruch) |
| `MISSING_REPORTED_RANK` | Hinweis | Rang nicht gemeldet, berechneter Rang liegt vor |
| `DUPLICATE_PROVIDER` | Hinweis | Kennung in B_05.01 mehrfach vergeben |
| `UNUSED_PROVIDER` | Information | Stammdatensatz ohne Lieferkette |

### Datenmodell

Ein **gerichteter Graph**, ausdrücklich kein Baum:

- **Knoten** — Finanzunternehmen (Wurzel, Rang 0) und Dienstleister (Kennung, Name, Sitzland, Art)
- **Kanten** — „verlagert weiter an“, immer bezogen auf eine Vertragsreferenz
- ein Dienstleister kann mehrere Unterauftragnehmer haben und selbst mehrere Auftraggeber
- derselbe Dienstleister bleibt über Verträge hinweg **ein** Knoten

Der **Rang wird je Vertrag** berechnet. Derselbe Dienstleister kann in Vertrag A auf Rang 2 und in
Vertrag B auf Rang 3 sitzen; ein register-weiter Rang könnte das nicht abbilden.

Das Finanzunternehmen ist ein **expliziter Wurzelknoten**. Damit ist „Rang 1“ kein Sonderfall im
Algorithmus, sondern schlicht die Nachfolgermenge der Wurzel.

Ein Zyklus liefert **keinen** Rang: betroffene und dahinterliegende Knoten erhalten `null`
(„nicht bestimmbar“) und einen Befund. Eine erfundene Zahl wäre genau der Fehler, den dieses Werkzeug
finden soll.

---

## Repository-Struktur

```
src/
├── domain/              Fachlichkeit — ohne UI, ohne I/O, ohne Framework
│   ├── model/           Typen: Kennungen, Dienstleister, Kante, Vertrag, Register
│   ├── graph/           eigene Graphalgorithmen (DirectedGraph, topologische
│   │                    Sortierung, längster Pfad, Zyklensuche)
│   ├── analysis/        Aufbau je Vertrag: Graph + berechnete Ränge
│   └── validation/      Befundtypen und Prüfungen (eine Datei je Prüfung)
├── data/                Datenzugriff — Ein- und Ausgabe
│   ├── csv/             RFC-4180-Parser und Abbildung auf B_05.01 / B_05.02
│   ├── storage/         Ablage im Browser (localStorage, mit Schema-Version)
│   └── generator/       Generator für synthetische Register
├── presentation/        Darstellung
│   ├── graph/           Layout-Modell und dagre-Geometrie (beide UI-frei)
│   ├── components/      React-Komponenten
│   └── i18n/            sämtliche deutschen Texte
├── app/                 Kompositionswurzel (Vite-Einstieg, App-Shell)
│   └── state/           Reducer der Eingabemaske (rein, ohne React)
└── testing/             Testbausteine (Register-Builder)
```

Die Aufteilung folgt einer Abhängigkeitsrichtung von außen nach innen:
`app → presentation → data → domain`. `domain/` importiert nichts aus den anderen Ordnern und
insbesondere kein React. Das hat drei praktische Konsequenzen:

1. **Die Kernlogik ist ohne UI testbar.** Alle Prüfungen laufen in einem einfachen Node-Prozess.
2. **Die Fachlichkeit ist sprachfrei.** Befunde tragen stabile englische Codes und strukturierte
   Daten; die deutschen Sätze entstehen erst in `presentation/i18n`. Tests prüfen Codes, nie Prosa.
3. **Die Visualisierung ist austauschbar.** `presentation/graph/layoutModel.ts` erzeugt flache
   Knoten- und Kantenlisten mit dem Rang als Ebene, `dagreLayout.ts` daraus die Koordinaten. Beide
   sind reine Funktionen und ohne DOM getestet; die React-Flow-Komponente rendert nur noch, was
   herauskommt. `domain/` erfährt von alldem nichts.

Graphalgorithmen sind bewusst selbst implementiert; es wird keine Graphbibliothek verwendet. dagre
wird ausschließlich für die Geometrie der Darstellung genutzt, nicht für die Fachlichkeit.

### Wie die Ebene entsteht

dagre liefert nur die **Reihenfolge** der Knoten innerhalb einer Ebene — die Minimierung der
Kantenkreuzungen ist der mühsame Teil. Ebene und Abstände kommen aus dem Werkzeug selbst:

- Die **y-Position folgt dem berechneten Rang**, nie dagres eigener Schichtung. dagre leitet seine
  Ebenen aus den Kanten ab und würde einen mehrfach erreichbaren Knoten unter Umständen auf den
  kürzeren Pfad legen. Der Rang ist hier aber als längster Pfad definiert, und das Diagramm muss
  genau den Rang zeigen, den der Befund nennt.
- Die **x-Abstände** werden ebenfalls selbst gesetzt. dagre hält Knoten nur innerhalb seiner eigenen
  Ebenen auseinander; überall dort, wo unsere Schichtung abweicht, würden sich Kästen überlappen.
- Knoten **ohne bestimmbaren Rang** (Zyklus oder unterbrochene Kette) haben keine eigene Ebene und
  werden eine Stufe unter dem tiefsten Rang geparkt.

---

## CSV-Format

Zwei Dateien, sprechende englische Spaltennamen. Die Spaltenreihenfolge ist frei, Komma und
Semikolon werden erkannt (deutsche Excel-Exporte), ein UTF-8-BOM wird entfernt.

**`providers.csv` — B_05.01**

| Spalte | Inhalt |
| ------ | ------ |
| `provider_id` | Identifikationskennung (Schlüssel) |
| `code_type` | `LEI`, `EUID` oder `INTERNAL` |
| `legal_name` | Firmierung |
| `country` | Sitzland, ISO 3166-1 alpha-2 |
| `person_type` | `LEGAL_PERSON`, `NATURAL_PERSON` oder `OTHER` |

**`supply_chain.csv` — B_05.02**

| Spalte | Inhalt |
| ------ | ------ |
| `contract_ref` | Vertragsreferenz — bestimmt die Kette |
| `provider_id` | Dienstleister an dieser Position |
| `reported_rank` | gemeldeter Rang (wird geprüft, **nicht** verwendet) |
| `contracted_by` | Kennung des Auftraggebers; leer = direkt vom Finanzunternehmen |

`contracted_by` entspricht in der Meldevorlage dem „Empfänger der Weiterverlagerung“ eine Ebene
höher. Das Finanzunternehmen selbst steht in keiner der beiden Dateien — es ist die meldende
Institution und wird der Anwendung getrennt übergeben.

Die ITS-Spaltencodes (`b_05.01.0010` …) werden bewusst nicht als Spaltenköpfe verwendet: Sie sind
ohne Legende nicht lesbar. Eine Alias-Tabelle in `src/data/csv/registerCsv.ts` könnte sie beim Import
zusätzlich akzeptieren, ohne die Domäne zu berühren.

---

## Pflege im Werkzeug

Neben dem Beispielregister lässt sich ein eigenes Register erfassen: Finanzunternehmen,
Dienstleister (B_05.01), Verträge und Beziehungen (B_05.02).

Der **Rang ist kein Eingabefeld**. Gepflegt wird die Beziehung — wer beauftragt wen, in welchem
Vertrag —, und der berechnete Rang erscheint live, während die Auswahl getroffen wird. Genau ein
Rang lässt sich eintippen: der **gemeldete**, und zwar ausschließlich, damit das Werkzeug beim
Abtippen eines Bestandseintrags etwas zum Vergleichen hat. Bleibt das Feld leer, gibt es keinen
Vergleich und keinen Befund.

Zwei Regeln der Bearbeitung sind bewusst gesetzt und in `app/state/editorState.ts` als Test
festgehalten:

- Wird ein Dienstleister gelöscht, verschwinden seine Beziehungen mit ihm. Sie stehen zu lassen
  würde eine gewollte Löschung in eine hängende Referenz verwandeln — also in einen Befund, der
  eine schlecht gepflegte Meldung behauptet, wo in Wahrheit nur gelöscht wurde.
- Eine Kennung bezeichnet genau einen Dienstleister. Ein erneutes Speichern derselben Kennung
  ersetzt den Stammdatensatz, statt einen zweiten anzulegen.

Das Register liegt im `localStorage` des Browsers, versehen mit einer Schema-Version. Ohne Backend
ist das die einzig mögliche Persistenz — und die passende: Die Daten verlassen den Rechner nicht.
Ein Stand, der sich nicht vollständig und in der erwarteten Version lesen lässt, wird verworfen
statt repariert.

## Setup

Voraussetzung: Node.js ≥ 20.

```bash
npm install
```

```bash
npm run dev
```

| Befehl | Zweck |
| ------ | ----- |
| `npm run dev` | Entwicklungsserver (Vite) |
| `npm test` | Testsuite einmalig (Vitest) |
| `npm run test:watch` | Tests im Watch-Modus |
| `npm run typecheck` | TypeScript ohne Emit |
| `npm run build` | Produktionsbuild nach `dist/` |

Die Anwendung ist reines Frontend ohne Backend und damit über GitHub Pages veröffentlichbar. Der
Asset-Pfad (`base`) in `vite.config.ts` muss dem Repository-Namen entsprechen.

## Stand

Dieser Schritt liefert das tragende Gerüst, noch keine fertige Anwendung.

**Vorhanden**

- Typmodell für Dienstleister, Kanten, Verträge, Register und Befunde
- Graphalgorithmen: topologische Sortierung, längster Pfad, Zyklensuche
- alle acht Prüfungen mit Unit-Tests
- CSV-Import und -Export für beide Meldevorlagen
- Generator für synthetische Register, seed-basiert reproduzierbar, mit gezielter Fehlerinjektion
- Graphdarstellung mit React Flow, Ebenen über den berechneten Rang, Layout mit dagre; Befunde sind
  am Knoten markiert, Umschalter je Vertrag, Rangtabelle als Textalternative
- Eingabemaske für Dienstleister, Verträge und Beziehungen, mit Speicherung im Browser und
  CSV-Export beider Meldevorlagen

**Offen**

- CSV-Dateiauswahl in der Oberfläche (der Import selbst funktioniert bereits)
- Export eines korrigierten Registers mit berechneten statt gemeldeten Rängen

**Nicht Teil des Projekts:** die übrigen Meldevorlagen, xBRL-CSV, aufsichtliche Meldeformate.

---

## Tests

```bash
npm test
```

Die Tests decken jede Prüfung einzeln ab, dazu verzweigte Ketten, gleichrangige Geschwisterknoten,
Rauten (zwei Pfade treffen sich wieder) und einen Dienstleister, der in zwei Verträgen mit
unterschiedlichem Rang auftritt.

Der Generator baut seine Ketten ebenenweise auf und ruft den Rangalgorithmus nie auf. Der erwartete
Rang steht also durch die Konstruktion fest und ist eine vom Algorithmus unabhängige Erwartung —
ein sauber erzeugtes Register muss befundfrei durch die Prüfung laufen.
