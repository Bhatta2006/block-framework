import { useEffect, useState } from 'react';
import { api } from './api';

interface Props {
  onChanged: () => void;
}

interface PendingPlan {
  planId: string;
  rationale: string;
  diff: Array<{ path: string; before: unknown; after: unknown }>;
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
export function AgentView({ onChanged }: Props) {
  const [instruction, setInstruction] = useState('');
  const [pending, setPending] = useState<PendingPlan | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [undoDepth, setUndoDepth] = useState(0);
  const [totalUsage, setTotalUsage] = useState({ inputTokens: 0, outputTokens: 0, calls: 0 });

  const refreshUsage = async () => {
    try {
      const u = await api.agentUsage();
      setTotalUsage(u.total);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void refreshUsage();
  }, []);

  const plan = async () => {
    setBusy(true);
    setErrors([]);
    setPending(null);
    try {
      const res = await api.agentEdit(instruction);
      if (!res.ok) {
        setErrors(res.errors ?? ['Planning failed']);
        return;
      }
      setPending({
        planId: res.planId,
        rationale: res.plan.rationale,
        diff: res.diff,
        usage: res.usage,
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
      <h2>AI edit</h2>
      <p className="hint">
        Describe a change in plain language. The agent plans small edits inside each block's
        editable fields only — locked fields and anything you hand-edited are never touched. You
        review the diff before anything is applied, and every edit can be undone.
      </p>

      <div className="agent-form">
        <input
          type="text"
          placeholder='e.g. "make it playful"'
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void plan();
          }}
          disabled={busy}
        />
        <button
          className="primary"
          onClick={() => void plan()}
          disabled={busy || !instruction.trim()}
        >
          {busy ? 'Planning…' : 'Plan edit'}
        </button>
        <button
          onClick={() => void undo()}
          disabled={busy || undoDepth === 0}
          title="Undo last agent edit"
        >
          Undo{undoDepth > 0 ? ` (${undoDepth})` : ''}
        </button>
      </div>

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
              {pending.liveModel ? '● live model' : '◌ recorded demo'}
            </span>
            <span className="token-note">
              {pending.usage.reduce((a, u) => a + u.inputTokens + u.outputTokens, 0)} tokens this
              plan
            </span>
          </div>
          {pending.rationale && <p className="hint">{pending.rationale}</p>}
          {pending.diff.length === 0 ? (
            <p className="hint">No editable fields match this instruction — nothing to change.</p>
          ) : (
            <table className="wires">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {pending.diff.map((d, i) => (
                  <tr key={i}>
                    <td>
                      <code>{d.path}</code>
                    </td>
                    <td className="diff-before">{JSON.stringify(d.before)}</td>
                    <td className="diff-after">{JSON.stringify(d.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      <p className="hint token-total">
        Total this session: {totalUsage.calls} model call{totalUsage.calls === 1 ? '' : 's'} ·{' '}
        {totalUsage.inputTokens + totalUsage.outputTokens} tokens
      </p>
    </div>
  );
}
