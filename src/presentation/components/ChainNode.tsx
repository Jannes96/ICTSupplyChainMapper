import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Severity } from '../../domain/validation/Finding.ts';
import type { Finding } from '../../domain/validation/Finding.ts';
import type { NodeKind } from '../graph/layoutModel.ts';
import { FINDING_TITLES, formatRank } from '../i18n/de.ts';

export type ChainNodeData = {
  label: string;
  kind: NodeKind;
  rank: number | null;
  country: string | null;
  findingCodes: readonly Finding['code'][];
  severity: Severity | null;
};

export type ChainNodeType = Node<ChainNodeData, 'chain'>;

/**
 * One box in the diagram: who it is, at which rank the calculation places it and
 * what the checks found. The finding is shown on the node itself — a graph that
 * only draws the chain would still leave the reader hunting through a list.
 */
export function ChainNode({ data }: NodeProps<ChainNodeType>) {
  const classes = ['chain-node', `chain-node--${data.kind}`];
  if (data.severity) classes.push(`chain-node--${data.severity}`);

  return (
    <div className={classes.join(' ')}>
      <Handle type="target" position={Position.Top} />

      <div className="chain-node__head">
        <span className="chain-node__rank" title="Berechneter Rang">
          {data.kind === 'financial_entity' ? 'FU' : formatRank(data.rank)}
        </span>
        {data.country && <span className="chain-node__country">{data.country}</span>}
      </div>

      <div className="chain-node__label" title={data.label}>
        {data.label}
      </div>

      {data.findingCodes.length > 0 && (
        <ul className="chain-node__findings" title={data.findingCodes.map((code) => FINDING_TITLES[code]).join(' · ')}>
          {/* The box has room for two lines; the rest is in the finding list below. */}
          {data.findingCodes.slice(0, 2).map((code) => (
            <li key={code}>{FINDING_TITLES[code]}</li>
          ))}
          {data.findingCodes.length > 2 && <li>+{data.findingCodes.length - 2} weitere</li>}
        </ul>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
