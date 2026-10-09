import { modKey } from './hooks';

const sections: Array<[string, Array<[string[], string]>]> = [
  [
    'General',
    [
      [[modKey, 'K'], 'Command palette'],
      [['/'], 'Ask AI about the selection'],
      [['?'], 'This shortcut sheet'],
      [[modKey, 'Enter'], 'Preview the app'],
      [[modKey, 'Z'], 'Undo'],
      [[modKey, 'Shift', 'Z'], 'Redo'],
    ],
  ],
  [
    'Modes',
    [
      [['1'], 'Flow: pages and connections'],
      [['2'], 'Design: compose the open page'],
      [['6'], 'Ship: readiness and export'],
    ],
  ],
  [
    'Canvas',
    [
      [['Shift', '1'], 'Fit everything in view'],
      [['Delete'], 'Remove the selection or cut a wire'],
      [['Double-click'], 'Open a page'],
      [['Drag port'], 'Connect an event'],
    ],
  ],
  [
    'Panels',
    [
      [['['], 'Toggle pages and layers'],
      [[']'], 'Toggle the block library'],
      [['.'], 'Focus mode: hide all panels'],
      [['Esc'], 'Close the open panel or dialog'],
    ],
  ],
];

export function ShortcutSheet() {
  return (
    <div className="shortcut-sheet">
      {sections.map(([title, rows]) => (
        <section key={title}>
          <h3>{title}</h3>
          {rows.map(([keys, label]) => (
            <div className="shortcut-row" key={label}>
              <span>{label}</span>
              <span className="shortcut-keys">
                {keys.map((k) => (
                  <kbd className="kbd" key={k}>
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
