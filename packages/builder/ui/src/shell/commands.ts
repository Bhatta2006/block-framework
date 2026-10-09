import {
  AppWindow,
  Code2,
  Keyboard,
  Moon,
  Palette,
  PenTool,
  Play,
  Plus,
  Redo2,
  Rocket,
  Sparkles,
  SquarePlus,
  Undo2,
  Workflow,
} from 'lucide-react';
import type { BlockSummary, BuilderProject } from '../api';
import { blockMeta } from '../catalog';
import type { PaletteCommand } from './CommandPalette';
import { modKey } from './hooks';
import type { Mode } from './TopBar';

type DialogName = 'preview' | 'apps' | 'new' | 'profile' | 'developer' | 'shortcuts';

export interface CommandContext {
  project: BuilderProject;
  library: BlockSummary[];
  pageOpen: boolean;
  theme: 'dark' | 'light';
  open: (dialog: DialogName) => void;
  mode: (mode: Mode) => void;
  openPage: (id: string) => void;
  addPage: () => void;
  addBlock: (info: BlockSummary) => void;
  askAI: () => void;
  travel: (direction: 'undo' | 'redo') => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

/** Everything the ⌘K palette can do, derived from the current project and selection. */
export function buildCommands(c: CommandContext): PaletteCommand[] {
  const other = c.theme === 'dark' ? 'light' : 'dark';
  const cmd = (
    id: string,
    group: PaletteCommand['group'],
    label: string,
    icon: PaletteCommand['icon'],
    run: () => void,
    shortcut?: string,
    keywords?: string[],
  ): PaletteCommand => ({ id, group, label, icon, run, shortcut, keywords });
  return [
    cmd('preview', 'Actions', 'Preview app', Play, () => c.open('preview'), modKey + ' ↵'),
    cmd('export', 'Actions', 'Export source code', Rocket, () => c.mode('ship'), undefined, [
      'download',
      'zip',
      'ship',
    ]),
    cmd('ai', 'Actions', 'Ask AI to change something', Sparkles, c.askAI, '/'),
    cmd('page', 'Actions', 'Add a page', Plus, c.addPage),
    cmd('undo', 'Actions', 'Undo', Undo2, () => c.travel('undo'), modKey + ' Z'),
    cmd('redo', 'Actions', 'Redo', Redo2, () => c.travel('redo'), modKey + ' ⇧ Z'),
    cmd('flow', 'Navigate', 'Flow mode', Workflow, () => c.mode('flow'), '1'),
    cmd('design', 'Navigate', 'Design mode', PenTool, () => c.mode('design'), '2'),
    cmd('ship', 'Navigate', 'Ship mode', Rocket, () => c.mode('ship'), '6'),
    cmd('apps', 'Navigate', 'Switch apps', AppWindow, () => c.open('apps')),
    ...c.project.graph.screens.map((s, i) =>
      cmd(
        'page-' + s.id,
        'Pages',
        String(i + 1).padStart(2, '0') + '  ' + s.title,
        AppWindow,
        () => c.openPage(s.id),
        undefined,
        [s.id],
      ),
    ),
    ...(c.pageOpen
      ? c.library.map((b) => {
          const meta = blockMeta(b.id);
          return cmd(
            'insert-' + b.id,
            'Insert',
            'Insert ' + meta.name,
            meta.icon,
            () => c.addBlock(b),
            undefined,
            [meta.description],
          );
        })
      : []),
    cmd('new', 'Settings', 'Create a new app', SquarePlus, () => c.open('new')),
    cmd('profile', 'Settings', 'Brand & app profile', Palette, () => c.open('profile')),
    cmd('dev', 'Settings', 'Developer tools', Code2, () => c.open('developer')),
    cmd('theme', 'Settings', 'Switch to ' + other + ' theme', Moon, () => c.setTheme(other)),
    cmd('keys', 'Settings', 'Keyboard shortcuts', Keyboard, () => c.open('shortcuts'), '?'),
  ];
}
