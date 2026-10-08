import { useCallback, useEffect, useState } from 'react';
import { api, type ChatGPTModel, type ChatGPTStatus } from './api';

export function ChatGPTSettings({
  onChanged,
  disabled,
  refreshKey,
}: {
  onChanged: () => void;
  disabled: boolean;
  refreshKey: number;
}) {
  const [status, setStatus] = useState<ChatGPTStatus | null>(null);
  const [models, setModels] = useState<ChatGPTModel[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginUrl, setLoginUrl] = useState('');
  const refresh = useCallback(async () => {
    try {
      const next = await api.chatgptStatus();
      setStatus(next);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ChatGPT connection is unavailable.');
      return null;
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);
  useEffect(() => {
    if (!status?.pending) return;
    const timer = setInterval(() => {
      void refresh().then((next) => {
        if (next && !next.pending) {
          setLoginUrl('');
          onChanged();
        }
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [status?.pending, refresh, onChanged]);
  const active = status?.accounts.find((a) => a.id === status.activeId);
  const loadModels = useCallback(async () => {
    setModels([]);
    try {
      setModels(await api.chatgptModels());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load ChatGPT models.');
    }
  }, []);
  useEffect(() => {
    if (active?.planEnabled) {
      setError('');
      void loadModels();
    } else setModels([]);
  }, [active?.id, active?.planEnabled, loadModels]);

  const action = async (
    name: 'cancel' | 'select' | 'model' | 'signout' | 'welcome',
    value?: string,
  ) => {
    setBusy(true);
    setError('');
    try {
      setStatus(await api.chatgptAction(name, value));
      setLoginUrl('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection update failed.');
    } finally {
      setBusy(false);
    }
  };
  const signIn = async (id?: string) => {
    // Open synchronously from the click so browsers do not block the sign-in tab.
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    setBusy(true);
    setError('');
    try {
      const result = await api.chatgptLogin(id);
      setLoginUrl(result.url);
      if (popup) popup.location.href = result.url;
      await refresh();
    } catch (e) {
      popup?.close();
      setError(e instanceof Error ? e.message : 'ChatGPT sign-in could not start.');
    } finally {
      setBusy(false);
    }
  };
  const locked = busy || disabled;
  return (
    <section className="chatgpt-settings" aria-label="ChatGPT connection">
      <div className="chatgpt-heading">
        <div>
          <strong>Use your ChatGPT plan</strong>
          <p className="hint">Connect an eligible account to make AI edits without an API key.</p>
        </div>
        <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">
          Manage usage ↗
        </a>
      </div>
      {status?.accounts.length ? (
        <label className="field">
          <span>ChatGPT account</span>
          <select
            aria-label="ChatGPT account"
            value={status.activeId ?? ''}
            disabled={locked || status.pending}
            onChange={(e) => void action('select', e.target.value)}
          >
            <option value="" disabled>
              Choose a connected account
            </option>
            {status.accounts.map((account) => (
              <option key={account.id} value={account.id} disabled={!account.connected}>
                {account.label}
                {account.connected ? '' : ' · signed out'}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {active?.connected && (
        <>
          <p className="chatgpt-state">
            {active.planEnabled ? '● Using ChatGPT plan' : 'Connected · plan usage is not enabled'}
          </p>
          {active.planEnabled ? (
            <label className="field">
              <span>Model</span>
              <select
                aria-label="ChatGPT model"
                value={active.model ?? ''}
                disabled={locked || !models.length || status?.pending}
                onChange={(e) => void action('model', e.target.value)}
              >
                <option value="" disabled>
                  Choose a model
                </option>
                {active.model && !models.some((m) => m.slug === active.model) && (
                  <option value={active.model} disabled>
                    {active.model} · refresh availability
                  </option>
                )}
                {models.map((model) => (
                  <option key={model.slug} value={model.slug}>
                    {model.display_name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="hint">Reconnect and allow ChatGPT plan usage to enable AI edits.</p>
          )}
        </>
      )}
      <div className="chatgpt-actions">
        {!status?.pending && (
          <button className="chatgpt-signin" disabled={locked} onClick={() => void signIn()}>
            Continue with ChatGPT
          </button>
        )}
        {active?.connected && (
          <button
            disabled={locked || status?.pending}
            onClick={() => void action('signout', active.id)}
          >
            Sign out
          </button>
        )}
        {active?.connected && !active.planEnabled && (
          <button disabled={locked || status?.pending} onClick={() => void signIn(active.id)}>
            Enable plan usage
          </button>
        )}
        {active?.planEnabled && (
          <button disabled={locked || status?.pending} onClick={() => void loadModels()}>
            Refresh models
          </button>
        )}
        {status?.pending && (
          <>
            <span role="status">Waiting for ChatGPT sign-in…</span>
            {loginUrl && (
              <a href={loginUrl} target="_blank" rel="noreferrer">
                Open sign-in ↗
              </a>
            )}
            <button disabled={locked} onClick={() => void action('cancel')}>
              Cancel sign-in
            </button>
          </>
        )}
        {status?.accounts
          .filter((a) => !a.connected)
          .map((account) => (
            <button
              key={account.id}
              disabled={locked || status.pending}
              onClick={() => void signIn(account.id)}
            >
              Reconnect {account.label}
            </button>
          ))}
      </div>
      {(error || status?.error) && (
        <p className="dialog-feedback" role="alert">
          {error || status?.error}
        </p>
      )}
      {status?.notice && (
        <p className="hint" role="status">
          {status.notice}
        </p>
      )}
      {status?.welcome && (
        <div className="chatgpt-welcome" role="dialog" aria-label="ChatGPT plan connected">
          <strong>You’re using your ChatGPT plan</strong>
          <p>
            Eligible AI edits use your plan or available credits. Manage access and limits in
            ChatGPT settings.
          </p>
          <button className="primary" disabled={locked} onClick={() => void action('welcome')}>
            Got it
          </button>
        </div>
      )}
      <p className="hint">
        Available for eligible ChatGPT Plus and Pro accounts. Your plan limits apply. This connects
        Studio’s AI assistant; it does not add login to the apps you build.
      </p>
    </section>
  );
}
