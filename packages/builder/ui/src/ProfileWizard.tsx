import { useState } from 'react';
import { api, type BuilderProject } from './api';
import { PROFILE_QUESTIONS, type BuilderProfile } from '../../src/cascade';

interface Props {
  project: BuilderProject;
  onChanged: () => void;
}

/**
 * Profile wizard: the six questions. Saving the profile then applying the
 * cascade derives app name, slug, brand color, paywall copy and price —
 * without touching anything the user hand-edited.
 */
export function ProfileWizard({ project, onChanged }: Props) {
  const [values, setValues] = useState<BuilderProfile>(() => ({
    appName: project.graph.app.name,
    audience: 'everyone',
    tone: 'minimal',
    brandColor: project.graph.app.theme?.primaryColor ?? '#345E4F',
    price: '4.99',
    currency: 'USD',
    ...(project.profile ?? {}),
  }));
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{ applied: string[]; skippedTouched: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    setBusy(true);
    setErrors([]);
    setResult(null);
    try {
      const res = await api.setProfile(values);
      if (!res.ok) {
        setErrors(res.errors ?? ['Invalid profile']);
        return;
      }
      const cascade = await api.applyCascade();
      setResult({ applied: cascade.applied, skippedTouched: cascade.skippedTouched });
      onChanged();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-wizard">
      <h2>App profile</h2>
      <p className="hint">
        Answer six questions — the cascade configures the app. Anything you edit by hand is never
        overwritten.
      </p>
      {project.profile && (
        <p className="hint">
          Current profile: <strong>{project.profile.appName}</strong> · {project.touched.length}{' '}
          hand-edited field(s) protected.
        </p>
      )}
      <div className="question-grid">
        {PROFILE_QUESTIONS.map((q) => (
          <label key={q.key} className="field">
            <span>{q.label}</span>
            {q.kind === 'select' ? (
              <select
                aria-label={q.label}
                value={values[q.key] ?? ''}
                onChange={(e) => setValues({ ...values, [q.key]: e.target.value })}
              >
                <option value="">Choose…</option>
                {q.options!.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : q.kind === 'color' ? (
              <div className="color-row">
                <input
                  type="color"
                  aria-label={q.label + ' picker'}
                  value={/^#[0-9a-fA-F]{6}$/.test(values[q.key] ?? '') ? values[q.key]! : '#4F46E5'}
                  onChange={(e) => setValues({ ...values, [q.key]: e.target.value })}
                />
                <input
                  type="text"
                  aria-label={q.label + ' hex'}
                  placeholder={q.placeholder}
                  value={values[q.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [q.key]: e.target.value })}
                />
              </div>
            ) : (
              <input
                type="text"
                aria-label={q.label}
                placeholder={q.placeholder}
                value={values[q.key] ?? ''}
                onChange={(e) => setValues({ ...values, [q.key]: e.target.value })}
              />
            )}
          </label>
        ))}
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
      <button className="primary" onClick={() => void apply()} disabled={busy}>
        {busy ? 'Applying…' : 'Save profile & apply cascade'}
      </button>
      {result && (
        <div className="cascade-result">
          <p>
            ✓ Derived <strong>{result.applied.length}</strong> value(s)
            {result.skippedTouched.length > 0 && (
              <>
                {' '}
                · left <strong>{result.skippedTouched.length}</strong> hand-edited field(s)
                untouched
              </>
            )}
            .
          </p>
          {result.skippedTouched.length > 0 && (
            <details>
              <summary>Protected fields</summary>
              <ul>
                {result.skippedTouched.map((p) => (
                  <li key={p}>
                    <code>{p}</code>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
