import React from 'react';
import { Navigate } from 'react-router-dom';

// Раздел переехал во вкладку Студии. Страница оставлена редиректом, а не
// удалена: на /products уже могли уйти ссылки, а SPA-фолбэк этого хостинга
// отдаёт 200 с index.html на любой путь — то есть удалённый маршрут выглядел
// бы не как «страницы нет», а как пустой белый экран без единой ошибки.
const ProductsPage: React.FC = () => <Navigate to="/studio?tab=products" replace />;

export default ProductsPage;
