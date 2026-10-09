import {
  AlertCircle,
  Bot,
  Check,
  ChevronsUpDown,
  Database,
  GitBranch,
  Loader2,
  Menu,
  PenTool,
  Play,
  Redo2,
  Rocket,
  Undo2,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { modKey } from './hooks';

export type Mode = 'flow' | 'design' | 'ship';

const modes: Array<{
  id: Mode | 'data' | 'logic' | 'agents';
  label: string;
  icon: LucideIcon;
  key?: string;
  soon?: string;
}> = [
  { id: 'flow', label: 'Flow', icon: Workflow, key: '1' },
  { id: 'design', label: 'Design', icon: PenTool, key: '2' },
  { id: 'data', label: 'Data', icon: Database, soon: 'Visual data model arrives in Phase 2' },
  { id: 'logic', label: 'Logic', icon: GitBranch, soon: 'Flows and actions arrive in Phase 2' },
  { id: 'agents', label: 'Agents', icon: Bot, soon: 'In-app AI agents arrive in Phase 3' },
  { id: 'ship', label: 'Ship', icon: Rocket, key: '6' },
];

export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="bs-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9b87f5" />
          <stop offset="1" stopColor="#6544f5" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="11" height="11" rx="3" fill="url(#bs-mark)" />
      <rect x="11" y="11" width="11" height="11" rx="3" fill="url(#bs-mark)" opacity=".55" />
      <rect x="11" y="2" width="11" height="7" rx="2.5" fill="currentColor" opacity=".18" />
      <rect x="2" y="15" width="7" height="7" rx="2.5" fill="currentColor" opacity=".18" />
    </svg>
  );
}

interface Props {
  appName: string;
  appCount: number;
  mode: Mode;
  hasPages: boolean;
  saving: boolean;
  error: boolean;
  history: { undo: number; redo: number };
  onMode: (mode: Mode) => void;
  onSwitchApps: () => void;
  onHome: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPreview: () => void;
  onExport: () => void;
  onToggleNav: () => void;
}

export function TopBar(props: Props) {
  const { mode, saving, error, history } = props;
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-button mobile-only"
          aria-label="Toggle navigation"
          onClick={props.onToggleNav}
        >
          <Menu size={18} />
        </button>
        <button className="brand" aria-label="Block Studio home" onClick={props.onHome}>
          <BrandMark />
        </button>
        <button className="app-switch" aria-label="Switch apps" onClick={props.onSwitchApps}>
          <span className="app-avatar" aria-hidden="true">
            {props.appName[0]}
          </span>
          <span className="app-switch-text">
            <strong>{props.appName}</strong>
            <small>
              {props.appCount} app{props.appCount === 1 ? '' : 's'} · Local
            </small>
          </span>
          <ChevronsUpDown size={14} />
        </button>
      </div>
      <nav className="mode-switch" aria-label="Studio modes">
        {modes.map((m) => {
          const Icon = m.icon;
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              className={'mode ' + (active ? 'active' : '')}
              aria-pressed={m.soon ? undefined : active}
              aria-disabled={m.soon ? true : undefined}
              disabled={Boolean(m.soon) || (m.id === 'design' && !props.hasPages)}
              title={m.soon ?? m.label + (m.key ? ' · ' + m.key : '')}
              onClick={() => !m.soon && props.onMode(m.id as Mode)}
            >
              <Icon size={14} />
              <span>{m.label}</span>
              {m.soon && <em>Soon</em>}
            </button>
          );
        })}
      </nav>
      <div className="topbar-right">
        <span className={'save-state ' + (error ? 'error' : '')} aria-live="polite">
          {saving ? (
            <Loader2 size={13} className="spin" />
          ) : error ? (
            <AlertCircle size={13} />
          ) : (
            <Check size={13} />
          )}
          <span>{saving ? 'Saving…' : error ? 'Changes not saved' : 'All changes saved'}</span>
        </span>
        <div className="history-buttons">
          <button
            className="icon-button"
            aria-label="Undo"
            title={'Undo · ' + modKey + ' Z'}
            disabled={!history.undo || saving}
            onClick={props.onUndo}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Redo"
            title={'Redo · ' + modKey + ' Shift Z'}
            disabled={!history.redo || saving}
            onClick={props.onRedo}
          >
            <Redo2 size={16} />
          </button>
        </div>
        <button
          onClick={props.onPreview}
          disabled={saving}
          title={'Preview · ' + modKey + ' Enter'}
        >
          <Play size={13} fill="currentColor" /> Preview
        </button>
        <button className="primary" onClick={props.onExport} disabled={saving}>
          <Rocket size={14} /> Export app
        </button>
      </div>
    </header>
  );
}
