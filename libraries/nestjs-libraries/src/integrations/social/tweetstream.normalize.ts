/** Strip leading @ and lowercase for profile / handle matching. */
export function normalizeTweetStreamHandle(handle?: string): string {
  return (handle ?? '').trim().replace(/^@+/i, '').toLowerCase();
}

export function authorToAaUser(author?: {
  id?: string;
  handle?: string;
  name?: string;
}): { id_str?: string; id?: string } | undefined {
  if (!author?.id) {
    return undefined;
  }
  return { id_str: String(author.id), id: String(author.id) };
}
