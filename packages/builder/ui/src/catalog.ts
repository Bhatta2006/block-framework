import {
  BadgeCheck,
  ChartColumn,
  CreditCard,
  Database,
  FileText,
  Gauge,
  KeyRound,
  LayoutList,
  ListChecks,
  MousePointerClick,
  PanelTop,
  ShieldCheck,
  SlidersHorizontal,
  SquarePen,
  Type,
  UserCog,
  UserPlus,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** Node and palette category; each maps to a `--cat-*` token. */
export type Category =
  'ui' | 'data' | 'logic' | 'integration' | 'ai' | 'account' | 'code' | 'infra';
/** What actually runs behind a block, shown so no demo is mistaken for a live service. */
export type Runtime = 'local' | 'demo' | 'cloud';

export interface BlockMeta {
  name: string;
  description: string;
  group: string;
  category: Category;
  runtime: Runtime;
  icon: LucideIcon;
}

const meta: Record<string, BlockMeta> = {
  'content.hero': {
    name: 'Hero section',
    description: 'A bold introduction and call to action',
    group: 'Sections',
    category: 'ui',
    runtime: 'local',
    icon: PanelTop,
  },
  'content.text': {
    name: 'Rich content',
    description: 'A heading and supporting copy',
    group: 'Sections',
    category: 'ui',
    runtime: 'local',
    icon: Type,
  },
  'action.button': {
    name: 'Action button',
    description: 'A focused, connected call to action',
    group: 'Sections',
    category: 'logic',
    runtime: 'local',
    icon: MousePointerClick,
  },
  'home.list': {
    name: 'Collection',
    description: 'Lists and browsable collections',
    group: 'Content',
    category: 'ui',
    runtime: 'local',
    icon: LayoutList,
  },
  'content.detail': {
    name: 'Item detail',
    description: 'Dynamic content from a selection',
    group: 'Content',
    category: 'ui',
    runtime: 'local',
    icon: FileText,
  },
  'stats.overview': {
    name: 'Analytics',
    description: 'Metrics with a clear visual hierarchy',
    group: 'Content',
    category: 'ui',
    runtime: 'local',
    icon: ChartColumn,
  },
  'onboarding.quiz': {
    name: 'Onboarding',
    description: 'Questions, answers, and progress',
    group: 'Content',
    category: 'ui',
    runtime: 'local',
    icon: ListChecks,
  },
  'profile.card': {
    name: 'Profile',
    description: 'People, bios, and profile stats',
    group: 'Content',
    category: 'ui',
    runtime: 'local',
    icon: UserRound,
  },
  'settings.list': {
    name: 'Settings',
    description: 'Preferences and local toggles',
    group: 'Content',
    category: 'ui',
    runtime: 'local',
    icon: SlidersHorizontal,
  },
  'data.collection': {
    name: 'Record collection',
    description: 'Persistent notes, search, folders, and backups',
    group: 'Data',
    category: 'data',
    runtime: 'local',
    icon: Database,
  },
  'data.editor': {
    name: 'Record editor',
    description: 'Autosave, tags, Markdown, and checklists',
    group: 'Data',
    category: 'data',
    runtime: 'local',
    icon: SquarePen,
  },
  'data.summary': {
    name: 'Collection summary',
    description: 'Live counts from a shared collection',
    group: 'Data',
    category: 'data',
    runtime: 'local',
    icon: Gauge,
  },
  'auth.email': {
    name: 'Sign in',
    description: 'Email sign-in and sign-up screens',
    group: 'Accounts & billing',
    category: 'account',
    runtime: 'demo',
    icon: KeyRound,
  },
  'paywall.basic': {
    name: 'Pricing',
    description: 'Plans and subscription choices',
    group: 'Accounts & billing',
    category: 'account',
    runtime: 'demo',
    icon: CreditCard,
  },
  'auth.account': {
    name: 'Cloud account sign-in',
    description: 'Real Google and verified email accounts',
    group: 'Cloud services',
    category: 'integration',
    runtime: 'cloud',
    icon: ShieldCheck,
  },
  'onboarding.profile': {
    name: 'Cloud onboarding',
    description: 'Account onboarding saved in the cloud',
    group: 'Cloud services',
    category: 'integration',
    runtime: 'cloud',
    icon: UserPlus,
  },
  'billing.plans': {
    name: 'UPI plans and checkout',
    description: 'UPI checkout with verified paid access',
    group: 'Cloud services',
    category: 'integration',
    runtime: 'cloud',
    icon: Wallet,
  },
  'account.settings': {
    name: 'Cloud account settings',
    description: 'Cloud identity, plans, and sign out',
    group: 'Cloud services',
    category: 'integration',
    runtime: 'cloud',
    icon: UserCog,
  },
  'billing.review': {
    name: 'Owner payment review',
    description: 'Owner review of actual payment receipts',
    group: 'Cloud services',
    category: 'integration',
    runtime: 'cloud',
    icon: BadgeCheck,
  },
};

export const groupOrder = ['Sections', 'Content', 'Data', 'Accounts & billing', 'Cloud services'];

export const runtimeLabel: Record<Runtime, string> = {
  local: 'Runs locally',
  demo: 'Demo service',
  cloud: 'Needs cloud backend',
};

const baseId = (type: string) => type.split('@')[0]!;

export function blockMeta(type: string): BlockMeta {
  const id = baseId(type);
  return (
    meta[id] ?? {
      name: id,
      description: 'Custom block',
      group: 'Custom',
      category: 'code',
      runtime: 'local',
      icon: FileText,
    }
  );
}

export const blockName = (type: string) => blockMeta(type).name;

/** Display name for an instance; the email block's sign-up variant reads as its own screen. */
export const instanceName = (type: string, variant?: string) =>
  type.startsWith('auth.email') && variant === 'signup' ? 'Sign up' : blockName(type);

/** "auth.completed" → "Auth completed"; "home.itemSelected" → "Home item selected". */
export function eventLabel(event: string) {
  const parts = event.split('.');
  const words = parts[0] === 'element' ? parts.slice(1) : parts;
  const text = words
    .join(' ')
    .replace(/[_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "ctaText" → "CTA text", "collectionKey" → "Collection key"; used for schema fields without titles. */
export function fieldLabel(key: string) {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((w) => (['cta', 'url', 'id', 'upi', 'ai'].includes(w) ? w.toUpperCase() : w));
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
