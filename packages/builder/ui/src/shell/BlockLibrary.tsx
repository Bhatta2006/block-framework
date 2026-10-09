import { useMemo, useState } from 'react';
import { ArrowUpRight, Cloud, FlaskConical, Plus, Search, X } from 'lucide-react';
import type { BlockSummary } from '../api';
import { blockMeta, groupOrder, runtimeLabel } from '../catalog';

interface Props {
  library: BlockSummary[];
  onAdd: (info: BlockSummary) => void;
  onClose: () => void;
  onContracts: () => void;
}

export function BlockLibrary({ library, onAdd, onClose, onContracts }: Props) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = library.filter((b) => {
      const m = blockMeta(b.id);
      return (
        !q ||
        (m.name + ' ' + m.description + ' ' + b.id + ' ' + b.category + ' ' + m.group)
          .toLowerCase()
          .includes(q)
      );
    });
    const byGroup = new Map<string, BlockSummary[]>();
    for (const b of matches) {
      const group = blockMeta(b.id).group;
      byGroup.set(group, [...(byGroup.get(group) ?? []), b]);
    }
    return [...byGroup.entries()].sort(
      ([a], [b]) => (groupOrder.indexOf(a) + 1 || 99) - (groupOrder.indexOf(b) + 1 || 99),
    );
  }, [library, query]);
  return (
    <aside className="library" aria-label="Block library">
      <div className="panel-heading library-heading">
        <span>Add blocks</span>
        <span className="count">{library.length}</span>
        <button className="icon-button small" aria-label="Close block library" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <label className="search-box">
        <Search size={14} />
        <input
          aria-label="Search blocks"
          placeholder="Search by name or outcome…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="library-scroll">
        {groups.map(([group, items]) => (
          <section key={group} className="library-group">
            <h4>{group}</h4>
            {items.map((info) => {
              const meta = blockMeta(info.id);
              const Icon = meta.icon;
              return (
                <button
                  key={info.id}
                  className="library-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/blockfw', info.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onAdd(info)}
                  aria-label={'Add ' + meta.name}
                  title={runtimeLabel[meta.runtime] + ' · drag onto the canvas or click to add'}
                >
                  <span className={'cat-tile large cat-' + meta.category}>
                    <Icon size={16} />
                  </span>
                  <span className="library-text">
                    <strong>
                      {meta.name}
                      {meta.runtime === 'demo' && (
                        <span className="runtime-tag demo">
                          <FlaskConical size={10} /> Demo
                        </span>
                      )}
                      {meta.runtime === 'cloud' && (
                        <span className="runtime-tag cloud">
                          <Cloud size={10} /> Cloud
                        </span>
                      )}
                    </strong>
                    <small>{meta.description}</small>
                  </span>
                  <Plus size={14} className="library-plus" />
                </button>
              );
            })}
          </section>
        ))}
        {groups.length === 0 && (
          <p className="empty-note">
            No blocks match “{query}”. Try “content”, “data”, or “sign in”.
          </p>
        )}
      </div>
      <button className="library-footer" onClick={onContracts}>
        Explore block contracts <ArrowUpRight size={13} />
      </button>
    </aside>
  );
}
