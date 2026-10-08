import notesGraph from '../../../../examples/notes/graph.json';
import cloudNotesGraph from '../../../../examples/paper-cloud/graph.json';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Code2,
  Download,
  Globe2,
  Layers,
  LayoutGrid,
  Loader2,
  Monitor,
  MoreHorizontal,
  Play,
  Plus,
  Redo2,
  Search,
  Settings2,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Workflow,
  X,
} from 'lucide-react';
import { api, type BuilderProject, type BlockSummary, type WiringReport } from './api';
import { useProject } from './useProject';
import { FlowCanvas, blockName, pageIds } from './FlowCanvas';
import './workspace.css';

const DesignEditor = lazy(() =>
  import('./DesignEditor').then((m) => ({ default: m.DesignEditor })),
);
const Inspector = lazy(() => import('./Inspector').then((m) => ({ default: m.Inspector })));
const AgentView = lazy(() => import('./AgentView').then((m) => ({ default: m.AgentView })));
const ProfileWizard = lazy(() =>
  import('./ProfileWizard').then((m) => ({ default: m.ProfileWizard })),
);
const CardsView = lazy(() => import('./CardsView').then((m) => ({ default: m.CardsView })));
type Dialog =
  | 'design'
  | 'apps'
  | 'new'
  | 'preview'
  | 'export'
  | 'profile'
  | 'agent'
  | 'developer'
  | 'cards'
  | null;
