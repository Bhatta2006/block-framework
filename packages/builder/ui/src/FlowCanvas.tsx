import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  MarkerType,
  useStore,
  type Node,
  type NodeProps,
  type Connection,
  type ReactFlowInstance,
  type Edge,
} from '@xyflow/react';
import { ArrowUpRight, Cloud, FlaskConical, LayoutTemplate, Scissors, X } from 'lucide-react';
import type { BuilderProject, BlockSummary, WiringReport, Wire } from './api';
import { blockMeta, eventLabel, instanceName, type Category } from './catalog';
import { consumeNames, eventNames, pageIds } from './graph';
import '@xyflow/react/dist/style.css';

export { pageIds, eventNames };

type CardData = {
  title: string;
  subtitle: string;
  preview: string;
  entry: boolean;
  kind: 'page' | 'block';
  category: Category;
  icon: typeof LayoutTemplate;
  runtime?: 'demo' | 'cloud';
  hidden?: boolean;
  ports: { id: string; label: string; event: string }[];
  inputs: string[];
  open?: () => void;
  phone?: boolean;
};
type CardNode = Node<CardData, 'card'>;
type LayoutLink = { screen: string; target: string };
type CanvasEdge = Edge<{ wire?: Wire; layout?: LayoutLink }>;

/** Below this zoom, live previews give way to compact cards (semantic zoom). */
const COMPACT_ZOOM = 0.35;

