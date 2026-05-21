'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { IntegrationLike } from '@gitroom/frontend/components/layout/x-integration.util';

export type XProfilePickerIntegration = IntegrationLike & {
  id: string;
  name: string;
  picture?: string;
};

function ProfileAvatars({
  integrations,
  selectedIds,
  onToggle,
  disabled,
}: {
  integrations: XProfilePickerIntegration[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {integrations.map((integration) => {
        const selected = selectedIds.includes(integration.id);
        return (
          <button
            key={integration.id}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(integration.id)}
            className={clsx(
              'flex items-center gap-2 rounded-full border-2 pe-3 ps-1 py-1 transition-all',
              selected
                ? 'border-[#622FF6] bg-[#622FF6]/10'
                : 'border-newBorder opacity-70 hover:opacity-100',
              disabled && 'pointer-events-none opacity-40'
            )}
          >
            <div className="relative flex-shrink-0">
              <ImageWithFallback
                fallbackSrc="/no-picture.svg"
                src={integration.picture || '/no-picture.svg'}
                className={clsx(
                  'rounded-full min-w-[40px] min-h-[40px] border',
                  selected ? 'border-btnPrimary' : 'border-transparent'
                )}
                alt={integration.name}
                width={40}
                height={40}
              />
              <SafeImage
                src="/icons/platforms/x.png"
                className="rounded-[4px] absolute z-10 bottom-0 -end-[4px] min-w-[14px] min-h-[14px]"
                alt="x"
                width={14}
                height={14}
              />
            </div>
            <span className="text-sm text-newTextColor max-w-[140px] truncate">
              {integration.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type XProfileMultiSelectProps = {
  integrations: XProfilePickerIntegration[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
};

export const XProfileMultiSelect: FC<XProfileMultiSelectProps> = ({
  integrations,
  selectedIds,
  onChange,
  disabled,
  compact,
}) => {
  const t = useT();

  const toggle = useCallback(
    (id: string) => {
      if (disabled) return;
      onChange(
        selectedIds.includes(id)
          ? selectedIds.filter((x) => x !== id)
          : [...selectedIds, id]
      );
    },
    [disabled, onChange, selectedIds]
  );

  if (!integrations.length) {
    return null;
  }

  return (
    <div
      className={clsx(
        'rounded-xl border border-newBorder bg-newBgColorInner',
        compact ? 'p-3' : 'p-4'
      )}
    >
      <div className="text-sm font-semibold text-newTextColor mb-1">
        {t('choose_x_profiles', 'Choose X profile(s)')}
      </div>
      {!compact && (
        <p className="text-xs text-newTableText mb-3">
          {t(
            'choose_x_profiles_hint',
            'Select one or more accounts. The same post goes to each profile you pick.'
          )}
        </p>
      )}
      <ProfileAvatars
        integrations={integrations}
        selectedIds={selectedIds}
        onToggle={toggle}
        disabled={disabled}
      />
      {selectedIds.length === 0 && (
        <p className="text-xs text-customColor19 mt-2">
          {t('select_at_least_one_x', 'Select at least one X profile.')}
        </p>
      )}
    </div>
  );
};

/** One active X channel at a time (e.g. follower explorer). */
export const XProfileSingleSelect: FC<{
  integrations: XProfilePickerIntegration[];
  selectedId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}> = ({ integrations, selectedId, onChange, disabled }) => {
  const t = useT();

  if (!integrations.length) {
    return null;
  }

  return (
    <div className="w-full min-w-0 rounded-2xl border border-newBorder bg-newBgColorInner p-4 sm:p-5">
      <div className="text-sm font-semibold text-newTextColor mb-1">
        {t('choose_x_profile', 'Choose X profile')}
      </div>
      <p className="text-xs sm:text-sm text-newTableText mb-4">
        {t(
          'choose_x_profile_single_hint',
          'Select which connected account to browse and follow from.'
        )}
      </p>
      <div className="w-full min-w-0 overflow-x-auto pb-1 -mx-1 px-1 custom-scrollbar">
        <ProfileAvatars
          integrations={integrations}
          selectedIds={selectedId ? [selectedId] : []}
          onToggle={(id) => {
            if (!disabled) onChange(id);
          }}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export const XProfilePickerModal: FC<{
  integrations: XProfilePickerIntegration[];
  onContinue: (selectedIds: string[]) => void;
  onCancel: () => void;
}> = ({ integrations, onContinue, onCancel }) => {
  const t = useT();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (integrations.length === 1) {
      setSelectedIds([integrations[0].id]);
    }
  }, [integrations]);

  return (
    <div className="flex flex-col gap-4 p-2 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-newTextColor">
          {t('choose_x_profiles', 'Choose X profile(s)')}
        </h2>
        <p className="text-sm text-newTableText mt-1">
          {t(
            'choose_x_profiles_modal_hint',
            'Pick which X accounts should receive this post. You can add other networks in the next step.'
          )}
        </p>
      </div>
      <XProfileMultiSelect
        integrations={integrations}
        selectedIds={selectedIds}
        onChange={setSelectedIds}
      />
      <div className="flex gap-2 justify-end">
        <Button type="button" secondary onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          disabled={selectedIds.length === 0}
          onClick={() => onContinue(selectedIds)}
        >
          {t('continue', 'Continue')}
        </Button>
      </div>
    </div>
  );
};