const descriptions: Record<string, string> = {
  'auth.email': 'Email authentication flow',
  'onboarding.quiz': 'Questions, answers, and progress',
  'paywall.basic': 'Plans and subscription choices',
  'home.list': 'Lists and browsable collections',
  'content.detail': 'Dynamic content from a selection',
  'stats.overview': 'Metrics with a clear visual hierarchy',
  'profile.card': 'People, bios, and profile stats',
  'settings.list': 'Preferences and local toggles',
  'content.hero': 'A bold introduction and call to action',
  'content.text': 'A heading and supporting copy',
  'action.button': 'A focused, connected call to action',
  'data.collection': 'Persistent notes, search, folders, and backups',
  'data.editor': 'Autosave, tags, Markdown, and checklists',
  'data.summary': 'Live counts from a shared collection',
  'auth.account': 'Real Google and verified email accounts',
  'onboarding.profile': 'Account onboarding saved in the cloud',
  'billing.plans': 'UPI checkout with verified paid access',
  'account.settings': 'Cloud identity, plans, and sign out',
  'billing.review': 'Owner review of actual payment receipts',
};
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab') return;
      const list = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,a[href],[tabindex="0"]',
        ) ?? [],
      );
      const first = list[0],
        last = list.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === ref.current)
      ) {
        last?.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first?.focus();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={'modal ' + (wide ? 'wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="icon-button" aria-label="Close dialog" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
function NavigationToggle({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled: boolean;
  onChange(value: boolean): Promise<void>;
}) {
  const [checked, setChecked] = useState(value);
  useEffect(() => setChecked(value), [value]);
  return (
    <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>
      <input
        type="checkbox"
        aria-label="Show page in app navigation"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          const next = e.currentTarget.checked;
          setChecked(next);
          void onChange(next).catch(() => setChecked(value));
        }}
      />
      In navigation
    </label>
  );
}
export function Workspace() {
  const {
    project,
    error,
    refresh,
    edit,
    saving,
    historyState,
    travel,
    clearError,
    catalog,
    manageApp: runAppAction,
  } = useProject();
  const [library, setLibrary] = useState<BlockSummary[]>([]);
  const [wiring, setWiring] = useState<WiringReport | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [platform, setPlatform] = useState<'web' | 'mobile'>('web');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [jsonDraft, setJsonDraft] = useState('');
  const [newAppTemplate, setNewAppTemplate] = useState('starter');
  const [newAppName, setNewAppName] = useState('My first app');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cloudUrl, setCloudUrl] = useState('');
  const [libOpen, setLibOpen] = useState(true);
  const manageApp = async (
    action: 'create' | 'activate' | 'delete' | 'restore',
    value: BuilderProject | string,
  ) => {
    await runAppAction(action, value);
    setPageId(null);
    setBlockId(null);
    setSidebarOpen(false);
    setNotice(null);
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const openPage = useCallback((id: string) => {
    setPageId(id);
    setBlockId(null);
    setSidebarOpen(false);
  }, []);
  const closeDialog = useCallback(() => setDialog(null), []);
  useEffect(() => {
    api
      .getBlocks()
      .then(setLibrary)
      .catch((e) => setNotice(String(e)));
  }, []);
  useEffect(() => {
    let active = true;
    if (project)
      api
        .compile('web')
        .then((r) => {
          if (active) setWiring(r.wiring);
        })
        .catch((e) => {
          if (active) setNotice(String(e));
        });
    return () => {
      active = false;
    };
  }, [project]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (dialog || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        travel(e.shiftKey ? 'redo' : 'undo');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [travel, dialog]);
  if (!project)
    return (
      <div className="loading-screen">
        <Box size={32} />
        <h2>Opening your workspace</h2>
        <p>{error ?? 'Loading pages and block contracts…'}</p>
        {error && <button onClick={() => void refresh()}>Try again</button>}
      </div>
    );
  const page = project.graph.screens.find((s) => s.id === pageId);
  const addPage = () => {
    const id = 'p_' + crypto.randomUUID().slice(0, 8);
    const bid = 'b_' + crypto.randomUUID().slice(0, 8);
    void edit((p) => {
      p.graph.blocks.push({
        id: bid,
        type: 'content.hero@1.0.0',
        config: { ...library.find((b) => b.id === 'content.hero@1.0.0')?.defaultConfig },
      });
      p.graph.screens.push({
        id,
        block: bid,
        blocks: [bid],
        title: 'Untitled page',
        position: {
          x: (p.graph.screens.length % 4) * 365,
          y: Math.floor(p.graph.screens.length / 4) * 370,
        },
      });
    })
      .then(() => openPage(id))
      .catch(() => {});
  };
  const addBlock = (info: BlockSummary, position?: { x: number; y: number }) => {
    if (!page) return;
    const id = 'b_' + crypto.randomUUID().slice(0, 8);
    void edit((p) => {
      const s = p.graph.screens.find((s) => s.id === page.id)!;
      const ids = pageIds(s);
      p.graph.blocks.push({
        id,
        type: info.id,
        variant: info.defaultVariant,
        config: structuredClone(info.defaultConfig),
        position: position ?? { x: (ids.length % 3) * 365, y: Math.floor(ids.length / 3) * 360 },
      });
      s.blocks = [...ids, id];
    })
      .then(() => setBlockId(id))
      .catch(() => {});
  };
  const exportProject = async () => {
    setExporting(true);
    setNotice(null);
    try {
      const target = project.graph.app.cloud ? 'web' : platform;
      const blob = await api.exportZip(target);
      download(blob, project.graph.app.slug + '-' + target + '.zip');
      setDialog(null);
      setNotice('Your ' + (target === 'web' ? 'web app' : 'Expo mobile app') + ' source is ready.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };
  const showDeveloper = () => {
    setJsonDraft(JSON.stringify(project, null, 2));
    setCloudUrl(project.graph.app.cloud?.backendUrl ?? 'http://127.0.0.1:8787');
    setDialog('developer');
  };
  return (
    <div className="workspace">
      <aside className={'sidebar ' + (sidebarOpen ? 'is-open' : '')}>
        <button
          className="wordmark"
          onClick={() => {
            setPageId(null);
            setBlockId(null);
          }}
        >
          <span className="brand-symbol">
            <Box size={21} strokeWidth={1.6} />
          </span>
          <b>
            block<span>studio</span>
          </b>
        </button>
        <div className="project-switch">
          <span className="project-avatar">{project.graph.app.name[0]}</span>
          <div>
            <button
              className="app-picker"
              aria-label="Switch apps"
              onClick={() => setDialog('apps')}
            >
              <strong>{project.graph.app.name}</strong>
              <ChevronRight size={14} />
            </button>
            <small>
              {catalog?.apps.filter((a) => !a.deleted).length ?? 1} apps · Local workspace
            </small>
          </div>
          <button className="icon-button" aria-label="Project settings" onClick={showDeveloper}>
            <MoreHorizontal size={16} />
          </button>
        </div>
        <div className="sidebar-caption">WORKSPACE</div>
        <button
          className={'nav-item ' + (!page ? 'active' : '')}
          onClick={() => {
            setPageId(null);
            setBlockId(null);
            setSidebarOpen(false);
          }}
        >
          <Workflow size={17} /> Page flow <span>{project.graph.screens.length}</span>
        </button>
        <div className="sidebar-caption pages-caption">
          PAGES
          <button
            className="icon-button"
            aria-label="Add page"
            onClick={addPage}
            disabled={!library.length}
          >
            <Plus size={14} />
          </button>
        </div>
        <nav className="page-list" aria-label="Pages">
          {project.graph.screens.map((s, i) => (
            <button
              className={'page-link ' + (page?.id === s.id ? 'active' : '')}
              key={s.id}
              onClick={() => openPage(s.id)}
            >
              <span className="page-number">{String(i + 1).padStart(2, '0')}</span>
              <span>{s.title}</span>
              {s.lane === 'tabs' && <LayoutGrid size={12} />}
            </button>
          ))}
        </nav>
        <button className="add-page" onClick={addPage} disabled={!library.length}>
          <Plus size={15} /> Add a page
        </button>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setDialog('new')}>
            <Plus size={16} /> New starter app
          </button>
          <div className="workspace-note">
            <span className="green-dot" />
            <span>
              One graph. Two platforms.<small>Build for web and mobile.</small>
            </span>
            <Globe2 size={18} />
          </div>
          <button className="nav-item" onClick={() => setDialog('profile')}>
            <Settings2 size={16} /> Brand & app profile
          </button>
          <button className="nav-item" onClick={() => setDialog('agent')}>
            <Sparkles size={16} /> AI assistant <span className="subtle-chip">Beta</span>
          </button>
          <button className="nav-item" onClick={showDeveloper}>
            <Code2 size={16} /> Developer tools
          </button>
          <div className="local-user">
            <span>Y</span>
            <div>
              Your workspace<small>Saved on this computer</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="editor">
        <header className="workspace-topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle navigation"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Layers size={17} />
            </button>
            <span>{project.graph.app.name}</span>
            <ChevronRight size={13} />
            <strong>{page?.title ?? 'Page flow'}</strong>
          </div>
          <div className="topbar-actions">
            <span className="save-status" aria-live="polite">
              {saving ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
              {saving ? 'Saving…' : error ? 'Changes not saved' : 'All changes saved'}
            </span>
            <button
              className="icon-button"
              aria-label="Undo"
              disabled={!historyState.undo || saving}
              onClick={() => travel('undo')}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo"
              disabled={!historyState.redo || saving}
              onClick={() => travel('redo')}
            >
              <Redo2 size={16} />
            </button>
            <span className="toolbar-divider" />
            <button onClick={() => setDialog('preview')} disabled={saving}>
              <Play size={14} fill="currentColor" /> Preview
            </button>
            <button className="primary" onClick={() => setDialog('export')} disabled={saving}>
              <ArrowUpRight size={15} /> Export app
            </button>
          </div>
        </header>
        <div className="canvas-toolbar">
          <div className="canvas-title">
            {page ? (
              <>
                <button
                  className="icon-button"
                  aria-label="Back to page flow"
                  onClick={() => {
                    setPageId(null);
                    setBlockId(null);
                  }}
                >
                  <ArrowLeft size={17} />
                </button>
                <div>
                  <input
                    aria-label="Page title"
                    className="title-input"
                    key={page.id + page.title}
                    defaultValue={page.title}
                    onBlur={(e) => {
                      const value = e.currentTarget.value.trim();
                      if (value && value !== page.title)
                        void edit((p) => {
                          p.graph.screens.find((s) => s.id === page.id)!.title = value;
                        }).catch(() => {});
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                  />
                  <p>Compose your page. The blocks handle the wiring.</p>
                </div>
              </>
            ) : (
              <div>
                <h1>Every great app starts with a flow.</h1>
                <p>Connect your pages, then make each one your own.</p>
              </div>
            )}
          </div>
          <div className="canvas-options">
            {page && (
              <>
                <button className={libOpen ? 'pressed' : ''} onClick={() => setLibOpen(!libOpen)}>
                  <Plus size={14} /> Blocks
                </button>
                <select
                  aria-label="Page layout"
                  value={page.layout ?? 'stack'}
                  onChange={(e) => {
                    const value = e.currentTarget.value as 'stack' | 'grid' | 'split';
                    void edit((p) => {
                      p.graph.screens.find((s) => s.id === page.id)!.layout = value;
                    }).catch(() => {});
                  }}
                >
                  <option value="stack">Stack layout</option>
                  <option value="grid">Grid layout</option>
                  <option value="split">Split layout</option>
                </select>
                <NavigationToggle
                  key={page.id}
                  value={page.navigation !== false}
                  disabled={saving}
                  onChange={(visible) =>
                    edit((p) => {
                      p.graph.screens.find((s) => s.id === page.id)!.navigation = visible;
                    })
                  }
                />
              </>
            )}
            <div className="platform-switch" aria-label="Preview platform">
              <button
                className={platform === 'web' ? 'selected' : ''}
                aria-pressed={platform === 'web'}
                onClick={() => setPlatform('web')}
              >
                <Monitor size={14} /> Web
              </button>
              <button
                className={platform === 'mobile' ? 'selected' : ''}
                aria-pressed={platform === 'mobile'}
                onClick={() => setPlatform('mobile')}
              >
                <Smartphone size={14} /> Mobile
              </button>
            </div>
            {!page && (
              <button onClick={addPage}>
                <Plus size={14} /> New page
              </button>
            )}
          </div>
        </div>
        <div className="canvas-area">
          {page && libOpen && (
            <aside className="block-library">
              <div className="library-head">
                <strong>Block library</strong>
                <span>{library.length}</span>
              </div>
              <p>
                Small building blocks.
                <br />
                Endless possibilities.
              </p>
              <label className="search-field">
                <Search size={14} />
                <input
                  aria-label="Search blocks"
                  placeholder="Search blocks…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="library-items">
                {library
                  .filter((b) =>
                    (blockName(b.id) + b.id + b.category)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((info, i) => (
                    <button
                      className="library-block"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/blockfw', info.id);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      key={info.id}
                      onClick={() => addBlock(info)}
                      aria-label={'Add ' + blockName(info.id)}
                    >
                      <span className={'library-icon tone-' + (i % 4)}>
                        <Layers size={18} />
                      </span>
                      <span>
                        <strong>{blockName(info.id)}</strong>
                        <small>{descriptions[info.id.split('@')[0]!] ?? info.category}</small>
                      </span>
                      <Plus size={13} />
                    </button>
                  ))}
                {library.filter((b) =>
                  (blockName(b.id) + b.id + b.category).toLowerCase().includes(query.toLowerCase()),
                ).length === 0 && (
                  <p className="empty-state">No matching blocks. Try “content” or “settings”.</p>
                )}
              </div>
              <button className="library-footer" onClick={() => setDialog('cards')}>
                <Code2 size={14} /> Explore block contracts <ArrowUpRight size={13} />
              </button>
            </aside>
          )}
          <FlowCanvas
            onAddBlock={addBlock}
            platform={platform}
            project={project}
            library={library}
            wiring={wiring}
            pageId={page?.id ?? null}
            onOpen={openPage}
            onSelectBlock={setBlockId}
            edit={(fn) => edit(fn).catch(() => {})}
          />
          {page && blockId && (
            <Suspense
              fallback={
                <aside className="inspector">
                  <p>Opening properties…</p>
                </aside>
              }
            >
              <Inspector
                project={project}
                pageId={page.id}
                blockId={blockId}
                library={library}
                wiring={wiring}
                edit={edit}
                close={() => setBlockId(null)}
                select={setBlockId}
                customize={() => setDialog('design')}
                askAI={() => setDialog('agent')}
              />
            </Suspense>
          )}
        </div>
        <footer className="workspace-status">
          <span>
            <span className="green-dot" /> {project.graph.screens.length} pages <i>·</i>{' '}
            {project.graph.blocks.length} blocks <i>·</i> {wiring?.resolved.length ?? 0} connections
          </span>
          <span>
            {page ? 'Canvas positions are independent of page layout' : 'Automatic wiring is on'}
            <span className="keyboard-key">⌘ / Ctrl Z</span>
          </span>
        </footer>
      </div>
      {!dialog && (error || notice) && (
        <div className={'toast ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>
          <span>{error ?? notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => {
              clearError();
              setNotice(null);
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {dialog && (
        <Modal
          title={
            {
              design: 'Customize your block',
              apps: 'Your apps',
              new: 'Start something new',
              preview: 'Live preview',
              export: 'Your app, ready to build on',
              profile: 'Brand & app profile',
              agent: 'AI assistant',
              developer: 'Developer tools',
              cards: 'Block contracts',
            }[dialog]
          }
          close={closeDialog}
          wide={dialog !== 'export' && dialog !== 'new'}
        >
          {(error || notice) && (
            <p
              className={error ? 'dialog-feedback error' : 'dialog-feedback'}
              role={error ? 'alert' : 'status'}
            >
              {error ?? notice}
            </p>
          )}
          <Suspense fallback={<p>Loading…</p>}>
            {dialog === 'design' && blockId && (
              <DesignEditor
                project={project}
                blockId={blockId}
                edit={edit}
                askAI={() => setDialog('agent')}
              />
            )}
            {dialog === 'apps' && (
              <div className="app-library">
                <p>Every app has its own pages, blocks, brand, and saved changes.</p>
                {catalog?.apps
                  .filter((a) => !a.deleted)
                  .map((a) => (
                    <div className="app-row" key={a.id}>
                      <button
                        disabled={saving}
                        className="app-open"
                        onClick={() =>
                          void manageApp('activate', a.id)
                            .then(closeDialog)
                            .catch(() => {})
                        }
                      >
                        <span className="project-avatar">{a.name[0]}</span>
                        <strong>{a.name}</strong>
                        {a.id === catalog.activeId && <span className="subtle-chip">Current</span>}
                      </button>
                      <button
                        aria-label={'Delete app ' + a.name}
                        className="icon-button danger"
                        disabled={saving || catalog.apps.filter((x) => !x.deleted).length < 2}
                        onClick={() =>
                          void manageApp('delete', a.id)
                            .then(() => {
                              setDialog('apps');
                              setNotice('App moved to Recently deleted.');
                            })
                            .catch(() => {})
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                <button className="primary full" disabled={saving} onClick={() => setDialog('new')}>
                  <Plus size={16} /> Create app
                </button>
                {catalog?.apps.some((a) => a.deleted) && (
                  <>
                    <h3>Recently deleted</h3>
                    {catalog.apps
                      .filter((a) => a.deleted)
                      .map((a) => (
                        <div className="app-row" key={a.id}>
                          <span>{a.name}</span>
                          <button
                            disabled={saving}
                            onClick={() => void manageApp('restore', a.id).catch(() => {})}
                          >
                            Restore app
                          </button>
                        </div>
                      ))}
                  </>
                )}
              </div>
            )}
            {dialog === 'new' && (
              <div className="export-panel">
                <span className="eyebrow">A SMALL START. A BIG POSSIBILITY.</span>
                <h2>
                  Your next idea
                  <br />
                  starts here.
                </h2>
                <p>
                  {newAppTemplate === 'cloud-notes'
                    ? 'Paper with real accounts, onboarding, private cloud notes, three plans, UPI checkout, and owner payment verification. Export includes the server and database migration. Provider setup is required. Web target.'
                    : newAppTemplate === 'notes'
                      ? 'A complete notes app with five connected pages, autosave, folders, search, favorites, archive, trash, and backups. Your notes stay on this device.'
                      : 'Start with two connected pages and four editable blocks. Build for web and mobile from the same canvas.'}
                </p>
                <label className="field">
                  <span>Template</span>
                  <select
                    aria-label="App template"
                    value={newAppTemplate}
                    onChange={(e) => setNewAppTemplate(e.target.value)}
                  >
                    <option value="starter">Starter app</option>
                    <option value="notes">Notes app · persistent records</option>
                    <option value="cloud-notes">Cloud notes · accounts, database, and UPI</option>
                  </select>
                </label>
                <label className="field">
                  <span>App name</span>
                  <input
                    aria-label="New app name"
                    value={newAppName}
                    onChange={(e) => setNewAppName(e.target.value)}
                    maxLength={80}
                  />
                </label>
                <button
                  className="primary full"
                  disabled={saving || !newAppName.trim() || !library.length}
                  onClick={() => {
                    const name = newAppName.trim();
                    const p = structuredClone(project);
                    p.profile = null;
                    p.touched = [];
                    p.graph = {
                      schemaVersion: '0',
                      app: {
                        name,
                        slug:
                          name
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-+|-+$/g, '')
                            .replace(/^[^a-z]+/, '') || 'my-app',
                        version: '1.0.0',
                        theme: {
                          primaryColor: '#345E4F',
                          backgroundColor: '#F8F9F5',
                          textColor: '#26372F',
                        },
                      },
                      screens: [
                        {
                          id: 'welcome',
                          title: 'Welcome',
                          block: 'hero',
                          blocks: ['hero', 'intro'],
                        },
                        {
                          id: 'next',
                          title: 'Next chapter',
                          block: 'story',
                          blocks: ['story', 'back'],
                        },
                      ],
                      blocks: [
                        {
                          id: 'hero',
                          type: 'content.hero@1.0.0',
                          config: {
                            ...library.find((b) => b.id === 'content.hero@1.0.0')!.defaultConfig,
                            title: name + '.',
                            ctaText: 'Explore the next chapter',
                          },
                        },
                        {
                          id: 'intro',
                          type: 'content.text@1.0.0',
                          config: {
                            title: 'Made for your next good idea.',
                            body: 'Select a block to make it your own. Add more pages, connect their events, and bring your idea to life.',
                          },
                        },
                        {
                          id: 'story',
                          type: 'content.text@1.0.0',
                          config: {
                            title: 'Your next chapter.',
                            body: 'Every app starts with a small step. This page is yours to shape.',
                          },
                        },
                        {
                          id: 'back',
                          type: 'action.button@1.0.0',
                          config: { ctaText: 'Back to the beginning' },
                        },
                      ],
                      wires: [
                        {
                          from: { instance: 'hero', event: 'action.pressed' },
                          to: { screen: 'next' },
                        },
                        {
                          from: { instance: 'back', event: 'action.pressed' },
                          to: { screen: 'welcome' },
                        },
                      ],
                    };
                    if (newAppTemplate === 'notes' || newAppTemplate === 'cloud-notes') {
                      p.graph = structuredClone(
                        newAppTemplate === 'cloud-notes' ? cloudNotesGraph : notesGraph,
                      ) as BuilderProject['graph'];
                      p.graph.app.name = name;
                      p.graph.app.slug =
                        name
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-+|-+$/g, '')
                          .replace(/^[^a-z]+/, '') || 'notes-app';
                    }
                    void manageApp('create', p)
                      .then(() => {
                        setDialog(null);
                        if (newAppTemplate === 'cloud-notes') setPlatform('web');
                        openPage(newAppTemplate === 'starter' ? 'welcome' : 'notes');
                      })
                      .catch(() => {});
                  }}
                >
                  <Plus size={15} />{' '}
                  {newAppTemplate === 'cloud-notes'
                    ? 'Create cloud notes app'
                    : newAppTemplate === 'notes'
                      ? 'Create notes app'
                      : 'Create starter app'}
                </button>
                <p className="export-note">Your existing apps stay in your app library.</p>
              </div>
            )}
            {dialog === 'preview' && (
              <div className="preview-studio">
                <div className="preview-toolbar">
                  <select
                    aria-label="Preview page"
                    value={page?.id ?? project.graph.screens[0]?.id}
                    onChange={(e) => setPageId(e.target.value)}
                  >
                    {project.graph.screens.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  <div className="platform-switch">
                    <button
                      className={platform === 'web' ? 'selected' : ''}
                      onClick={() => setPlatform('web')}
                    >
                      <Monitor size={14} /> Desktop
                    </button>
                    <button
                      className={platform === 'mobile' ? 'selected' : ''}
                      onClick={() => setPlatform('mobile')}
                    >
                      <Smartphone size={14} /> Phone
                    </button>
                  </div>
                  <a
                    className="button"
                    href={
                      '/api/run?page=' +
                      encodeURIComponent(page?.id ?? project.graph.screens[0]!.id)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open app <ArrowUpRight size={14} />
                  </a>
                </div>
                <p className="preview-note">
                  {platform === 'mobile'
                    ? project.graph.app.cloud
                      ? 'Responsive phone preview · cloud apps currently export for web.'
                      : 'Responsive phone preview · native mobile source is available in Export.'
                    : 'Interactive web preview · your connections run here.'}
                </p>
                <div className={'preview-device ' + platform}>
                  <iframe
                    key={JSON.stringify(project.graph) + (page?.id ?? '') + platform}
                    title="Interactive app preview"
                    src={
                      '/api/run?page=' +
                      encodeURIComponent(page?.id ?? project.graph.screens[0]!.id)
                    }
                  />
                </div>
              </div>
            )}
            {dialog === 'export' && (
              <div className="export-panel">
                <span className="eyebrow">BUILT WITH BLOCK STUDIO</span>
                <h2>
                  Take your idea
                  <br />
                  into the world.
                </h2>
                <p>
                  Download a complete, editable codebase. Pick the platform you’re building for.
                </p>
                <button
                  className={'export-option ' + (platform === 'web' ? 'chosen' : '')}
                  onClick={() => setPlatform('web')}
                >
                  <Globe2 size={24} />
                  <div>
                    <strong>Web application</strong>
                    <small>React + Vite · responsive · deploy anywhere</small>
                  </div>
                  {platform === 'web' && <Check size={16} />}
                </button>
                <button
                  className={'export-option ' + (platform === 'mobile' ? 'chosen' : '')}
                  disabled={!!project.graph.app.cloud}
                  onClick={() => setPlatform('mobile')}
                >
                  <Smartphone size={24} />
                  <div>
                    <strong>Mobile application</strong>
                    <small>
                      {project.graph.app.cloud
                        ? 'Cloud account integration currently supports web export'
                        : 'Expo + React Native · iOS and Android'}
                    </small>
                  </div>
                  {platform === 'mobile' && <Check size={16} />}
                </button>
                <button
                  className="primary full"
                  disabled={exporting}
                  onClick={() => void exportProject()}
                >
                  {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                  {exporting
                    ? 'Preparing your code…'
                    : 'Download ' +
                      (project.graph.app.cloud || platform === 'web' ? 'web' : 'mobile') +
                      ' app'}
                </button>
                <p className="export-note">
                  {project.graph.app.cloud
                    ? 'Includes the real backend, database migration, environment template, and hosting instructions. Personal UPI payments require owner receipt verification.'
                    : 'Auth and billing use demo services. Connect your providers in the exported code before launch.'}
                </p>
              </div>
            )}
            {dialog === 'profile' && (
              <ProfileWizard project={project} onChanged={() => void refresh()} />
            )}
            {dialog === 'agent' && (
              <AgentView project={project} blockId={blockId} onChanged={() => void refresh()} />
            )}
            {dialog === 'cards' && <CardsView />}
            {dialog === 'developer' && (
              <div className="developer-panel">
                <section className="developer-intro">
                  <Globe2 size={25} />
                  <div>
                    <h2>Cloud services</h2>
                    <p>
                      Connect a Supabase app backend. Keep provider keys in the exported server
                      environment; this graph stores only its public URL. Real accounts and payments
                      run through that server.
                    </p>
                    <label className="field">
                      <span>Backend URL</span>
                      <input
                        aria-label="Cloud backend URL"
                        value={cloudUrl}
                        onChange={(e) => setCloudUrl(e.target.value)}
                        placeholder="https://your-app.example.com"
                      />
                    </label>
                    <button
                      disabled={saving}
                      onClick={() => {
                        let url: URL;
                        try {
                          url = new URL(cloudUrl.trim());
                          if (
                            url.origin !== cloudUrl.trim() ||
                            (url.protocol !== 'https:' &&
                              !(
                                url.protocol === 'http:' &&
                                ['127.0.0.1', 'localhost'].includes(url.hostname)
                              ))
                          )
                            throw new Error();
                        } catch {
                          setNotice(
                            'Use an HTTPS origin or a loopback development origin, without a path.',
                          );
                          return;
                        }
                        void edit((p) => {
                          p.graph.app.cloud = { provider: 'supabase', backendUrl: url.origin };
                        })
                          .then(() =>
                            setNotice(
                              'Cloud backend saved. Export the web app to configure its server and database.',
                            ),
                          )
                          .catch(() => {});
                      }}
                    >
                      {project.graph.app.cloud ? 'Save cloud connection' : 'Enable cloud services'}
                    </button>
                    <p>
                      {project.graph.app.cloud
                        ? 'Cloud enabled · web target · confirmed email/Google accounts · server-enforced plans. Canvas thumbnails use temporary data; the connected app uses your cloud account.'
                        : 'Enable cloud services before adding real account, onboarding, or payment blocks.'}
                    </p>
                  </div>
                </section>
                <div className="developer-intro">
                  <Code2 size={25} />
                  <div>
                    <h2>Start simple. Go beyond.</h2>
                    <p>
                      Your project is an open graph. Edit its contracts, bring your own blocks, and
                      extend the exported source.
                    </p>
                  </div>
                </div>
                <div className="developer-actions">
                  <button
                    onClick={() =>
                      download(
                        new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
                        project.graph.app.slug + '.blockfw.json',
                      )
                    }
                  >
                    <Download size={14} /> Save project file
                  </button>
                  <button onClick={() => fileInput.current?.click()}>
                    <Upload size={14} /> Import project
                  </button>
                  <button onClick={() => setDialog('cards')}>
                    <Layers size={14} /> Block contracts
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".json"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setJsonDraft(await file.text());
                      } catch (err) {
                        setNotice(String(err));
                      }
                    }}
                  />
                </div>
                <label className="field">
                  <span>Project contract · JSON</span>
                  <textarea
                    className="code-editor"
                    aria-label="Project JSON"
                    spellCheck={false}
                    value={jsonDraft}
                    onChange={(e) => setJsonDraft(e.target.value)}
                  />
                </label>
                <div className="developer-actions">
                  <button
                    className="primary"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(jsonDraft) as BuilderProject;
                        void edit((p) => {
                          if (!parsed.graph)
                            throw new Error(
                              'Import a builder project with version, graph, profile, and touched fields.',
                            );
                          Object.assign(p, parsed);
                        })
                          .then(() => {
                            setNotice('Project validated and applied.');
                            setPageId(null);
                            setBlockId(null);
                          })
                          .catch(() => {});
                      } catch (e) {
                        setNotice(String(e));
                      }
                    }}
                  >
                    <Check size={14} /> Validate & apply
                  </button>
                  {page && (
                    <button
                      className="danger"
                      disabled={project.graph.screens.length < 2}
                      onClick={() => {
                        void edit((p) => {
                          const ids = pageIds(page);
                          p.graph.screens = p.graph.screens.filter((s) => s.id !== page.id);
                          for (const b of p.graph.blocks)
                            for (const [key, action] of Object.entries(b.design?.actions ?? {})) {
                              if (action.type === 'navigate' && action.screen === page.id)
                                b.design!.actions![key] = { type: 'none' };
                            }
                          p.graph.blocks = p.graph.blocks.filter((b) => !ids.includes(b.id));
                          p.graph.wires = p.graph.wires?.filter(
                            (w) => w.to.screen !== page.id && !ids.includes(w.from.instance),
                          );
                        })
                          .then(() => {
                            setPageId(null);
                            setBlockId(null);
                            setDialog(null);
                          })
                          .catch(() => {});
                      }}
                    >
                      <Trash2 size={14} /> Delete current page
                    </button>
                  )}
                </div>
                <p className="muted">
                  A page’s blocks array defines rendering order. Node positions define the editor
                  canvas. Explicit event wires override automatic routing. Exported source can be
                  extended with APIs, custom logic, and integrations.
                </p>
              </div>
            )}
          </Suspense>
        </Modal>
      )}
    </div>
  );
}
