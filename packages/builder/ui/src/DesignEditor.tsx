import { useEffect, useRef, useState } from 'react';
import type { ElementDesign, ElementAction, BlockElement } from '@blockfw/manifest';
import type { BuilderProject } from './api';

interface Props {
  project: BuilderProject;
  blockId: string;
  edit: (fn: (p: BuilderProject) => void) => Promise<void>;
  askAI: () => void;
}
const numeric: Array<[keyof ElementDesign, string]> = [
  ['x', 'Horizontal offset'],
  ['y', 'Vertical offset'],
  ['width', 'Width'],
  ['height', 'Height'],
  ['padding', 'Padding'],
  ['marginTop', 'Space above'],
  ['marginBottom', 'Space below'],
  ['borderRadius', 'Corner radius'],
  ['fontSize', 'Font size'],
  ['opacity', 'Opacity'],
];
export function DesignEditor({ project, blockId, edit, askAI }: Props) {
  const block = project.graph.blocks.find((b) => b.id === blockId)!;
  const [selected, setSelected] = useState('button');
  const [elements, setElements] = useState<Array<{ id: string; text?: string; tag?: string }>>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [action, setAction] = useState<ElementAction>({ type: 'none' });
  const [label, setLabel] = useState('');
  const [originalAction, setOriginalAction] = useState(true);
  const [draft, setDraft] = useState<ElementDesign>({});
  const [all, setAll] = useState(false);
  const [phone, setPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const content = block.design?.content?.find((e) => e.id === selected);
  const actionValue = JSON.stringify(block.design?.actions?.[selected] ?? { type: 'none' });
  useEffect(() => {
    setAction(JSON.parse(actionValue));
    setOriginalAction(!block.design?.actions?.[selected]);
    setLabel(content?.text ?? '');
  }, [actionValue, content?.text, selected]);
  const preview = () =>
    frame.current?.contentWindow?.postMessage(
      { source: 'block-studio-editor', type: 'style', element: selected, style: draft },
      location.origin,
    );
  useEffect(preview, [draft, selected]);
  const saveElement = async () => {
    setBusy(true);
    try {
      await edit((p) => {
        const b = p.graph.blocks.find((b) => b.id === blockId)!;
        b.design ??= {};
        b.design.actions ??= {};
        if (
          content?.type === 'button' ||
          elements.find((e) => e.id === selected)?.tag === 'button'
        ) {
          if (originalAction) delete b.design.actions[selected];
          else b.design.actions[selected] = action;
        }
        b.design.disconnectedEvents = b.design.disconnectedEvents?.filter(
          (e) => e !== 'element.' + selected + '.pressed',
        );
        p.graph.wires = p.graph.wires?.filter(
          (w) => w.from.instance !== blockId || w.from.event !== 'element.' + selected + '.pressed',
        );
        const item = b.design.content?.find((e) => e.id === selected);
        if (item) item.text = label;
        p.touched.push('block:' + blockId + '.design');
      });
      setFeedback('Element content and action saved.');
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const addElement = async (type: BlockElement['type']) => {
    const id = 'custom-' + crypto.randomUUID().slice(0, 8);
    try {
      await edit((p) => {
        const b = p.graph.blocks.find((b) => b.id === blockId)!;
        b.design ??= {};
        b.design.content ??= [];
        b.design.content.push({
          id,
          type,
          ...(type !== 'divider' ? { text: type === 'button' ? 'New button' : 'Your text' } : {}),
        });
        p.touched.push('block:' + blockId + '.design');
      });
      setSelected(id);
      setFeedback('Element added inside this block. Buttons have no action until you choose one.');
    } catch (e) {
      setFeedback(String(e));
    }
  };
  // Style previews stay in the same document so applying a style cannot interrupt a drag.
  const frameVersion = JSON.stringify({
    id: block.id,
    type: block.type,
    config: block.config,
    variant: block.variant,
    content: block.design?.content,
  });
  const value = JSON.stringify(block.design?.elements?.[selected] ?? {});
  useEffect(() => {
    setDraft(JSON.parse(value));
  }, [value, selected]);
  const apply = async (style: ElementDesign, element = selected, merge = false) => {
    setBusy(true);
    setFeedback('');
    try {
      await edit((p) => {
        const targets = all ? p.graph.blocks : p.graph.blocks.filter((b) => b.id === blockId);
        for (const b of targets) {
          b.design ??= {};
          b.design.elements ??= {};
          b.design.elements[element] = { ...(merge ? b.design.elements[element] : {}), ...style };
          p.touched.push('block:' + b.id + '.design.elements.' + element);
        }
        p.touched = [...new Set(p.touched)];
      });
      setFeedback(all ? 'Design applied across all blocks.' : 'Design applied to this block.');
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.source !== 'block-studio-design' ||
        event.data?.blockId !== blockId
      )
        return;
      const message = event.data;
      if (message.type === 'elements' && Array.isArray(message.elements)) {
        setElements(message.elements);
        preview();
        if (
          !message.elements.some((e: { id: string }) => e.id === selected) &&
          !block.design?.content?.some((e) => e.id === selected)
        )
          setSelected(message.elements[0]?.id ?? 'container');
      }
      if (message.type === 'select') setSelected(message.element);
      if (message.type === 'move') {
        setSelected(message.element);
        void apply(
          {
            x: Math.max(-2000, Math.min(2000, message.x)),
            y: Math.max(-2000, Math.min(2000, message.y)),
          },
          message.element,
          true,
        );
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  });
  const set = (key: keyof ElementDesign, input: string | boolean | number | undefined) =>
    setDraft((prev) => {
      const next = { ...prev };
      if (input === undefined) delete next[key];
      else Object.assign(next, { [key]: input });
      return next;
    });
  return (
    <div className="design-editor">
      <div className="design-stage">
        <div className="design-stage-label">
          <strong>Inside your block</strong>
          <span>Click to select · drag to position</span>
          <button aria-pressed={phone} onClick={() => setPhone(!phone)}>
            {phone ? 'Show desktop width' : 'Show phone width'}
          </button>
        </div>
        <iframe
          style={phone ? { width: '375px', maxWidth: '100%', margin: '0 auto' } : undefined}
          ref={frame}
          onLoad={preview}
          title="Block design canvas"
          src={
            '/api/run?block=' +
            encodeURIComponent(blockId) +
            '&embedded=1&editor=1&v=' +
            encodeURIComponent(frameVersion)
          }
        />
        <p className="muted">
          Offsets move elements within their normal layout. Keep important controls within the page
          on phone and desktop.
        </p>
      </div>
      <div className="design-controls">
        <button
          className="full"
          aria-expanded={libraryOpen}
          onClick={() => setLibraryOpen(!libraryOpen)}
        >
          Element library
        </button>
        {libraryOpen && (
          <div className="element-library">
            <strong>Add inside this block</strong>
            <p className="muted">Independent elements with your own design and optional actions.</p>
            <button disabled={busy} onClick={() => void addElement('button')}>
              + Button
            </button>
            <button disabled={busy} onClick={() => void addElement('text')}>
              + Text
            </button>
            <button disabled={busy} onClick={() => void addElement('divider')}>
              + Divider
            </button>
          </div>
        )}
        <label className="field">
          <span>Element</span>
          <select
            aria-label="Design element"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {(elements.length
              ? elements
              : [{ id: 'container' }, { id: 'title' }, { id: 'button' }]
            ).map((e) => (
              <option key={e.id} value={e.id}>
                {e.id}
                {e.text ? ' · ' + e.text.slice(0, 24) : ''}
              </option>
            ))}
          </select>
        </label>
        {content && (
          <div className="element-content">
            {content.type !== 'divider' && (
              <label className="field">
                <span>Element text</span>
                <input
                  aria-label="Element text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
            )}
            <label className="field">
              <span>Place inside block</span>
              <select
                aria-label="Insert before element"
                value={content.before ?? ''}
                onChange={(e) => {
                  const before = e.target.value;
                  void edit((p) => {
                    const item = p.graph.blocks
                      .find((b) => b.id === blockId)!
                      .design!.content!.find((e) => e.id === selected)!;
                    if (before) item.before = before;
                    else delete item.before;
                  }).catch((e) => setFeedback(String(e)));
                }}
              >
                <option value="">At end of block</option>
                {elements
                  .filter(
                    (e) => e.id !== selected && e.id !== 'container' && !e.id.startsWith('custom-'),
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      Before {e.id}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="danger full"
              onClick={() => {
                void edit((p) => {
                  const b = p.graph.blocks.find((b) => b.id === blockId)!;
                  b.design!.content = b.design!.content!.filter((e) => e.id !== selected);
                  if (b.design!.elements) delete b.design!.elements[selected];
                  if (b.design!.actions) delete b.design!.actions[selected];
                  b.design!.disconnectedEvents = b.design!.disconnectedEvents?.filter(
                    (e) => e !== 'element.' + selected + '.pressed',
                  );
                  p.graph.wires = p.graph.wires?.filter(
                    (w) =>
                      w.from.instance !== blockId ||
                      w.from.event !== 'element.' + selected + '.pressed',
                  );
                })
                  .then(() => setSelected('container'))
                  .catch((e) => setFeedback(String(e)));
              }}
            >
              Remove added element
            </button>
          </div>
        )}
        {(content?.type === 'button' ||
          elements.find((e) => e.id === selected)?.tag === 'button') && (
          <div className="element-action">
            <label className="field">
              <span>When this button is pressed</span>
              <select
                aria-label="Button action"
                value={originalAction ? 'default' : action.type}
                onChange={(e) => {
                  const type = e.target.value;
                  setOriginalAction(type === 'default');
                  setAction(
                    type === 'navigate'
                      ? { type, screen: project.graph.screens[0]!.id }
                      : type === 'url'
                        ? { type, url: 'https://' }
                        : type === 'message'
                          ? { type, message: 'Hello!' }
                          : { type: type === 'default' ? 'none' : (type as 'none' | 'back') },
                  );
                }}
              >
                <option value="default">
                  {content ? 'No action (default)' : 'Original block behavior'}
                </option>
                <option value="none">No action</option>
                <option value="navigate">Go to page</option>
                <option value="back">Go back</option>
                <option value="url">Open URL</option>
                <option value="message">Show message</option>
              </select>
            </label>
            {action.type === 'navigate' && (
              <label className="field">
                <span>Destination page</span>
                <select
                  aria-label="Button destination"
                  value={action.screen}
                  onChange={(e) => setAction({ type: 'navigate', screen: e.target.value })}
                >
                  {project.graph.screens.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {action.type === 'url' && (
              <label className="field">
                <span>URL</span>
                <input
                  aria-label="Button URL"
                  value={action.url}
                  onChange={(e) => setAction({ type: 'url', url: e.target.value })}
                />
              </label>
            )}
            {action.type === 'message' && (
              <label className="field">
                <span>Message</span>
                <input
                  aria-label="Button message"
                  value={action.message}
                  onChange={(e) => setAction({ type: 'message', message: e.target.value })}
                />
              </label>
            )}
            <button className="full" disabled={busy} onClick={() => void saveElement()}>
              Save element & action
            </button>
          </div>
        )}
        {content && content.type === 'text' && (
          <button disabled={busy} onClick={() => void saveElement()}>
            Save element text
          </button>
        )}
        <p className="muted">Style changes preview instantly. Apply design to save them.</p>
        <div className="design-grid">
          {numeric.map(([key, label]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                type="number"
                aria-label={label}
                step={key === 'opacity' ? 0.1 : 1}
                min={key === 'x' || key === 'y' ? -2000 : key === 'fontSize' ? 8 : 0}
                max={key === 'opacity' ? 1 : key === 'fontSize' ? 200 : 2000}
                placeholder="Auto"
                value={(draft[key] as number) ?? ''}
                onChange={(e) => {
                  if (key === 'width' && e.target.value && draft.alignSelf === 'stretch')
                    set('alignSelf', 'flex-start');
                  set(key, e.target.value === '' ? undefined : Number(e.target.value));
                }}
              />
            </label>
          ))}
        </div>
        <label className="field">
          <span>Alignment</span>
          <select
            aria-label="Element alignment"
            value={draft.alignSelf ?? ''}
            onChange={(e) => {
              if (e.target.value === 'stretch') set('width', undefined);
              set('alignSelf', e.target.value || undefined);
            }}
          >
            <option value="">Default</option>
            <option value="flex-start">Left</option>
            <option value="center">Center</option>
            <option value="flex-end">Right</option>
            <option value="stretch">Full width</option>
          </select>
        </label>
        <label className="field">
          <span>Text alignment</span>
          <select
            aria-label="Text alignment"
            value={draft.textAlign ?? ''}
            onChange={(e) => set('textAlign', e.target.value || undefined)}
          >
            <option value="">Default</option>
            <option>left</option>
            <option>center</option>
            <option>right</option>
          </select>
        </label>
        <label className="field">
          <span>Font weight</span>
          <select
            aria-label="Font weight"
            value={draft.fontWeight ?? ''}
            onChange={(e) => set('fontWeight', e.target.value || undefined)}
          >
            <option value="">Default</option>
            {['400', '500', '600', '700', '800'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {(['color', 'backgroundColor'] as const).map((key) => (
          <label className="field" key={key}>
            <span>{key === 'color' ? 'Text color' : 'Background color'}</span>
            <input
              aria-label={key === 'color' ? 'Element text color' : 'Element background color'}
              placeholder="#345E4F"
              value={draft[key] ?? ''}
              onChange={(e) => set(key, e.target.value || undefined)}
            />
          </label>
        ))}
        <label className="design-check">
          <input
            type="checkbox"
            checked={draft.hidden ?? false}
            onChange={(e) => set('hidden', e.target.checked)}
          />{' '}
          Hide this element
        </label>
        <label className="design-check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Apply
          to matching elements in all blocks
        </label>
        <button className="primary full" disabled={busy} onClick={() => void apply(draft)}>
          {busy ? 'Applying…' : 'Apply design'}
        </button>
        <button
          className="full"
          disabled={busy}
          onClick={() => {
            void edit((p) => {
              for (const b of p.graph.blocks.filter((b) => all || b.id === blockId)) {
                if (b.design?.elements) delete b.design.elements[selected];
              }
            })
              .then(() => {
                setDraft({});
                setFeedback('Element reset to its original design.');
              })
              .catch((e) => setFeedback(String(e.message ?? e)));
          }}
        >
          Reset element
        </button>
        <button className="full" onClick={askAI}>
          Ask AI to customize
        </button>
        {feedback && (
          <p role="status" className="form-feedback">
            {feedback}
          </p>
        )}
      </div>
    </div>
  );
}
