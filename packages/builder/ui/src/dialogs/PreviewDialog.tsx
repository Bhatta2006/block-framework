import { ArrowUpRight, Monitor, Smartphone } from 'lucide-react';
import type { BuilderProject } from '../api';

export function PreviewDialog({
  project,
  pageId,
  platform,
  setPlatform,
  setPage,
}: {
  project: BuilderProject;
  pageId: string;
  platform: 'web' | 'mobile';
  setPlatform: (p: 'web' | 'mobile') => void;
  setPage: (id: string) => void;
}) {
  const src = '/api/run?page=' + encodeURIComponent(pageId);
  return (
    <div className="preview-studio">
      <div className="preview-toolbar">
        <select aria-label="Preview page" value={pageId} onChange={(e) => setPage(e.target.value)}>
          {project.graph.screens.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <div className="segmented" aria-label="Preview device">
          <button
            className={platform === 'web' ? 'selected' : ''}
            aria-pressed={platform === 'web'}
            onClick={() => setPlatform('web')}
          >
            <Monitor size={14} /> Desktop
          </button>
          <button
            className={platform === 'mobile' ? 'selected' : ''}
            aria-pressed={platform === 'mobile'}
            onClick={() => setPlatform('mobile')}
          >
            <Smartphone size={14} /> Phone
          </button>
        </div>
        <span className="preview-note">
          {platform === 'mobile'
            ? project.graph.app.cloud
              ? 'Responsive phone preview · cloud apps currently export for web.'
              : 'Responsive phone preview · native source is available in Ship.'
            : 'Interactive preview · your connections run here.'}
        </span>
        <a className="button" href={src} target="_blank" rel="noreferrer">
          Open app <ArrowUpRight size={14} />
        </a>
      </div>
      <div className={'preview-device ' + platform}>
        {platform === 'web' && (
          <div className="browser-chrome" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>{project.graph.app.slug}.app</span>
          </div>
        )}
        <iframe
          key={JSON.stringify(project.graph) + pageId + platform}
          title="Interactive app preview"
          src={src}
        />
      </div>
    </div>
  );
}
