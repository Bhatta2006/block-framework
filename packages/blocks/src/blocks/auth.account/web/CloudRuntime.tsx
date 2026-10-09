import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import QRCode from 'qrcode';
type Profile = {
  full_name: string;
  focus: string;
  onboarding_completed_at: string | null;
};
type Session = {
  user: {
    id: string;
    email: string;
  } | null;
  profile: Profile | null;
  plan: string;
  expiresAt?: string | null;
  owner: boolean;
  requiresPasswordReset?: boolean;
  noteLimit?: number;
};
type Payment = {
  id: string;
  user_id?: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  reference?: string;
  review_note?: string;
};
type Settings = {
  upiId: string;
  accessDays: number;
  plans: {
    id: string;
    name: string;
    amount: number;
    noteLimit: number;
  }[];
};
type Config = {
  title?: string;
  subtitle?: string;
  ctaText?: string;
};
type Api = <T = Record<string, unknown>>(
  path: string,
  method?: string,
  value?: unknown,
) => Promise<T>;
type Cloud = {
  session: Session;
  settings: Settings | null;
  loading: boolean;
  error: string;
  disabled: boolean;
  pending: number;
  api: Api;
  refresh: () => Promise<void>;
};
export type CloudAdapter = {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
};
const signedOut: Session = { user: null, profile: null, plan: 'free', owner: false };
const Context = createContext<Cloud | null>(null);
function useCloud() {
  const c = useContext(Context);
  if (!c) throw new Error('Configure cloud services for this block.');
  return c;
}
export function CloudProvider({
  backendUrl,
  disabled = false,
  children,
}: {
  backendUrl?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session>(signedOut);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(!disabled);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);
  const accountRef = useRef(session.user?.id);
  accountRef.current = session.user?.id;
  const base = location.pathname === '/api/run' ? backendUrl || '' : '';
  const api = useCallback<Api>(
    async <T,>(path: string, method = 'GET', value?: unknown): Promise<T> => {
      if (disabled)
        throw new Error('Canvas preview only. Open the connected app to use real services.');
      if (method !== 'GET') setPending((n) => n + 1);
      try {
        const response = await fetch(base + '/api/cloud/' + path, {
          method,
          credentials: 'include',
          headers: {
            ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
            ...(accountRef.current ? { 'X-Paper-Account': accountRef.current } : {}),
          },
          ...(value !== undefined ? { body: JSON.stringify(value) } : {}),
          signal: AbortSignal.timeout(25000),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(data?.error?.message || 'The service is unavailable. Please retry.');
        return data as T;
      } finally {
        if (method !== 'GET') setPending((n) => Math.max(0, n - 1));
      }
    },
    [base, disabled],
  );
  const refresh = useCallback(async () => {
    const current = await api<Session>('auth/session');
    setSession(current);
  }, [api]);
  useEffect(() => {
    if (disabled) return;
    let active = true;
    setLoading(true);
    setError('');
    void Promise.all([api<Settings>('config'), api<Session>('auth/session')])
      .then(([config, current]) => {
        if (active) {
          setSettings(config);
          setSession(current);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, disabled]);
  return (
    <Context.Provider
      value={{ session, settings, loading, error, disabled, pending, api, refresh }}
    >
      {children}
    </Context.Provider>
  );
}
function Feedback({ error, message }: { error?: string; message?: string }) {
  return error ? (
    <p className="cloud-feedback error" role="alert">
      {error}
    </p>
  ) : message ? (
    <p className="cloud-feedback" role="status">
      {message}
    </p>
  ) : null;
}
type Props = {
  config?: Config;
  emit?: (event: string, value?: unknown) => boolean | void;
  decorate?: (tree: React.ReactElement) => React.ReactNode;
};
function surface(tree: React.ReactElement, decorate?: Props['decorate']) {
  return decorate ? decorate(tree) : tree;
}
export function CloudAuth({ config = {}, emit, decorate }: Props) {
  const c = useCloud();
  const [mode, setMode] = useState<'signin' | 'signup' | 'recover' | 'reset'>(
    c.session.requiresPasswordReset ? 'reset' : 'signin',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('auth_error');
    if (code)
      setError('Sign-in or verification could not be completed. Please try again with a new link.');
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'recover') {
        const result = await c.api<{
          message: string;
        }>('auth/recover', 'POST', { email });
        setMessage(result.message);
      } else if (mode === 'signup') {
        const result = await c.api<{
          message: string;
        }>('auth/signup', 'POST', { email, password });
        setMessage(result.message);
        setPassword('');
      } else {
        await c.api(
          'auth/' + (mode === 'reset' ? 'password' : 'login'),
          'POST',
          mode === 'reset' ? { password } : { email, password },
        );
        setPassword('');
        await c.refresh();
        emit?.('auth.completed', {});
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const google = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await c.api<{
        url: string;
      }>('auth/google', 'POST', {});
      location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  if (c.session.user && !c.session.requiresPasswordReset)
    return surface(
      <section className="cloud-card" data-element="container">
        <h1 data-element="title">You're signed in</h1>
        <p>{c.session.user.email}</p>
        <button className="primary" onClick={() => emit?.('auth.completed', {})}>
          Continue to your notes
        </button>
      </section>,
      decorate,
    );
  return surface(
    <section className="cloud-card cloud-auth" data-element="container">
      <span className="cloud-eyebrow">YOUR PRIVATE SPACE</span>
      <h1 data-element="title">
        {mode === 'signup'
          ? 'Create your account'
          : mode === 'recover'
            ? 'Reset your password'
            : mode === 'reset'
              ? 'Choose a new password'
              : config.title || 'Welcome to Paper'}
      </h1>
      <p data-element="subtitle">
        {config.subtitle || 'A clear space for your thoughts. Saved securely to your account.'}
      </p>
      {mode !== 'recover' && mode !== 'reset' && (
        <>
          <button
            className="cloud-google"
            disabled={busy || c.disabled}
            onClick={() => void google()}
          >
            Continue with Google
          </button>
          <div className="cloud-divider">or continue with email</div>
        </>
      )}
      <form onSubmit={(e) => void submit(e)}>
        {mode !== 'reset' && (
          <label>
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
            />
          </label>
        )}
        {mode !== 'recover' && (
          <label>
            {mode === 'reset' ? 'New password' : 'Password'}
            <input
              required
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={mode === 'signin' ? 1 : 12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {(mode === 'signup' || mode === 'reset') && <small>Use at least 12 characters.</small>}
        <button data-element="button" className="primary" disabled={busy || c.disabled}>
          {busy
            ? 'Working…'
            : mode === 'signup'
              ? 'Create account'
              : mode === 'recover'
                ? 'Send recovery email'
                : mode === 'reset'
                  ? 'Save new password'
                  : 'Sign in'}
        </button>
      </form>
      <Feedback error={error} message={message} />
      {mode !== 'reset' && (
        <div className="cloud-auth-links">
          <button
            className="cloud-text-button"
            disabled={busy}
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError('');
              setMessage('');
            }}
          >
            {mode === 'signin' ? 'Create an account' : 'Back to sign in'}
          </button>
          {mode === 'signin' && (
            <button
              className="cloud-text-button"
              onClick={() => {
                setMode('recover');
                setError('');
                setMessage('');
              }}
            >
              Forgot password?
            </button>
          )}
        </div>
      )}
      {c.disabled && (
        <p className="cloud-feedback">
          Cloud block preview. Connect the backend to use real sign-in.
        </p>
      )}
    </section>,
    decorate,
  );
}
export function CloudOnboarding({ config = {}, emit, decorate }: Props) {
  const c = useCloud();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(c.session.profile?.full_name || '');
  const [focus, setFocus] = useState(c.session.profile?.focus || 'personal');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    setBusy(true);
    setError('');
    try {
      await c.api('profile', 'PUT', { fullName: name, focus });
      await c.refresh();
      emit?.('onboarding.completed', {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return surface(
    <section className="cloud-card cloud-onboarding" data-element="container">
      <span className="cloud-eyebrow">STEP {step} OF 2</span>
      <h1 data-element="title">
        {step === 1 ? config.title || 'Make this space yours' : 'How will you use Paper?'}
      </h1>
      <p>
        {step === 1
          ? 'Tell us what to call you.'
          : 'Choose a starting focus. You can change this later.'}
      </p>
      {step === 1 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setStep(2);
          }}
        >
          <label>
            Your name
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </label>
          <button className="primary" disabled={!name.trim() || c.disabled}>
            Continue
          </button>
        </form>
      ) : (
        <>
          <div className="cloud-focus">
            {[
              ['personal', 'Personal', 'Ideas, lists, and everyday thoughts'],
              ['work', 'Work', 'Plans, meetings, and decisions'],
              ['study', 'Study', 'Learning, research, and revision'],
            ].map(([id = '', title, body]) => (
              <button key={id} aria-pressed={focus === id} onClick={() => setFocus(id)}>
                <b>{title}</b>
                <small>{body}</small>
              </button>
            ))}
          </div>
          <div className="cloud-row">
            <button onClick={() => setStep(1)}>Back</button>
            <button
              data-element="button"
              className="primary"
              disabled={busy || c.disabled}
              onClick={() => void finish()}
            >
              {busy ? 'Saving your setup…' : config.ctaText || 'Open my workspace'}
            </button>
          </div>
        </>
      )}
      <Feedback error={error} />
    </section>,
    decorate,
  );
}
export function CloudBoundary({
  blocks,
  children,
  decorateAuth,
  decorateOnboarding,
}: {
  blocks: {
    type: string;
    config?: Config;
  }[];
  children: (identity: string, adapter?: CloudAdapter) => React.ReactNode;
  decorateAuth?: (tree: React.ReactNode) => React.ReactNode;
  decorateOnboarding?: (tree: React.ReactNode) => React.ReactNode;
}) {
  const c = useCloud();
  const revisions = useMemo(() => new Map<string, number>(), [c.session.user?.id]);
  const adapter = useMemo<CloudAdapter>(
    () => ({
      async read(key) {
        const result = await c.api<{
          data: unknown;
          revision: number;
        }>('collections/' + encodeURIComponent(key));
        revisions.set(key, result.revision);
        return result.data === null ? null : JSON.stringify(result.data);
      },
      async write(key, value) {
        const result = await c.api<{
          revision: number;
        }>('collections/' + encodeURIComponent(key), 'PUT', {
          data: JSON.parse(value),
          revision: revisions.get(key) ?? 0,
        });
        revisions.set(key, result.revision);
      },
    }),
    [c.api, revisions],
  );
  if (c.disabled) return <>{children('canvas-preview')}</>;
  if (c.loading)
    return (
      <section className="cloud-card" role="status">
        <h1>Opening your account</h1>
        <p>Connecting to the cloud…</p>
      </section>
    );
  if (c.error)
    return (
      <section className="cloud-card">
        <h1>Cloud connection required</h1>
        <Feedback error={c.error} />
        <p>
          Configure and start the exported backend, then set its public URL in Studio's cloud setup.
        </p>
        <button onClick={() => location.reload()}>Retry connection</button>
      </section>
    );
  if (!c.session.user || c.session.requiresPasswordReset)
    return (
      <CloudAuth
        config={blocks.find((b) => b.type.startsWith('auth.account@'))?.config}
        decorate={decorateAuth}
      />
    );
  if (!c.session.profile?.onboarding_completed_at)
    return (
      <CloudOnboarding
        config={blocks.find((b) => b.type.startsWith('onboarding.profile@'))?.config}
        decorate={decorateOnboarding}
      />
    );
  return <>{children(c.session.user.id, adapter)}</>;
}
export function CloudPlans({ config = {}, emit, decorate }: Props) {
  const c = useCloud();
  const [payment, setPayment] = useState<{
    payment: Payment;
    upiUrl: string;
    accessDays: number;
  } | null>(null);
  const [qr, setQr] = useState('');
  const [reference, setReference] = useState('');
  const [history, setHistory] = useState<Payment[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await c.api<{
      payments: Payment[];
    }>('payments');
    setHistory(result.payments);
    await c.refresh();
  }, [c.api, c.refresh]);
  useEffect(() => {
    if (!c.disabled && c.session.user) void load().catch((e) => setError(e.message));
  }, [c.disabled, c.session.user?.id, load]);
  useEffect(() => {
    setQr('');
    if (payment)
      void QRCode.toDataURL(payment.upiUrl, { width: 240, margin: 2, errorCorrectionLevel: 'M' })
        .then(setQr)
        .catch(() => setError('Could not create the QR code. Use the UPI app link below.'));
  }, [payment]);
  const buy = async (plan: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setPayment(await c.api('payments', 'POST', { plan }));
      setReference('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const claim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payment) return;
    setBusy(true);
    setError('');
    try {
      const result = await c.api<{
        message: string;
      }>('payments/' + payment.payment.id + '/claim', 'POST', { reference });
      setMessage(result.message || 'Submitted for owner verification.');
      setPayment(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const all = c.settings?.plans || [
    { id: 'free', name: 'Free', amount: 0, noteLimit: 25 },
    { id: 'plus', name: 'Plus', amount: 50000, noteLimit: 1000 },
    { id: 'pro', name: 'Pro', amount: 100000, noteLimit: 10000 },
  ];
  return surface(
    <section className="cloud-card cloud-plans" data-element="container">
      <span className="cloud-eyebrow">ROOM TO GROW</span>
      <h1 data-element="title">{config.title || 'Choose your space'}</h1>
      <p>{config.subtitle || 'Start free. Pay only when you need more room.'}</p>
      <p className="cloud-account-summary">
        Current plan: <b>{c.session.plan}</b>
        {c.session.expiresAt &&
          ' · Access until ' + new Date(c.session.expiresAt).toLocaleDateString()}
      </p>
      <div className="cloud-plan-grid">
        {all.map((p) => (
          <article key={p.id} className={p.id === 'plus' ? 'featured' : ''}>
            <h2>{p.name}</h2>
            <div className="cloud-price">₹{p.amount / 100}</div>
            <p>
              {p.amount
                ? (c.settings?.accessDays || 30) + ' days of access'
                : 'Free, no payment needed'}
            </p>
            <ul>
              <li>{p.noteLimit.toLocaleString()} notes</li>
              <li>Private cloud storage</li>
              <li>Search, folders, and favorites</li>
              <li>Export your notes anytime</li>
            </ul>
            <button
              className="primary"
              disabled={busy || c.disabled}
              onClick={() => (p.id === 'free' ? emit?.('billing.continued', {}) : void buy(p.id))}
            >
              {p.id === 'free'
                ? 'Continue with current access'
                : 'Pay ₹' + p.amount / 100 + ' by UPI'}
            </button>
          </article>
        ))}
      </div>
      <p className="cloud-small">
        Paid passes are prepaid and manually renewed. No automatic debits. Personal UPI testing: the
        owner confirms actual receipt before access changes.
      </p>
      {payment && (
        <div className="cloud-checkout">
          <div>
            {qr && (
              <img
                src={qr}
                alt={'UPI payment QR for ₹' + payment.payment.amount / 100}
                width="240"
                height="240"
              />
            )}
          </div>
          <div>
            <h2>
              Pay ₹{payment.payment.amount / 100} for {payment.payment.plan}
            </h2>
            <p>{payment.accessDays} days of access after verification.</p>
            <p>
              Recipient UPI ID: <strong>{c.settings?.upiId}</strong>
            </p>
            <a className="cloud-upi-button" href={payment.upiUrl}>
              Open your UPI app
            </a>
            <p>
              After paying, enter the reference shown by your bank or UPI app. Submitting a
              reference does not confirm receipt.
            </p>
            <form onSubmit={(e) => void claim(e)}>
              <label>
                UPI transaction reference
                <input
                  required
                  pattern="[A-Za-z0-9]{8,35}"
                  minLength={8}
                  maxLength={35}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                Submit transaction reference
              </button>
              <button type="button" onClick={() => setPayment(null)} disabled={busy}>
                Close payment details
              </button>
            </form>
          </div>
        </div>
      )}
      <Feedback error={error} message={message} />
      {history.length > 0 && (
        <div className="cloud-payment-history">
          <h2>Your payments</h2>
          {history.map((p) => (
            <div key={p.id}>
              <span>
                {p.plan} · ₹{p.amount / 100}
              </span>
              <span>
                {p.status}
                {p.review_note && ' · ' + p.review_note}
              </span>
            </div>
          ))}
          <button disabled={busy} onClick={() => void load().catch((e) => setError(e.message))}>
            Refresh payment status
          </button>
        </div>
      )}
    </section>,
    decorate,
  );
}
export function CloudAccount({ config = {}, emit, decorate }: Props) {
  const c = useCloud();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    setError('');
    try {
      await c.api('auth/logout', 'POST', {});
      await c.refresh();
      emit?.('auth.signedOut', {});
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return surface(
    <section className="cloud-card" data-element="container">
      <span className="cloud-eyebrow">ACCOUNT</span>
      <h1 data-element="title">{config.title || 'Your account'}</h1>
      <p>{c.session.profile?.full_name}</p>
      <p>{c.session.user?.email || 'Cloud account preview'}</p>
      <dl className="cloud-details">
        <dt>Plan</dt>
        <dd>
          {c.session.plan}
          {c.session.expiresAt &&
            ' · expires ' + new Date(c.session.expiresAt).toLocaleDateString()}
        </dd>
        <dt>Note limit</dt>
        <dd>{c.session.noteLimit || 25}</dd>
        <dt>Storage</dt>
        <dd>Private Supabase cloud database</dd>
      </dl>
      <div className="cloud-row">
        <button onClick={() => emit?.('account.plans', {})}>Manage plan</button>
        <button onClick={() => emit?.('account.profile', {})}>Edit profile</button>
        {c.session.owner && (
          <button onClick={() => emit?.('account.reviewPayments', {})}>Review payments</button>
        )}
        <button
          data-element="button"
          disabled={busy || c.disabled || c.pending > 0}
          onClick={() => void logout()}
        >
          {busy ? 'Signing out…' : c.pending ? 'Saving changes…' : 'Sign out'}
        </button>
      </div>
      <Feedback error={error} />
    </section>,
    decorate,
  );
}
export function CloudOwner({ config = {}, decorate }: Props) {
  const c = useCloud();
  const [payments, setPayments] = useState<Payment[]>(
    c.disabled
      ? [
          {
            id: 'canvas-example',
            plan: 'plus',
            amount: 50000,
            currency: 'INR',
            status: 'preview',
            reference: 'EXAMPLE0000',
            user_id: 'Canvas example account',
          },
        ]
      : [],
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(c.disabled ? 'canvas-example' : '');
  const [verified, setVerified] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await c.api<{
      payments: Payment[];
    }>('owner/payments');
    setPayments(result.payments);
  }, [c.api]);
  useEffect(() => {
    if (c.session.owner && !c.disabled) void load().catch((e) => setError(e.message));
  }, [load, c.session.owner, c.disabled]);
  const review = async (approve: boolean) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await c.api('owner/payments/' + selected + '/review', 'POST', {
        approve,
        receiptVerified: verified,
        note,
      });
      setMessage(
        approve
          ? 'Payment approved. Access was granted once.'
          : 'Payment rejected. Access was not granted.',
      );
      setSelected('');
      setVerified(false);
      setNote('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!c.session.owner && !c.disabled)
    return surface(
      <section className="cloud-card">
        <h1>Owner access required</h1>
        <p>Only the verified owner account can review payments.</p>
      </section>,
      decorate,
    );
  return surface(
    <section className="cloud-card" data-element="container">
      <span className="cloud-eyebrow">OWNER ONLY</span>
      <h1 data-element="title">{config.title || 'Payment verification'}</h1>
      {c.disabled && (
        <p>
          Canvas example only. Payment review is disabled here; open the connected app with the
          verified owner account.
        </p>
      )}
      <p>
        Check the actual receipt in your bank or UPI app. Match the reference and exact amount
        before approving.
      </p>
      <button
        disabled={busy || c.disabled}
        onClick={() => void load().catch((e) => setError(e.message))}
      >
        Refresh queue
      </button>
      <div className="cloud-review-list">
        {!payments.length && <p>No submitted payments waiting for review.</p>}
        {payments.map((p) => (
          <article key={p.id}>
            <h2>
              {p.plan} · ₹{p.amount / 100}
            </h2>
            <p>
              Reference: <strong>{p.reference}</strong>
            </p>
            <p className="cloud-small">Account: {p.user_id}</p>
            <button
              disabled={busy}
              onClick={() => {
                setSelected(p.id);
                setVerified(false);
                setNote('');
              }}
            >
              Review this payment
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <div className="cloud-review-form">
          <label className="cloud-checkbox">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            I checked the bank receipt and matched the reference, recipient, and amount.
          </label>
          <label>
            Review note
            <input
              required
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="cloud-row">
            <button
              className="primary"
              disabled={c.disabled || busy || !verified || !note.trim()}
              onClick={() => void review(true)}
            >
              Approve verified payment
            </button>
            <button
              disabled={c.disabled || busy || !note.trim()}
              onClick={() => void review(false)}
            >
              Reject claim
            </button>
            <button disabled={busy} onClick={() => setSelected('')}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <Feedback error={error} message={message} />
    </section>,
    decorate,
  );
}
