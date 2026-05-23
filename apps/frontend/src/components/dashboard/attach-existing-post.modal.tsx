'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  XProfileSingleSelect,
  XProfilePickerIntegration,
} from '@gitroom/frontend/components/launches/x-profile-picker.component';
import { Button } from '@gitroom/react/form/button';
import {
  buildXPostSettings,
  ComposerSettings,
  DEFAULT_COMPOSER_SETTINGS,
  useComposerSettingsUpdater,
  XAutomationOptionsPanel,
} from '@gitroom/frontend/components/dashboard/dashboard-composer.shared';

export const AttachExistingPostModalContent: FC<{
  close: () => void;
  xIntegrations: XProfilePickerIntegration[];
  initialSettings?: ComposerSettings;
  defaultProfileId?: string;
  onSuccess?: () => void;
}> = ({
  close,
  xIntegrations,
  initialSettings,
  defaultProfileId,
  onSuccess,
}) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();

  const [tweetUrl, setTweetUrl] = useState('');
  const [profileId, setProfileId] = useState(defaultProfileId || '');
  const [settings, setSettings] = useState<ComposerSettings>(
    () => initialSettings || { ...DEFAULT_COMPOSER_SETTINGS }
  );
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const updateSetting = useComposerSettingsUpdater(setSettings);

  useEffect(() => {
    if (defaultProfileId) {
      setProfileId(defaultProfileId);
      return;
    }
    if (xIntegrations.length === 1) {
      setProfileId(xIntegrations[0].id);
    }
  }, [defaultProfileId, xIntegrations]);

  const submit = useCallback(async () => {
    const url = tweetUrl.trim();
    if (!url) {
      toast.show(
        t('paste_x_post_url', 'Paste a published X post URL'),
        'warning'
      );
      return;
    }
    if (!profileId) {
      toast.show(
        t('select_one_x_profile_attach', 'Select an X profile'),
        'warning'
      );
      return;
    }
    if (
      !settings.autoDm &&
      !settings.autoRetweet &&
      !settings.autoThreadReply
    ) {
      toast.show(
        t(
          'enable_automation_first',
          'Enable at least one automation (Auto DM, Auto retweet, or Auto plug)'
        ),
        'warning'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/posts/attach-published-tweet', {
        method: 'POST',
        body: JSON.stringify({
          integrationId: profileId,
          tweetUrl: url,
          settings: buildXPostSettings(settings),
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        toast.show(
          errText ||
            t('attach_automations_failed', 'Could not attach automations'),
          'warning'
        );
        return;
      }
      toast.show(
        t(
          'attach_automations_ok',
          'Automations attached — workers will run on this post'
        ),
        'success'
      );
      onSuccess?.();
      close();
    } finally {
      setSubmitting(false);
    }
  }, [
    tweetUrl,
    profileId,
    settings,
    fetch,
    toast,
    t,
    onSuccess,
    close,
  ]);

  if (!xIntegrations.length) {
    return (
      <div className="p-6 text-newTableText text-sm text-center">
        {t('connect_x_first', 'Connect an X account first.')}
      </div>
    );
  }

  return (
    <div className="flex flex-col max-h-[min(85vh,720px)] w-full max-w-[560px] mx-auto bg-newBgColorInner rounded-[16px] border border-newBorder overflow-hidden shadow-xl">
      <div className="px-5 pt-5 pb-3 border-b border-newBorder shrink-0">
        <h2 className="text-newTextColor text-lg font-semibold">
          {t('automate_existing_post', 'Automate existing post')}
        </h2>
        <p className="text-newTableText text-xs mt-1 leading-snug">
          {t(
            'automate_existing_post_hint',
            'Paste a published X post URL and enable automations — same workers as posts sent from this app.'
          )}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 flex flex-col gap-4">
        <div>
          <label className="text-newTextColor text-sm font-medium block mb-1.5">
            {t('x_post_url', 'X post URL')}
          </label>
          <input
            type="url"
            value={tweetUrl}
            onChange={(e) => setTweetUrl(e.target.value)}
            placeholder="https://x.com/you/status/1234567890"
            className="w-full bg-newBgColor border border-newBorder rounded-lg px-3 py-2.5 text-sm text-newTextColor outline-none focus:border-newSep"
          />
        </div>

        <XProfileSingleSelect
          integrations={xIntegrations}
          selectedId={profileId}
          onChange={setProfileId}
          disabled={submitting}
        />

        <div className="border border-newBorder rounded-xl">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <span className="text-newTextColor text-sm font-semibold">
              {t('advanced_options', 'Advanced Options')}
            </span>
            <span className="text-newTableText text-sm">
              {advancedOpen ? '▴' : '▾'}
            </span>
          </button>
          {advancedOpen && (
            <div className="border-t border-newBorder px-4 pb-4">
              <XAutomationOptionsPanel
                settings={settings}
                updateSetting={updateSetting}
                showThreadDelay={false}
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-4 border-t border-newBorder flex gap-2 shrink-0">
        <Button
          type="button"
          className="flex-1"
          secondary
          onClick={close}
          disabled={submitting}
        >
          {t('cancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          className="flex-[2]"
          onClick={submit}
          loading={submitting}
          disabled={submitting || !tweetUrl.trim() || !profileId}
        >
          {t('attach_automations', 'Attach automations')}
        </Button>
      </div>
    </div>
  );
};
