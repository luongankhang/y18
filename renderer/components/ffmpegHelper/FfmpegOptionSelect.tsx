import React from 'react';
import { useTranslation } from 'next-i18next';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  advancedSelectContentClass,
  advancedSelectTriggerClass,
  AdvancedFieldHint,
} from './AdvancedOptionsSection';

export interface FfmpegSelectOption {
  value: string;
  nameKey: string;
  descKey?: string;
}

function OptionDropdownLabel({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-0.5">
      <span className="font-medium leading-none">{name}</span>
      <span className="text-xs leading-snug text-muted-foreground">
        {description}
      </span>
    </div>
  );
}

interface FfmpegOptionSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: FfmpegSelectOption[];
  disabled?: boolean;
  label?: string;
  hint?: string;
  triggerClassName?: string;
  placeholderKey?: string;
}

export function FfmpegOptionSelect({
  value,
  onValueChange,
  options,
  disabled,
  label,
  hint,
  triggerClassName,
  placeholderKey,
}: FfmpegOptionSelectProps) {
  const { t } = useTranslation('ffmpegHelper');
  const selected = options.find((option) => option.value === value);

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          className={triggerClassName ?? advancedSelectTriggerClass}
        >
          <SelectValue
            placeholder={placeholderKey ? t(placeholderKey) : undefined}
          >
            {selected ? t(selected.nameKey) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className={advancedSelectContentClass}>
          {options.map((option) => {
            const name = t(option.nameKey);
            return (
              <SelectItem
                key={option.value}
                value={option.value}
                textValue={name}
              >
                {option.descKey ? (
                  <OptionDropdownLabel
                    name={name}
                    description={t(option.descKey)}
                  />
                ) : (
                  name
                )}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {hint && <AdvancedFieldHint>{hint}</AdvancedFieldHint>}
    </div>
  );
}

export function DescribedSelectItem({
  value,
  name,
  description,
}: {
  value: string;
  name: string;
  description?: string;
}) {
  return (
    <SelectItem value={value} textValue={name}>
      {description ? (
        <OptionDropdownLabel name={name} description={description} />
      ) : (
        name
      )}
    </SelectItem>
  );
}

export function FfmpegSelectTriggerValue({
  name,
  placeholder,
}: {
  name?: string;
  placeholder?: string;
}) {
  return <SelectValue placeholder={placeholder}>{name ?? null}</SelectValue>;
}
