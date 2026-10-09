/** The six profile questions. */
export interface BuilderProfile {
  /** e.g. "HabitFlow" */
  appName: string;
  /** e.g. "busy professionals" */
  audience: string;
  /** "playful" | "professional" | "minimal" (free text allowed, matched loosely) */
  tone: string;
  /** hex, e.g. "#4F46E5" */
  brandColor: string;
  /** e.g. "4.99" */
  price: string;
  /** ISO code, e.g. "USD" */
  currency: string;
}

export const PROFILE_QUESTIONS: Array<{
  key: keyof BuilderProfile;
  label: string;
  placeholder: string;
  kind: 'text' | 'color' | 'select';
  options?: string[];
}> = [
  { key: 'appName', label: 'What is your app called?', placeholder: 'HabitFlow', kind: 'text' },
  { key: 'audience', label: 'Who is it for?', placeholder: 'busy professionals', kind: 'text' },
  {
    key: 'tone',
    label: 'What tone should the copy use?',
    placeholder: 'playful',
    kind: 'select',
    options: ['playful', 'professional', 'minimal'],
  },
  { key: 'brandColor', label: 'Pick a brand color', placeholder: '#4F46E5', kind: 'color' },
  { key: 'price', label: 'Monthly price (numbers only)', placeholder: '4.99', kind: 'text' },
  {
    key: 'currency',
    label: 'Currency',
    placeholder: 'USD',
    kind: 'select',
    options: ['USD', 'EUR', 'GBP', 'INR'],
  },
];
