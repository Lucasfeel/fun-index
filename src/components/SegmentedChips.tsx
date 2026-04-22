import clsx from 'clsx';

interface Option<T extends string> {
  label: string;
  value: T;
}

interface SegmentedChipsProps<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}

export function SegmentedChips<T extends string>({
  value,
  options,
  onChange,
}: SegmentedChipsProps<T>) {
  return (
    <div className="segmented-chips" role="tablist" aria-label="Filter">
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={clsx('segmented-chips__item', selected && 'segmented-chips__item--active')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
