import { lazy, Suspense } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { BuilderProject } from '../api';

const AgentView = lazy(() => import('../AgentView').then((m) => ({ default: m.AgentView })));

/** Floating entry point. It names what the AI will act on before anything runs. */
export function ComposerPill({ context, onOpen }: { context: string; onOpen: () => void }) {
  return (
    <button className="composer-pill" aria-label={'Ask AI about ' + context} onClick={onOpen}>
      <Sparkles size={15} className="composer-spark" />
      <span className="composer-placeholder">Ask Studio to change something…</span>
      <span className="chip">{context}</span>
      <kbd className="kbd">/</kbd>
    </button>
  );
}

/** Docked AI panel. It replaces the inspector so the canvas stays visible and interactive. */
export function AIPanel({
  project,
  blockId,
  instruction,
  onChanged,
  onClose,
}: {
  project: BuilderProject;
  blockId: string | null;
  instruction: string;
  onChanged: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="side-panel ai-panel" aria-label="AI assistant panel">
      <div className="side-panel-head">
        <span className="cat-tile cat-ai">
          <Sparkles size={14} />
        </span>
        <div>
          <strong>AI assistant</strong>
          <small className="plain">Plan · review · apply · undo</small>
        </div>
        <button className="icon-button" aria-label="Close AI panel" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="side-panel-body">
        <Suspense fallback={<p className="muted">Loading assistant…</p>}>
          <AgentView
            key={(blockId ?? 'all') + '|' + instruction}
            project={project}
            blockId={blockId}
            initialInstruction={instruction}
            onChanged={onChanged}
          />
        </Suspense>
      </div>
    </aside>
  );
}
