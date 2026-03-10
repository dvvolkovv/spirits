import React from 'react';
import ReferralDashboard from '../components/profile/ReferralDashboard';

const ReferralPage: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <ReferralDashboard />
    </div>
  );
};

export default ReferralPage;
