import { useCallback, useEffect, useState } from 'react';
import { api, type WiringReport } from './api';
import { useProject } from './useProject';
import { Canvas } from './Canvas';
import { ScreenDetail } from './ScreenDetail';
import { WiringView } from './WiringView';
import { ProfileWizard } from './ProfileWizard';
import { CardsView } from './CardsView';
import './styles.css';

type Tab = 'canvas' | 'wiring' | 'profile' | 'cards';

export function App() {
  const { project, error, refresh } = useProject();
  const [tab, setTab] = useState<Tab>('canvas');
  const [selectedScreen, setSelectedScreen] = useState<string | null>(null);
  const [wiring, setWiring] = useState<WiringReport | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);

  const compile = useCallback(async () => {
    setCompiling(true);
    try {
      const res = await api.compile();
      setWiring(res.wiring);
      setHash(res.projectHash);
    } catch (e) {
      console.error(e);
    } finally {
      setCompiling(false);
    }
  }, []);

  useEffect(() => {
    if (project) void compile();
  }, [project, compile]);

  if (error) return <div className="app error">Failed to load project: {error}</div>;
  if (!project) return <div className="app">Loading…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>▦ Block Framework</strong>
          <span className="app-name">{project.graph.app.name}</span>
        </div>
        <nav className="tabs">
          {(['canvas', 'wiring', 'profile', 'cards'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'canvas'
                ? 'Canvas'
                : t === 'wiring'
                  ? 'Wiring'
                  : t === 'profile'
                    ? 'Profile'
                    : 'Block cards'}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          {hash && (
            <code className="hash" title="Deterministic project hash">
              {hash.slice(0, 12)}…
            </code>
          )}
          <button onClick={() => void compile()} disabled={compiling}>
            {compiling ? 'Compiling…' : '⟳ Compile'}
          </button>
        </div>
      </header>

      <main className="main">
        {tab === 'canvas' && (
          <Canvas
            project={project}
            selectedScreen={selectedScreen}
            onSelect={setSelectedScreen}
            onChanged={refresh}
          />
        )}
        {tab === 'wiring' && <WiringView project={project} wiring={wiring} onChanged={refresh} />}
        {tab === 'profile' && <ProfileWizard project={project} onChanged={refresh} />}
        {tab === 'cards' && <CardsView />}
      </main>

      {selectedScreen && tab === 'canvas' && (
        <ScreenDetail
          project={project}
          screenId={selectedScreen}
          onClose={() => setSelectedScreen(null)}
          onChanged={refresh}
        />
      )}

      <footer className="statusbar">
        <span>
          {project.graph.screens.length} screens · {project.graph.blocks.length} blocks
        </span>
        <span>
          {wiring
            ? `${wiring.resolved.length} wires · ${wiring.warnings.length} warnings`
            : 'not compiled yet'}
        </span>
        <span className="zero-ai">zero AI calls</span>
      </footer>
    </div>
  );
}
