/** The same runtime powers exported web apps and the builder's live preview. */
export const WEB_RUNTIME = String.raw`
import React, { useEffect, useState, useRef } from 'react';
type Item = {
  id: string;
  title: string;
  subtitle?: string;
};
type Question = {
  prompt: string;
  options: string[];
  multi?: boolean;
};
type Stat = {
  label: string;
  value: string;
  delta?: string;
};
type Row = {
  id: string;
  label: string;
  kind: string;
  value?: boolean;
  detail?: string;
};
type Config = {
  title?: string;
  subtitle?: string;
  headline?: string;
  subheadline?: string;
  ctaText?: string;
  eyebrow?: string;
  body?: string;
  name?: string;
  handle?: string;
  bio?: string;
  showImage?: boolean;
  skippable?: boolean;
  items?: Item[];
  questions?: Question[];
  stats?: Stat[];
  products?: {
    id: string;
    title: string;
    price: string;
    period: string;
  }[];
  sections?: {
    title?: string;
    rows: Row[];
  }[];
};
type ElementDesign = {
  x?: number;
  y?: number;
  hidden?: boolean;
  [key: string]: unknown;
};
type Action = {
  type: 'none' | 'navigate' | 'back' | 'url' | 'message';
  screen?: string;
  url?: string;
  message?: string;
};
type AddedElement = {
  id: string;
  type: 'button' | 'text' | 'divider';
  text?: string;
  before?: string;
};
type Design = {
  content?: AddedElement[];
  actions?: Record<string, Action>;
  disconnectedEvents?: string[];
  elements?: Record<string, ElementDesign>;
};
export type Block = {
  id: string;
  type: string;
  variant?: string;
  config?: Config;
  design?: Design;
};
export type Page = {
  id: string;
  block: string;
  blocks?: string[];
  title: string;
  lane?: string;
  layout?: string;
};
export type Graph = {
  app: {
    name: string;
    theme?: {
      primaryColor?: string;
      backgroundColor?: string;
      textColor?: string;
    };
  };
  screens: Page[];
  blocks: Block[];
};
export type Wire = {
  from: {
    instance: string;
    event: string;
  };
  to: {
    screen: string;
    instance?: string;
  };
};
type Emit = (event: string, output?: unknown) => void;
type Props = {
  block: Block;
  input?: unknown;
  emit: Emit;
};

const ActionContext = React.createContext<(id: string, action: Action) => void>(() => {});
function elementStyle(value: ElementDesign = {}, button = false): React.CSSProperties {
  const { x, y, hidden, ...style } = value;
  const alignment = style.alignSelf;
  return {
    ...(alignment
      ? {
          minWidth: 0,
          width: alignment === 'stretch' ? '100%' : 'fit-content',
          maxWidth: '100%',
          marginLeft: alignment === 'center' || alignment === 'flex-end' ? 'auto' : 0,
          marginRight: alignment === 'center' || alignment === 'flex-start' ? 'auto' : 0,
        }
      : {}),
    ...(button && style.textAlign
      ? {
          justifyContent:
            style.textAlign === 'center'
              ? 'center'
              : style.textAlign === 'right'
                ? 'flex-end'
                : 'flex-start',
          gap: 8,
        }
      : {}),
    ...(style as React.CSSProperties),
    ...(hidden ? { display: 'none' } : {}),
    ...(x !== undefined || y !== undefined
      ? { position: 'relative', transform: 'translate(' + (x ?? 0) + 'px, ' + (y ?? 0) + 'px)' }
      : {}),
  };
}
function customize(tree: React.ReactNode, design?: Design): React.ReactNode {
  const runAction = React.useContext(ActionContext);
  const inserted = new Set<string>();
  const added = (item: AddedElement) => {
    inserted.add(item.id);
    const action = design?.actions?.[item.id];
    return React.createElement(
      item.type === 'button' ? 'button' : item.type === 'divider' ? 'hr' : 'p',
      {
        key: item.id,
        'data-element': item.id,
        type: item.type === 'button' ? 'button' : undefined,
        className: item.type === 'button' ? 'primary custom-element' : 'custom-element',
        style: {
          ...(item.type === 'divider'
            ? { width: '100%', border: 0, borderTop: '1px solid #d7ded8' }
            : {}),
          ...elementStyle(design?.elements?.[item.id], item.type === 'button'),
        },
        onClick:
          item.type === 'button' ? () => runAction(item.id, action ?? { type: 'none' }) : undefined,
      },
      item.type === 'divider'
        ? undefined
        : (item.text ?? (item.type === 'button' ? 'New button' : 'Your text')),
    );
  };
  const counts: Record<string, number> = {};
  const walk = (node: React.ReactNode): React.ReactNode => {
    if (!React.isValidElement(node)) return node;
    if (node.type === React.Fragment) {
      const fragment = node as React.ReactElement<{ children?: React.ReactNode }>;
      return React.cloneElement(fragment, {}, React.Children.map(fragment.props.children, walk));
    }
    if (typeof node.type !== 'string') return node;
    const element = node as React.ReactElement<{
      className?: string;
      style?: React.CSSProperties;
      children?: React.ReactNode;
      name?: string;
      'data-element'?: string;
      onClick?: React.MouseEventHandler;
      type?: string;
    }>;
    const tag = node.type;
    const classes = element.props.className ?? '';
    let key =
      element.props['data-element'] ??
      (/block-surface|button-block/.test(classes)
        ? 'container'
        : /^h[12]$/.test(tag)
          ? 'title'
          : /eyebrow/.test(classes)
            ? 'eyebrow'
            : /lead/.test(classes) || (tag === 'p' && !classes)
              ? 'subtitle'
              : /detail-art|profile-cover/.test(classes)
                ? 'image'
                : /primary/.test(classes) && tag === 'button'
                  ? 'button'
                  : /text-button/.test(classes)
                    ? 'secondaryButton'
                    : tag === 'input'
                      ? 'input'
                      : classes.split(/\s+/)[0]?.replace(/[^a-zA-Z0-9-]/g, '') ||
                        (tag === 'p'
                          ? 'body'
                          : tag === 'span' || tag === 'strong' || tag === 'small'
                            ? 'text'
                            : tag));
    if (key) {
      counts[key] = (counts[key] ?? 0) + 1;
      if (counts[key] > 1) key += '-' + counts[key];
    }
    const value = design?.elements?.[key] ?? design?.elements?.[key.replace(/-\d+$/, '')];
    const children = React.Children.map(element.props.children, walk);
    if (!key)
      return React.cloneElement(
        element,
        tag === 'form'
          ? { style: { ...element.props.style, display: 'flex', flexDirection: 'column', gap: 16 } }
          : {},
        children,
      );
    const action = design?.actions?.[key];
    const rendered = React.cloneElement(
      element,
      {
        ...({ 'data-element': key } as object),
        ...(action && tag === 'button'
          ? {
              type: 'button',
              onClick: (event: React.MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                runAction(key, action);
              },
            }
          : {}),
        style: {
          ...element.props.style,
          ...(tag === 'form'
            ? ({ display: 'flex', flexDirection: 'column', gap: 16 } as React.CSSProperties)
            : {}),
          ...elementStyle(value, tag === 'button'),
          ...(key === 'container'
            ? { display: value?.hidden ? 'none' : 'flex', flexDirection: 'column' }
            : {}),
        },
      },
      key === 'container'
        ? [children, ...(design?.content ?? []).filter((item) => !inserted.has(item.id)).map(added)]
        : children,
    );
    const before = (design?.content ?? []).filter(
      (item) => item.before === key && !inserted.has(item.id),
    );
    return before.length ? (
      <React.Fragment key={key}>
        {before.map(added)}
        {rendered}
      </React.Fragment>
    ) : (
      rendered
    );
  };
  return walk(tree);
}

function Auth({ block, emit }: Props) {
  const c = block.config ?? {};
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return customize(
    <section className="auth block-surface">
      <div className="block-symbol">↗</div>
      <span className="eyebrow">
        {block.variant === 'signup' ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}
      </span>
      <h1>{c.headline}</h1>
      <p className="lead">{c.subheadline}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const data = new FormData(e.currentTarget);
          const email = String(data.get('email') ?? '');
          await new Promise((r) => setTimeout(r, 300));
          try {
            emit('auth.completed', { user: { id: 'demo-user', email }, mocked: true });
          } catch {
            setError('Something went wrong. Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email address
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={6}
            placeholder="At least 6 characters"
            required
            autoComplete={block.variant === 'signup' ? 'new-password' : 'current-password'}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'One moment…' : (c.ctaText ?? 'Continue')} <span>→</span>
        </button>
      </form>
      <p className="fine-print">Demo authentication · connect your auth provider before launch.</p>
    </section>,
    block.design,
  );
}
function Quiz({ block, emit }: Props) {
  const c = block.config ?? {};
  const questions = c.questions ?? [];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const all = block.variant === 'quiz-list';
  const complete = () => emit('onboarding.completed', { answers, skipped: false });
  const toggle = (i: number, value: string, multi?: boolean) =>
    setAnswers((prev) => {
      const selected = prev[String(i)] ?? [];
      return {
        ...prev,
        [String(i)]: multi
          ? selected.includes(value)
            ? selected.filter((v) => v !== value)
            : [...selected, value]
          : [value],
      };
    });
  const answered = all
    ? questions.every((_, i) => (answers[String(i)] ?? []).length > 0)
    : (answers[String(index)] ?? []).length > 0;
  return customize(
    <section className="block-surface quiz">
      <span className="eyebrow">LET'S MAKE IT YOURS</span>
      {!all && (
        <>
          <div className="progress">
            <span
              style={{ width: String(((index + 1) / Math.max(1, questions.length)) * 100) + '%' }}
            />
          </div>
          <p className="fine-print">
            Step {index + 1} of {questions.length}
          </p>
        </>
      )}
      {(all ? questions : questions.slice(index, index + 1)).map((q, qi) => {
        const i = all ? qi : index;
        return (
          <div className="question" key={i}>
            <h2>{q.prompt}</h2>
            <div className="choices">
              {q.options.map((option, oi) => (
                <button
                  key={option}
                  className={
                    'choice ' + ((answers[String(i)] ?? []).includes(option) ? 'chosen' : '')
                  }
                  onClick={() => toggle(i, option, q.multi)}
                  aria-pressed={(answers[String(i)] ?? []).includes(option)}
                >
                  <span className="choice-number">{String(oi + 1).padStart(2, '0')}</span>
                  {option}
                  <span className="choice-check">✓</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <button
        className="primary"
        disabled={!answered}
        onClick={() => (all || index === questions.length - 1 ? complete() : setIndex(index + 1))}
      >
        {all || index === questions.length - 1 ? 'Finish' : 'Continue'} <span>→</span>
      </button>
      {c.skippable && (
        <button
          className="text-button"
          onClick={() => emit('onboarding.completed', { answers, skipped: true })}
        >
          Skip for now
        </button>
      )}
    </section>,
    block.design,
  );
}
function Paywall({ block, emit }: Props) {
  const c = block.config ?? {};
  const products = c.products ?? [];
  const [selected, setSelected] = useState(products[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const checkout = async (restore: boolean) => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 350));
    emit(
      restore ? 'paywall.restored' : 'paywall.completed',
      restore ? { restored: true, mocked: true } : { productId: selected, mocked: true },
    );
    setBusy(false);
  };
  return customize(
    <section className="block-surface paywall">
      <div className="block-symbol">✧</div>
      <span className="eyebrow">A LITTLE MORE POSSIBILITY</span>
      <h1>{c.headline}</h1>
      <p className="lead">{c.subheadline ?? 'Everything you need to make meaningful progress.'}</p>
      <div className="benefits">
        <span>✓ Unlimited possibilities</span>
        <span>✓ Made for your routine</span>
        <span>✓ Cancel any time</span>
      </div>
      <div className="product-options">
        {(block.variant === 'compact' ? products.slice(0, 1) : products).map((p) => (
          <button
            key={p.id}
            className={'product-option ' + (selected === p.id ? 'chosen' : '')}
            onClick={() => setSelected(p.id)}
            aria-pressed={selected === p.id}
          >
            <span>
              <strong>{p.title}</strong>
              <small>Billed every {p.period}</small>
            </span>
            <span className="product-price">
              {p.price}
              <small> / {p.period}</small>
            </span>
          </button>
        ))}
      </div>
      <button className="primary" disabled={busy || !selected} onClick={() => void checkout(false)}>
        {busy ? 'One moment…' : (c.ctaText ?? 'Subscribe')} <span>→</span>
      </button>
      <button className="text-button" disabled={busy} onClick={() => void checkout(true)}>
        Restore purchases
      </button>
      <p className="fine-print">Demo checkout · no payment is collected.</p>
    </section>,
    block.design,
  );
}
function Home({ block, emit }: Props) {
  const c = block.config ?? {};
  return customize(
    <section className="block-surface home">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR DAILY EDIT</span>
          <h2>{c.title}</h2>
          <p>{c.subtitle}</p>
        </div>
        <span className="round-badge">↗</span>
      </div>
      <div className={'items ' + (block.variant === 'grid' ? 'item-grid' : '')}>
        {(c.items ?? []).map((item, i) => (
          <button
            className="item"
            key={item.id}
            onClick={() => emit('home.itemSelected', { item })}
          >
            <span className={'item-art art-' + (i % 3)}>{['◒', '⌘', '↗'][i % 3]}</span>
            <span className="item-copy">
              <span className="item-tag">
                {['DAILY RITUAL', 'FOCUS TIME', 'A MOMENT FOR YOU'][i % 3]}
              </span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </span>
            <span className="item-arrow">↗</span>
          </button>
        ))}
      </div>
    </section>,
    block.design,
  );
}
function Detail({ block, input, emit }: Props) {
  const c = block.config ?? {};
  const item = (
    input as
      | {
          item?: Item;
        }
      | undefined
  )?.item ?? {
    id: 'sample',
    title: 'Your next good habit',
    subtitle: 'Open an item from your home page to explore the details.',
  };
  return customize(
    <section className="block-surface detail">
      {c.showImage !== false && (
        <div className="detail-art">
          <span>◒</span>
          <small>MAKE TODAY COUNT</small>
        </div>
      )}
      <span className="eyebrow">
        {block.variant === 'product' ? 'THE COLLECTION' : 'A MOMENT OF INTENTION'}
      </span>
      <h1>{item.title}</h1>
      <p className="lead">{item.subtitle}</p>
      <div className="detail-note">
        <span>✧</span>
        <p>Progress starts with showing up. Take a breath, make a little space, and begin.</p>
      </div>
      <button className="primary detail-action" onClick={() => emit('content.action', { item })}>
        {c.ctaText ?? 'Continue'} <span>→</span>
      </button>
    </section>,
    block.design,
  );
}
function Stats({ block }: Props) {
  const c = block.config ?? {};
  return customize(
    <section className="block-surface stats">
      <span className="eyebrow">THE BIGGER PICTURE</span>
      {c.title && <h2>{c.title}</h2>}
      <div className={'stats-grid ' + (block.variant === 'grid' ? 'two-columns' : '')}>
        {(c.stats ?? []).map((s, i) => (
          <div className="stat" key={s.label}>
            <span className="stat-symbol">{['↗', '◷', '✧'][i % 3]}</span>
            <p>{s.label}</p>
            <strong>{s.value}</strong>
            {s.delta && <span className="delta">{s.delta}</span>}
            <div className="sparkline" aria-hidden="true">
              {[24, 38, 30, 54, 42, 68, 57, 82, 75, 96].map((height, j) => (
                <i key={j} style={{ height: String(Math.max(12, height - i * 8)) + '%' }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>,
    block.design,
  );
}
function Profile({ block }: Props) {
  const c = block.config ?? {};
  const initials = (c.name ?? 'You')
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .slice(0, 2);
  return customize(
    <section
      className={'block-surface profile ' + (block.variant === 'compact' ? 'compact-profile' : '')}
    >
      <div className="profile-cover">
        <span>YOUR STORY, STILL UNFOLDING.</span>
      </div>
      <div className="avatar">{initials}</div>
      <span className="eyebrow">GOOD TO SEE YOU</span>
      <h2>{c.name}</h2>
      <p className="handle">{c.handle}</p>
      <p className="lead">{c.bio}</p>
      <div className="profile-stats">
        {(c.stats ?? []).map((s) => (
          <div key={s.label}>
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </section>,
    block.design,
  );
}
function Settings({ block }: Props) {
  const c = block.config ?? {};
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  return customize(
    <section
      className={
        'block-surface settings ' + (block.variant === 'grouped' ? 'grouped-settings' : '')
      }
    >
      <span className="eyebrow">THE WAY YOU LIKE IT</span>
      <h2>{c.title}</h2>
      {(c.sections ?? []).map((s, i) => (
        <div className="settings-section" key={i}>
          <h3>{s.title}</h3>
          {s.rows.map((row) => (
            <div className="setting-row" key={row.id}>
              <span>
                <strong>{row.label}</strong>
                {row.detail && <small>{row.detail}</small>}
              </span>
              {row.kind === 'toggle' ? (
                <button
                  className={'toggle ' + ((toggles[row.id] ?? row.value) ? 'on' : '')}
                  role="switch"
                  aria-label={row.label}
                  aria-checked={toggles[row.id] ?? row.value ?? false}
                  onClick={() =>
                    setToggles((prev) => ({
                      ...prev,
                      [row.id]: !(prev[row.id] ?? row.value ?? false),
                    }))
                  }
                >
                  <i />
                </button>
              ) : (
                <span className="setting-detail">
                  {row.detail ?? 'Not connected'} <span>↗</span>
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>,
    block.design,
  );
}
export function BlockView(props: Props) {
  const c = props.block.config ?? {};
  switch (props.block.type.split('@')[0]) {
    case 'auth.email':
      return customize(<Auth {...props} />, props.block.design);
    case 'onboarding.quiz':
      return customize(<Quiz {...props} />, props.block.design);
    case 'paywall.basic':
      return customize(<Paywall {...props} />, props.block.design);
    case 'home.list':
      return customize(<Home {...props} />, props.block.design);
    case 'content.detail':
      return customize(<Detail {...props} />, props.block.design);
    case 'stats.overview':
      return customize(<Stats {...props} />, props.block.design);
    case 'profile.card':
      return customize(<Profile {...props} />, props.block.design);
    case 'settings.list':
      return customize(<Settings {...props} />, props.block.design);
    case 'content.hero':
      return customize(
        <section
          className={
            'block-surface hero ' + (props.block.variant === 'compact' ? 'compact-hero' : '')
          }
        >
          <span className="eyebrow">{c.eyebrow}</span>
          <h1>{c.title}</h1>
          <p className="lead">{c.body}</p>
          <button className="primary" onClick={() => props.emit('action.pressed', {})}>
            {c.ctaText} <span>→</span>
          </button>
          <div className="hero-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>✧</span>
          </div>
        </section>,
        props.block.design,
      );
    case 'content.text':
      return customize(
        <section
          className={
            'block-surface text-block ' + (props.block.variant === 'compact' ? 'compact-text' : '')
          }
        >
          <span className="eyebrow">A LITTLE PERSPECTIVE</span>
          <h2>{c.title}</h2>
          <p className="lead">{c.body}</p>
        </section>,
        props.block.design,
      );
    case 'action.button':
      return customize(
        <section className="button-block">
          <button className="primary" onClick={() => props.emit('action.pressed', {})}>
            {c.ctaText} <span>→</span>
          </button>
        </section>,
        props.block.design,
      );
    default:
      return customize(
        <section className="block-surface">
          <h2>Custom block</h2>
          <p>Add a web renderer for {props.block.type} in runtime.tsx.</p>
        </section>,
        props.block.design,
      );
  }
}
export function Application({
  graph,
  wires,
  initialPage,
  previewBlock,
  embedded = false,
}: {
  graph: Graph;
  wires: Wire[];
  initialPage?: string;
  previewBlock?: string;
  embedded?: boolean;
}) {
  const [draftDesign, setDraftDesign] = useState<Record<string, ElementDesign>>({});
  const [selectedElement, setSelectedElement] = useState('button');
  const draftRef = useRef(draftDesign);
  draftRef.current = draftDesign;
  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>('[data-element]')
      .forEach((el) =>
        el.classList.toggle('design-selected', el.dataset.element === selectedElement),
      );
  }, [selectedElement, draftDesign]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        !previewBlock ||
        new URLSearchParams(location.search).get('editor') !== '1' ||
        event.origin !== location.origin ||
        event.source !== window.parent ||
        event.data?.source !== 'block-studio-editor'
      )
        return;
      if (event.data.type === 'style')
        setDraftDesign((prev) => ({ ...prev, [event.data.element]: event.data.style }));
      if (event.data.element) setSelectedElement(event.data.element);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [previewBlock]);
  useEffect(() => {
    if (!previewBlock || new URLSearchParams(location.search).get('editor') !== '1') return;
    const root = document.querySelector('.block-container');
    if (!root) return;
    const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-element]'));
    const send = (payload: object) =>
      window.parent.postMessage(
        { source: 'block-studio-design', blockId: previewBlock, ...payload },
        window.location.origin,
      );
    elements.forEach((el) =>
      el.classList.toggle('design-selected', el.dataset.element === selectedElement),
    );
    send({
      type: 'elements',
      elements: elements.map((el) => ({
        id: el.dataset.element,
        label: el.dataset.element,
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().slice(0, 40),
      })),
    });
    let start: {
      element: HTMLElement;
      x: number;
      y: number;
      left: number;
      top: number;
      selected: string;
    } | null = null;
    const down = (event: PointerEvent) => {
      const element = (event.target as HTMLElement).closest<HTMLElement>('[data-element]');
      if (!element || !root.contains(element)) return;
      event.preventDefault();
      event.stopPropagation();
      elements.forEach((el) => el.classList.remove('design-selected'));
      element.classList.add('design-selected');
      const selected = element.dataset.element!;
      setSelectedElement(selected);
      const values =
        draftRef.current[selected] ??
        graph.blocks.find((b) => b.id === previewBlock)?.design?.elements?.[selected] ??
        {};
      start = {
        element,
        x: event.clientX,
        y: event.clientY,
        left: values.x ?? 0,
        top: values.y ?? 0,
        selected,
      };
      element.setPointerCapture(event.pointerId);
      send({ type: 'select', element: selected });
    };
    const move = (event: PointerEvent) => {
      if (start)
        start.element.style.transform =
          'translate(' +
          (start.left + event.clientX - start.x) +
          'px, ' +
          (start.top + event.clientY - start.y) +
          'px)';
    };
    const up = (event: PointerEvent) => {
      if (!start) return;
      const dx = event.clientX - start.x,
        dy = event.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3)
        send({
          type: 'move',
          element: start.selected,
          x: Math.round(start.left + dx),
          y: Math.round(start.top + dy),
        });
      start = null;
    };
    const click = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    root.addEventListener('pointerdown', down as EventListener, true);
    root.addEventListener('pointermove', move as EventListener, true);
    root.addEventListener('pointerup', up as EventListener, true);
    root.addEventListener('click', click, true);
    return () => {
      root.removeEventListener('pointerdown', down as EventListener, true);
      root.removeEventListener('pointermove', move as EventListener, true);
      root.removeEventListener('pointerup', up as EventListener, true);
      root.removeEventListener('click', click, true);
    };
  }, [graph, previewBlock]);

  const readPage = () => {
    const id = window.location.hash.slice(1);
    return graph.screens.some((p) => p.id === id)
      ? id
      : (initialPage ?? graph.screens[0]?.id ?? '');
  };
  const [pageId, setPageId] = useState(readPage);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  useEffect(() => {
    const update = () => setPageId(readPage());
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
    };
  }, [graph, initialPage]);
  const page = graph.screens.find((p) => p.id === pageId) ?? graph.screens[0];
  const navigate = (id: string) => {
    setPageId(id);
    window.history.pushState(null, '', '#' + id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const emit = (id: string, event: string, output?: unknown) => {
    const wire = wires.find((w) => w.from.instance === id && w.from.event === event);
    if (!wire) return;
    if (wire.to.instance) setInputs((prev) => ({ ...prev, [wire.to.instance!]: output }));
    if (wire.to.screen !== pageId) navigate(wire.to.screen);
  };
  const style = {
    '--brand': graph.app.theme?.primaryColor ?? '#466d5e',
    '--page-bg': graph.app.theme?.backgroundColor ?? '#f8f8f5',
    '--ink': graph.app.theme?.textColor ?? '#202b29',
  } as React.CSSProperties;
  const blockIds = previewBlock ? [previewBlock] : (page?.blocks ?? (page ? [page.block] : []));
  return (
    <div className={'generated-app ' + (embedded ? 'embedded' : '')} style={style}>
      {!embedded && (
        <header className="app-header">
          <a
            href={'#' + graph.screens[0]?.id}
            onClick={(e) => {
              e.preventDefault();
              navigate(graph.screens[0]?.id ?? '');
            }}
            className="app-brand"
          >
            <span>◒</span>
            {graph.app.name}
          </a>
          <nav aria-label="Pages">
            {graph.screens.map((p) => (
              <button
                className={pageId === p.id ? 'active' : ''}
                key={p.id}
                onClick={() => navigate(p.id)}
              >
                {p.title}
              </button>
            ))}
          </nav>
          <span className="app-header-note">Make a little progress.</span>
        </header>
      )}
      <main
        className={'page-content layout-' + (page?.layout ?? 'stack')}
        key={pageId + (previewBlock ?? '')}
      >
        {blockIds.map((id) => {
          const block = graph.blocks.find((b) => b.id === id);
          return block ? (
            <div className="block-container" key={id}>
              <ActionContext.Provider
                value={(element, action) => {
                  if (action.type === 'navigate') emit(id, 'element.' + element + '.pressed');
                  if (action.type === 'back') window.history.back();
                  if (action.type === 'url' && /^https?:\/\//.test(action.url ?? ''))
                    window.open(action.url, '_blank', 'noopener,noreferrer');
                  if (action.type === 'message') window.alert(action.message ?? '');
                }}
              >
                <BlockView
                  block={
                    previewBlock
                      ? {
                          ...block,
                          design: {
                            ...block.design,
                            elements: { ...block.design?.elements, ...draftDesign },
                          },
                        }
                      : block
                  }
                  input={inputs[id]}
                  emit={(event, output) => emit(id, event, output)}
                />
              </ActionContext.Provider>
            </div>
          ) : null;
        })}
      </main>
      {!embedded && (
        <footer className="app-footer">
          <span>{graph.app.name}</span>
          <span>Made with intention. Built with Block.</span>
        </footer>
      )}
    </div>
  );
}
`;

