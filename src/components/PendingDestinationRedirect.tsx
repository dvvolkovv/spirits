import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { takePendingDestination } from '../utils/pendingDestination';

// После входа — в раздел, куда человек шёл до него (utils/pendingDestination.ts).
//
// Покрывает пути, которые кончаются голым /chat уже ПОСЛЕ того, как оболочка
// вошедшего смонтирована: OAuth-колбэк, экран привязки, страница почтовой
// ссылки (бэкенд делает location.replace('/chat')), Taler ID (/?talerid_login=
// → RootRedirect → голый /chat). /chat с параметрами — чей-то явный адрес
// (?assistant=, ?view=tokens), его не трогаем.
//
// SMS — отдельно и НЕ здесь: AuthContext.login() делает setUser ДО того, как
// SmsLoginPane успевает перейти на /chat, — оболочка вошедшего рисуется сразу
// по адресу экрана входа («/» или голый /chat), и этот компонент забрал бы
// запись сам, а navigate('/chat') из SmsLoginPane увёл бы обратно в чат.
// Поэтому SmsLoginPane забирает запись ДО login() и уходит прямо в раздел
// (см. SmsLoginPane.tsx, handleOTPSubmit).
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
