import notesGraph from '../../../../examples/notes/graph.json';
import cloudNotesGraph from '../../../../examples/paper-cloud/graph.json';
import type { BlockSummary, BuilderProject } from './api';

export type TemplateId = 'starter' | 'notes' | 'cloud-notes';

export interface TemplateInfo {
  id: TemplateId;
  title: string;
  summary: string;
  detail: string;
  pages: number;
  targets: string;
  services: string;
  /** Page opened after creation. */
  entry: string;
  webOnly?: boolean;
}

export const templates: TemplateInfo[] = [
  {
    id: 'starter',
    title: 'Starter',
    summary: 'Two connected pages to shape any idea.',
    detail:
      'Start with two connected pages and four editable blocks. Build for web and mobile from the same canvas.',
    pages: 2,
    targets: 'Web + iOS + Android',
    services: 'No services needed',
    entry: 'welcome',
  },
  {
    id: 'notes',
    title: 'Notes',
    summary: 'A complete notes app with persistent records.',
    detail:
      'Five connected pages with autosave, folders, search, favorites, archive, trash, and backups. Notes stay on the device.',
    pages: 5,
    targets: 'Web + iOS + Android',
    services: 'On-device storage',
    entry: 'notes',
  },
  {
    id: 'cloud-notes',
    title: 'Cloud notes',
    summary: 'Accounts, a database, plans, and UPI checkout.',
    detail:
      'Real accounts, onboarding, private cloud notes, three plans, UPI checkout, and owner payment verification. Export includes the server and database migration. Provider setup required.',
    pages: 10,
    targets: 'Web',
    services: 'Supabase + UPI',
    entry: 'notes',
    webOnly: true,
  },
];

const slugify = (name: string, fallback: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, '') || fallback;

/** Builds a fresh project for a template, keeping the caller's project envelope fields. */
export function createFromTemplate(
  base: BuilderProject,
  template: TemplateId,
  name: string,
  library: BlockSummary[],
): BuilderProject {
  const p = structuredClone(base);
  p.profile = null;
  p.touched = [];
  if (template !== 'starter') {
    p.graph = structuredClone(
      template === 'cloud-notes' ? cloudNotesGraph : notesGraph,
    ) as BuilderProject['graph'];
    p.graph.app.name = name;
    p.graph.app.slug = slugify(name, 'notes-app');
    return p;
  }
  const hero = library.find((b) => b.id === 'content.hero@1.0.0')!;
  p.graph = {
    schemaVersion: '0',
    app: {
      name,
      slug: slugify(name, 'my-app'),
      version: '1.0.0',
      theme: { primaryColor: '#345E4F', backgroundColor: '#F8F9F5', textColor: '#26372F' },
    },
    screens: [
      { id: 'welcome', title: 'Welcome', block: 'hero', blocks: ['hero', 'intro'] },
      { id: 'next', title: 'Next chapter', block: 'story', blocks: ['story', 'back'] },
    ],
    blocks: [
      {
        id: 'hero',
        type: 'content.hero@1.0.0',
        config: { ...hero.defaultConfig, title: name + '.', ctaText: 'Explore the next chapter' },
      },
      {
        id: 'intro',
        type: 'content.text@1.0.0',
        config: {
          title: 'Made for your next good idea.',
          body: 'Select a block to make it your own. Add more pages, connect their events, and bring your idea to life.',
        },
      },
      {
        id: 'story',
        type: 'content.text@1.0.0',
        config: {
          title: 'Your next chapter.',
          body: 'Every app starts with a small step. This page is yours to shape.',
        },
      },
      {
        id: 'back',
        type: 'action.button@1.0.0',
        config: { ctaText: 'Back to the beginning' },
      },
    ],
    wires: [
      { from: { instance: 'hero', event: 'action.pressed' }, to: { screen: 'next' } },
      { from: { instance: 'back', event: 'action.pressed' }, to: { screen: 'welcome' } },
    ],
  };
  return p;
}
