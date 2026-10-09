import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDashed,
  Download,
  FolderGit2,
  Globe2,
  Loader2,
  Rocket,
  Smartphone,
  Store,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { api, type BuilderProject, type WiringReport } from '../api';
import { blockMeta, eventLabel, instanceName } from '../catalog';
import { pageIds } from '../graph';

type Status = 'ok' | 'warn' | 'error';
interface ReadinessCheck {
  id: string;
  status: Status;
  title: string;
  detail: string;
  fix?: { label: string; run: () => void };
}

function readiness(
  project: BuilderProject,
  wiring: WiringReport | null,
  go: { page: (id: string, block?: string) => void; developer: () => void },
): ReadinessCheck[] {
  const g = project.graph;
  const pageOf = (instance: string) => g.screens.find((s) => pageIds(s).includes(instance));
  const nameOf = (instance: string) => {
    const b = g.blocks.find((x) => x.id === instance);
    return b ? instanceName(b.type, b.variant) : instance;
  };
  const checks: ReadinessCheck[] = [];
  if (!wiring)
    return [
      {
        id: 'loading',
        status: 'warn',
        title: 'Checking your app…',
        detail: 'Compiling the graph.',
      },
    ];
  const unreachable = wiring.flow.unreachable;
  checks.push(
    unreachable.length
      ? {
          id: 'reach',
          status: 'warn',
          title:
            unreachable.length +
            ' page' +
            (unreachable.length === 1 ? ' is' : 's are') +
            ' unreachable',
          detail:
            unreachable.map((id) => g.screens.find((s) => s.id === id)?.title ?? id).join(', ') +
            '. Connect an action to each page, or move it to tab navigation.',
          fix: { label: 'Open page', run: () => go.page(unreachable[0]!) },
        }
      : {
          id: 'reach',
          status: 'ok',
          title: 'Every page is reachable',
          detail: 'People can get to each page from the entry page or navigation.',
        },
  );
  const unmet = [...wiring.unmet, ...wiring.ambiguous];
  checks.push(
    unmet.length
      ? {
          id: 'actions',
          status: 'error',
          title:
            unmet.length +
            ' action' +
            (unmet.length === 1 ? ' needs' : 's need') +
            ' a destination',
          detail: unmet.map((u) => nameOf(u.instance) + ' · ' + eventLabel(u.event)).join(', '),
          fix: {
            label: 'Fix connection',
            run: () => {
              const page = pageOf(unmet[0]!.instance);
              if (page) go.page(page.id, unmet[0]!.instance);
            },
          },
        }
      : {
          id: 'actions',
          status: 'ok',
          title: 'Every action has a destination',
          detail: wiring.resolved.length + ' connections resolve without guessing.',
        },
  );
  if (wiring.unmetRequirements.length)
    checks.push({
      id: 'data',
      status: 'error',
      title: 'Missing data for ' + wiring.unmetRequirements.length + ' block(s)',
      detail: wiring.unmetRequirements
        .map((r) => nameOf(r.instance) + ' needs ' + r.entity)
        .join(', '),
      fix: {
        label: 'Show block',
        run: () => {
          const r = wiring.unmetRequirements[0]!;
          const page = pageOf(r.instance);
          if (page) go.page(page.id, r.instance);
        },
      },
    });
  const used = g.blocks.filter((b) => g.screens.some((s) => pageIds(s).includes(b.id)));
  const demos = [
    ...new Set(
      used
        .filter((b) => blockMeta(b.type).runtime === 'demo')
        .map((b) => instanceName(b.type, b.variant)),
    ),
  ];
  checks.push(
    demos.length
      ? {
          id: 'services',
          status: 'warn',
          title: 'Demo services in use',
          detail:
            demos.join(', ') +
            ' use demonstration services. Connect real providers in the exported code before launch.',
        }
      : {
          id: 'services',
          status: 'ok',
          title: 'No demo services',
          detail: 'Every block runs on real local storage or a configured backend.',
        },
  );
  const cloudBlocks = used.filter((b) => blockMeta(b.type).runtime === 'cloud');
  if (cloudBlocks.length)
    checks.push(
      g.app.cloud?.backendUrl
        ? {
            id: 'cloud',
            status: 'ok',
            title: 'Cloud backend connected',
            detail:
              g.app.cloud.backendUrl + ' · accounts, notes, and plans run through your server.',
          }
        : {
            id: 'cloud',
            status: 'error',
            title: 'Cloud blocks need a backend',
            detail: 'Add your backend origin before exporting accounts, onboarding, or payments.',
            fix: { label: 'Open developer tools', run: go.developer },
          },
    );
  checks.push({
    id: 'reproducible',
    status: 'ok',
    title: 'Reproducible source',
    detail:
      'The same graph always produces byte-identical, audited source with no Studio runtime dependency.',
  });
  return checks;
}

const statusIcon: Record<Status, LucideIcon> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
};

