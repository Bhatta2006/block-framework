import { useRef, useState } from 'react';
import { Check, Code2, Download, Globe2, Layers, Trash2, Upload } from 'lucide-react';
import type { BuilderProject } from '../api';
import { pageIds } from '../graph';

type Edit = (fn: (p: BuilderProject) => void) => Promise<void>;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DeveloperDialog({
  project,
  pageId,
  saving,
  edit,
  notify,
  onApplied,
  onPageDeleted,
  onContracts,
}: {
  project: BuilderProject;
  pageId: string | null;
  saving: boolean;
  edit: Edit;
  notify: (message: string, tone?: 'info' | 'error') => void;
  onApplied: () => void;
  onPageDeleted: () => void;
  onContracts: () => void;
}) {
  const [json, setJson] = useState(() => JSON.stringify(project, null, 2));
  const [cloudUrl, setCloudUrl] = useState(
    project.graph.app.cloud?.backendUrl ?? 'http://127.0.0.1:8787',
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const page = project.graph.screens.find((s) => s.id === pageId);
  const saveCloud = () => {
    let url: URL;
    try {
      url = new URL(cloudUrl.trim());
      if (
        url.origin !== cloudUrl.trim() ||
        (url.protocol !== 'https:' &&
          !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))
      )
        throw new Error();
    } catch {
      notify('Use an HTTPS origin or a loopback development origin, without a path.', 'error');
      return;
    }
    void edit((p) => {
      p.graph.app.cloud = { provider: 'supabase', backendUrl: url.origin };
    })
      .then(() =>
        notify('Cloud backend saved. Export the web app to configure its server and database.'),
      )
      .catch(() => {});
  };
  const applyJson = () => {
    try {
      const parsed = JSON.parse(json) as BuilderProject;
      void edit((p) => {
        if (!parsed.graph)
          throw new Error(
            'Import a builder project with version, graph, profile, and touched fields.',
          );
        Object.assign(p, parsed);
      })
        .then(() => {
          notify('Project validated and applied.');
          onApplied();
        })
        .catch(() => {});
    } catch (e) {
      notify(String(e), 'error');
    }
  };
  const deletePage = () => {
    if (!page) return;
    void edit((p) => {
      const ids = pageIds(page);
      p.graph.screens = p.graph.screens.filter((s) => s.id !== page.id);
      for (const b of p.graph.blocks)
        for (const [key, action] of Object.entries(b.design?.actions ?? {})) {
          if (action.type === 'navigate' && action.screen === page.id)
            b.design!.actions![key] = { type: 'none' };
        }
      p.graph.blocks = p.graph.blocks.filter((b) => !ids.includes(b.id));
      p.graph.wires = p.graph.wires?.filter(
        (w) => w.to.screen !== page.id && !ids.includes(w.from.instance),
      );
    })
      .then(onPageDeleted)
      .catch(() => {});
  };
  return (
    <div className="developer-panel">
      <section className="dev-section">
        <span className="cat-tile large cat-integration">
          <Globe2 size={17} />
        </span>
        <div>
          <h2>Cloud services</h2>
          <p className="muted">
            Connect a Supabase app backend. Provider keys stay in the exported server environment;
            the graph stores only this public URL.
          </p>
          <div className="inline-field">
            <input
              aria-label="Cloud backend URL"
              value={cloudUrl}
              onChange={(e) => setCloudUrl(e.target.value)}
              placeholder="https://your-app.example.com"
            />
            <button disabled={saving} onClick={saveCloud}>
              {project.graph.app.cloud ? 'Save cloud connection' : 'Enable cloud services'}
            </button>
          </div>
          <p className="muted small">
            {project.graph.app.cloud
              ? 'Cloud enabled · web target · confirmed email/Google accounts · server-enforced plans.'
              : 'Enable cloud services before adding real account, onboarding, or payment blocks.'}
          </p>
        </div>
      </section>
      <section className="dev-section">
        <span className="cat-tile large cat-code">
          <Code2 size={17} />
        </span>
        <div>
          <h2>Project contract</h2>
          <p className="muted">
            Your project is an open graph. Edit its JSON, bring your own blocks, and extend the
            exported source.
          </p>
          <div className="developer-actions">
            <button
              onClick={() =>
                download(
                  new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
                  project.graph.app.slug + '.blockfw.json',
                )
              }
            >
              <Download size={14} /> Save project file
            </button>
            <button onClick={() => fileInput.current?.click()}>
              <Upload size={14} /> Import project
            </button>
            <button onClick={onContracts}>
              <Layers size={14} /> Block contracts
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setJson(await file.text());
                } catch (err) {
                  notify(String(err), 'error');
                }
              }}
            />
          </div>
        </div>
      </section>
      <label className="field">
        <span>Project JSON</span>
        <textarea
          className="code-editor"
          aria-label="Project JSON"
          spellCheck={false}
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
      </label>
      <div className="developer-actions">
        <button className="primary" onClick={applyJson}>
          <Check size={14} /> Validate & apply
        </button>
        {page && (
          <button
            className="danger"
            disabled={project.graph.screens.length < 2}
            onClick={deletePage}
          >
            <Trash2 size={14} /> Delete current page
          </button>
        )}
      </div>
      <p className="muted small">
        A page’s blocks array defines rendering order. Node positions only arrange the canvas.
        Explicit event wires override automatic routing.
      </p>
    </div>
  );
}
