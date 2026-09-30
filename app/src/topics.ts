import { Category } from './types';

// Canonical topic taxonomy for the product. Every category filter, picker,
// and label in the app derives from this single source; screens must not
// maintain ad-hoc copies. `ALL` is a UI-only aggregate and never leaves the
// client as a category value.
export const TOPIC_CATEGORIES: Category[] = [
  'CRYPTO',
  'SPORTS',
  'WEATHER',
  'POLITICS',
  'CULTURE',
];

export type CategoryFilter = Category | 'ALL';

export const ALL_CATEGORIES: CategoryFilter[] = ['ALL', ...TOPIC_CATEGORIES];

export function categoryLabel(c: CategoryFilter): string {
  if (c === 'ALL') return 'All';
  return c.charAt(0) + c.slice(1).toLowerCase();
}