export function ShipView({
  project,
  wiring,
  platform,
  setPlatform,
  onOpenPage,
  onDeveloper,
  notify,
}: {
  project: BuilderProject;
  wiring: WiringReport | null;
  platform: 'web' | 'mobile';
  setPlatform: (p: 'web' | 'mobile') => void;
  onOpenPage: (id: string, block?: string) => void;
  onDeveloper: () => void;
  notify: (message: string, tone?: 'info' | 'error') => void;
}) {
  const [workspace, setWorkspace] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cloud = Boolean(project.graph.app.cloud);
  const checks = readiness(project, wiring, { page: onOpenPage, developer: onDeveloper });
  const scored = checks.filter((c) => c.id !== 'loading');
  const score = scored.length
    ? Math.round(
        (scored.reduce((n, c) => n + (c.status === 'ok' ? 1 : c.status === 'warn' ? 0.5 : 0), 0) /
          scored.length) *
          100,
      )
    : 0;
  const target = workspace ? 'workspace' : cloud ? 'web' : platform;
  const download = async () => {
    setExporting(true);
    try {
      const blob = await api.exportZip(target);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = project.graph.app.slug + '-' + target + '.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(
        'Your ' +
          (target === 'workspace'
            ? 'project workspace'
            : target === 'web'
              ? 'web app'
              : 'Expo mobile app') +
          ' source is ready.',
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setExporting(false);
    }
  };
  const options: Array<{
    id: string;
    icon: LucideIcon;
    title: string;
    detail: string;
    chosen: boolean;
    disabled?: boolean;
    pick: () => void;
  }> = [
    {
      id: 'web',
      icon: Globe2,
      title: 'Web application',
      detail: 'React + Vite · responsive · deploy anywhere',
      chosen: !workspace && (cloud || platform === 'web'),
      pick: () => {
        setWorkspace(false);
        setPlatform('web');
      },
    },
    {
      id: 'mobile',
      icon: Smartphone,
      title: 'Mobile application',
      detail: cloud
        ? 'Cloud account integration currently supports web export'
        : 'Expo + React Native · iOS and Android',
      chosen: !workspace && !cloud && platform === 'mobile',
      disabled: cloud,
      pick: () => {
        setWorkspace(false);
        setPlatform('mobile');
      },
    },
    {
      id: 'workspace',
      icon: Download,
      title: 'All project platforms',
      detail: 'One monorepo · every platform enabled in your project',
      chosen: workspace,
      pick: () => setWorkspace(true),
    },
  ];
  return (
    <div className="ship-view">
      <div className="ship-inner">
        <header className="ship-header">
          <div>
            <span className="eyebrow">Ship</span>
            <h1>Get {project.graph.app.name} ready for people</h1>
            <p className="muted">
              Check what the app still needs, then take the source code. You own every line, with no
              lock-in.
            </p>
          </div>
          <div
            className="health"
            style={{ ['--score' as string]: score }}
            aria-label={'Readiness ' + score + '%'}
          >
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.9" className="health-track" />
              <circle
                cx="18"
                cy="18"
                r="15.9"
                className="health-value"
                strokeDasharray={score + ' 100'}
              />
            </svg>
            <strong>{score}</strong>
            <small>Readiness</small>
          </div>
        </header>
        <div className="ship-grid">
          <section className="ship-card">
            <h2>Readiness checklist</h2>
            <ul className="checklist">
              {checks.map((c) => {
                const Icon = statusIcon[c.status];
                return (
                  <li key={c.id} className={'check ' + c.status}>
                    <Icon size={17} />
                    <div>
                      <strong>{c.title}</strong>
                      <p>{c.detail}</p>
                    </div>
                    {c.fix && (
                      <button className="small-button" onClick={c.fix.run}>
                        {c.fix.label}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="ship-card">
            <h2>Export source code</h2>
            <div className="export-options">
              {options.map((o) => {
                const Icon = o.icon;
                return (
                  <button
                    key={o.id}
                    className={'export-option ' + (o.chosen ? 'chosen' : '')}
                    aria-pressed={o.chosen}
                    disabled={o.disabled}
                    onClick={o.pick}
                  >
                    <Icon size={20} />
                    <span>
                      <strong>{o.title}</strong>
                      <small>{o.detail}</small>
                    </span>
                    {o.chosen && <Check size={16} className="export-check" />}
                  </button>
                );
              })}
            </div>
            <button
              className="primary full large"
              disabled={exporting}
              onClick={() => void download()}
            >
              {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
              {exporting
                ? 'Preparing your code…'
                : workspace
                  ? 'Download project workspace'
                  : 'Download ' + (cloud || platform === 'web' ? 'web' : 'mobile') + ' app'}
            </button>
            <p className="muted export-note">
              {cloud
                ? 'Includes the real backend, database migration, environment template, and hosting instructions. Personal UPI payments require owner receipt verification.'
                : 'Typed, linted, and tested source with a README. Demo services stay clearly marked in the code.'}
            </p>
            <h3>Coming next</h3>
            <ul className="planned">
              <li>
                <Rocket size={15} /> One-click deploy to Vercel, Cloudflare, or Fly
                <span className="chip">Phase 2</span>
              </li>
              <li>
                <FolderGit2 size={15} /> Sync to a GitHub repository
                <span className="chip">Phase 2</span>
              </li>
              <li>
                <Store size={15} /> Signed iOS and Android store builds
                <span className="chip">Phase 3</span>
              </li>
              <li>
                <CircleDashed size={15} /> Preview environments with a database
                <span className="chip">Phase 3</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
