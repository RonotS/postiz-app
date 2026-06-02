'use client';

import { FC, useCallback } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export type ComposerSettings = {
  longForm: boolean;
  autoRetweet: boolean;
  autoRetweetInterval: number;
  autoRetweetTimes: number;
  autoDm: boolean;
  autoDmMessage: string;
  autoDmTargetLikes: boolean;
  autoDmTargetRetweets: boolean;
  autoDmTargetReplies: boolean;
  autoThreadReply: boolean;
  autoThreadReplyLikes: number;
  autoThreadReplyText: string;
  threadDelay: boolean;
  linkedinPublish: boolean;
  generateBlog: boolean;
  paidPartnership: boolean;
};

export const DEFAULT_COMPOSER_SETTINGS: ComposerSettings = {
  longForm: true,
  autoRetweet: false,
  autoRetweetInterval: 6,
  autoRetweetTimes: 1,
  autoDm: false,
  autoDmMessage: '',
  autoDmTargetLikes: true,
  autoDmTargetRetweets: false,
  autoDmTargetReplies: false,
  autoThreadReply: false,
  autoThreadReplyLikes: 5,
  autoThreadReplyText: '',
  threadDelay: false,
  linkedinPublish: false,
  generateBlog: false,
  paidPartnership: false,
};

export function composerSettingsFromXPost(
  raw: unknown,
  base: ComposerSettings = DEFAULT_COMPOSER_SETTINGS
): ComposerSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...base };
  }
  const s = raw as Record<string, unknown>;
  if (s.__type !== 'x') {
    return { ...base };
  }
  const targets =
    s.auto_dm_targets && typeof s.auto_dm_targets === 'object'
      ? (s.auto_dm_targets as Record<string, unknown>)
      : {};

  return {
    ...base,
    autoRetweet: s.auto_retweet_enabled === true,
    autoRetweetInterval: Math.max(
      1,
      Number(s.auto_retweet_interval_hours) || base.autoRetweetInterval
    ),
    autoRetweetTimes: Math.max(
      1,
      Number(s.auto_retweet_times) || base.autoRetweetTimes
    ),
    autoDm: s.auto_dm_enabled === true,
    autoDmMessage:
      typeof s.auto_dm_message === 'string'
        ? s.auto_dm_message
        : base.autoDmMessage,
    autoDmTargetLikes: targets.likes !== false,
    autoDmTargetRetweets: targets.retweets === true,
    autoDmTargetReplies: targets.replies === true,
    autoThreadReply: s.auto_thread_reply_enabled === true,
    autoThreadReplyLikes: Math.max(
      1,
      Number(s.auto_thread_reply_likes) || base.autoThreadReplyLikes
    ),
    autoThreadReplyText:
      typeof s.auto_thread_reply_text === 'string'
        ? s.auto_thread_reply_text
        : base.autoThreadReplyText,
    paidPartnership: s.paid_partnership === true,
  };
}

export function buildXPostSettings(settings: ComposerSettings) {
  return {
    __type: 'x' as const,
    who_can_reply_post: 'everyone' as const,
    made_with_ai: false,
    paid_partnership: settings.paidPartnership,
    ...(settings.autoRetweet
      ? {
          auto_retweet_enabled: true,
          auto_retweet_interval_hours: settings.autoRetweetInterval,
          auto_retweet_times: settings.autoRetweetTimes,
        }
      : { auto_retweet_enabled: false }),
    ...(settings.autoDm
      ? {
          auto_dm_enabled: true,
          auto_dm_message: settings.autoDmMessage,
          auto_dm_targets: {
            likes: settings.autoDmTargetLikes,
            retweets: settings.autoDmTargetRetweets,
            replies: settings.autoDmTargetReplies,
          },
        }
      : { auto_dm_enabled: false }),
    ...(settings.autoThreadReply
      ? {
          auto_thread_reply_enabled: true,
          auto_thread_reply_likes: settings.autoThreadReplyLikes,
          auto_thread_reply_text: settings.autoThreadReplyText,
        }
      : { auto_thread_reply_enabled: false }),
  };
}