export const WEB_STYLES = String.raw`
@import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap");
.design-selected {
  outline: 2px solid #466d5e !important;
  outline-offset: 3px;
}
[data-element] {
  touch-action: auto;
}
:root {
  font-family: "DM Sans", system-ui, sans-serif;
  color: #202b29;
  background: #f8f8f5;
  font-synthesis: none;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
button,
input {
  font: inherit;
}
button,
a,
input {
  outline-offset: 4px;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
button {
  transition:
    background 0.15s,
    transform 0.15s,
    box-shadow 0.15s;
}
button:hover:not(:disabled) {
  transform: translateY(-1px);
}
.generated-app {
  min-height: 100vh;
  background: var(--page-bg);
  color: var(--ink);
}
.app-header {
  display: flex;
  align-items: center;
  gap: 40px;
  padding: 25px 5%;
  border-bottom: 1px solid #e7ebe8;
  background: #ffffffd9;
}
.app-brand {
  display: flex;
  gap: 10px;
  font:
    800 20px Manrope,
    sans-serif;
  letter-spacing: -0.7px;
  color: inherit;
  text-decoration: none;
  white-space: nowrap;
}
.app-brand > span {
  color: var(--brand);
  font-size: 27px;
}
.app-header nav {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.app-header nav button {
  border: 0;
  background: transparent;
  padding: 8px 10px;
  color: #7c8480;
  font-size: 12px;
  border-radius: 8px;
}
.app-header nav button.active {
  background: #edf2ee;
  color: var(--brand);
  font-weight: 700;
}
.app-header-note {
  margin-left: auto;
  color: #8a938d;
  font-size: 11px;
  white-space: nowrap;
}
.page-content {
  max-width: 1080px;
  padding: 56px 28px;
  margin: auto;
  display: grid;
  gap: 26px;
}
.layout-stack .block-container {
  width: 100%;
}
.layout-stack:has(.auth),
.layout-stack:has(.quiz),
.layout-stack:has(.paywall) {
  max-width: 630px;
}
.layout-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.layout-split {
  grid-template-columns: 1.4fr 1fr;
  align-items: start;
}
.block-surface {
  padding: 36px;
  border: 1px solid #e5e9e5;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 5px 24px #273a3004;
  overflow: hidden;
}
.block-surface h1,
.block-surface h2 {
  font-family: Manrope, system-ui, sans-serif;
  letter-spacing: -1.3px;
  line-height: 1.15;
  margin: 13px 0 14px;
  font-weight: 800;
}
.block-surface h1 {
  font-size: 38px;
}
.block-surface h2 {
  font-size: 28px;
}
.block-surface p {
  line-height: 1.65;
}
.lead {
  color: #7a827f;
  font-size: 15px;
  max-width: 560px;
  margin: 0 0 25px;
}
.eyebrow {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.8px;
  color: var(--brand);
}
.primary {
  border: 0;
  background: var(--brand);
  color: white;
  border-radius: 12px;
  padding: 16px 21px;
  width: 100%;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  box-shadow: 0 5px 12px #243a3012;
}
.primary:hover:not(:disabled) {
  filter: brightness(0.94);
  box-shadow: 0 7px 16px #243a3024;
}
.primary > span {
  font-size: 19px;
}
.auth {
  max-width: 560px;
  margin: auto;
}
.block-symbol {
  width: 45px;
  height: 45px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: #f1f4ed;
  color: var(--brand);
  font-size: 26px;
  margin-bottom: 28px;
}
.auth form {
  display: grid;
  gap: 20px;
}
.auth label {
  font-size: 11px;
  color: #5d6862;
  font-weight: 600;
  display: grid;
  gap: 8px;
}
.auth input {
  width: 100%;
  border: 1px solid #e1e6e2;
  background: #fcfdfb;
  border-radius: 10px;
  padding: 14px;
  font-size: 13px;
  color: var(--ink);
}
.auth input:focus {
  border-color: var(--brand);
  outline: 2px solid #e6eee8;
}
.fine-print {
  font-size: 10px;
  color: #919991;
  text-align: center;
  margin-top: 20px;
}
.progress {
  height: 4px;
  background: #eff2ed;
  border-radius: 3px;
  margin-top: 23px;
  overflow: hidden;
}
.progress > span {
  display: block;
  height: 100%;
  background: var(--brand);
  border-radius: 3px;
}
.question {
  margin: 26px 0;
}
.choices {
  display: grid;
  gap: 10px;
}
.choice {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px;
  background: #fff;
  border: 1px solid #e4e9e4;
  border-radius: 12px;
  text-align: left;
  font-size: 13px;
  color: #495750;
}
.choice.chosen {
  background: #f1f5ef;
  border-color: var(--brand);
  color: var(--brand);
}
.choice-number {
  font-size: 10px;
  font-weight: 700;
  color: #9ea79e;
}
.choice-check {
  margin-left: auto;
  opacity: 0;
}
.chosen .choice-check {
  opacity: 1;
}
.text-button {
  display: block;
  background: none;
  border: 0;
  margin: 17px auto 0;
  color: #849087;
  font-size: 11px;
}
.benefits {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin: 25px 0;
  font-size: 10px;
  color: #65786a;
}
.product-options {
  display: grid;
  gap: 10px;
  margin: 25px 0;
}
.product-option {
  display: flex;
  justify-content: space-between;
  text-align: left;
  align-items: center;
  gap: 16px;
  padding: 22px;
  border: 1px solid #e5e9e5;
  background: white;
  border-radius: 13px;
}
.product-option.chosen {
  border-color: var(--brand);
  background: #f7f9f4;
}
.product-option strong {
  font-size: 13px;
}
.product-option small {
  display: block;
  font-size: 10px;
  font-weight: 400;
  color: #8a948c;
  margin-top: 5px;
}
.product-price {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -1px;
}
.product-price small {
  display: inline;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}
.section-heading h2 {
  margin-bottom: 5px;
}
.section-heading p {
  margin: 0;
  color: #89948c;
  font-size: 13px;
}
.round-badge {
  border-radius: 50%;
  background: #f1f4ef;
  width: 37px;
  height: 37px;
  display: grid;
  place-items: center;
  color: var(--brand);
}
.items {
  display: grid;
  gap: 12px;
}
.item {
  display: flex;
  align-items: center;
  text-align: left;
  gap: 20px;
  padding: 16px;
  border: 1px solid #e8ece7;
  border-radius: 16px;
  background: white;
  color: inherit;
}
.item:hover {
  border-color: #b8c8b5;
  background: #fcfdf9;
}
.item-art {
  width: 68px;
  height: 68px;
  flex-shrink: 0;
  border-radius: 13px;
  background: #e9eee2;
  color: #637b56;
  display: grid;
  place-items: center;
  font-size: 33px;
}
.art-1 {
  background: #f4ebe0;
  color: #b7986a;
}
.art-2 {
  background: #e5ecf0;
  color: #6b8492;
}
.item-copy {
  display: grid;
  gap: 5px;
}
.item-tag {
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: #9aab94;
}
.item strong {
  font:
    700 15px Manrope,
    sans-serif;
  letter-spacing: -0.3px;
}
.item small {
  font-size: 11px;
  color: #929b94;
}
.item-arrow {
  margin-left: auto;
  color: #809878;
  font-size: 20px;
}
.item-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.item-grid .item {
  flex-wrap: wrap;
}
.item-grid .item-art {
  width: 100%;
  height: 110px;
}
.detail-art {
  height: 210px;
  margin: -36px -36px 30px;
  background: #e6eddf;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #6e865a;
}
.detail-art > span {
  font-size: 85px;
}
.detail-art small {
  font-size: 9px;
  letter-spacing: 3px;
}
.detail-note {
  background: #f8faf5;
  display: flex;
  gap: 15px;
  padding: 20px;
  border-radius: 13px;
  color: #819078;
  font-size: 12px;
}
.detail-note > span {
  font-size: 25px;
}
.detail-note p {
  margin: 0;
}
.detail-action {
  margin-top: 24px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 15px;
  margin-top: 25px;
}
.stats-grid.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.stat {
  position: relative;
  background: #f8faf5;
  border-radius: 15px;
  padding: 22px;
  overflow: hidden;
}
.stat p {
  font-size: 11px;
  color: #8a9785;
  margin: 18px 0 7px;
}
.stat > strong {
  display: block;
  font:
    800 34px Manrope,
    sans-serif;
  letter-spacing: -1.5px;
}
.stat-symbol {
  color: #849975;
  font-size: 20px;
}
.delta {
  display: inline-block;
  color: #769066;
  font-size: 9px;
  margin-top: 12px;
}
.sparkline {
  display: flex;
  gap: 4px;
  align-items: end;
  height: 42px;
  margin-top: 23px;
  opacity: 0.65;
}
.sparkline i {
  display: block;
  background: #c8d8bd;
  flex: 1;
  border-radius: 3px 3px 0 0;
}
.profile {
  text-align: center;
  padding-top: 0;
}
.profile-cover {
  height: 100px;
  background: #e9eee3;
  margin: 0 -36px 0;
  display: flex;
  align-items: center;
  justify-content: end;
  padding: 25px;
  color: #9bab8d;
  font-size: 8px;
  letter-spacing: 1.8px;
}
.avatar {
  width: 85px;
  height: 85px;
  border: 6px solid white;
  border-radius: 50%;
  background: var(--brand);
  color: white;
  display: grid;
  place-items: center;
  font:
    700 23px Manrope,
    sans-serif;
  margin: -43px auto 20px;
  position: relative;
}
.profile .handle {
  font-size: 12px;
  color: #98a18f;
  margin-top: -5px;
}
.profile .lead {
  margin: 20px auto;
}
.profile-stats {
  display: flex;
  justify-content: center;
  padding-top: 26px;
  gap: 45px;
  border-top: 1px solid #edf0e9;
  margin-top: 26px;
}
.profile-stats div {
  display: grid;
  gap: 8px;
}
.profile-stats strong {
  font:
    800 23px Manrope,
    sans-serif;
}
.profile-stats span {
  font-size: 10px;
  color: #9ba591;
}
.compact-profile .profile-cover {
  display: none;
}
.compact-profile {
  padding-top: 36px;
}
.compact-profile .avatar {
  margin: 0 auto 20px;
}
.settings-section {
  margin-top: 26px;
}
.settings-section h3 {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #9baa91;
  margin-bottom: 12px;
}
.setting-row {
  padding: 19px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #edf0e9;
  gap: 16px;
}
.setting-row strong {
  font-size: 12px;
  font-weight: 500;
}
.setting-row small {
  display: block;
  color: #9ba591;
  font-size: 10px;
  margin-top: 4px;
}
.setting-detail {
  font-size: 10px;
  color: #9ba591;
}
.setting-detail > span {
  font-size: 16px;
  margin-left: 10px;
}
.toggle {
  padding: 3px;
  background: #e3e8df;
  border: 0;
  border-radius: 20px;
  width: 35px;
  height: 21px;
  flex-shrink: 0;
}
.toggle i {
  display: block;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: white;
  transition: transform 0.15s;
  box-shadow: 0 1px 3px #0001;
}
.toggle.on {
  background: var(--brand);
}
.toggle.on i {
  transform: translateX(14px);
}
.hero {
  position: relative;
  min-height: 280px;
  padding: 48px;
  background: #f3f6ed;
}
.hero h1 {
  max-width: 460px;
  font-size: 43px;
  position: relative;
  z-index: 1;
}
.hero .lead {
  max-width: 420px;
  position: relative;
  z-index: 1;
}
.hero .primary {
  width: auto;
  min-width: 210px;
  gap: 28px;
  position: relative;
  z-index: 1;
}
.hero-orbit {
  position: absolute;
  right: -65px;
  bottom: -50px;
  width: 300px;
  height: 300px;
  display: grid;
  place-items: center;
  color: #a8b899;
  opacity: 0.45;
}
.hero-orbit i {
  position: absolute;
  border: 1px solid #b7c6a7;
  border-radius: 50%;
  width: 100%;
  height: 100%;
}
.hero-orbit i:nth-child(2) {
  width: 70%;
  height: 70%;
}
.hero-orbit i:nth-child(3) {
  width: 40%;
  height: 40%;
}
.hero-orbit > span {
  font-size: 60px;
}
.text-block {
  border: 0;
  box-shadow: none;
  background: transparent;
}
.button-block {
  padding: 10px 0;
}
.app-footer {
  max-width: 1024px;
  margin: 0 auto;
  padding: 25px 28px 35px;
  display: flex;
  justify-content: space-between;
  gap: 20px;
  border-top: 1px solid #e9eee5;
  color: #9ba591;
  font-size: 10px;
}
body:has(.embedded) {
  overflow: hidden;
}
.embedded .page-content {
  padding: 20px;
  max-width: 100%;
}
.embedded .block-surface {
  box-shadow: none;
}
.embedded:has(.hero) {
  background: #f3f6ed;
}
.embedded .auth,
.embedded .paywall {
  max-width: 100%;
}
.embedded .block-surface h1 {
  font-size: 28px;
}
.embedded .block-surface h2 {
  font-size: 23px;
}
.embedded .block-surface {
  padding: 26px;
}
.embedded .detail-art {
  margin: -26px -26px 24px;
}
.embedded .profile-cover {
  margin: 0 -26px;
}
.embedded .profile {
  padding-top: 0;
}
.embedded .stats-grid {
  gap: 8px;
}
.embedded .stat {
  padding: 15px;
}
.embedded .stat > strong {
  font-size: 27px;
}
.embedded .hero {
  padding: 30px;
  min-height: 260px;
}
.embedded .hero h1 {
  font-size: 34px;
}
.compact-hero {
  padding: 28px;
  min-height: 220px;
}
.compact-hero h1 {
  font-size: 30px;
}
.compact-text {
  padding: 18px;
}
.compact-text h2 {
  font-size: 21px;
}
.grouped-settings .settings-section {
  background: #f8faf5;
  border: 1px solid #e6ece0;
  border-radius: 14px;
  padding: 18px;
}
.grouped-settings .setting-row:last-child {
  border-bottom: 0;
}
@media (max-width: 700px) {
  .app-header {
    padding: 18px 20px;
    flex-wrap: wrap;
    gap: 16px;
  }
  .app-header nav {
    order: 3;
    width: 100%;
    overflow: auto;
    flex-wrap: nowrap;
  }
  .app-header-note {
    font-size: 9px;
  }
  .page-content {
    padding: 25px 16px;
    gap: 16px;
  }
  .layout-grid,
  .layout-split {
    grid-template-columns: 1fr;
  }
  .block-surface {
    padding: 26px;
  }
  .block-surface h1 {
    font-size: 30px;
  }
  .block-surface h2 {
    font-size: 24px;
  }
  .stats-grid {
    gap: 8px;
  }
  .stat {
    padding: 15px;
  }
  .stat > strong {
    font-size: 27px;
  }
  .hero {
    padding: 30px;
  }
  .hero h1 {
    font-size: 35px;
  }
  .item-grid {
    grid-template-columns: 1fr;
  }
  .profile-cover {
    margin: 0 -26px;
  }
  .detail-art {
    margin: -26px -26px 25px;
  }
  .app-footer {
    font-size: 9px;
  }
  .profile-stats {
    gap: 25px;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
`;
