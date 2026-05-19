'use client';

import {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { getActiveXIntegrations } from '@gitroom/frontend/components/layout/x-integration.util';
import {
  XProfilePickerIntegration,
  XProfileSingleSelect,
} from '@gitroom/frontend/components/launches/x-profile-picker.component';
import {
  ProfileAutomationsCard,
  ProfileAutomationsEmpty,
  ProfileAutomationsPrimaryButton,
} from '@gitroom/frontend/components/dashboard/profile-automations.ui';

const Toggle: FC<{
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ enabled, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!enabled)}
    disabled={disabled}
    className={clsx(
      'relative h-7 w-12 shrink-0 rounded-full transition-all duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-btnPrimary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-newBgColorInner',
      enabled ? 'bg-btnPrimary shadow-md shadow-btnPrimary/25' : 'bg-newBgLineColor',
      disabled && 'opacity-50 cursor-not-allowed'
    )}
    aria-pressed={enabled}
  >
    <span
      className={clsx(
        'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200',
        enabled && 'translate-x-5'
      )}
    />
  </button>
);

/**
 * Configure the standalone `autoDmFollowers` plug that sends a welcome DM to
 * every new X follower.
 */
export const FollowersPanel: FC<{ xIntegrationId?: string }> = ({
  xIntegrationId: xIntegrationIdProp,
}) => {
  const t = useT();
  const toast = useToaster();
  const fetch = useFetch();

  const { data: integrations = [], isLoading: loadingIntegrations } = useSWR(
    '/integrations/list',
    async () => {
      const res = await fetch('/integrations/list');
      if (!res.ok) return [] as XProfilePickerIntegration[];
      const data = await res.json();
      return (data.integrations || []) as XProfilePickerIntegration[];
    },
    { revalidateOnFocus: false }
  );

  const xIntegrations = useMemo(
    () => getActiveXIntegrations(integrations),
    [integrations]
  );

  const [pickedId, setPickedId] = useState(xIntegrationIdProp || '');

  useEffect(() => {
    if (xIntegrationIdProp) {
      setPickedId(xIntegrationIdProp);
      return;
    }
    if (!xIntegrations.length) {
      setPickedId('');
      return;
    }
    if (!pickedId || !xIntegrations.some((i) => i.id === pickedId)) {
      setPickedId(xIntegrations[0].id!);
    }
  }, [xIntegrationIdProp, xIntegrations, pickedId]);

  const xIntegrationId = xIntegrationIdProp || pickedId;

  const loadPlugs = useCallback(async () => {
    if (!xIntegrationId) return [] as any[];
    const res = await fetch(`/integrations/${xIntegrationId}/plugs`);
    if (!res.ok) return [] as any[];
    return (await res.json()) as any[];
  }, [xIntegrationId, fetch]);

  const {
    data: plugs,
    isLoading,
    mutate: refetch,
  } = useSWR(
    xIntegrationId ? `dashboard-followers-plug-${xIntegrationId}` : null,
    loadPlugs,
    { revalidateOnFocus: false }
  );

  const existing = useMemo(() => {
    return (plugs || []).find((p: any) => p.plugFunction === 'autoDmFollowers');
  }, [plugs]);

  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing) {
      setEnabled(false);
      setMessage('');
      return;
    }
    setEnabled(!!existing.activated);
    try {
      const parsed = JSON.parse(existing.data || '[]') as Array<{
        name: string;
        value: string;
      }>;
      const msg = parsed.find((f) => f.name === 'message')?.value || '';
      setMessage(msg);
    } catch {
      setMessage('');
    }
  }, [existing]);

  const statusLabel = useMemo(() => {
    if (!existing) {
      return t('status_not_configured', 'Not configured');
    }
    return existing.activated
      ? t('status_active', 'Active')
      : t('status_inactive', 'Inactive');
  }, [existing, t]);

  const statusTone = useMemo(() => {
    if (!existing) return 'neutral';
    return existing.activated ? 'active' : 'inactive';
  }, [existing]);

  const save = useCallback(async () => {
    if (!xIntegrationId) {
      toast.show(
        t(
          'connect_x_first_followers',
          'Connect your X account first to enable follower DMs'
        ),
        'warning'
      );
      return;
    }
    if (enabled && message.trim().length < 3) {
      toast.show(
        t(
          'follower_dm_too_short',
          'Welcome message must be at least 3 characters'
        ),
        'warning'
      );
      return;
    }
    setSaving(true);
    try {
      if (enabled) {
        await fetch(`/integrations/${xIntegrationId}/plugs`, {
          method: 'POST',
          body: JSON.stringify({
            func: 'autoDmFollowers',
            fields: [{ name: 'message', value: message.trim() }],
          }),
        });
      } else if (existing?.id) {
        await fetch(`/integrations/plugs/${existing.id}/activate`, {
          method: 'PUT',
          body: JSON.stringify({ status: false }),
        });
      }
      await refetch();
      toast.show(t('saved', 'Saved'), 'success');
    } catch {
      toast.show(t('save_failed', 'Save failed'), 'warning');
    } finally {
      setSaving(false);
    }
  }, [enabled, message, xIntegrationId, existing, refetch, t, toast, fetch]);

  if (loadingIntegrations) {
    return (
      <ProfileAutomationsCard>
        <div className="space-y-4 animate-pulse">
          <div className="h-5 w-40 rounded-lg bg-newBgLineColor/80" />
          <div className="h-28 rounded-xl bg-newBgLineColor/60" />
          <div className="h-10 w-24 rounded-xl bg-newBgLineColor/80 ms-auto" />
        </div>
      </ProfileAutomationsCard>
    );
  }

  if (!xIntegrations.length) {
    return (
      <ProfileAutomationsEmpty variant="warning">
        {t(
          'connect_x_followers',
          'Connect your X account to manage new-follower auto DMs.'
        )}
      </ProfileAutomationsEmpty>
    );
  }

  return (
    <div className="w-full min-w-0 flex flex-col gap-4 sm:gap-5">
      {xIntegrations.length > 1 && !xIntegrationIdProp && (
        <XProfileSingleSelect
          integrations={xIntegrations}
          selectedId={pickedId}
          onChange={setPickedId}
          disabled={saving || isLoading}
        />
      )}

      <ProfileAutomationsCard className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -end-12 -top-12 h-32 w-32 rounded-full bg-violet-500/10 blur-2xl"
          aria-hidden
        />

        <div className="relative flex flex-col gap-5 sm:gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className={clsx(
                    'inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide border',
                    statusTone === 'active' &&
                      'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                    statusTone === 'inactive' &&
                      'border-newBorder/80 bg-newBgColor/50 text-newTableText',
                    statusTone === 'neutral' &&
                      'border-newBorder/80 bg-newBgColor/50 text-newTableText'
                  )}
                >
                  {statusLabel}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-newTableText leading-relaxed max-w-none">
                {t(
                  'auto_dm_followers_long',
                  'Turn this on and save: a background job checks your followers about every 2 minutes (server default; set X_FOLLOWER_DM_POLL_INTERVAL_MS to change). The first check only records who already follows you (no DMs). After that, anyone new gets this welcome message. You do not need to post for it to run.'
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 sm:pt-1">
              <span className="text-xs font-medium text-newTableText">
                {enabled
                  ? t('enabled', 'Enabled')
                  : t('disabled', 'Disabled')}
              </span>
              <Toggle
                enabled={enabled}
                onChange={setEnabled}
                disabled={isLoading || saving}
              />
            </div>
          </div>

          <div className="w-full min-w-0">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-newTableText">
              {t('welcome_message', 'Welcome message')}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t(
                'follower_dm_placeholder_v2',
                'e.g. Hey! Thanks for the follow — appreciate you being here.'
              )}
              className={clsx(
                'w-full min-w-0 rounded-xl border border-newBorder/80 bg-newBgColor/40',
                'px-4 py-3 text-sm text-newTextColor outline-none resize-y min-h-[120px] sm:min-h-[140px]',
                'placeholder:text-newTableText/60 transition-colors',
                'focus:border-btnPrimary/50 focus:ring-2 focus:ring-btnPrimary/15',
                (!enabled || isLoading) && 'opacity-60 cursor-not-allowed'
              )}
              disabled={!enabled || isLoading || saving}
            />
            <p className="mt-2 text-[11px] text-newTableText">
              {message.trim().length > 0
                ? t('char_count', '{{count}} characters', {
                    count: message.trim().length,
                  })
                : t(
                    'follower_dm_min_hint',
                    'At least 3 characters when enabled.'
                  )}
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end pt-1 border-t border-newBorder/60">
            <ProfileAutomationsPrimaryButton
              loading={saving}
              disabled={isLoading}
              onClick={save}
              className="w-full sm:w-auto"
            >
              {saving ? t('saving', 'Saving...') : t('save', 'Save')}
            </ProfileAutomationsPrimaryButton>
          </div>
        </div>
      </ProfileAutomationsCard>

      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 sm:px-5 sm:py-4 text-xs sm:text-sm text-newTableText leading-relaxed w-full min-w-0">
        <p className="font-semibold text-newTextColor mb-1.5">
          {t('heads_up', 'Heads up')}
        </p>
        <ul className="list-disc space-y-1 ps-4">
          <li>
            {t(
              'followers_requires_dm',
              'Your X app must have Direct Message permission and a plan/credits that cover DM Create.'
            )}
          </li>
          <li>
            {t(
              'followers_poll_interval',
              'About every 2 minutes while the plug is on (unless X_FOLLOWER_DM_POLL_INTERVAL_MS is set on the server), TweetMax compares your recent followers to the saved list and DMs anyone new.'
            )}
          </li>
          <li>
            {t(
              'followers_first_run_baseline',
              'The very first run after you enable it only builds the list of existing followers — no messages are sent until the next runs see someone new.'
            )}
          </li>
          <li>
            {t(
              'followers_rate_limit',
              'X rate-limits the followers endpoint, so each run only scans the most recent ~500 followers.'
            )}
          </li>
        </ul>
      </div>
    </div>
  );
};
