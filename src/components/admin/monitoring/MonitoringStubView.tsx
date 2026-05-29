import React from 'react';
import { Construction } from 'lucide-react';

const MonitoringStubView: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="h-full flex items-center justify-center">
    <div className="text-center max-w-md p-6">
      <Construction className="w-12 h-12 text-amber-500 mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  </div>
);

export default MonitoringStubView;
