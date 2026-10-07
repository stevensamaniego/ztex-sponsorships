// One tier list for the public form, the approval page and server validation.
// Keep in sync with the <select id="sponsorshipTier"> options in index.html.
const TIERS = ['Title Sponsor', 'Platinum', 'Gold', 'Silver', 'Bronze', 'In-Kind', 'Not Applicable', 'Other'];
const OTHER = 'Other';
const OTHER_MAX = 100;

// Older submissions used "Custom" and "N/A".
const LEGACY = { 'Custom': OTHER, 'N/A': 'Not Applicable' };

function normalizeTier(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  return LEGACY[v] || v;
}

// Returns { tier, other } or { error }. An empty tier is allowed (the field is optional).
function parseTier(tierValue, otherValue) {
  const tier = normalizeTier(tierValue);
  if (!tier) return { tier: '', other: '' };
  if (!TIERS.includes(tier)) return { error: 'Invalid tier.' };
  if (tier !== OTHER) return { tier, other: '' };
  const other = typeof otherValue === 'string' ? otherValue.trim().replace(/\s+/g, ' ') : '';
  // A cached copy of the old form can still send "Custom" with no description box
  if (!other && LEGACY[String(tierValue).trim()]) return { tier, other: '' };
  if (!other) return { error: 'Please describe the "Other" tier.' };
  if (other.length > OTHER_MAX) return { error: `"Other" tier description: ${OTHER_MAX} characters max.` };
  return { tier, other };
}

// Display text, e.g. "Gold" or "Other: Naming rights". Unescaped; callers escape for HTML.
function tierLabel(tier, other) {
  const t = normalizeTier(tier);
  if (!t) return '';
  return t === OTHER && other ? `${OTHER}: ${other}` : t;
}

module.exports = { TIERS, OTHER, OTHER_MAX, normalizeTier, parseTier, tierLabel };
