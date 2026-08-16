import type { ReactNode } from 'react';
import {
  siAnthropic,
  siChainguard,
  siCloudflare,
  siCloudsmith,
  siCoderabbit,
  siDatabricks,
  siDatadog,
  siDocker,
  siEpicgames,
  siGithub,
  siGitlab,
  siGoogle,
  siGrafana,
  siHarbor,
  siJetbrains,
  siJfrog,
  siMeta,
  siMistralai,
  siNvidia,
  siSnyk,
  siSonatype,
  siSpacex,
  siVercel,
  type SimpleIcon,
} from 'simple-icons';

/**
 * Brand marks for tracked vendors. We source the bulk from `simple-icons` so the
 * demo runs fully offline (no logo CDN, no keys). The handful of vendors that
 * simple-icons drops for trademark reasons (AWS, Microsoft, and text-only marks
 * like OpenAI, Oracle, IBM) are hand-rolled as small, self-contained SVG or
 * typographic tiles. Anything unmapped falls back to initials.
 */
export type VendorLogo = {
  title: string;
  /** Tile background colour (usually the brand colour). */
  bg: string;
  /** Pre-sized inner SVG for the tile. */
  node: ReactNode;
};

/** simple-icons ship a single monochrome path + an official brand hex. */
function glyphLogo(icon: SimpleIcon): VendorLogo {
  return {
    title: icon.title,
    bg: `#${icon.hex}`,
    node: (
      <svg
        role="img"
        viewBox="0 0 24 24"
        fill="#fff"
        className="size-[58%]"
        aria-hidden="true"
      >
        <path d={icon.path} />
      </svg>
    ),
  };
}

/**
 * A brand-coloured typographic tile for vendors simple-icons doesn't ship (mostly
 * trademark-only wordmarks). A short monogram on the brand colour reads as an
 * intentional mark rather than the neutral initials fallback.
 */
function markLogo(title: string, bg: string, mark: string, fg = '#fff'): VendorLogo {
  return {
    title,
    bg,
    node: (
      <span
        className="text-[11px] font-bold leading-none tracking-tight"
        style={{ color: fg }}
      >
        {mark}
      </span>
    ),
  };
}

/** Microsoft's four-square symbol on white (positions are brand-mandated). */
const microsoftLogo: VendorLogo = {
  title: 'Microsoft',
  bg: '#ffffff',
  node: (
    <svg viewBox="0 0 24 24" className="size-[62%]" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  ),
};

/** AWS as its Squid Ink tile with the Amazon Orange smile beneath the wordmark. */
const awsLogo: VendorLogo = {
  title: 'AWS',
  bg: '#232F3E',
  node: (
    <svg viewBox="0 0 40 26" className="w-[76%]" aria-hidden="true">
      <text
        x="20"
        y="12"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="Arial, Helvetica, sans-serif"
        fill="#fff"
      >
        aws
      </text>
      <path
        d="M5 19 C 13 24, 27 24, 33 19"
        stroke="#FF9900"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M30 16.4 L35.5 18.8 L30.2 21.6 Z" fill="#FF9900" />
    </svg>
  ),
};

const VENDOR_LOGOS: Record<string, VendorLogo> = {
  // --- Supply-chain / artifact-management competitors -----------------------
  jfrog: glyphLogo(siJfrog),
  sonatype: glyphLogo(siSonatype),
  gitlab: glyphLogo(siGitlab),
  github: glyphLogo(siGithub),
  docker: glyphLogo(siDocker),
  cloudsmith: glyphLogo(siCloudsmith),
  harbor: glyphLogo(siHarbor),
  snyk: glyphLogo(siSnyk),
  chainguard: glyphLogo(siChainguard),
  microsoft: microsoftLogo,
  aws: awsLogo,

  // --- Wider tech landscape surfaced by the corpus --------------------------
  anthropic: glyphLogo(siAnthropic),
  cloudflare: glyphLogo(siCloudflare),
  coderabbit: glyphLogo(siCoderabbit),
  databricks: glyphLogo(siDatabricks),
  datadog: glyphLogo(siDatadog),
  'epic games': glyphLogo(siEpicgames),
  google: glyphLogo(siGoogle),
  grafana: glyphLogo(siGrafana),
  jetbrains: glyphLogo(siJetbrains),
  meta: glyphLogo(siMeta),
  'mistral ai': glyphLogo(siMistralai),
  nvidia: glyphLogo(siNvidia),
  spacex: glyphLogo(siSpacex),
  vercel: glyphLogo(siVercel),

  // --- Trademark-only marks simple-icons doesn't ship -----------------------
  openai: markLogo('OpenAI', '#000000', 'OAI'),
  oracle: markLogo('Oracle', '#C74634', 'O'),
  ibm: markLogo('IBM', '#0530AD', 'IBM'),
  sigstore: markLogo('Sigstore', '#2A9D8F', 'SS'),
  rubrik: markLogo('Rubrik', '#00C08B', 'R'),
  xai: markLogo('xAI', '#000000', 'X'),
};

/** Look up a vendor's brand mark, or `null` to signal "use initials". */
export function vendorLogo(vendor: string | null): VendorLogo | null {
  if (!vendor) return null;
  return VENDOR_LOGOS[vendor.trim().toLowerCase()] ?? null;
}
