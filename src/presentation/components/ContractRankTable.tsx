import type { LayoutGraph } from '../graph/layoutModel.ts';
import { formatRank } from '../i18n/de.ts';

interface ContractRankTableProps {
  readonly layout: LayoutGraph;
}

/**
 * Placeholder for the graph view: the same layout model that will feed React Flow
 * is rendered here as a table, grouped by rank. It already answers the question
 * the visualisation will answer — who sits at which level of the chain.
 */
export function ContractRankTable({ layout }: ContractRankTableProps) {
  const labels = new Map(layout.nodes.map((node) => [node.id, node]));

  return (
    <table className="ranks">
      <thead>
        <tr>
          <th scope="col">Rang</th>
          <th scope="col">Dienstleister</th>
        </tr>
      </thead>
      <tbody>
        {layout.layers.map((layer) => (
          <tr key={String(layer.rank)}>
            <th scope="row">{formatRank(layer.rank)}</th>
            <td>
              <ul className="layer">
                {layer.nodes.map((id) => {
                  const node = labels.get(id);
                  return (
                    <li key={id} className={node?.findingCodes.length ? 'node node--flagged' : 'node'}>
                      {node?.label ?? id}
                      {node?.country ? <span className="country">{node.country}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
