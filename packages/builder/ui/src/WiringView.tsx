import { useState } from 'react';
import { api, type BuilderProject, type WiringReport } from './api';

interface Props {
  project: BuilderProject;
  wiring: WiringReport | null;
  onChanged: () => void;
}

/**
 * Wiring view: every resolved wire, its origin, and its target. Manual
 * overrides can be added (event → screen) or removed; the engine
 * re-resolves deterministically on the next compile.
 */
export function WiringView({ project, wiring, onChanged }: Props) {
  const [event, setEvent] = useState('');
  const [screen, setScreen] = useState('');

  // Known events from the last compile, offered as suggestions.
  const knownEvents = [
    ...new Set((wiring?.resolved ?? []).map((w) => `${w.from.instance}.${w.from.event}`)),
  ];

  const addWire = async () => {
    if (!event.includes('.') || !screen) return;
    const [instance, ...rest] = event.split('.');
    const eventName = rest.join('.');
    const next = structuredClone(project);
    next.graph.wires = [
      ...(next.graph.wires ?? []),
      { from: { instance: instance!, event: eventName }, to: { screen } },
    ];
    await api.saveProject(next);
    setEvent('');
    onChanged();
  };

  const removeWire = async (index: number) => {
    const next = structuredClone(project);
    next.graph.wires = (next.graph.wires ?? []).filter((_, i) => i !== index);
    await api.saveProject(next);
    onChanged();
  };

  const userWires = project.graph.wires ?? [];

  return (
    <div className="wiring-view">
      <h2>Wiring</h2>
      {wiring ? (
        <>
          <table className="wires">
            <thead>
              <tr>
                <th>From</th>
                <th>Event</th>
                <th>To screen</th>
                <th>Origin</th>
              </tr>
            </thead>
            <tbody>
              {wiring.resolved.map((w, i) => (
                <tr key={i}>
                  <td>{w.from.instance}</td>
                  <td>
                    <code>{w.from.event}</code>
                  </td>
                  <td>
                    {w.to.screen}
                    {w.to.instance ? ` (${w.to.instance})` : ''}
                  </td>
                  <td>
                    <span className={`origin origin-${w.origin}`}>{w.origin}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {wiring.warnings.length > 0 && (
            <div className="warnings">
              {wiring.warnings.map((w, i) => (
                <div key={i} className="warning">
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}
          {wiring.unmet.length > 0 && (
            <div className="warnings">
              {wiring.unmet.map((u, i) => (
                <div key={i} className="warning error">
                  ✖ {u.instance}: {u.reason}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p>Compile the project to see the wiring report.</p>
      )}

      <h3>Manual overrides</h3>
      <div className="wire-form">
        <input
          placeholder="b4.home.itemSelected"
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          title="instance.event"
          list="known-events"
        />
        <datalist id="known-events">
          {knownEvents.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
        <select value={screen} onChange={(e) => setScreen(e.target.value)}>
          <option value="">→ screen…</option>
          {project.graph.screens.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} — {s.title}
            </option>
          ))}
        </select>
        <button onClick={() => void addWire()} disabled={!event.includes('.') || !screen}>
          Add wire
        </button>
      </div>
      {userWires.length > 0 && (
        <ul className="override-list">
          {userWires.map((w, i) => (
            <li key={i}>
              <code>
                {w.from.instance}.{w.from.event}
              </code>{' '}
              → {w.to.screen}
              <button onClick={() => void removeWire(i)} title="Remove override">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