export const Toggle: FC<{
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

export const SettingRow: FC<{
  icon?: string;
  label: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  trailing?: React.ReactNode;
  hint?: React.ReactNode;
}> = ({ icon, label, enabled, onChange, trailing, hint }) => (
  <div className="flex flex-col gap-1 py-2">
    <div className="flex items-center gap-3">
      {icon && (
        <span className="text-newTableText text-sm w-4 text-center">{icon}</span>
      )}
      <span className="flex-1 text-newTextColor text-sm">{label}</span>
      {trailing}
      <Toggle enabled={enabled} onChange={onChange} />
    </div>
    {hint && <div className="text-newTableText text-xs ml-7">{hint}</div>}
  </div>
);

export function automationEnabledSummary(settings: ComposerSettings): string {
  return (
    [
      settings.autoDm && 'auto-dm',
      settings.autoRetweet && 'auto-retweet',
      settings.autoThreadReply && 'thread-reply',
      settings.threadDelay && 'thread-delay',
    ]
      .filter(Boolean)
      .join(', ') || '—'
  );
}

export const XAutomationOptionsPanel: FC<{
  settings: ComposerSettings;
  updateSetting: <K extends keyof ComposerSettings>(
    key: K,
    value: ComposerSettings[K]
  ) => void;
  showThreadDelay?: boolean;
}> = ({ settings, updateSetting, showThreadDelay = true }) => {
  const t = useT();

  return (
    <div className="flex flex-col gap-1">
      <div className="bg-customColor26/10 border border-customColor26/20 rounded-lg px-3 py-2 text-customColor26 text-xs flex items-center gap-2 mb-2">
        <span>ⓘ</span>
        {t(
          'affect_only_this_tweet',
          'These settings will affect this tweet only.'
        )}
      </div>

      <SettingRow
        icon="↻"
        label={t('auto_retweet', 'Auto retweet')}
        enabled={settings.autoRetweet}
        onChange={(v) => updateSetting('autoRetweet', v)}
      />

      {settings.autoRetweet && (
        <div className="ml-7 mb-2 mt-1 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-newTableText text-xs">
              {t('interval', 'Interval')}
            </span>
            <select
              value={settings.autoRetweetInterval}
              onChange={(e) =>
                updateSetting(
                  'autoRetweetInterval',
                  parseInt(e.target.value) || 6
                )
              }
              className="bg-newBgColor border border-newBorder rounded-lg px-2 py-1 text-xs text-newTextColor outline-none min-w-[120px]"
            >
              <option value={1}>1 hour</option>
              <option value={3}>3 hours</option>
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
              <option value={48}>2 days</option>
              <option value={168}>1 week</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-newTableText text-xs">
              {t('number_of_times', '# of times')}
            </span>
            <select
              value={settings.autoRetweetTimes}
              onChange={(e) =>
                updateSetting('autoRetweetTimes', parseInt(e.target.value) || 1)
              }
              className="bg-newBgColor border border-newBorder rounded-lg px-2 py-1 text-xs text-newTextColor outline-none min-w-[120px]"
            >
              <option value={1}>1 time</option>
              <option value={2}>2 times</option>
              <option value={3}>3 times</option>
              <option value={5}>5 times</option>
              <option value={10}>10 times</option>
            </select>
          </div>
        </div>
      )}

      <SettingRow
        icon="✉"
        label={t('auto_dm', 'Auto DM')}
        enabled={settings.autoDm}
        onChange={(v) => updateSetting('autoDm', v)}
      />

      {settings.autoDm && (
        <div className="ml-7 mb-2 mt-1 flex flex-col gap-1">
          <SettingRow
            icon="♥"
            label={t('dm_likers', 'DM users who liked')}
            enabled={settings.autoDmTargetLikes}
            onChange={(v) => updateSetting('autoDmTargetLikes', v)}
          />
          <SettingRow
            icon="↻"
            label={t('dm_retweeters', 'DM users who retweeted')}
            enabled={settings.autoDmTargetRetweets}
            onChange={(v) => updateSetting('autoDmTargetRetweets', v)}
          />
          <SettingRow
            icon="💬"
            label={t('dm_repliers', 'DM users who commented')}
            enabled={settings.autoDmTargetReplies}
            onChange={(v) => updateSetting('autoDmTargetReplies', v)}
          />
          <textarea
            placeholder={t(
              'dm_message_placeholder',
              'Custom DM message for this tweet (leave empty for a short default)'
            )}
            value={settings.autoDmMessage}
            onChange={(e) => updateSetting('autoDmMessage', e.target.value)}
            className="w-full bg-newBgColor border border-newBorder rounded-lg px-3 py-2 text-xs text-newTextColor outline-none resize-none focus:border-newSep min-h-[70px] mt-2"
          />
        </div>
      )}

      <SettingRow
        icon="🔌"
        label={t('auto_plug', 'Auto plug')}
        enabled={settings.autoThreadReply}
        onChange={(v) => updateSetting('autoThreadReply', v)}
        trailing={
          <div className="flex items-center gap-1 mr-1">
            <input
              type="number"
              min={1}
              value={settings.autoThreadReplyLikes}
              onChange={(e) =>
                updateSetting(
                  'autoThreadReplyLikes',
                  parseInt(e.target.value) || 1
                )
              }
              className="w-[44px] bg-newBgColor border border-newBorder rounded px-2 py-0.5 text-xs text-newTextColor text-center outline-none focus:border-newSep"
            />
            <span className="text-newTableText text-xs">{t('likes', 'likes')}</span>
          </div>
        }
      />

      {settings.autoThreadReply && (
        <div className="ml-7 mb-2 mt-1 flex flex-col gap-1">
          <p className="text-newTableText text-[11px] leading-snug">
            {t(
              'auto_thread_reply_hint',
              'Once this tweet reaches the like threshold, the text below is posted as a chained reply thread. Separate tweets in the thread with three blank lines (same as the main composer).'
            )}
          </p>
          <textarea
            placeholder={t(
              'auto_thread_reply_placeholder',
              'Thread content — separate tweets with three blank lines'
            )}
            value={settings.autoThreadReplyText}
            onChange={(e) =>
              updateSetting('autoThreadReplyText', e.target.value)
            }
            className="w-full bg-newBgColor border border-newBorder rounded-lg px-3 py-2 text-xs text-newTextColor outline-none resize-y focus:border-newSep min-h-[90px] mt-1"
          />
        </div>
      )}

      {showThreadDelay && (
        <SettingRow
          icon="⏱"
          label={t('thread_delay', 'Thread Delay')}
          enabled={settings.threadDelay}
          onChange={(v) => updateSetting('threadDelay', v)}
        />
      )}
    </div>
  );
};

export function useComposerSettingsUpdater(
  setSettings: React.Dispatch<React.SetStateAction<ComposerSettings>>
) {
  return useCallback(
    <K extends keyof ComposerSettings>(key: K, value: ComposerSettings[K]) => {
      setSettings((s) => ({ ...s, [key]: value }));
    },
    [setSettings]
  );
}
