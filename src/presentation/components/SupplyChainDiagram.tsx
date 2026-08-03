import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import { NODE_HEIGHT, NODE_WIDTH, layoutGraph } from '../graph/dagreLayout.ts';
import type { LayoutGraph } from '../graph/layoutModel.ts';
import { ChainNode, type ChainNodeType } from './ChainNode.tsx';

const nodeTypes: NodeTypes = { chain: ChainNode };

interface SupplyChainDiagramProps {
  readonly layout: LayoutGraph;
}

/**
 * The diagram itself.
 *
 * Deliberately thin: geometry comes from `layoutGraph`, content from the layout
 * model, and both are computed and tested elsewhere. This component only turns
 * them into React Flow's node and edge shapes.
 */
export function SupplyChainDiagram({ layout }: SupplyChainDiagramProps) {
  const { nodes, edges } = useMemo(() => {
    const positions = layoutGraph(layout);

    const nodes: ChainNodeType[] = layout.nodes.map((node) => ({
      id: node.id,
      type: 'chain',
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      // The chain is maintained in the register, not by dragging boxes around.
      draggable: false,
      connectable: false,
      data: {
        label: node.label,
        kind: node.kind,
        rank: node.rank,
        country: node.country,
        findingCodes: node.findingCodes,
        severity: node.severity,
      },
    }));

    const flagged = new Set(
      layout.nodes.filter((node) => node.severity === 'error').map((node) => node.id),
    );

    const edges: Edge[] = layout.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      // An edge is highlighted when it leads into a node the checks flagged.
      className: flagged.has(edge.target) ? 'chain-edge chain-edge--error' : 'chain-edge',
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    }));

    return { nodes, edges };
  }, [layout]);

  return (
    <div className="diagram" role="img" aria-label={`Lieferkette des Vertrags ${layout.contractRef}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
