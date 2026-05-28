export const RANK_WIDTH = 12;
export const RANK_RADIX = 36n;
export const RANK_MAX = RANK_RADIX ** BigInt(RANK_WIDTH) - 1n;

export function parseRank(rank: string): bigint {
  let value = 0n;
  for (const char of rank.toLowerCase()) {
    const digit = BigInt(parseInt(char, 36));
    if (digit < 0n || digit >= RANK_RADIX) continue;
    value = value * RANK_RADIX + digit;
  }
  return value;
}

export function formatRank(value: bigint): string {
  return value.toString(36).padStart(RANK_WIDTH, '0');
}

export function rankBetween(afterRank: string | null, beforeRank: string | null): string | null {
  const low = afterRank ? parseRank(afterRank) : 0n;
  const high = beforeRank ? parseRank(beforeRank) : RANK_MAX;
  if (high - low <= 1n) return null;
  return formatRank((low + high) / 2n);
}
