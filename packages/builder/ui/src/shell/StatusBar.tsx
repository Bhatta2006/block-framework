import { AlertTriangle, CheckCircle2, Command } from 'lucide-react';
import type { WiringReport } from '../api';
import { modKey } from './hooks';

/** Problems the author can act on, derived from the compiler's wiring report. */
export function problemCount(wiring: WiringReport | null) {
  if (!wiring) return 0;
  return (
    wiring.unmet.length +
    wiring.ambiguous.length +
    wiring.unmetRequirements.length +
    wiring.flow.unreachable.length
  );
}

export function StatusBar({
  pages,
  blocks,
  wiring,
  onProblems,
  onPalette,
}: {
  pages: number;
  blocks: number;
  wiring: WiringReport | null;
  onProblems: () => void;
  onPalette: () => void;
}) {
  const problems = problemCount(wiring);
  return (
    <footer className="statusbar">
      <span className="status-group">
        <span className="dot" aria-hidden="true" />
        <span>
          {pages} pages <i>·</i> {blocks} blocks <i>·</i> {wiring?.resolved.length ?? 0} connections
        </span>
      </span>
      <button className={'status-button ' + (problems ? 'warn' : '')} onClick={onProblems}>
        {problems ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
        {problems ? problems + (problems === 1 ? ' problem' : ' problems') : 'No problems'}
      </button>
      <span className="status-group status-right">
        <span className="status-free">Editing is free · no AI credits used</span>
        <button className="status-button" onClick={onPalette}>
          <Command size={11} /> {modKey} K
        </button>
      </span>
    </footer>
  );
}
