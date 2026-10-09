import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { api, type BlockSummary, type BuilderProject, type WiringReport } from './api';
import { useProject } from './useProject';
import { FlowCanvas } from './FlowCanvas';
import { pageIds } from './graph';
import { blockMeta, instanceName } from './catalog';
import { createFromTemplate, templates, type TemplateId } from './templates';
import { TopBar, BrandMark, type Mode } from './shell/TopBar';
import { Rail } from './shell/Rail';
import { Navigator } from './shell/Navigator';
import { BlockLibrary } from './shell/BlockLibrary';
import { CanvasBar } from './shell/CanvasBar';
import { StatusBar } from './shell/StatusBar';
import { ComposerPill, AIPanel } from './shell/Composer';
import { buildCommands } from './shell/commands';
import { ShortcutSheet } from './shell/ShortcutSheet';
import { Modal } from './shell/Modal';
import { isTyping, useTheme, useToasts } from './shell/hooks';
import { AppLibrary, NewAppDialog } from './dialogs/AppDialogs';
import { PreviewDialog } from './dialogs/PreviewDialog';
import { DeveloperDialog } from './dialogs/DeveloperDialog';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/canvas.css';
import './styles/panels.css';

const DesignEditor = lazy(() =>
  import('./DesignEditor').then((m) => ({ default: m.DesignEditor })),
);
const Inspector = lazy(() => import('./Inspector').then((m) => ({ default: m.Inspector })));
const ProfileWizard = lazy(() =>
  import('./ProfileWizard').then((m) => ({ default: m.ProfileWizard })),
);
const CardsView = lazy(() => import('./CardsView').then((m) => ({ default: m.CardsView })));
const CommandPalette = lazy(() =>
  import('./shell/CommandPalette').then((m) => ({ default: m.CommandPalette })),
);
const ShipView = lazy(() => import('./views/ShipView').then((m) => ({ default: m.ShipView })));

type Dialog =
  'design' | 'apps' | 'new' | 'preview' | 'profile' | 'developer' | 'cards' | 'shortcuts' | null;
