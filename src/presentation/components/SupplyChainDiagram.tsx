import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef } from 'react';
import type { NodeId } from '../../domain/model/ids.ts';
import { NODE_HEIGHT, NODE_WIDTH, layoutGraph } from '../graph/dagreLayout.ts';
import type { LayoutGraph } from '../graph/layoutModel.ts';
import { ChainNode, type ChainNodeType } from './ChainNode.tsx';

const nodeTypes: NodeTypes = { chain: ChainNode };

interface SupplyChainDiagramProps {
  readonly layout: LayoutGraph;
  /** Nodes a selected finding points at. Everything else steps back. */
  readonly focused?: ReadonlySet<NodeId> | null;
  /** Called when a box is chosen, to ask what hangs off that provider. */
  readonly onSelectNode?: (id: NodeId) => void;
}

/**
 * The diagram itself.
 *
 * Deliberately thin: geometry comes from `layoutGraph`, content from the layout
 * model, and both are computed and tested elsewhere. This component only turns
 * them into React Flow's node and edge shapes.
 */
export function SupplyChainDiagram({
  layout,
  focused = null,
  onSelectNode,
}: SupplyChainDiagramProps) {
  const instance = useRef<ReactFlowInstance<ChainNodeType, Edge> | null>(null);

  const { nodes, edges, positions } = useMemo(() => {
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
        isFocused: focused?.has(node.id) ?? false,
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
      className: [
        'chain-edge',
        // An edge is highlighted when it leads into a node the checks flagged.
        flagged.has(edge.target) ? 'chain-edge--error' : '',
        // Both ends focused means the edge belongs to the selected finding —
        // which is what draws a cycle as a closed ring rather than loose nodes.
        focused?.has(edge.source) && focused.has(edge.target) ? 'chain-edge--focused' : '',
      ]
        .filter(Boolean)
        .join(' '),
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    }));

    return { nodes, edges, positions };
  }, [layout, focused]);

  /**
   * Marking a node is not enough — in a chain of twenty it may well sit outside
   * the visible area, and a highlight nobody can see is no help.
   *
   * The centre is worked out from the positions this component computed itself
   * rather than asked of React Flow. Its own `fitView` can only work once it has
   * measured the nodes, and switching contract hands it a fresh set — aiming at
   * the previous layout, or chasing frames until it has caught up. The
   * coordinates are known here anyway.
   */
  useEffect(() => {
    const flow = instance.current;
    if (!flow || !focused || focused.size === 0) return;

    const points = [...focused].map((id) => positions.get(id)).filter((point) => point !== undefined);
    if (points.length === 0) return;

    const centreX =
      points.reduce((sum, point) => sum + point.x, 0) / points.length + NODE_WIDTH / 2;
    const centreY =
      points.reduce((sum, point) => sum + point.y, 0) / points.length + NODE_HEIGHT / 2;

    // Keep the reader's zoom unless it is so far out that the marking is a
    // speck; never zoom in past the point where the layout stops making sense.
    const zoom = Math.min(Math.max(flow.getZoom(), 0.75), 1.2);
    flow.setCenter(centreX, centreY, { zoom, duration: 400 });
  }, [focused, positions]);

  return (
    <div
      className={focused && focused.size > 0 ? 'diagram diagram--focused' : 'diagram'}
      role="img"
      aria-label={`Lieferkette des Vertrags ${layout.contractRef}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(flow) => {
          instance.current = flow;
        }}
        onNodeClick={(_, node) => onSelectNode?.(node.id as NodeId)}
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
