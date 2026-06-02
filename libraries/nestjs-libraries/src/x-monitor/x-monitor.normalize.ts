/** Strip leading @ and lowercase for profile / handle matching. */
export function normalizeXHandle(handle?: string): string {
  return (handle ?? '').trim().replace(/^@+/i, '').toLowerCase();
}

export function userToAaShape(user: {
  id: string;
  username?: string;
}): { id_str: string; id: string; screen_name?: string } {
  return {
    id_str: String(user.id),
    id: String(user.id),
    ...(user.username?.trim()
      ? { screen_name: user.username.trim() }
      : {}),
  };
}