const CanvasCard = memo(function CanvasCard({ data, selected }: NodeProps<CardNode>) {
  const compact = useStore((s) => s.transform[2] < COMPACT_ZOOM);
  const Icon = data.icon;
  return (
    <div
      className={
        'canvas-card kind-' +
        data.kind +
        ' cat-' +
        data.category +
        (selected ? ' chosen' : '') +
        (compact ? ' compact' : '')
      }
    >
      {data.kind === 'page' && (
        <Handle type="target" position={Position.Left} id="page" className="page-inlet" />
      )}
      {data.kind === 'block' && (
        <>
          <Handle type="target" position={Position.Top} id="layout-in" className="layout-handle" />
          <Handle
            type="source"
            position={Position.Bottom}
            id="layout-out"
            className="layout-handle"
          />
        </>
      )}
      <div className="node-head">
        <span className={'cat-tile cat-' + data.category}>
          <Icon size={14} />
        </span>
        <div className="node-titles">
          <strong>{data.title}</strong>
          <small>{data.subtitle}</small>
        </div>
        {data.entry && <span className="node-chip accent">Start</span>}
        {data.hidden && <span className="node-chip">Hidden</span>}
        {data.runtime === 'demo' && (
          <span className="node-chip warning" title="Demo service">
            <FlaskConical size={10} /> Demo
          </span>
        )}
        {data.runtime === 'cloud' && (
          <span className="node-chip info" title="Needs a cloud backend">
            <Cloud size={10} /> Cloud
          </span>
        )}
        {data.open && (
          <button
            className="icon-button node-open nodrag"
            aria-label={'Open ' + data.title + ' canvas'}
            onClick={data.open}
          >
            <ArrowUpRight size={15} />
          </button>
        )}
      </div>
      {compact ? (
        <div className="node-compact">{data.title}</div>
      ) : (
        <div className={'node-preview ' + (data.phone ? 'phone-preview' : '')}>
          <iframe
            title={data.title + ' block preview'}
            src={data.preview}
            tabIndex={-1}
            loading="lazy"
          />
        </div>
      )}
      {(data.inputs.length > 0 || data.ports.length > 0) && (
        <div className="node-ports">
          {data.inputs.map((port) => (
            <div className="port-row input-row" key={port} title={port}>
              <Handle type="target" position={Position.Left} id={port} />
              <span>{eventLabel(port)}</span>
            </div>
          ))}
          {data.ports.map((port) => (
            <div className="port-row output-row" key={port.id} title={port.event}>
              <span>{port.label}</span>
              <Handle type="source" position={Position.Right} id={port.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
const nodeTypes = { card: CanvasCard };

interface Props {
  project: BuilderProject;
  library: BlockSummary[];
  wiring: WiringReport | null;
  pageId: string | null;
  selectedBlock: string | null;
  onOpen: (id: string) => void;
  onSelectBlock: (id: string | null) => void;
  edit: (fn: (p: BuilderProject) => void) => Promise<void>;
  platform: 'web' | 'mobile';
  theme: 'dark' | 'light';
  fitSignal: number;
  onAddBlock: (info: BlockSummary, position?: { x: number; y: number }) => void;
}
export function FlowCanvas({
  project,
  library,
  wiring,
  pageId,
  selectedBlock,
  onOpen,
  onSelectBlock,
  edit,
  platform,
  theme,
  fitSignal,
  onAddBlock,
}: Props) {
  const [selectedLayout, setSelectedLayout] = useState<LayoutLink | null>(null);
  const [selectedWire, setSelectedWire] = useState<Wire | null>(null);
  useEffect(() => {
    setSelectedWire(null);
    setSelectedLayout(null);
  }, [pageId]);
  const cut = (sources: Array<Wire['from']>, layouts: LayoutLink[] = []) => {
    void edit((p) => {
      for (const link of layouts) {
        const screen = p.graph.screens.find((s) => s.id === link.screen);
        if (screen)
          screen.disconnectedLayout = [
            ...new Set([...(screen.disconnectedLayout ?? []), link.target]),
          ];
      }
      p.graph.wires = p.graph.wires?.filter(
        (w) => !sources.some((s) => s.instance === w.from.instance && s.event === w.from.event),
      );
      for (const source of sources) {
        const block = p.graph.blocks.find((b) => b.id === source.instance);
        if (!block) continue;
        block.design ??= {};
        block.design.disconnectedEvents = [
          ...new Set([...(block.design.disconnectedEvents ?? []), source.event]),
        ];
        if (source.event.startsWith('element.')) {
          const id = source.event.slice(8, -8);
          block.design.actions ??= {};
          block.design.actions[id] = { type: 'none' };
        }
      }
    })
      .then(() => {
        setSelectedWire(null);
        setSelectedLayout(null);
      })
      .catch(() => {});
  };
  const flow = useRef<ReactFlowInstance<CardNode, CanvasEdge> | null>(null);
  useEffect(() => {
    if (fitSignal) void flow.current?.fitView({ padding: 0.18, maxZoom: 1, duration: 300 });
  }, [fitSignal]);
  const page = project.graph.screens.find((s) => s.id === pageId);
  const bust = useMemo(() => JSON.stringify(project.graph), [project.graph]);
  const version = useMemo(() => {
    let n = 0;
    for (const c of bust) n = (n * 31 + c.charCodeAt(0)) | 0;
    return String(n);
  }, [bust]);
  const initial = useMemo<CardNode[]>(() => {
    if (!page)
      return project.graph.screens.map((s, i) => {
        const count = pageIds(s).length;
        return {
          id: s.id,
          type: 'card',
          deletable: false,
          position: s.position ?? { x: (i % 4) * 365, y: Math.floor(i / 4) * 370 },
          data: {
            title: s.title,
            phone: platform === 'mobile',
            subtitle:
              count +
              ' block' +
              (count === 1 ? '' : 's') +
              ' · ' +
              (s.lane === 'tabs' ? 'Tab' : 'Flow'),
            entry: i === 0,
            hidden: s.navigation === false,
            kind: 'page',
            category: 'ui',
            icon: LayoutTemplate,
            preview: '/api/run?page=' + encodeURIComponent(s.id) + '&embedded=1&v=' + version,
            ports: pageIds(s).flatMap((id) => {
              const b = project.graph.blocks.find((b) => b.id === id);
              return eventNames(
                library.find((l) => l.id === b?.type),
                b,
              ).map((event) => ({
                id: id + ':' + event,
                event,
                label: eventLabel(event),
              }));
            }),
            inputs: [],
            open: () => onOpen(s.id),
          },
        };
      });
    return pageIds(page).map((id, i) => {
      const block = project.graph.blocks.find((b) => b.id === id)!;
      const info = library.find((l) => l.id === block.type);
      const meta = blockMeta(block.type);
      return {
        id,
        type: 'card',
        position: block.position ?? { x: (i % 3) * 365, y: Math.floor(i / 3) * 360 },
        selected: id === selectedBlock,
        data: {
          title: instanceName(block.type, block.variant),
          phone: platform === 'mobile',
          subtitle: id + ' · ' + (block.variant ?? info?.defaultVariant ?? 'default'),
          kind: 'block',
          category: meta.category,
          icon: meta.icon,
          runtime: meta.runtime === 'local' ? undefined : meta.runtime,
          entry: false,
          preview: '/api/run?block=' + encodeURIComponent(id) + '&embedded=1&v=' + version,
          ports: eventNames(info, block).map((event) => ({
            id: id + ':' + event,
            event,
            label: eventLabel(event),
          })),
          inputs: consumeNames(info),
        },
      };
    });
  }, [project, page, library, version, onOpen, platform, selectedBlock]);
  const [nodes, setNodes] = useState<CardNode[]>(initial);
  useEffect(() => {
    setNodes(initial);
  }, [initial]);
  const edges = useMemo<CanvasEdge[]>(
    () =>
      (wiring?.resolved ?? []).flatMap((w, i) => {
        const sourcePage = project.graph.screens.find((s) => pageIds(s).includes(w.from.instance));
        if (!sourcePage) return [];
        if (page && (sourcePage.id !== page.id || w.to.screen !== page.id || !w.to.instance))
          return [];
        const user = w.origin === 'user';
        return [
          {
            id: 'wire-' + i,
            source: page ? w.from.instance : sourcePage.id,
            target: page ? w.to.instance! : w.to.screen,
            sourceHandle: w.from.instance + ':' + w.from.event,
            targetHandle: page ? (w.to.port ?? w.from.event) : 'page',
            type: 'default',
            label: page ? undefined : eventLabel(w.from.event.split('.').at(-1) ?? w.from.event),
            className: user ? 'edge-user' : 'edge-auto',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 14,
              height: 14,
              color: user ? 'var(--edge-user)' : 'var(--edge-auto)',
            },
            data: { wire: w },
            deletable: true,
            selected:
              selectedWire?.from.instance === w.from.instance &&
              selectedWire?.from.event === w.from.event,
          },
        ];
      }),
    [wiring, project, page, selectedWire],
  );
  const connect = (connection: Connection) => {
    if (
      page &&
      connection.sourceHandle === 'layout-out' &&
      connection.targetHandle === 'layout-in'
    ) {
      if (connection.source === connection.target) return;
      void edit((p) => {
        const s = p.graph.screens.find((s) => s.id === page.id)!;
        const ids = pageIds(s).filter((id) => id !== connection.target);
        ids.splice(ids.indexOf(connection.source!) + 1, 0, connection.target!);
        s.blocks = ids;
        s.block = ids[0]!;
        s.disconnectedLayout = s.disconnectedLayout?.filter((id) => id !== connection.target);
      });
      return;
    }
    if (connection.targetHandle === 'layout-in') return;
    const [instance, event] = (connection.sourceHandle ?? '').split(':');
    if (!instance || !event || !connection.target) return;
    void edit((p) => {
      const target = page ? page.id : connection.target!;
      const semantic = page && connection.targetHandle !== 'page';
      p.graph.wires = (p.graph.wires ?? []).filter(
        (w) => w.from.instance !== instance || w.from.event !== event,
      );
      const block = p.graph.blocks.find((b) => b.id === instance);
      if (block?.design)
        block.design.disconnectedEvents = block.design.disconnectedEvents?.filter(
          (e) => e !== event,
        );
      if (block && event.startsWith('element.')) {
        block.design ??= {};
        block.design.actions ??= {};
        block.design.actions[event.slice(8, -8)] = { type: 'navigate', screen: target };
      }
      p.graph.wires.push({
        from: { instance, event },
        to: {
          screen: target,
          ...(semantic ? { instance: connection.target!, port: connection.targetHandle! } : {}),
        },
      });
    });
  };
  const compositionEdges: CanvasEdge[] = page
    ? pageIds(page)
        .slice(1)
        .map((id, i) => ({
          id: 'composition-' + id,
          source: pageIds(page)[i]!,
          target: id,
          sourceHandle: 'layout-out',
          targetHandle: 'layout-in',
          type: 'smoothstep',
          label: 'render order',
          className: 'edge-layout',
          deletable: true,
          data: { layout: { screen: page.id, target: id } },
          selected: selectedLayout?.screen === page.id && selectedLayout?.target === id,
        }))
        .filter((edge) => !page.disconnectedLayout?.includes(edge.target))
    : [];
  const wireLabel = selectedWire
    ? (() => {
        const from = project.graph.blocks.find((b) => b.id === selectedWire.from.instance);
        const to = project.graph.screens.find((s) => s.id === selectedWire.to.screen);
        return (
          (from ? instanceName(from.type, from.variant) : selectedWire.from.instance) +
          ' · ' +
          eventLabel(selectedWire.from.event) +
          ' → ' +
          (to?.title ?? selectedWire.to.screen) +
          (selectedWire.origin === 'auto' ? ' (automatic)' : '')
        );
      })()
    : 'Render order · cutting keeps the block on the page';
  return (
    <div
      className="flow-canvas"
      data-testid={page ? 'page-canvas' : 'page-flow'}
      onDragOver={(e) => {
        if (page) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (!page) return;
        const info = library.find((b) => b.id === e.dataTransfer.getData('application/blockfw'));
        if (info)
          onAddBlock(info, flow.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
      }}
    >
      <ReactFlow<CardNode, CanvasEdge>
        key={pageId ?? 'overview'}
        nodes={nodes}
        edges={[...edges, ...compositionEdges]}
        nodeTypes={nodeTypes}
        colorMode={theme}
        onNodesChange={(changes) => setNodes((prev) => applyNodeChanges(changes, prev))}
        onNodeDragStop={(_, node) =>
          void edit((p) => {
            const item = page
              ? p.graph.blocks.find((b) => b.id === node.id)
              : p.graph.screens.find((s) => s.id === node.id);
            if (item) item.position = node.position;
          })
        }
        onNodeClick={(_, node) => {
          if (page) onSelectBlock(node.id);
        }}
        onNodeDoubleClick={(_, node) => {
          if (!page) onOpen(node.id);
        }}
        onPaneClick={() => onSelectBlock(null)}
        onInit={(instance) => {
          flow.current = instance;
        }}
        onConnect={connect}
        onEdgeClick={(_, edge) => {
          setSelectedWire(edge.data?.wire ?? null);
          setSelectedLayout(edge.data?.layout ?? null);
        }}
        onEdgesDelete={(deleted) =>
          cut(
            deleted.flatMap((e) => (e.data?.wire ? [e.data.wire.from] : [])),
            deleted.flatMap((e) => (e.data?.layout ? [e.data.layout] : [])),
          )
        }
        onBeforeDelete={({ nodes: deleting }) =>
          Promise.resolve(
            deleting.length === 0 || Boolean(page && deleting.length < pageIds(page).length),
          )
        }
        onNodesDelete={(deleted) => {
          if (!page) return;
          void edit((p) => {
            const s = p.graph.screens.find((s) => s.id === page.id)!;
            const ids = deleted.map((n) => n.id);
            const remaining = pageIds(s).filter((id) => !ids.includes(id));
            if (!remaining.length)
              throw new Error(
                'Keep one block on the page. Add a replacement before removing the last block.',
              );
            s.blocks = remaining;
            s.block = remaining[0]!;
            p.graph.blocks = p.graph.blocks.filter((b) => !ids.includes(b.id));
            p.graph.wires = p.graph.wires?.filter(
              (w) => !ids.includes(w.from.instance) && !ids.includes(w.to.instance ?? ''),
            );
          });
          onSelectBlock(null);
        }}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="var(--canvas-dot)"
          gap={22}
          size={1.4}
        />
        <Controls showInteractive={false} position="bottom-right" />
        {(page ? pageIds(page).length : project.graph.screens.length) > 3 && (
          <MiniMap
            pannable
            zoomable
            position="bottom-left"
            nodeColor="var(--surface-3)"
            nodeStrokeColor="var(--border-strong)"
            maskColor="color-mix(in srgb, var(--canvas-bg) 70%, transparent)"
          />
        )}
      </ReactFlow>
      {(selectedWire || selectedLayout) && (
        <div className="wire-toolbar" role="toolbar" aria-label="Connection">
          <span>{wireLabel}</span>
          <button
            className="danger"
            onClick={() =>
              cut(selectedWire ? [selectedWire.from] : [], selectedLayout ? [selectedLayout] : [])
            }
          >
            <Scissors size={14} /> Cut connection
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss wire controls"
            onClick={() => {
              setSelectedWire(null);
              setSelectedLayout(null);
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="edge-legend" aria-hidden="true">
        <span className="legend-line user" /> Your connections
        <span className="legend-line auto" /> Automatic
        {page && (
          <>
            <span className="legend-line layout" /> Render order
          </>
        )}
      </div>
    </div>
  );
}
