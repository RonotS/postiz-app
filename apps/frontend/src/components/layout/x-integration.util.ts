export type IntegrationLike = {
  id?: string;
  identifier: string;
  name?: string;
  /** X handle / profile slug from `/integrations/list` (`profile` column). */
  display?: string;
  picture?: string;
  disabled?: boolean;
  inBetweenSteps?: boolean;
};

export function isXIntegrationIdentifier(identifier: string): boolean {
  const id = (identifier || '').toLowerCase();
  return id === 'x' || id === 'twitter';
}

export function getActiveXIntegrations<T extends IntegrationLike>(
  integrations: T[] | undefined
): T[] {
  return (
    integrations?.filter(
      (i) =>
        !i.disabled &&
        !i.inBetweenSteps &&
        isXIntegrationIdentifier(i.identifier)
    ) ?? []
  );
}

export function hasActiveXIntegration(
  integrations: IntegrationLike[] | undefined
): boolean {
  return getActiveXIntegrations(integrations).length > 0;
}
