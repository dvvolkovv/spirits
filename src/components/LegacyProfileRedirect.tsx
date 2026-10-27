import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { legacyProfilePath } from '../utils/cabinetSections';

/**
 * Старые адреса /settings и /referral — в «Мой профиль» с параметрами
 * (utils/cabinetSections.ts, legacyProfilePath). Прежний
 * <Navigate to="/profile"> терял всё после «?».
 */
const LegacyProfileRedirect: React.FC<{ from: 'settings' | 'referral' }> = ({ from }) => {
  const { search } = useLocation();
  return <Navigate to={legacyProfilePath(from, search)} replace />;
};

export default LegacyProfileRedirect;
