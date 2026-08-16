import type { ReactNode } from 'react';
import {
  siChainguard,
  siCloudsmith,
  siDocker,
  siGithub,
  siGitlab,
  siHarbor,
  siJfrog,
  siSnyk,
  siSonatype,
  type SimpleIcon,
} from 'simple-icons';

/**
 * Brand marks for tracked vendors. We source the bulk from `simple-icons` so the
 * demo runs fully offline (no logo CDN, no keys), and hand-roll the two vendors
 * that simple-icons dropped for trademark reasons (AWS, Microsoft) as small,
 * self-contained SVG tiles. Anything unmapped falls back to initials.
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
};

/** Look up a vendor's brand mark, or `null` to signal "use initials". */
export function vendorLogo(vendor: string | null): VendorLogo | null {
  if (!vendor) return null;
  return VENDOR_LOGOS[vendor.trim().toLowerCase()] ?? null;
}
