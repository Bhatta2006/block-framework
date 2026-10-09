import { useState } from 'react';
import { Check, Cloud, FileStack, Layers, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import type { AppCatalog } from '../api';
import { templates, type TemplateId } from '../templates';

export function AppLibrary({
  catalog,
  saving,
  onOpen,
  onDelete,
  onRestore,
  onCreate,
}: {
  catalog: AppCatalog | null;
  saving: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onCreate: () => void;
}) {
  const active = catalog?.apps.filter((a) => !a.deleted) ?? [];
  const deleted = catalog?.apps.filter((a) => a.deleted) ?? [];
  return (
    <div className="app-library">
      <p className="muted">Each app keeps its own pages, blocks, brand, and saved history.</p>
      <div className="app-list">
        {active.map((a) => (
          <div className={'app-row ' + (a.id === catalog?.activeId ? 'current' : '')} key={a.id}>
            <button disabled={saving} className="app-open" onClick={() => onOpen(a.id)}>
              <span className="app-avatar large">{a.name[0]}</span> <strong>{a.name}</strong>
              {a.id === catalog?.activeId && (
                <span className="chip accent" aria-hidden="true">
                  <Check size={11} /> Open
                </span>
              )}
            </button>
            <button
              aria-label={'Delete app ' + a.name}
              className="icon-button danger"
              disabled={saving || active.length < 2}
              title={active.length < 2 ? 'Keep at least one app' : 'Move to Recently deleted'}
              onClick={() => onDelete(a.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button className="primary full" disabled={saving} onClick={onCreate}>
        <Plus size={16} /> Create app
      </button>
      {deleted.length > 0 && (
        <>
          <h3>Recently deleted</h3>
          <div className="app-list">
            {deleted.map((a) => (
              <div className="app-row deleted" key={a.id}>
                <span className="app-avatar large">{a.name[0]}</span>
                <span className="app-deleted-name">{a.name}</span>
                <button disabled={saving} onClick={() => onRestore(a.id)}>
                  <RotateCcw size={14} /> Restore app
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const templateIcon = { starter: Sparkles, notes: FileStack, 'cloud-notes': Cloud } as const;

export function NewAppDialog({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (template: TemplateId, name: string) => void;
}) {
  const [template, setTemplate] = useState<TemplateId>('starter');
  const [name, setName] = useState('My first app');
  const chosen = templates.find((t) => t.id === template)!;
  return (
    <form
      className="new-app"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(template, name.trim());
      }}
    >
      <div className="new-app-intro">
        <h2>Start from a working app</h2>
        <p className="muted">
          Every template is a real, connected graph. Change anything; export the source at any time.
        </p>
      </div>
      <div className="template-grid" role="radiogroup" aria-label="App template">
        {templates.map((t) => {
          const Icon = templateIcon[t.id];
          return (
            <label key={t.id} className={'template-card ' + (template === t.id ? 'chosen' : '')}>
              <input
                type="radio"
                name="template"
                value={t.id}
                checked={template === t.id}
                onChange={() => setTemplate(t.id)}
                className="template-radio"
              />
              <span className="template-title">{t.title}</span>
              <span className="template-art" aria-hidden="true">
                <Icon size={22} />
                <span className="template-pages">
                  {Array.from({ length: Math.min(t.pages, 5) }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
              </span>
              <span className="template-summary">{t.summary}</span>
              <span className="template-meta">
                <span>
                  <Layers size={11} /> {t.pages} pages
                </span>
                <span>{t.targets}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="template-detail">
        {chosen.detail} <span className="chip">{chosen.services}</span>
      </p>
      <label className="field">
        <span>App name</span>
        <input
          aria-label="New app name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      </label>
      <button className="primary full large" type="submit" disabled={disabled || !name.trim()}>
        <Plus size={15} />
        {template === 'cloud-notes'
          ? 'Create cloud notes app'
          : template === 'notes'
            ? 'Create notes app'
            : 'Create starter app'}
      </button>
      <p className="muted center">Your existing apps stay in your app library.</p>
    </form>
  );
}
