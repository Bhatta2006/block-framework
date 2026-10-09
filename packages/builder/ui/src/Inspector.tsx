import { useEffect, useState } from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { ArrowDown, ArrowUp, Copy, Paintbrush, Sparkles, Trash2, X } from 'lucide-react';
import type { BuilderProject, BlockSummary, WiringReport } from './api';
import { eventNames, pageIds } from './graph';
import { blockMeta, eventLabel, fieldLabel, instanceName } from './catalog';

interface Props {
  project: BuilderProject;
  blockId: string;
  pageId: string;
  library: BlockSummary[];
  wiring: WiringReport | null;
  edit: (fn: (p: BuilderProject) => void) => Promise<void>;
  close: () => void;
  select: (id: string) => void;
  customize: () => void;
  askAI: () => void;
}
export function Inspector({
  project,
  blockId,
  pageId,
  library,
  wiring,
  edit,
  close,
  select,
  customize,
  askAI,
}: Props) {
  const block = project.graph.blocks.find((b) => b.id === blockId);
  const info = library.find((l) => l.id === block?.type);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Record<string, unknown>>({});
  useEffect(() => {
    setData({ ...info?.defaultConfig, ...block?.config });
  }, [JSON.stringify(block?.config), blockId, info]);
  if (!block || !info) return null;
  const page = project.graph.screens.find((s) => s.id === pageId)!;
  const order = pageIds(page);
  const index = order.indexOf(block.id);
  const reorder = (offset: number) =>
    void edit((p) => {
      const s = p.graph.screens.find((s) => s.id === pageId)!;
      const ids = [...pageIds(s)];
      const moved = ids.splice(index, 1)[0]!;
      ids.splice(index + offset, 0, moved);
      s.blocks = ids;
      s.block = ids[0]!;
    }).catch(() => {});
  const duplicate = () => {
    const id = 'b_' + crypto.randomUUID().slice(0, 8);
    void edit((p) => {
      const s = p.graph.screens.find((s) => s.id === pageId)!;
      const source = p.graph.blocks.find((b) => b.id === blockId)!;
      p.graph.blocks.push({
        ...structuredClone(source),
        id,
        position: { x: (source.position?.x ?? 0) + 340, y: (source.position?.y ?? 0) + 30 },
      });
      s.blocks = [...pageIds(s), id];
    })
      .then(() => select(id))
      .catch(() => {});
  };
  const meta = blockMeta(block.type);
  const Icon = meta.icon;
  const properties = (info.configSchema.properties ?? {}) as Record<string, { title?: string }>;
  const uiSchema = Object.fromEntries(
    Object.entries(properties)
      .filter(([, field]) => !field.title)
      .map(([key]) => [key, { 'ui:title': fieldLabel(key) }]),
  );
  return (
    <aside className="side-panel inspector" aria-label="Block properties">
      <div className="side-panel-head">
        <span className={'cat-tile cat-' + meta.category}>
          <Icon size={14} />
        </span>
        <div>
          <strong>{instanceName(block.type, block.variant)}</strong>
          <small>
            {block.id} · v{block.type.split('@')[1] ?? '1'}
          </small>
        </div>
        <button className="icon-button" aria-label="Close properties" onClick={close}>
          <X size={16} />
        </button>
      </div>
      <div className="side-panel-body inspector-body">
        <div className="inspector-cta">
          <button className="primary" onClick={customize}>
            <Paintbrush size={14} /> Customize inside this block
          </button>
          <button
            className="icon-button bordered"
            aria-label="Ask AI to edit this block"
            title="Ask AI to edit this block"
            onClick={askAI}
          >
            <Sparkles size={15} />
          </button>
        </div>
        {block.type.startsWith('data.') && (
          <p className="inspector-note">
            Blocks with the same collectionKey share records within this app. Live previews save on
            this device; canvas thumbnails use temporary records. Connect data.recordSelected to a
            Record editor to open or create notes. Seed records are used only for a new collection.
          </p>
        )}
        {meta.runtime === 'demo' && (
          <p className="inspector-note warning-note">
            Demo service. It behaves realistically in previews; connect a real provider in the
            exported code before launch.
          </p>
        )}
        <div className="inspector-row">
          <label className="field compact">
            <span>Appearance</span>
            <select
              aria-label="Appearance"
              value={block.variant ?? info.defaultVariant}
              onChange={(e) => {
                const value = e.currentTarget.value;
                void edit((p) => {
                  const b = p.graph.blocks.find((b) => b.id === blockId)!;
                  b.variant = value;
                  if (b.type.startsWith('auth.email')) {
                    const defaults =
                      value === 'signup'
                        ? {
                            headline: 'Create your account',
                            subheadline: 'Start your next chapter.',
                            ctaText: 'Create account',
                          }
                        : {
                            headline: 'Welcome back',
                            subheadline: 'Sign in to continue.',
                            ctaText: 'Sign in',
                          };
                    for (const [key, copy] of Object.entries(defaults))
                      if (!p.touched.includes('block:' + blockId + '.config.' + key)) {
                        b.config ??= {};
                        b.config[key] = copy;
                      }
                  }
                  p.touched = [...new Set([...p.touched, 'block:' + blockId + '.variant'])];
                }).catch(() => {});
              }}
            >
              {info.variants.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <div className="order-actions" role="group" aria-label="Page order">
            <span>
              Order{' '}
              <b>
                {index + 1}/{order.length}
              </b>
            </span>
            <button
              className="icon-button"
              aria-label="Move block earlier"
              disabled={index === 0}
              onClick={() => reorder(-1)}
            >
              <ArrowUp size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Move block later"
              disabled={index === order.length - 1}
              onClick={() => reorder(1)}
            >
              <ArrowDown size={15} />
            </button>
          </div>
        </div>
        <h3>Content</h3>
        <Form
          noHtml5Validate
          schema={info.configSchema as never}
          uiSchema={uiSchema}
          validator={validator}
          formData={data}
          onChange={(e) => setData(e.formData ?? {})}
          onError={() => setFeedback('Check the highlighted content fields, then apply again.')}
          onSubmit={() => {
            setBusy(true);
            setFeedback('');
            void edit((p) => {
              const b = p.graph.blocks.find((b) => b.id === blockId)!;
              for (const key of Object.keys(data)) {
                if (
                  JSON.stringify(data[key]) !==
                  JSON.stringify(b.config?.[key] ?? info.defaultConfig[key])
                )
                  p.touched.push('block:' + blockId + '.config.' + key);
              }
              b.config = data;
              p.touched = [...new Set(p.touched)].sort();
            })
              .then(() => setFeedback('Changes applied.'))
              .catch((e) => setFeedback(String(e.message ?? e)))
              .finally(() => setBusy(false));
          }}
        >
          <button className="primary full" type="submit" disabled={busy}>
            {busy ? 'Applying…' : 'Apply changes'}
          </button>
        </Form>
        {feedback && (
          <p role="status" className="form-feedback">
            {feedback}
          </p>
        )}
        {eventNames(info).length > 0 && (
          <>
            <h3>Actions</h3>
            <p className="inspector-note">
              Each action goes to a page automatically. Pick a page to make it explicit, or choose
              No connection.
            </p>
            {eventNames(info).map((event) => {
              const wire = wiring?.resolved.find(
                (w) => w.from.instance === blockId && w.from.event === event,
              );
              const explicit = project.graph.wires?.find(
                (w) => w.from.instance === blockId && w.from.event === event,
              );
              return (
                <label className="field route-field" key={event}>
                  <span>
                    {eventLabel(event)} <code>{event}</code>
                  </span>
                  <select
                    aria-label={'Route ' + event}
                    value={
                      block.design?.disconnectedEvents?.includes(event)
                        ? 'none'
                        : (explicit?.to.screen ?? 'auto')
                    }
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      void edit((p) => {
                        p.graph.wires = (p.graph.wires ?? []).filter(
                          (w) => w.from.instance !== blockId || w.from.event !== event,
                        );
                        const b = p.graph.blocks.find((b) => b.id === blockId)!;
                        b.design ??= {};
                        b.design.disconnectedEvents = (b.design.disconnectedEvents ?? []).filter(
                          (e) => e !== event,
                        );
                        if (value === 'none') b.design.disconnectedEvents.push(event);
                        if (value !== 'auto' && value !== 'none')
                          p.graph.wires.push({
                            from: { instance: blockId, event },
                            to: { screen: value },
                          });
                      }).catch(() => {});
                    }}
                  >
                    <option value="none">No connection</option>
                    <option value="auto">
                      Auto ·{' '}
                      {project.graph.screens.find((s) => s.id === wire?.to.screen)?.title ??
                        'End of flow'}
                    </option>
                    {project.graph.screens.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </>
        )}
        <div className="inspector-actions">
          <button onClick={duplicate}>
            <Copy size={14} /> Duplicate
          </button>
          <button
            className="danger"
            disabled={order.length === 1}
            onClick={() =>
              void edit((p) => {
                const s = p.graph.screens.find((s) => s.id === pageId)!;
                s.blocks = pageIds(s).filter((id) => id !== blockId);
                s.block = s.blocks[0]!;
                p.graph.blocks = p.graph.blocks.filter((b) => b.id !== blockId);
                p.graph.wires = p.graph.wires?.filter(
                  (w) => w.from.instance !== blockId && w.to.instance !== blockId,
                );
              })
                .then(close)
                .catch(() => {})
            }
          >
            <Trash2 size={14} /> Remove
          </button>
        </div>
      </div>
    </aside>
  );
}
