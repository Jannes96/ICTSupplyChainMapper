import type { NodeId } from '../model/ids.ts';

/**
 * Minimal directed graph, implemented from scratch on purpose (no graph library).
 *
 * Adjacency is stored twice — successors and predecessors — because the rank
 * calculation walks forward while the longest-path relaxation reads backwards.
 * Both directions are `Map`/`Set`, so iteration follows insertion order and every
 * algorithm in this folder is deterministic for a given input order. That matters:
 * findings must be reproducible between two runs on the same register.
 */
export class DirectedGraph {
  private readonly outgoing = new Map<NodeId, Set<NodeId>>();
  private readonly incoming = new Map<NodeId, Set<NodeId>>();

  addNode(id: NodeId): void {
    if (!this.outgoing.has(id)) {
      this.outgoing.set(id, new Set());
      this.incoming.set(id, new Set());
    }
  }

  /** Adds an edge "from subcontracts to to", creating both nodes if needed. */
  addEdge(from: NodeId, to: NodeId): void {
    this.addNode(from);
    this.addNode(to);
    this.outgoing.get(from)?.add(to);
    this.incoming.get(to)?.add(from);
  }

  hasNode(id: NodeId): boolean {
    return this.outgoing.has(id);
  }

  hasEdge(from: NodeId, to: NodeId): boolean {
    return this.outgoing.get(from)?.has(to) ?? false;
  }

  /** All nodes in insertion order. */
  get nodes(): NodeId[] {
    return [...this.outgoing.keys()];
  }

  get nodeCount(): number {
    return this.outgoing.size;
  }

  get edgeCount(): number {
    let total = 0;
    for (const targets of this.outgoing.values()) total += targets.size;
    return total;
  }

  /** All edges in insertion order of their source node. */
  get edges(): Array<{ from: NodeId; to: NodeId }> {
    const result: Array<{ from: NodeId; to: NodeId }> = [];
    for (const [from, targets] of this.outgoing) {
      for (const to of targets) result.push({ from, to });
    }
    return result;
  }

  successors(id: NodeId): NodeId[] {
    return [...(this.outgoing.get(id) ?? [])];
  }

  predecessors(id: NodeId): NodeId[] {
    return [...(this.incoming.get(id) ?? [])];
  }

  inDegree(id: NodeId): number {
    return this.incoming.get(id)?.size ?? 0;
  }

  outDegree(id: NodeId): number {
    return this.outgoing.get(id)?.size ?? 0;
  }
}
