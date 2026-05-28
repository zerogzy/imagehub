export const DEFAULT_GROUP_NAME = '默认';
export const DEFAULT_GROUP_SLUG = 'default';

interface SlugLookupClient {
  group: { findUnique: (args: { where: { slug: string }; select?: { id: true } }) => Promise<{ id: string } | null> };
}

export function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || DEFAULT_GROUP_SLUG;
}

export async function uniqueGroupSlug(value: string, client: SlugLookupClient): Promise<string> {
  const base = normalizeSlug(value);
  let slug = base;
  let suffix = 2;

  while (await client.group.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}
