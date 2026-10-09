import { useEffect, useState } from 'react';
import { Blocks, Monitor, Smartphone, Workflow } from 'lucide-react';
import type { BuilderProject } from '../api';

type Screen = BuilderProject['graph']['screens'][number];
type Layout = 'stack' | 'grid' | 'split';

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
    <label className="switch-label" title="Show this page in the app's menu">
      <input
        type="checkbox"
        className="switch"
        aria-label="Show page in app navigation"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          const next = e.currentTarget.checked;
          setChecked(next);
          void onChange(next).catch(() => setChecked(value));
        }}
      />
      <span>In navigation</span>
    </label>
  );
}

export function CanvasBar({
  page,
  pages,
  connections,
  libraryOpen,
  saving,
  platform,
  onLibrary,
  onRename,
  onLayout,
  onNavigation,
  onPlatform,
}: {
  page: Screen | undefined;
  pages: number;
  connections: number;
  libraryOpen: boolean;
  saving: boolean;
  platform: 'web' | 'mobile';
  onLibrary: () => void;
  onRename: (title: string) => void;
  onLayout: (layout: Layout) => void;
  onNavigation: (visible: boolean) => Promise<void>;
  onPlatform: (platform: 'web' | 'mobile') => void;
}) {
  return (
    <div className="canvas-bar">
      <div className="canvas-bar-group">
        {page ? (
          <>
            <button
              className={'toggle ' + (libraryOpen ? 'pressed' : '')}
              aria-pressed={libraryOpen}
              onClick={onLibrary}
            >
              <Blocks size={14} /> Blocks
            </button>
            <span className="bar-divider" />
            <input
              aria-label="Page title"
              className="title-input"
              key={page.id + page.title}
              defaultValue={page.title}
              onBlur={(e) => {
                const value = e.currentTarget.value.trim();
                if (value && value !== page.title) onRename(value);
                else e.currentTarget.value = page.title;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  e.currentTarget.value = page.title;
                  e.currentTarget.blur();
                }
              }}
            />
            <select
              aria-label="Page layout"
              className="bar-select"
              title="Page layout"
              value={page.layout ?? 'stack'}
              onChange={(e) => onLayout(e.currentTarget.value as Layout)}
            >
              <option value="stack">Stack</option>
              <option value="grid">Grid</option>
              <option value="split">Split</option>
            </select>
            <NavigationToggle
              key={page.id}
              value={page.navigation !== false}
              disabled={saving}
              onChange={onNavigation}
            />
          </>
        ) : (
          <span className="bar-title">
            <Workflow size={14} />
            <strong>Page flow</strong>
            <span className="muted">
              {pages} pages · {connections} connections
            </span>
          </span>
        )}
      </div>
      <div className="canvas-bar-group segmented" role="group" aria-label="Preview platform">
        <button
          className={platform === 'web' ? 'selected' : ''}
          aria-pressed={platform === 'web'}
          onClick={() => onPlatform('web')}
        >
          <Monitor size={14} /> Web
        </button>
        <button
          className={platform === 'mobile' ? 'selected' : ''}
          aria-pressed={platform === 'mobile'}
          onClick={() => onPlatform('mobile')}
        >
          <Smartphone size={14} /> Mobile
        </button>
      </div>
    </div>
  );
}
