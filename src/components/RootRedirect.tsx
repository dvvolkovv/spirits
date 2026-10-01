import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

// `/` → `/chat`, сохраняя только выбор ассистента: ссылка вида
// my.linkeon.io/?assistant=14 иначе теряла бы его ещё до чата. Остальные
// параметры не переносятся сознательно: одноразовые коды входа Taler ID
// (talerid_login, talerid_link) App.tsx гасит через history.replaceState мимо
// роутера, и перенос устаревшего search вернул бы их в адрес /chat.
const RootRedirect: React.FC = () => {
  const assistant = new URLSearchParams(useLocation().search).get('assistant')?.trim();
  const search = assistant ? `?${new URLSearchParams({ assistant })}` : '';
  return <Navigate to={{ pathname: '/chat', search }} replace />;
};

export default RootRedirect;
