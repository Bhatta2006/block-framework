import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { CornerDownLeft, Search, Sparkles, type LucideIcon } from 'lucide-react';

export interface PaletteCommand {
  id: string;
  group: 'Navigate' | 'Pages' | 'Insert' | 'Actions' | 'Settings';
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  keywords?: string[];
  run: () => void;
}

const groups: PaletteCommand['group'][] = ['Actions', 'Navigate', 'Pages', 'Insert', 'Settings'];

/** ⌘K palette. Anything that is not a command falls through to the AI composer. */
export function CommandPalette({
  commands,
  onAsk,
  close,
}: {
  commands: PaletteCommand[];
  onAsk: (instruction: string) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [close]);
  const run = (fn: () => void) => {
    close();
    fn();
  };
  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <Command className="palette" label="Command palette" loop>
        <div className="palette-input">
          <Search size={16} />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search pages, blocks, and actions — or ask AI…"
          />
          <span className="kbd">Esc</span>
        </div>
        <Command.List className="palette-list">
          <Command.Empty className="palette-empty">No matching commands.</Command.Empty>
          {groups.map((group) => {
            const items = commands.filter((c) => c.group === group);
            if (!items.length) return null;
            return (
              <Command.Group key={group} heading={group}>
                {items.map((c) => {
                  const Icon = c.icon;
                  return (
                    <Command.Item
                      key={c.id}
                      value={c.group + ' ' + c.label}
                      keywords={c.keywords}
                      onSelect={() => run(c.run)}
                    >
                      <Icon size={15} />
                      <span>{c.label}</span>
                      {c.shortcut && <span className="palette-shortcut">{c.shortcut}</span>}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            );
          })}
          {query.trim() && (
            <Command.Group heading="Ask AI" forceMount>
              <Command.Item
                forceMount
                value={'ask-ai ' + query}
                onSelect={() => run(() => onAsk(query.trim()))}
              >
                <Sparkles size={15} />
                <span>
                  Ask AI: <b>{query.trim()}</b>
                </span>
                <span className="palette-shortcut">
                  <CornerDownLeft size={12} />
                </span>
              </Command.Item>
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
