import { useCallback, useEffect, useState } from 'react';
import { api, type WiringReport } from './api';
import { useProject } from './useProject';
import { Canvas } from './Canvas';
import { ScreenDetail } from './ScreenDetail';
import { WiringView } from './WiringView';
import { ProfileWizard } from './ProfileWizard';
import { CardsView } from './CardsView';
import { AgentView } from './AgentView';
import './styles.css';

type Tab = 'canvas' | 'wiring' | 'profile' | 'cards' | 'agent';

export function App() {
  const { project, error, refresh: baseRefresh } = useProject();
  const [tab, setTab] = useState<Tab>('canvas');
  const [selectedScreen, setSelectedScreen] = useState<string | null>(null);
  const [wiring, setWiring] = useState<WiringReport | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [agentUsage, setAgentUsage] = useState({ calls: 0, inputTokens: 0, outputTokens: 0 });
  // Bumps whenever the project changes so preview iframes reload (the
  // preview cache is keyed by project hash, so new hashes re-render).
  const [previewBust, setPreviewBust] = useState('0');

  const refresh = useCallback(async () => {
    setPreviewBust((b) => String(Number(b) + 1));
    await baseRefresh();
  }, [baseRefresh]);

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
    if (project) {
      void compile();
      api
        .agentUsage()
        .then((u) => setAgentUsage(u.total))
        .catch(() => {});
    }
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
          {(['canvas', 'wiring', 'profile', 'cards', 'agent'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'canvas'
                ? 'Canvas'
                : t === 'wiring'
                  ? 'Wiring'
                  : t === 'profile'
                    ? 'Profile'
                    : t === 'cards'
                      ? 'Block cards'
                      : '✨ Agent'}
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
            previewBust={previewBust}
          />
        )}
        {tab === 'wiring' && <WiringView project={project} wiring={wiring} onChanged={refresh} />}
        {tab === 'profile' && <ProfileWizard project={project} onChanged={refresh} />}
        {tab === 'cards' && <CardsView />}
        {tab === 'agent' && <AgentView onChanged={refresh} />}
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
        <span className="zero-ai">
          {agentUsage.calls === 0
            ? 'zero AI calls'
            : `${agentUsage.calls} agent call${agentUsage.calls === 1 ? '' : 's'} · ${agentUsage.inputTokens + agentUsage.outputTokens} tokens`}
        </span>
      </footer>
    </div>
  );
}