const dialogTitles: Record<Exclude<Dialog, null>, string> = {
  design: 'Customize your block',
  apps: 'Your apps',
  new: 'Create an app',
  preview: 'Live preview',
  profile: 'Brand & app profile',
  developer: 'Developer tools',
  cards: 'Block contracts',
  shortcuts: 'Keyboard shortcuts',
};

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
  const theme = useTheme();
  const { toasts, push: notify, dismiss } = useToasts();
  const [library, setLibrary] = useState<BlockSummary[]>([]);
  const [wiring, setWiring] = useState<WiringReport | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [view, setView] = useState<'canvas' | 'ship'>('canvas');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [platform, setPlatform] = useState<'web' | 'mobile'>('web');
  const [navOpen, setNavOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [libOpen, setLibOpen] = useState(true);
  const [ai, setAI] = useState({ open: false, instruction: '' });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);

  const page = project?.graph.screens.find((s) => s.id === pageId);
  const mode: Mode = view === 'ship' ? 'ship' : page ? 'design' : 'flow';
  const closeDialog = useCallback(() => setDialog(null), []);
  const openPage = useCallback((id: string, block?: string) => {
    setView('canvas');
    setPageId(id);
    setBlockId(block ?? null);
    setDrawerOpen(false);
  }, []);
  const showFlow = useCallback(() => {
    setView('canvas');
    setPageId(null);
    setBlockId(null);
    setDrawerOpen(false);
  }, []);
  const openAI = useCallback((instruction = '') => {
    setDialog(null);
    setAI({ open: true, instruction });
  }, []);
  const switchMode = useCallback(
    (next: Mode) => {
      if (next === 'ship') return setView('ship');
      if (next === 'flow') return showFlow();
      setView('canvas');
      if (!page && project?.graph.screens[0]) openPage(project.graph.screens[0].id);
    },
    [page, project, showFlow, openPage],
  );

  useEffect(() => {
    api
      .getBlocks()
      .then(setLibrary)
      .catch((e) => notify(String(e), 'error'));
  }, [notify]);
  useEffect(() => {
    let active = true;
    if (project)
      api
        .compile('web')
        .then((r) => active && setWiring(r.wiring))
        .catch((e) => active && notify(String(e), 'error'));
    return () => {
      active = false;
    };
  }, [project, notify]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (dialog || paletteOpen) return;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        setDialog('preview');
        return;
      }
      if (isTyping(e.target)) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        travel(e.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (mod || e.altKey) return;
      if (e.shiftKey && e.code === 'Digit1') return setFitSignal((n) => n + 1);
      const actions: Record<string, () => void> = {
        '/': () => openAI(),
        '?': () => setDialog('shortcuts'),
        '[': () => setNavOpen((open) => !open),
        ']': () => page && setLibOpen((open) => !open),
        '.': () => setFocusMode((on) => !on),
        '1': () => switchMode('flow'),
        '2': () => switchMode('design'),
        '6': () => switchMode('ship'),
        Escape: () => {
          if (ai.open) setAI((a) => ({ ...a, open: false }));
          else if (focusMode) setFocusMode(false);
          else if (blockId) setBlockId(null);
        },
      };
      const run = actions[e.key];
      if (run) {
        if (e.key !== 'Escape') e.preventDefault();
        run();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [travel, dialog, paletteOpen, page, ai.open, focusMode, blockId, openAI, switchMode]);

  if (!project)
    return (
      <div className="loading-screen">
        <BrandMark size={40} />
        <h2>Opening your workspace</h2>
        <p className="muted">{error ?? 'Loading pages and block contracts…'}</p>
        {error && <button onClick={() => void refresh()}>Try again</button>}
      </div>
    );

  const manageApp = async (
    action: 'create' | 'activate' | 'delete' | 'restore',
    value: Parameters<typeof runAppAction>[1],
  ) => {
    await runAppAction(action, value);
    setPageId(null);
    setBlockId(null);
    setView('canvas');
    setAI({ open: false, instruction: '' });
    setDrawerOpen(false);
  };
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
      .then(() => {
        setBlockId(id);
        setAI((a) => ({ ...a, open: false }));
        notify(blockMeta(info.id).name + ' added to ' + page.title + '.', 'info', {
          label: 'Undo',
          run: () => travel('undo'),
        });
      })
      .catch(() => {});
  };
  const createApp = (template: TemplateId, name: string) => {
    void manageApp('create', createFromTemplate(project, template, name, library))
      .then(() => {
        setDialog(null);
        if (template === 'cloud-notes') setPlatform('web');
        openPage(templates.find((t) => t.id === template)!.entry);
      })
      .catch(() => {});
  };
  const editPage = (fn: (s: BuilderProject['graph']['screens'][number]) => void) =>
    edit((p) => fn(p.graph.screens.find((s) => s.id === page!.id)!));
  const selectedBlock = blockId ? project.graph.blocks.find((b) => b.id === blockId) : undefined;
  const aiContext = selectedBlock
    ? instanceName(selectedBlock.type, selectedBlock.variant)
    : 'Whole app';
  const showInspector = view === 'canvas' && page && blockId && !ai.open;

  const commands = buildCommands({
    project,
    library,
    pageOpen: Boolean(page),
    theme: theme.resolved,
    open: setDialog,
    mode: switchMode,
    openPage,
    addPage,
    addBlock,
    askAI: () => openAI(),
    travel,
    setTheme: theme.choose,
  });

  return (
    <div
      className={'studio' + (focusMode ? ' focus-mode' : '') + (drawerOpen ? ' drawer-open' : '')}
    >
      <TopBar
        appName={project.graph.app.name}
        appCount={catalog?.apps.filter((a) => !a.deleted).length ?? 1}
        mode={mode}
        hasPages={project.graph.screens.length > 0}
        saving={saving}
        error={Boolean(error)}
        history={historyState}
        onMode={switchMode}
        onSwitchApps={() => setDialog('apps')}
        onHome={showFlow}
        onUndo={() => travel('undo')}
        onRedo={() => travel('redo')}
        onPreview={() => setDialog('preview')}
        onExport={() => setView('ship')}
        onToggleNav={() => setDrawerOpen((open) => !open)}
      />
      <div className="studio-body">
        <div className="left-dock">
          <Rail
            navigatorOpen={navOpen}
            libraryOpen={libOpen}
            canAddBlocks={Boolean(page) && view === 'canvas'}
            aiOpen={ai.open}
            theme={theme.preference}
            onNavigator={() => setNavOpen((open) => !open)}
            onLibrary={() => setLibOpen((open) => !open)}
            onSearch={() => setPaletteOpen(true)}
            onAI={() => (ai.open ? setAI((a) => ({ ...a, open: false })) : openAI())}
            onNewApp={() => setDialog('new')}
            onProfile={() => setDialog('profile')}
            onDeveloper={() => setDialog('developer')}
            onShortcuts={() => setDialog('shortcuts')}
            onTheme={theme.choose}
          />
          {(navOpen || drawerOpen) && (
            <Navigator
              project={project}
              pageId={view === 'canvas' ? (page?.id ?? null) : null}
              blockId={blockId}
              canAddPage={library.length > 0}
              onFlow={showFlow}
              onOpenPage={openPage}
              onSelectBlock={(id) => {
                setBlockId(id);
                setAI((a) => ({ ...a, open: false }));
              }}
              onAddPage={addPage}
            />
          )}
        </div>
        {drawerOpen && <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} />}
        <main className="stage">
          <Suspense fallback={<div className="stage-loading">Loading…</div>}>
            {view === 'ship' ? (
              <ShipView
                project={project}
                wiring={wiring}
                platform={platform}
                setPlatform={setPlatform}
                onOpenPage={openPage}
                onDeveloper={() => setDialog('developer')}
                notify={notify}
              />
            ) : (
              <>
                {page && libOpen && (
                  <BlockLibrary
                    library={library}
                    onAdd={addBlock}
                    onClose={() => setLibOpen(false)}
                    onContracts={() => setDialog('cards')}
                  />
                )}
                <div className="canvas-wrap">
                  <CanvasBar
                    page={page}
                    pages={project.graph.screens.length}
                    connections={wiring?.resolved.length ?? 0}
                    libraryOpen={libOpen}
                    saving={saving}
                    platform={platform}
                    onLibrary={() => setLibOpen((open) => !open)}
                    onRename={(title) => void editPage((s) => (s.title = title)).catch(() => {})}
                    onLayout={(layout) => void editPage((s) => (s.layout = layout)).catch(() => {})}
                    onNavigation={(visible) => editPage((s) => (s.navigation = visible))}
                    onPlatform={setPlatform}
                  />
                  <FlowCanvas
                    project={project}
                    library={library}
                    wiring={wiring}
                    pageId={page?.id ?? null}
                    selectedBlock={blockId}
                    onOpen={openPage}
                    onSelectBlock={setBlockId}
                    onAddBlock={addBlock}
                    edit={(fn) => edit(fn).catch(() => {})}
                    platform={platform}
                    theme={theme.resolved}
                    fitSignal={fitSignal}
                  />
                  {!ai.open && <ComposerPill context={aiContext} onOpen={() => openAI()} />}
                </div>
              </>
            )}
            {ai.open && (
              <AIPanel
                project={project}
                blockId={blockId}
                instruction={ai.instruction}
                onChanged={() => void refresh()}
                onClose={() => setAI((a) => ({ ...a, open: false }))}
              />
            )}
            {showInspector && (
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
                askAI={() => openAI()}
              />
            )}
          </Suspense>
        </main>
      </div>
      <StatusBar
        pages={project.graph.screens.length}
        blocks={project.graph.blocks.length}
        wiring={wiring}
        onProblems={() => setView('ship')}
        onPalette={() => setPaletteOpen(true)}
      />
      <div className="toast-stack">
        {!dialog && error && (
          <div className="toast error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button className="icon-button" aria-label="Dismiss notification" onClick={clearError}>
              <X size={14} />
            </button>
          </div>
        )}
        {toasts.map((t) => (
          <div
            key={t.id}
            className={'toast ' + (t.tone === 'error' ? 'error' : '')}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            {t.tone === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                aria-label={t.action.label + ': ' + t.message}
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            commands={commands}
            onAsk={(text) => openAI(text)}
            close={() => setPaletteOpen(false)}
          />
        </Suspense>
      )}
      {dialog && (
        <Modal
          title={dialogTitles[dialog]}
          close={closeDialog}
          wide={!['new', 'apps', 'shortcuts'].includes(dialog)}
        >
          {error && (
            <p className="dialog-feedback error" role="alert">
              {error}
            </p>
          )}
          <Suspense fallback={<p className="muted">Loading…</p>}>
            {dialog === 'design' && blockId && (
              <DesignEditor
                project={project}
                blockId={blockId}
                edit={edit}
                askAI={() => openAI()}
              />
            )}
            {dialog === 'apps' && (
              <AppLibrary
                catalog={catalog}
                saving={saving}
                onOpen={(id) =>
                  void manageApp('activate', id)
                    .then(closeDialog)
                    .catch(() => {})
                }
                onDelete={(id) =>
                  void manageApp('delete', id)
                    .then(() => notify('App moved to Recently deleted.'))
                    .catch(() => {})
                }
                onRestore={(id) => void manageApp('restore', id).catch(() => {})}
                onCreate={() => setDialog('new')}
              />
            )}
            {dialog === 'new' && (
              <NewAppDialog disabled={saving || !library.length} onCreate={createApp} />
            )}
            {dialog === 'preview' && (
              <PreviewDialog
                project={project}
                pageId={page?.id ?? project.graph.screens[0]!.id}
                platform={platform}
                setPlatform={setPlatform}
                setPage={(id) => setPageId(id)}
              />
            )}
            {dialog === 'profile' && (
              <ProfileWizard project={project} onChanged={() => void refresh()} />
            )}
            {dialog === 'cards' && <CardsView />}
            {dialog === 'shortcuts' && <ShortcutSheet />}
            {dialog === 'developer' && (
              <DeveloperDialog
                project={project}
                pageId={page?.id ?? null}
                saving={saving}
                edit={edit}
                notify={notify}
                onApplied={showFlow}
                onPageDeleted={() => {
                  showFlow();
                  setDialog(null);
                }}
                onContracts={() => setDialog('cards')}
              />
            )}
          </Suspense>
        </Modal>
      )}
    </div>
  );
}
