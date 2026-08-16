'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Bell } from 'lucide-react';
import type { Category } from '@/lib/queries';
import type { SubscriptionFacets } from '@/lib/queries';
import { createSubscriptionAction, previewMatchCountAction } from '@/lib/actions';
import { CATEGORY_COLOR } from '@/lib/format';

/** Impact floor options — mirrors the Insights feed's threshold filter. */
const IMPACT_OPTIONS = [
  { value: '', label: 'Any impact' },
  { value: '2', label: 'Low (2+)' },
  { value: '3', label: 'Medium (3+)' },
  { value: '4', label: 'High (4+)' },
  { value: '5', label: 'Act now (5)' },
];

const FREQUENCY_OPTIONS = [
  { value: 'immediate', label: 'Immediately' },
  { value: 'daily', label: 'Daily digest' },
  { value: 'weekly', label: 'Weekly digest' },
];

function splitKeywords(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** Prefilled values carried in from a contextual "subscribe to this" link. */
export interface SubscriptionFormInitial {
  vendors?: string[];
  categories?: Category[];
  impact?: string;
  keywords?: string;
  label?: string;
}

/**
 * Build a subscription rule. Every field carries a permanent label (never a
 * placeholder-as-label), the choices reuse the same vocabulary as the Insights feed, and a
 * live "matches N insights" line gives the rule a scent before it is saved. An empty rule is
 * valid and matches everything — so the fastest path is: type an email, pick a threshold,
 * save. `initial` lets a "subscribe to this" link elsewhere in the app land here with the
 * relevant filters already selected.
 */
export function SubscriptionForm({
  facets,
  initial,
}: {
  facets: SubscriptionFacets;
  initial?: SubscriptionFormInitial;
}) {
  const [vendors, setVendors] = useState<Set<string>>(new Set(initial?.vendors ?? []));
  const [categories, setCategories] = useState<Set<Category>>(
    new Set(initial?.categories ?? []),
  );
  const [impact, setImpact] = useState(initial?.impact ?? '');
  const [keywords, setKeywords] = useState(initial?.keywords ?? '');
  const [count, setCount] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  // Always show a chip for a prefilled vendor, even if it is not in the facet list
  // (e.g. a slightly different spelling) — otherwise the selection would be invisible.
  const vendorOptions = useMemo(
    () => [...new Set([...facets.vendors, ...vendors])],
    [facets.vendors, vendors],
  );

  const filters = useMemo(
    () => ({
      vendors: [...vendors],
      categories: [...categories],
      keywords: splitKeywords(keywords),
      minImpact: impact ? Number.parseInt(impact, 10) : null,
    }),
    [vendors, categories, keywords, impact],
  );

  // Debounced live preview: recount matches whenever the filters change.
  useEffect(() => {
    const handle = setTimeout(() => {
      startTransition(async () => {
        setCount(await previewMatchCountAction(filters));
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [filters]);

  return (
    <form
      action={createSubscriptionAction}
      className="space-y-5 border border-line bg-card p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email address" hint="Where this alert is delivered.">
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-md border border-field-line bg-field px-3 py-2 text-[13px] text-ink-strong placeholder:text-ink-faint outline-none focus:border-accent"
          />
        </Field>
        <Field
          label="Name"
          hint="Optional — we'll name it from the filters if you skip it."
        >
          <input
            type="text"
            name="label"
            defaultValue={initial?.label ?? ''}
            placeholder="e.g. Sonatype security"
            className="w-full rounded-md border border-field-line bg-field px-3 py-2 text-[13px] text-ink-strong placeholder:text-ink-faint outline-none focus:border-accent"
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[12px] font-medium text-ink">Companies</legend>
        <p className="mb-2 text-[11px] text-ink-faint">
          Leave all unchecked to include every vendor.
        </p>
        <div className="flex flex-wrap gap-2">
          {vendorOptions.length === 0 && (
            <span className="text-[12px] text-ink-faint">No vendors yet.</span>
          )}
          {vendorOptions.map((vendor) => (
            <CheckChip
              key={vendor}
              name="vendors"
              value={vendor}
              checked={vendors.has(vendor)}
              onChange={() => setVendors((s) => toggle(s, vendor))}
            >
              {vendor}
            </CheckChip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[12px] font-medium text-ink">Update types</legend>
        <div className="flex flex-wrap gap-2">
          {facets.categories.map((category) => (
            <CheckChip
              key={category}
              name="categories"
              value={category}
              checked={categories.has(category)}
              onChange={() => setCategories((s) => toggle(s, category))}
              dotColor={CATEGORY_COLOR[category]}
            >
              {category}
            </CheckChip>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minimum severity" hint="Only alert at or above this impact.">
          <select
            name="impact"
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            className="w-full rounded-md border border-field-line bg-field px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
          >
            {IMPACT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Keywords"
          hint="Comma-separated. Matches title, summary, and why-it-matters."
        >
          <input
            type="text"
            name="keywords"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="e.g. CVE, pricing, acquisition"
            className="w-full rounded-md border border-field-line bg-field px-3 py-2 text-[13px] text-ink-strong placeholder:text-ink-faint outline-none focus:border-accent"
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[12px] font-medium text-ink">Frequency</legend>
        <div className="flex flex-wrap gap-4">
          {FREQUENCY_OPTIONS.map((o, i) => (
            <label
              key={o.value}
              className="inline-flex items-center gap-2 text-[13px] text-ink"
            >
              <input
                type="radio"
                name="frequency"
                value={o.value}
                defaultChecked={i === 0}
                className="accent-accent"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
        <p className="text-[13px] text-ink-dim" aria-live="polite">
          {count === null ? (
            'Calculating matches…'
          ) : (
            <>
              Matches <strong className="text-ink-strong tabular-nums">{count}</strong>{' '}
              current insight{count === 1 ? '' : 's'}.
            </>
          )}
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-faint">{hint}</span>}
    </label>
  );
}

function CheckChip({
  name,
  value,
  checked,
  onChange,
  dotColor,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  dotColor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors ${
        checked
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line text-ink-dim hover:border-accent hover:text-accent'
      }`}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {dotColor && (
        <span className="size-2 rounded-full" style={{ backgroundColor: dotColor }} />
      )}
      {children}
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-[36px] items-center gap-2 rounded-[4px] bg-accent px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      <Bell className="size-4" />
      {pending ? 'Saving…' : 'Save subscription'}
    </button>
  );
}
