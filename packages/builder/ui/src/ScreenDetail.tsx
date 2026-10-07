import { useEffect, useState } from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { api, type BlockSummary, type BuilderProject } from './api';

interface Props {
  project: BuilderProject;
  screenId: string;
  onClose: () => void;
  onChanged: () => void;
}

interface BlockInfo extends BlockSummary {
  configSchema: Record<string, unknown>;
}

/**
 * Screen detail panel: variant switcher + auto-generated config form.
 * The form is generated from the block's manifest JSON Schema (RJSF) —
 * no hand-built forms. Every edit marks its cascade path as touched so
 * user edits win over derived values.
 */
export function ScreenDetail({ project, screenId, onClose, onChanged }: Props) {
  const [blocks, setBlocks] = useState<BlockInfo[]>([]);
  const screen = project.graph.screens.find((s) => s.id === screenId);
  const block = project.graph.blocks.find((b) => b.id === screen?.block);
  const [formData, setFormData] = useState<Record<string, unknown>>(block?.config ?? {});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    api.getBlocks().then(setBlocks).catch(console.error);
  }, []);

  // Reset the form when switching to a different screen (intentionally keyed on screenId only).
  useEffect(() => {
    setFormData(block?.config ?? {});
  }, [screenId]);

  if (!screen || !block) return null;
  const info = blocks.find((b) => b.id === block.type);

  const saveConfig = async (data: Record<string, unknown>) => {
    setSaveState('saving');
    const next = structuredClone(project);
    const nb = next.graph.blocks.find((b) => b.id === block.id);
    if (nb) nb.config = data;
    await api.saveProject(next);
    // Mark every top-level config key as touched.
    for (const key of Object.keys(data)) {
      await api.touch(`block:${block.id}.config.${key}`);
    }
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 1200);
    onChanged();
  };

  const setVariant = async (variant: string) => {
    const next = structuredClone(project);
    const nb = next.graph.blocks.find((b) => b.id === block.id);
    if (nb) nb.variant = variant;
    await api.saveProject(next);
    await api.touch(`block:${block.id}.variant`);
    onChanged();
  };

  const setLane = async (lane: string) => {
    const next = structuredClone(project);
    const ns = next.graph.screens.find((s) => s.id === screen.id);
    if (ns) {
      if (lane === 'main') delete ns.lane;
      else ns.lane = lane;
    }
    await api.saveProject(next);
    onChanged();
  };

  return (
    <aside className="detail-panel">
      <div className="detail-head">
        <div>
          <h2>{screen.title}</h2>
          <div className="detail-sub">
            {block.type} · instance {block.id}
          </div>
        </div>
        <button onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <label className="field">
        <span>Variant</span>
        <select
          value={block.variant ?? info?.defaultVariant ?? ''}
          onChange={(e) => void setVariant(e.target.value)}
        >
          {(info?.variants ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Lane</span>
        <select value={screen.lane ?? 'main'} onChange={(e) => void setLane(e.target.value)}>
          <option value="main">main (event flow)</option>
          <option value="tabs">tabs (tab bar)</option>
        </select>
      </label>

      <h3>Configuration</h3>
      {info ? (
        <Form
          schema={info.configSchema as never}
          validator={validator}
          formData={formData}
          onChange={(e) => setFormData((e.formData as Record<string, unknown>) ?? {})}
          onSubmit={(e) => void saveConfig((e.formData as Record<string, unknown>) ?? {})}
        >
          <button type="submit" className="primary" disabled={saveState === 'saving'}>
            {saveState === 'saved' ? 'Saved ✓' : saveState === 'saving' ? 'Saving…' : 'Save config'}
          </button>
        </Form>
      ) : (
        <p>Loading schema…</p>
      )}
      <p className="hint">
        Saving marks these fields as hand-edited — the Profile Cascade will not overwrite them.
      </p>
    </aside>
  );
}
