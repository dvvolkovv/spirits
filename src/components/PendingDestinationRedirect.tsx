import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { takePendingDestination } from '../utils/pendingDestination';

// После входа — в раздел, куда человек шёл до него (utils/pendingDestination.ts).
//
// Все пути входа кончаются голым /chat: SMS и OAuth, экран привязки, ссылка
// из письма (её обслуживает страница бэкенда с location.replace('/chat')).
// Поэтому ловим именно голый /chat, а не правим каждый путь — так покрыт и
// вход по письму, до которого фронт не дотягивается. /chat с параметрами —
// чей-то явный адрес (?assistant=, ?view=tokens), его не трогаем.
const PendingDestinationRedirect: React.FC = () => {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (pathname !== '/chat' || search) return;
    const destination = takePendingDestination();
    if (destination) navigate(destination, { replace: true });
  }, [pathname, search, navigate]);

  return null;
};

export default PendingDestinationRedirect;
