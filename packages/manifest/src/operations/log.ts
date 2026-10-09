import { canonicalJson } from '../canonical.js';
import { applyProjectOperations } from './apply.js';
import { diffProjectOperations } from './diff.js';
import type { GraphDocument, OperationEntry, OperationSource, ProjectOperation } from './types.js';
import type { GraphInput } from '../graph-v1.js';
import { legacyGraph } from '../migrations/index.js';

/** One accepted operation history; persistence/quality gates run before changing the log. */
export class ProjectOperationLog<P extends GraphDocument> {
  private past: OperationEntry[] = [];
  private future: OperationEntry[] = [];
  private current: P | undefined;
  private sequence = 0;
  constructor(
    private accept: (project: P, graph: GraphInput) => void = () => {},
    private graphSource?: () => GraphInput,
  ) {}
  get state() {
    return { undo: this.past.length, redo: this.future.length, revision: this.sequence };
  }
  get entries(): OperationEntry[] {
    return structuredClone(this.past);
  }
  get lastSource() {
    return this.past.at(-1)?.source;
  }
  get agentDepth() {
    return this.past.filter((entry) => entry.source === 'agent').length;
  }
  apply(project: P, operations: readonly ProjectOperation[], source: OperationSource): P {
    const authored = { ...project, graph: this.graphSource?.() ?? project.graph };
    const resolved = applyProjectOperations(authored, operations);
    if (!diffProjectOperations(authored, resolved).length) return structuredClone(project);
    const next = {
      ...resolved,
      graph: project.graph.schemaVersion === '0' ? legacyGraph(resolved.graph) : resolved.graph,
    } as P;
    const forward = structuredClone([...operations]);
    const inverse = diffProjectOperations(resolved, authored);
    this.accept(next, resolved.graph);
    this.past.push({ revision: ++this.sequence, source, forward, inverse });
    if (this.past.length > 50) this.past.shift();
    this.future = [];
    this.current = structuredClone(next);
    return next;
  }
  travel(direction: 'undo' | 'redo', project = this.current): P | null {
    const from = direction === 'undo' ? this.past : this.future;
    const to = direction === 'undo' ? this.future : this.past;
    const entry = from.at(-1);
    if (!entry || !project) return null;
    if (this.current && canonicalJson(project) !== canonicalJson(this.current))
      throw new Error('Project changed outside the operation log');
    const authored = { ...project, graph: this.graphSource?.() ?? project.graph };
    const resolved = applyProjectOperations(
      authored,
      direction === 'undo' ? entry.inverse : entry.forward,
    );
    const next = {
      ...resolved,
      graph: project.graph.schemaVersion === '0' ? legacyGraph(resolved.graph) : resolved.graph,
    } as P;
    this.accept(next, resolved.graph);
    from.pop();
    to.push(entry);
    this.sequence++;
    this.current = structuredClone(next);
    return next;
  }
}
