import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  MarkerType,
  type Node,
  type NodeProps,
  type Connection,
  type ReactFlowInstance,
  type Edge,
} from '@xyflow/react';
import { ArrowUpRight, Layers, LayoutTemplate, MousePointer2, Scissors } from 'lucide-react';
import type { BuilderProject, BlockSummary, WiringReport, Wire } from './api';
import '@xyflow/react/dist/style.css';

export const blockNames: Record<string, string> = {
  'auth.email': 'Sign in',
  'onboarding.quiz': 'Onboarding',
  'paywall.basic': 'Pricing',
  'home.list': 'Collection',
  'content.detail': 'Item detail',
  'stats.overview': 'Analytics',
  'profile.card': 'Profile',
  'settings.list': 'Settings',
  'content.hero': 'Hero section',
  'content.text': 'Rich content',
  'action.button': 'Action button',
};
export const blockName = (type: string) => blockNames[type.split('@')[0]!] ?? type.split('@')[0]!;
export const pageIds = (s: BuilderProject['graph']['screens'][number]) => s.blocks ?? [s.block];
export const eventNames = (
  info?: BlockSummary,
  block?: BuilderProject['graph']['blocks'][number],
) => [
  ...(info?.ports.emits.map((p) => (typeof p === 'string' ? p : p.event)) ?? []),
  ...[
    ...new Set([
      ...(block?.design?.content ?? []).filter((e) => e.type === 'button').map((e) => e.id),
      ...Object.keys(block?.design?.actions ?? {}),
    ]),
  ].map((id) => 'element.' + id + '.pressed'),
];
const consumeNames = (info?: BlockSummary) =>
  info?.ports.consumes
    .map((p) => (typeof p === 'string' ? p : p.port))
    .filter((p) => !['app.launched', 'paywall.show'].includes(p)) ?? [];

type CardData = {
  title: string;
  subtitle: string;
  preview: string;
  entry: boolean;
  kind: 'page' | 'block';
  ports: { id: string; label: string }[];
  inputs: string[];
  open?: () => void;
  selected?: boolean;
  phone?: boolean;
};
type CardNode = Node<CardData, 'card'>;
type LayoutLink = { screen: string; target: string };
type CanvasEdge = Edge<{ wire?: Wire; layout?: LayoutLink }>;
function CanvasCard({ data, selected }: NodeProps<CardNode>) {
  return (
    <div className={'canvas-card ' + (selected ? 'chosen' : '')}>
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
        <span className="node-icon">
          {data.kind === 'page' ? <LayoutTemplate size={15} /> : <Layers size={15} />}
        </span>
        <div>
          <strong>{data.title}</strong>
          <small>{data.subtitle}</small>
        </div>
        {data.entry && <span className="entry-chip">Start</span>}
        {data.open && (
          <button
            className="icon-button nodrag"
            aria-label={'Open ' + data.title + ' canvas'}
            onClick={data.open}
          >
            <ArrowUpRight size={16} />
          </button>
        )}
      </div>
      <div className={'node-preview ' + (data.phone ? 'phone-preview' : '')}>
        <iframe
          title={data.title + ' block preview'}
          src={data.preview}
          tabIndex={-1}
          loading="lazy"
        />
      </div>
      {(data.inputs.length > 0 || data.ports.length > 0) && (
        <div className="node-ports">
          {data.inputs.map((port) => (
            <div className="port-row input-row" key={port}>
              <Handle type="target" position={Position.Left} id={port} />
              <span>{port}</span>
              <span className="port-dot">IN</span>
            </div>
          ))}
          {data.ports.map((port) => (
            <div className="port-row" key={port.id}>
              <span className="port-dot">OUT</span>
              <span>{port.label}</span>
              <Handle type="source" position={Position.Right} id={port.id} />
            </div>
          ))}
        </div>
      )}
      {data.ports.length === 0 && (
        <div className="node-caption">
          {data.kind === 'page' ? 'Display page' : 'Content block'}
          <span>●</span>
        </div>
      )}
    </div>
  );
}
const nodeTypes = { card: CanvasCard };

