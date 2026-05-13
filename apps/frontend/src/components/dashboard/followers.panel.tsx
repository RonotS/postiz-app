'use client';

import {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';

const Toggle: FC<{
  enabled: boolean;
  onChange: (v: boolean) => void;
}> = ({ enabled, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!enabled)}
    className={`relative w-[36px] h-[20px] rounded-full transition-colors flex-shrink-0 ${
      enabled ? 'bg-btnPrimary' : 'bg-newBgLineColor'
    }`}
    aria-pressed={enabled}
  >
    <span
      className={`absolute top-[2px] left-[2px] w-[16px] h-[16px] bg-white rounded-full transition-transform ${
        enabled ? 'translate-x-[16px]' : 'translate-x-0'
      }`}
    />
  </button>
);

/**
 * Configure the standalone `autoDmFollowers` plug that sends a welcome DM to
 * every new X follower.
 */
export const FollowersPanel: FC<{ xIntegrationId?: string }> = ({
  xIntegrationId,
}) => {
  const t = useT();
  const toast = useToaster();
  const fetch = useFetch();

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

  if (!xIntegrationId) {
    return (
      <div className="bg-customColor19/10 border border-customColor19/30 rounded-lg px-4 py-3 text-newTextColor text-sm">
        {t(
          'connect_x_followers',
          'Connect your X account to manage new-follower auto DMs.'
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <div className="bg-newBgColorInner border border-newBorder rounded-lg p-4">
        <div className="flex items-start gap-3 mb-3">
          <span className="text-newTableText text-base">👋</span>
          <div className="flex-1">
            <div className="text-newTextColor text-sm font-semibold">
              {t('auto_dm_followers', 'Auto DM new followers')}
            </div>
            <div className="text-newTableText text-xs mt-0.5 leading-snug">
              {t(
                'auto_dm_followers_long',
                'Turn this on and save: a background job checks your followers about every 2 minutes (server default; set X_FOLLOWER_DM_POLL_INTERVAL_MS to change). The first check only records who already follows you (no DMs). After that, anyone new gets this welcome message. You do not need to post for it to run.'
              )}
            </div>
          </div>
          <Toggle enabled={enabled} onChange={setEnabled} />
        </div>

        <label className="text-newTextColor text-xs font-medium block mb-1">
          {t('welcome_message', 'Welcome message')}
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t(
            'follower_dm_placeholder_v2',
            'e.g. Hey! Thanks for the follow — appreciate you being here.'
          )}
          className="w-full bg-newBgColor border border-newBorder rounded-lg px-3 py-2 text-sm text-newTextColor outline-none resize-y focus:border-newSep min-h-[100px]"
          disabled={!enabled || isLoading}
        />

        <div className="flex items-center justify-between mt-3 gap-3">
          <span className="text-newTableText text-[11px]">
            {existing
              ? existing.activated
                ? t('status_active', 'Status: Active')
                : t('status_inactive', 'Status: Inactive')
              : t('status_not_configured', 'Status: Not configured')}
          </span>
          <button
            onClick={save}
            disabled={saving || isLoading}
            className="px-4 py-1.5 text-xs text-white font-medium bg-btnPrimary rounded-lg hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {saving ? t('saving', 'Saving...') : t('save', 'Save')}
          </button>
        </div>
      </div>

      <div className="bg-customColor26/5 border border-customColor26/20 rounded-lg p-3 text-customColor26 text-xs leading-relaxed">
        <div className="font-semibold mb-1">{t('heads_up', 'Heads up')}</div>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            {t(
              'followers_requires_dm',
              'Your X app must have Direct Message permission and a plan/credits that cover DM Create.'
            )}
          </li>
          <li>
            {t(
              'followers_poll_interval',
              'About every 2 minutes while the plug is on (unless X_FOLLOWER_DM_POLL_INTERVAL_MS is set on the server), Postiz compares your recent followers to the saved list and DMs anyone new.'
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
