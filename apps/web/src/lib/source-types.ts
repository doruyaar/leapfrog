/**
 * Tiles for the Quick Setup grid. `color` drives the icon mark so the grid keeps
 * the colourful, scannable feel of the reference screen.
 */
export type SourceType = {
  name: string;
  short: string;
  color: string;
  /** Enabled tiles show no "+" badge, matching the reference. */
  enabled?: boolean;
};

export const SOURCE_TYPES: SourceType[] = [
  { name: 'RSS', short: 'RS', color: '#f26522', enabled: true },
  { name: 'Atom', short: 'AT', color: '#8e8e93', enabled: true },
  { name: 'GitHub', short: 'GH', color: '#24292e', enabled: true },
  { name: 'NVD', short: 'NV', color: '#c9302c', enabled: true },
  { name: 'Hacker News', short: 'HN', color: '#ff6600' },
  { name: 'Reddit', short: 'RD', color: '#ff4500' },
  { name: 'Changelog', short: 'CL', color: '#6f42c1' },

  { name: 'Docs', short: 'DC', color: '#0092df' },
  { name: 'Blog', short: 'BL', color: '#e91e63' },
  { name: 'Pricing', short: 'PR', color: '#2e7d32' },
  { name: 'Releases', short: 'RL', color: '#00796b' },
  { name: 'Sitemap', short: 'SM', color: '#5c6bc0' },
  { name: 'Crunchbase', short: 'CB', color: '#0288d1' },
  { name: 'G2', short: 'G2', color: '#ff492c' },

  { name: 'Gartner', short: 'GA', color: '#00305e' },
  { name: 'LinkedIn', short: 'LI', color: '#0a66c2' },
  { name: 'YouTube', short: 'YT', color: '#ff0000' },
  { name: 'Podcast', short: 'PD', color: '#8e24aa' },
  { name: 'Patents', short: 'PT', color: '#455a64' },
  { name: 'Jobs', short: 'JB', color: '#f9a825' },
  { name: 'Funding', short: 'FD', color: '#43a047' },

  { name: 'StackShare', short: 'SS', color: '#0690fa' },
  { name: 'Slack', short: 'SL', color: '#4a154b' },
  { name: 'Discourse', short: 'DS', color: '#231f20' },
  { name: 'Mastodon', short: 'MA', color: '#6364ff' },
  { name: 'Webhook', short: 'WH', color: '#607d8b' },
  { name: 'CSV', short: 'CS', color: '#1d6f42' },
];
