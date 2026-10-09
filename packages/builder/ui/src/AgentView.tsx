import { useCallback, useEffect, useState } from 'react';
import { api, type BuilderProject } from './api';
import { ChatGPTSettings } from './ChatGPTSettings';

interface Props {
  onChanged: () => void;
  project: BuilderProject;
  blockId: string | null;
  /** Prefilled request, e.g. from the command palette. */
  initialInstruction?: string;
}

interface PendingPlan {
  planId: string;
  rationale: string;
  diff: Array<{ path: string; before: unknown; after: unknown }>;
  warnings?: string[];
  usage: Array<{ inputTokens: number; outputTokens: number }>;
  provider: string;
  liveModel: boolean;
}

/**
 * Agent tab: plain-language instruction → scoped plan → human-reviewed diff
 * → apply → undo. The agent only edits fields inside each block's
 * editSurface; locked fields and hand-edited paths are never touched.
 * A "recorded" badge marks deterministic demo responses; a "live" badge
 * marks real model output.
 */
export function AgentView({ onChanged, project, blockId, initialInstruction = '' }: Props) {
  const [focus, setFocus] = useState(blockId ?? 'all');
  const [allowTouched, setAllowTouched] = useState(false);
  const [live, setLive] = useState(false);
  const [instruction, setInstruction] = useState(initialInstruction);
  const [pending, setPending] = useState<PendingPlan | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [undoDepth, setUndoDepth] = useState(0);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [totalUsage, setTotalUsage] = useState({ inputTokens: 0, outputTokens: 0, calls: 0 });

  const refreshUsage = useCallback(async () => {
    try {
      const u = await api.agentUsage();
      setTotalUsage(u.total);
      setLive(u.liveModel);
      setUndoDepth(u.undoDepth);
      setConnectionVersion((version) => version + 1);
    } catch {
      /* ignore */
    }
  }, []);
  const connectionChanged = useCallback(() => {
    setPending(null);
    void refreshUsage();
  }, [refreshUsage]);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  const plan = async () => {
    setBusy(true);
    setErrors([]);
    setPending(null);
    try {
      const res = await api.agentEdit(
        instruction,
        focus === 'all' ? undefined : [focus],
        allowTouched,
      );
      if (!res.ok || !res.planId || !res.plan) {
        setErrors(res.errors ?? ['Planning failed']);
        return;
      }
      setPending({
        planId: res.planId,
        rationale: res.plan.rationale,
        diff: res.diff ?? [],
        warnings: res.warnings,
        usage: res.usage ?? [],
        provider: res.provider,
        liveModel: res.liveModel,
      });
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
      void refreshUsage();
    }
  };

  const apply = async () => {
    if (!pending) return;
    setErrors([]);
    setBusy(true);
    try {
      const res = await api.agentApply(pending.planId);
      if (!res.ok) {
        setErrors(res.errors ?? ['Apply failed']);
        return;
      }
      setPending(null);
      setInstruction('');
      setUndoDepth((d) => d + 1);
      onChanged();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
      void refreshUsage();
    }
  };

  const undo = async () => {
    setErrors([]);
    setBusy(true);
    try {
      const res = await api.agentUndo();
      if (!res.ok) {
        setErrors(res.errors ?? ['Nothing to undo']);
        return;
      }
      setUndoDepth((d) => Math.max(0, d - 1));
      onChanged();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="agent-view">
      <label className="field">
        <span>Acts on</span>
        <select
          aria-label="AI edit scope"
          value={focus}
          onChange={(e) => {
            setFocus(e.target.value);
            setPending(null);
          }}
        >
          <option value="all">All blocks · common app changes</option>
          {project.graph.blocks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id} · {b.type.split('@')[0]}
            </option>
          ))}
        </select>
      </label>
      <div className="agent-form">
        <textarea
          aria-label="AI instruction"
          rows={3}
          placeholder='Describe a change, e.g. "make the welcome copy warmer"'
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && instruction.trim()) {
              e.preventDefault();
              void plan();
            }
          }}
          disabled={busy}
        />
        <div className="agent-form-actions">
          <button
            onClick={() => void undo()}
            disabled={busy || undoDepth === 0}
            title="Undo last agent edit"
          >
            Undo{undoDepth > 0 ? ` (${undoDepth})` : ''}
          </button>
          <button
            className="primary"
            onClick={() => void plan()}
            disabled={busy || !instruction.trim()}
          >
            {busy ? 'Planning…' : 'Plan edit'}
          </button>
        </div>
      </div>
      <p className="agent-cost">
        Nothing changes until you review and apply the plan. Customized fields stay protected unless
        you allow them below.
      </p>
      <label className="design-check">
        <input
          type="checkbox"
          checked={allowTouched}
          onChange={(e) => {
            setAllowTouched(e.target.checked);
            setPending(null);
          }}
        />{' '}
        Allow this request to update my previously customized fields
      </label>
      {!live && (
        <p className="dialog-feedback">
          Recorded demo mode. Free-form AI customization requires a configured live model. Manual
          design controls work without a model.
        </p>
      )}
      {errors.length > 0 && (
        <div className="warnings">
          {errors.map((e, i) => (
            <div key={i} className="warning error">
              {e}
            </div>
          ))}
        </div>
      )}

      {pending && (
        <div className="agent-plan">
          <div className="agent-plan-head">
            <span
              className={`provider-badge ${pending.liveModel ? 'live' : 'recorded'}`}
              title={
                pending.liveModel
                  ? 'Answered by a live model'
                  : 'Deterministic recorded demo response (no model call)'
              }
            >
              {pending.provider === 'chatgpt'
                ? '● ChatGPT plan'
                : pending.liveModel
                  ? '● live model'
                  : '◌ recorded demo'}
            </span>
            <span className="token-note">
              {pending.usage.reduce((a, u) => a + u.inputTokens + u.outputTokens, 0)} tokens this
              plan
            </span>
          </div>
          {pending.rationale && <p className="hint">{pending.rationale}</p>}
          {pending.warnings && pending.warnings.length > 0 && (
            <div className="warnings">
              {pending.warnings.map((w, i) => (
                <div key={i} className="warning">
                  Skipped: {w}
                </div>
              ))}
            </div>
          )}
          {pending.diff.length === 0 ? (
            <p className="hint">No editable fields match this instruction — nothing to change.</p>
          ) : (
            <ul className="diff-list">
              {pending.diff.map((d, i) => (
                <li key={i}>
                  <code>{d.path}</code>
                  <div className="diff-values">
                    <span className="diff-before">{JSON.stringify(d.before)}</span>
                    <span className="diff-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="diff-after">{JSON.stringify(d.after)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="agent-actions">
            <button
              className="primary"
              onClick={() => void apply()}
              disabled={busy || pending.diff.length === 0}
            >
              Apply {pending.diff.length} change{pending.diff.length === 1 ? '' : 's'}
            </button>
            <button onClick={() => setPending(null)} disabled={busy}>
              Discard
            </button>
          </div>
        </div>
      )}

      <ChatGPTSettings
        onChanged={connectionChanged}
        disabled={busy}
        refreshKey={connectionVersion}
      />
      <p className="hint token-total">
        Total this session: {totalUsage.calls} model call{totalUsage.calls === 1 ? '' : 's'} ·{' '}
        {totalUsage.inputTokens + totalUsage.outputTokens} tokens
      </p>
    </div>
  );
}
