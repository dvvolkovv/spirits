import React from 'react';

interface MobileRecordField {
  label: string;
  value: React.ReactNode;
}

interface MobileRecordCardProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  fields: MobileRecordField[];
  onOpen: () => void;
  testId?: string;
}

export const MobileRecordCard: React.FC<MobileRecordCardProps> = ({ title, subtitle, fields, onOpen, testId }) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onOpen}
    className="w-full min-h-11 px-4 py-4 text-left hover:bg-forest-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-300 focus-visible:ring-inset"
  >
    <div className="min-w-0">
      <div className="text-sm font-medium text-gray-900 break-all">{title}</div>
      {subtitle && <div className="mt-1 text-xs text-gray-500">{subtitle}</div>}
    </div>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 text-xs">
      {fields.map((field) => (
        <div key={field.label} className="min-w-0">
          <dt className="text-gray-400">{field.label}</dt>
          <dd className="mt-0.5 text-gray-800 break-words">{field.value}</dd>
        </div>
      ))}
    </dl>
  </button>
);
