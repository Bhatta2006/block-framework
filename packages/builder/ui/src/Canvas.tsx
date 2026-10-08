import { useState } from 'react';
import { api, type BuilderProject } from './api';

interface Props {
  project: BuilderProject;
  selectedScreen: string | null;
  onSelect: (screenId: string | null) => void;
  onChanged: () => void;
  previewBust: string;
}

function blockTypeOf(project: BuilderProject, screenId: string): string {
  const screen = project.graph.screens.find((s) => s.id === screenId);
  const block = project.graph.blocks.find((b) => b.id === screen?.block);
  return block?.type.split('@')[0] ?? '?';
}

/**
 * Lane-based canvas. Screens are cards in their lane; reordering is a list
 * operation (drag, or arrow buttons as a fallback). Each card shows a live
 * static preview of the generated block.
 */
export function Canvas({ project, selectedScreen, onSelect, onChanged, previewBust }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const lanes = [
    'main',
    ...project.graph.screens.map((s) => s.lane ?? 'main').filter((l) => l !== 'main'),
  ];
  const uniqueLanes = [...new Set(lanes)];

  const screensIn = (lane: string) =>
    project.graph.screens.filter((s) => (s.lane ?? 'main') === lane);

  const move = async (screenId: string, dir: -1 | 1) => {
    const lane = project.graph.screens.find((s) => s.id === screenId)?.lane ?? 'main';
    const ids = screensIn(lane).map((s) => s.id);
    const i = ids.indexOf(screenId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = { ...project, graph: { ...project.graph, screens: [...project.graph.screens] } };
    // Swap positions within the lane by reordering the global screen list.
    const global = next.graph.screens;
    const gi = global.findIndex((s) => s.id === ids[i]);
    const gj = global.findIndex((s) => s.id === ids[j]);
    const [moved] = global.splice(gi, 1);
    global.splice(gj, 0, moved!);
    await api.saveProject(next);
    onChanged();
  };

  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const lane = project.graph.screens.find((s) => s.id === targetId)?.lane ?? 'main';
    const dragLane = project.graph.screens.find((s) => s.id === dragId)?.lane ?? 'main';
    if (lane !== dragLane) {
      setDragId(null);
      return;
    }
    const next = { ...project, graph: { ...project.graph, screens: [...project.graph.screens] } };
    const global = next.graph.screens;
    const from = global.findIndex((s) => s.id === dragId);
    const to = global.findIndex((s) => s.id === targetId);
    const [moved] = global.splice(from, 1);
    global.splice(to, 0, moved!);
    setDragId(null);
    await api.saveProject(next);
    onChanged();
  };

  return (
    <div className="canvas">
      {uniqueLanes.map((lane) => (
        <section key={lane} className="lane">
          <h2>
            {lane === 'main' ? 'Main flow' : `Lane: ${lane}`}
            <span className="lane-hint">
              {lane === 'main' ? 'event-driven order' : 'reachable via tab bar'}
            </span>
          </h2>
          <div className="lane-cards">
            {screensIn(lane).map((screen, i) => (
              <div
                key={screen.id}
                className={`screen-card${selectedScreen === screen.id ? ' selected' : ''}${dragId === screen.id ? ' dragging' : ''}`}
                draggable
                onDragStart={() => setDragId(screen.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void onDrop(screen.id)}
                onClick={() => onSelect(screen.id)}
              >
                <div className="screen-card-head">
                  <span className="screen-index">{i + 1}</span>
                  <div>
                    <div className="screen-title">{screen.title}</div>
                    <div className="screen-block">{blockTypeOf(project, screen.id)}</div>
                  </div>
                </div>
                <iframe
                  title={`preview ${screen.id}`}
                  src={api.previewUrl(screen.block, previewBust)}
                  className="screen-preview"
                  loading="lazy"
                />
                <div className="screen-card-foot">
                  <button
                    title="Move earlier"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      void move(screen.id, -1);
                    }}
                  >
                    ←
                  </button>
                  <button
                    title="Move later"
                    disabled={i === screensIn(lane).length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      void move(screen.id, 1);
                    }}
                  >
                    →
                  </button>
                  <span className="screen-id">{screen.id}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
