import { EyeOff, Flag, LayoutGrid, Plus, Workflow } from 'lucide-react';
import type { BuilderProject } from '../api';
import { blockMeta, instanceName } from '../catalog';
import { pageIds } from '../graph';

interface Props {
  project: BuilderProject;
  pageId: string | null;
  blockId: string | null;
  canAddPage: boolean;
  onFlow: () => void;
  onOpenPage: (id: string) => void;
  onSelectBlock: (id: string) => void;
  onAddPage: () => void;
}

export function Navigator({
  project,
  pageId,
  blockId,
  canAddPage,
  onFlow,
  onOpenPage,
  onSelectBlock,
  onAddPage,
}: Props) {
  const screens = project.graph.screens;
  const page = screens.find((s) => s.id === pageId);
  return (
    <aside className="navigator" aria-label="Pages and layers">
      <div className="panel-section">
        <div className="panel-heading">
          <span>Pages</span>
          <span className="count">{screens.length}</span>
          <button
            className="icon-button small"
            aria-label="Add page"
            onClick={onAddPage}
            disabled={!canAddPage}
          >
            <Plus size={15} />
          </button>
        </div>
        <button className={'nav-row ' + (!page ? 'active' : '')} onClick={onFlow}>
          <Workflow size={15} />
          <span className="nav-row-title">Page flow</span>
        </button>
        <nav className="page-list" aria-label="Pages">
          {screens.map((s, i) => (
            <button
              key={s.id}
              className={'nav-row page-row ' + (page?.id === s.id ? 'active' : '')}
              onClick={() => onOpenPage(s.id)}
            >
              <span className="page-number">{String(i + 1).padStart(2, '0')}</span>{' '}
              <span className="nav-row-title">{s.title}</span>
              <span className="row-badges" aria-hidden="true">
                {i === 0 && (
                  <span title="Entry page">
                    <Flag size={12} />
                  </span>
                )}
                {s.lane === 'tabs' && (
                  <span title="Tab navigation">
                    <LayoutGrid size={12} />
                  </span>
                )}
                {s.navigation === false && (
                  <span title="Hidden from app navigation">
                    <EyeOff size={12} />
                  </span>
                )}
              </span>
            </button>
          ))}
        </nav>
        <button className="add-row" onClick={onAddPage} disabled={!canAddPage}>
          <Plus size={14} /> New page
        </button>
      </div>
      {page && (
        <div className="panel-section layers">
          <div className="panel-heading">
            <span>Layers</span>
            <span className="count">{pageIds(page).length}</span>
          </div>
          <p className="panel-note">Top to bottom, as rendered on the page.</p>
          {pageIds(page).map((id, i) => {
            const block = project.graph.blocks.find((b) => b.id === id);
            if (!block) return null;
            const meta = blockMeta(block.type);
            const Icon = meta.icon;
            const name = instanceName(block.type, block.variant);
            return (
              <button
                key={id}
                className={'nav-row layer-row ' + (blockId === id ? 'active' : '')}
                aria-label={'Select block ' + name}
                onClick={() => onSelectBlock(id)}
              >
                <span className="layer-index">{i + 1}</span>
                <span className={'cat-tile cat-' + meta.category}>
                  <Icon size={13} />
                </span>
                <span className="nav-row-title">{name}</span>
                <span className="row-meta">{block.variant ?? ''}</span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
