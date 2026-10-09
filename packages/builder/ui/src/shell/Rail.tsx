import {
  Code2,
  Keyboard,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  Plus,
  Search,
  Sparkles,
  SquarePlus,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import type { ThemePreference } from './hooks';
import { modKey } from './hooks';

interface Item {
  label: string;
  icon: LucideIcon;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}

function RailButton({ item }: { item: Item }) {
  const Icon = item.icon;
  return (
    <button
      className={'rail-button ' + (item.active ? 'active' : '')}
      aria-label={item.label}
      aria-pressed={item.active}
      disabled={item.disabled}
      onClick={item.run}
      data-tip={item.label + (item.hint ? '  ' + item.hint : '')}
    >
      <Icon size={19} strokeWidth={1.7} />
    </button>
  );
}

interface Props {
  navigatorOpen: boolean;
  libraryOpen: boolean;
  canAddBlocks: boolean;
  aiOpen: boolean;
  theme: ThemePreference;
  onNavigator: () => void;
  onLibrary: () => void;
  onSearch: () => void;
  onAI: () => void;
  onNewApp: () => void;
  onProfile: () => void;
  onDeveloper: () => void;
  onShortcuts: () => void;
  onTheme: (next: ThemePreference) => void;
}

const nextTheme: Record<ThemePreference, ThemePreference> = {
  system: 'dark',
  dark: 'light',
  light: 'system',
};
const themeIcon: Record<ThemePreference, LucideIcon> = { system: Monitor, dark: Moon, light: Sun };

export function Rail(props: Props) {
  const top: Item[] = [
    {
      label: 'Pages and layers',
      icon: PanelLeft,
      hint: '[',
      active: props.navigatorOpen,
      run: props.onNavigator,
    },
    {
      label: 'Add blocks',
      icon: Plus,
      active: props.libraryOpen && props.canAddBlocks,
      disabled: !props.canAddBlocks,
      run: props.onLibrary,
    },
    { label: 'Search and commands', icon: Search, hint: modKey + ' K', run: props.onSearch },
    { label: 'AI assistant', icon: Sparkles, hint: '/', active: props.aiOpen, run: props.onAI },
    { label: 'Brand & app profile', icon: Palette, run: props.onProfile },
    { label: 'New app', icon: SquarePlus, run: props.onNewApp },
  ];
  const bottom: Item[] = [
    { label: 'Developer tools', icon: Code2, run: props.onDeveloper },
    { label: 'Keyboard shortcuts', icon: Keyboard, hint: '?', run: props.onShortcuts },
    {
      label: 'Theme: ' + props.theme,
      icon: themeIcon[props.theme],
      run: () => props.onTheme(nextTheme[props.theme]),
    },
  ];
  return (
    <nav className="rail" aria-label="Studio tools">
      <div className="rail-group">
        {top.map((item) => (
          <RailButton key={item.label} item={item} />
        ))}
      </div>
      <div className="rail-group">
        {bottom.map((item) => (
          <RailButton key={item.label} item={item} />
        ))}
      </div>
    </nav>
  );
}