interface Props {
  project: BuilderProject;
  library: BlockSummary[];
  wiring: WiringReport | null;
  pageId: string | null;
  onOpen: (id: string) => void;
  onSelectBlock: (id: string | null) => void;
  edit: (fn: (p: BuilderProject) => void) => Promise<void>;
  platform: 'web' | 'mobile';
  onAddBlock: (info: BlockSummary, position?: { x: number; y: number }) => void;
}
export function FlowCanvas({
  project,
  library,
  wiring,
  pageId,
  onOpen,
  onSelectBlock,
  edit,
  platform,
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
  const page = project.graph.screens.find((s) => s.id === pageId);
  const bust = useMemo(() => JSON.stringify(project.graph), [project.graph]);
  const version = useMemo(() => {
    let n = 0;
    for (const c of bust) n = (n * 31 + c.charCodeAt(0)) | 0;
    return String(n);
  }, [bust]);
  const initial = useMemo<CardNode[]>(() => {
    if (!page)
      return project.graph.screens.map((s, i) => ({
        id: s.id,
        type: 'card',
        deletable: false,
        position: s.position ?? { x: (i % 4) * 365, y: Math.floor(i / 4) * 370 },
        data: {
          title: s.title,
          phone: platform === 'mobile',
          subtitle:
            pageIds(s).length +
            ' block' +
            (pageIds(s).length === 1 ? '' : 's') +
            ' · ' +
            (s.lane === 'tabs' ? 'Navigation' : 'Flow'),
          entry: i === 0,
          kind: 'page',
          preview: '/api/run?page=' + encodeURIComponent(s.id) + '&embedded=1&v=' + version,
          ports: pageIds(s).flatMap((id) => {
            const b = project.graph.blocks.find((b) => b.id === id);
            return eventNames(
              library.find((l) => l.id === b?.type),
              b,
            ).map((event) => ({
              id: id + ':' + event,
              label: event,
            }));
          }),
          inputs: [],
          open: () => onOpen(s.id),
        },
      }));
    return pageIds(page).map((id, i) => {
      const block = project.graph.blocks.find((b) => b.id === id)!;
      const info = library.find((l) => l.id === block.type);
      return {
        id,
        type: 'card',
        position: block.position ?? { x: (i % 3) * 365, y: Math.floor(i / 3) * 360 },
        data: {
          title:
            block.type.startsWith('auth.email') && block.variant === 'signup'
              ? 'Sign up'
              : blockName(block.type),
          phone: platform === 'mobile',
          subtitle: id + ' · ' + (block.variant ?? info?.defaultVariant ?? 'default'),
          kind: 'block',
          entry: false,
          preview: '/api/run?block=' + encodeURIComponent(id) + '&embedded=1&v=' + version,
          ports: eventNames(info, block).map((event) => ({ id: id + ':' + event, label: event })),
          inputs: consumeNames(info),
        },
      };
    });
  }, [project, page, library, version, onOpen, platform]);
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
        return [
          {
            id: 'wire-' + i,
            source: page ? w.from.instance : sourcePage.id,
            target: page ? w.to.instance! : w.to.screen,
            sourceHandle: w.from.instance + ':' + w.from.event,
            targetHandle: page ? (w.to.port ?? w.from.event) : 'page',
            type: 'smoothstep',
            label: page ? undefined : w.from.event.split('.').at(-1),
            animated: false,
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            style: {
              stroke: w.origin === 'user' ? '#305c4b' : '#97afa3',
              strokeWidth: w.origin === 'user' ? 2 : 1.5,
              strokeDasharray: w.origin === 'auto' ? '5 4' : undefined,
            },
            labelStyle: { fill: '#637368', fontSize: 10 },
            labelBgStyle: { fill: '#fafbf8' },
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
          style: { stroke: '#c3d0ba', strokeWidth: 1 },
          labelStyle: { fill: '#8d9d7e', fontSize: 9 },
          labelBgStyle: { fill: '#f8faf4' },
          deletable: true,
          data: { layout: { screen: page.id, target: id } },
          selected: selectedLayout?.screen === page.id && selectedLayout?.target === id,
        }))
        .filter((edge) => !page.disconnectedLayout?.includes(edge.target))
    : [];
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
        minZoom={0.2}
        maxZoom={1.5}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#d9dfd5" gap={24} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="#d4e2d8" maskColor="rgba(245,247,242,.75)" />
      </ReactFlow>
      {(selectedWire || selectedLayout) && (
        <div className="wire-toolbar">
          <span>
            {selectedWire ? selectedWire.from.event : 'Layout guide · blocks remain on the page'}
          </span>
          <button
            className="danger"
            onClick={() =>
              cut(selectedWire ? [selectedWire.from] : [], selectedLayout ? [selectedLayout] : [])
            }
          >
            <Scissors size={14} /> Cut connection
          </button>
          <button
            aria-label="Dismiss wire controls"
            onClick={() => {
              setSelectedWire(null);
              setSelectedLayout(null);
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className="canvas-guide">
        <MousePointer2 size={13} />
        <span>
          {page
            ? 'Select a block to edit · drag a port to connect'
            : 'Double-click a page to open · drag a port to connect pages · select a wire to cut'}
        </span>
      </div>
      <div className="edge-legend">
        <span className="dash-line" /> Auto connected <span className="solid-line" /> Your
        connections
      </div>
    </div>
  );
}
