import { useState } from 'react';
import {
  api,
  type AgentBlockDraft,
  type AgentBlockResult,
  type AgentBuildPlan,
  type MissingCapability,
} from './api';

interface Props {
  /** Reload the workspace after an applied build (a new app may now be active). */
  onBuilt: () => void;
  disabled?: boolean;
}

const EXAMPLE = 'A book club app';

/**
 * Build with blocks: plain-language request → builder agent blueprint →
 * reviewed pages and coverage report → apply. Only library blocks are used;
 * capabilities without a block are listed as needing new blocks. Approved
 * builds are recorded, so the same request replays without model tokens.
 *
 * A missing capability can become a block: the block author drafts a
 * contract for review, then scaffolds, fills and verifies the block and
 * registers it as experimental for the next build.
 */
export function BuildView({ onBuilt, disabled }: Props) {
  const [request, setRequest] = useState('');
  const [mode, setMode] = useState<'new' | 'extend'>('new');
  const [pending, setPending] = useState<AgentBuildPlan | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [authoring, setAuthoring] = useState<Authoring | null>(null);

  const plan = async () => {
    setBusy(true);
    setErrors([]);
    setNotice('');
    setPending(null);
    try {
      const res = await api.agentBuild(request, mode);
      if (!res.ok || !res.planId) setErrors(res.errors ?? ['Planning failed']);
      else setPending(res);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!pending?.planId) return;
    setBusy(true);
    setErrors([]);
    try {
      const res = await api.agentBuildApply(pending.planId);
      setNotice(
        res.mode === 'new'
          ? `Created "${pending.appName}" as a new app. Your previous app is unchanged in Switch apps.`
          : 'Added to this app. Use Undo below to revert the whole build.',
      );
      setPending(null);
      setRequest('');
      onBuilt();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  const draftBlock = async (missing: MissingCapability) => {
    const capability = missing.capability;
    setBusy(true);
    setAuthoring({ capability, errors: [] });
    try {
      const draft = await api.agentBlockDraft(missing);
      setAuthoring(
        draft.ok && draft.contractId
          ? { capability, draft, errors: [] }
          : { capability, errors: draft.errors ?? ['Drafting failed'] },
      );
    } catch (e) {
      setAuthoring({ capability, errors: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setBusy(false);
    }
  };

  const approveBlock = async () => {
    if (!authoring?.draft?.contractId) return;
    const { capability, draft } = authoring;
    setBusy(true);
    try {
      const result = await api.agentBlockImplement(draft.contractId!);
      setAuthoring({
        capability,
        draft,
        result,
        errors: result.ok ? [] : (result.errors ?? ['Block checks failed']),
      });
    } catch (e) {
      setAuthoring({ capability, draft, errors: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setBusy(false);
    }
  };

  const tokens = (pending?.usage ?? []).reduce((a, u) => a + u.inputTokens + u.outputTokens, 0);
  const locked = busy || disabled;

  return (
    <section className="build-view" aria-label="Build with blocks">
      <h2>Build with blocks</h2>
      <p className="hint">
        Describe an app. The builder assembles it from tested library blocks, wires the pages and
        checks that it compiles before you apply it. Repeating an approved request reuses it without
        model tokens.
      </p>
      <label className="field">
        <span>Build target</span>
        <select
          aria-label="Build target"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as 'new' | 'extend');
            setPending(null);
          }}
        >
          <option value="new">New app · keeps the current app</option>
          <option value="extend">Add pages to this app</option>
        </select>
      </label>
      <div className="agent-form">
        <input
          type="text"
          aria-label="Describe the app"
          placeholder={`e.g. "${EXAMPLE}"`}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && request.trim()) void plan();
          }}
          disabled={locked}
        />
        <button
          className="primary"
          onClick={() => void plan()}
          disabled={locked || !request.trim()}
        >
          {busy && !pending ? 'Planning…' : 'Plan build'}
        </button>
        {!request && (
          <button onClick={() => setRequest(EXAMPLE)} disabled={locked}>
            Try example
          </button>
        )}
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
      {notice && <p className="dialog-feedback">{notice}</p>}

      {pending && (
        <div className="agent-plan">
          <div className="agent-plan-head">
            <span
              className={`provider-badge ${pending.source === 'recipe' || pending.liveModel ? 'live' : 'recorded'}`}
            >
              {pending.source === 'recipe'
                ? '♻ approved recipe · no model call'
                : pending.liveModel
                  ? '● live model'
                  : '◌ recorded demo'}
            </span>
            <span className="token-note">
              {tokens} tokens · {pending.attempts ?? 0} attempt{pending.attempts === 1 ? '' : 's'}
            </span>
          </div>
          <h3 className="build-title">
            {pending.mode === 'new' ? pending.appName : 'New pages for this app'}
          </h3>
          {pending.rationale && <p className="hint">{pending.rationale}</p>}
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th>Library blocks</th>
              </tr>
            </thead>
            <tbody>
              {pending.pages?.map((page) => (
                <tr key={page.id}>
                  <td>{page.title}</td>
                  <td>
                    {page.blocks.map((type) => (
                      <code key={type} className="build-block">
                        {type.split('@')[0]}
                      </code>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            {pending.coverage?.blocks} blocks on {pending.coverage?.pages} pages from the library ·{' '}
            {pending.operations} typed operations · compile check passed
          </p>
          {pending.missing && pending.missing.length > 0 && (
            <div className="warnings">
              {pending.missing.map((m, i) => (
                <div key={i} className="warning missing-block">
                  <span>
                    Needs a new block: {m.capability}
                    {m.proposedBlock ? ` (proposed ${m.proposedBlock})` : ''}
                    {m.reason ? ` — ${m.reason}` : ''}. Not included in this build.
                  </span>
                  <button
                    onClick={() => void draftBlock(m)}
                    disabled={locked}
                    aria-label={`Create block for ${m.capability}`}
                  >
                    Create block
                  </button>
                </div>
              ))}
            </div>
          )}
          {pending.warnings?.map((w, i) => (
            <div key={i} className="warning">
              {w}
            </div>
          ))}
          {authoring && (
            <BlockAuthoring
              authoring={authoring}
              busy={busy}
              locked={Boolean(locked)}
              onApprove={() => void approveBlock()}
              onClose={() => setAuthoring(null)}
            />
          )}
          <div className="agent-actions">
            <button className="primary" onClick={() => void apply()} disabled={locked}>
              {pending.mode === 'new' ? 'Create app' : 'Add to this app'}
            </button>
            <button onClick={() => setPending(null)} disabled={locked}>
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

interface Authoring {
  capability: string;
  draft?: AgentBlockDraft;
  result?: AgentBlockResult;
  errors: string[];
}

const portName = (port: string | { event?: string; port?: string }) =>
  typeof port === 'string' ? port : (port.event ?? port.port ?? '');

/** Contract review for a missing capability, then the authored block's gate results. */
function BlockAuthoring({
  authoring: { capability, draft, result, errors },
  busy,
  locked,
  onApprove,
  onClose,
}: {
  authoring: Authoring;
  busy: boolean;
  locked: boolean;
  onApprove: () => void;
  onClose: () => void;
}) {
  const contract = draft?.contract;
  const ports = contract?.manifest.ports as
    | { emits?: Array<string | { event: string }>; consumes?: Array<string | { port: string }> }
    | undefined;
  const tokens = [...(draft?.usage ?? []), ...(result?.usage ?? [])].reduce(
    (a, u) => a + u.inputTokens + u.outputTokens,
    0,
  );
  return (
    <section className="agent-plan block-contract" aria-label="New block">
      <div className="agent-plan-head">
        <span className={`provider-badge ${draft?.liveModel ? 'live' : 'recorded'}`}>
          {draft?.liveModel ? '● live model' : '◌ recorded demo'}
        </span>
        <span className="token-note">{tokens} tokens</span>
      </div>
      <h3 className="build-title">
        New block for {capability}
        {contract && (
          <>
            {' · '}
            <code>{contract.manifest.id}</code>
          </>
        )}
      </h3>
      {!draft && busy && <p className="hint">Drafting the block contract…</p>}
      {contract && !result && (
        <>
          <p className="hint">{contract.summary}</p>
          <table>
            <tbody>
              <tr>
                <th>Variants</th>
                <td>{contract.manifest.variants.join(', ')}</td>
              </tr>
              <tr>
                <th>Builder can set</th>
                <td>{contract.manifest.editSurface.join(', ') || 'nothing'}</td>
              </tr>
              <tr>
                <th>Emits</th>
                <td>{(ports?.emits ?? []).map(portName).join(', ') || 'nothing'}</td>
              </tr>
              <tr>
                <th>Consumes</th>
                <td>{(ports?.consumes ?? []).map(portName).join(', ') || 'nothing'}</td>
              </tr>
            </tbody>
          </table>
          {draft?.card && (
            <details>
              <summary>Block card the builder will read</summary>
              <pre className="block-card">{draft.card.markdown}</pre>
            </details>
          )}
          <p className="hint">
            Approving scaffolds the block, has the model write its template, then runs manifest
            validation, sdk test, sdk validate and a compile. The block is added as experimental
            only if every check passes.
          </p>
          <div className="agent-actions">
            <button className="primary" onClick={onApprove} disabled={locked}>
              {busy ? 'Building block…' : 'Approve contract'}
            </button>
            <button onClick={onClose} disabled={locked}>
              Discard
            </button>
          </div>
        </>
      )}
      {result?.checks && (
        <ul className="block-checks" aria-label="Block checks">
          {result.checks.map((check) => (
            <li key={check.name} className={check.ok ? 'ok' : 'failed'}>
              {check.ok ? '✓' : '✗'} {check.name}
              {check.issues.length > 0 && `: ${check.issues.join('; ')}`}
            </li>
          ))}
        </ul>
      )}
      {result?.ok && (
        <p className="dialog-feedback">
          {result.block} is now an experimental library block. Plan the build again to use it.
        </p>
      )}
      {errors.map((e, i) => (
        <div key={i} className="warning error">
          {e}
        </div>
      ))}
      {(result || errors.length > 0) && (
        <div className="agent-actions">
          <button onClick={onClose} disabled={locked}>
            Close
          </button>
        </div>
      )}
    </section>
  );
}
