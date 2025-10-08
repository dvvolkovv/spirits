import React from 'react';
import { X } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'terms' | 'privacy';
}

const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose, type }) => {
  if (!isOpen) return null;

  const termsContent = (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Пользовательское соглашение</h2>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">1. Общие положения</h3>
        <p className="text-gray-700 leading-relaxed">
          Настоящее Пользовательское соглашение регулирует отношения между администрацией приложения
          "Kindred Spirits" (далее - Приложение) и пользователями Приложения.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Используя Приложение, вы подтверждаете свое согласие с настоящим Соглашением. Если вы не
          согласны с условиями Соглашения, пожалуйста, не используйте Приложение.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">2. Правообладатель</h3>
        <p className="text-gray-700 leading-relaxed">
          Приложение "Kindred Spirits" принадлежит Волкову Дмитрию Викторовичу, который является
          правообладателем и администратором Приложения.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Все права на Приложение, включая исключительные права на использование, принадлежат
          Волкову Дмитрию Викторовичу.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">3. Цель Приложения</h3>
        <p className="text-gray-700 leading-relaxed">
          Приложение предназначено для поиска и общения с людьми, близкими по духу, ценностям и
          интересам. Приложение использует искусственный интеллект для анализа и подбора совместимых
          пользователей.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">4. Регистрация и аккаунт</h3>
        <p className="text-gray-700 leading-relaxed">
          Для использования Приложения необходимо пройти процедуру регистрации с использованием
          номера телефона. Вы обязуетесь предоставлять достоверную информацию о себе.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Вы несете ответственность за сохранность доступа к своему аккаунту и за все действия,
          совершенные с его использованием.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">5. Правила поведения</h3>
        <p className="text-gray-700 leading-relaxed">
          Пользователям запрещается:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Размещать оскорбительный, дискриминационный или незаконный контент</li>
          <li>Распространять спам или рекламу без согласия администрации</li>
          <li>Выдавать себя за другое лицо</li>
          <li>Использовать Приложение в мошеннических целях</li>
          <li>Нарушать права других пользователей</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">6. Интеллектуальная собственность</h3>
        <p className="text-gray-700 leading-relaxed">
          Все права на Приложение, включая исходный код, дизайн, логотипы и другие материалы,
          принадлежат Волкову Дмитрию Викторовичу.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">7. Ответственность</h3>
        <p className="text-gray-700 leading-relaxed">
          Приложение предоставляется "как есть". Администрация не несет ответственности за
          взаимодействие между пользователями и за последствия такого взаимодействия.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">8. Изменение условий</h3>
        <p className="text-gray-700 leading-relaxed">
          Администрация оставляет за собой право изменять условия настоящего Соглашения в любое
          время. Продолжение использования Приложения после внесения изменений означает ваше
          согласие с новыми условиями.
        </p>
      </section>
    </div>
  );

  const privacyContent = (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Политика конфиденциальности</h2>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">1. Сбор информации</h3>
        <p className="text-gray-700 leading-relaxed">
          Мы собираем следующую информацию:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Номер телефона для аутентификации</li>
          <li>Имя и фамилия (по желанию)</li>
          <li>Информация о ваших ценностях, убеждениях и интересах</li>
          <li>История сообщений и взаимодействий в Приложении</li>
          <li>Техническая информация об устройстве и использовании Приложения</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">2. Использование информации</h3>
        <p className="text-gray-700 leading-relaxed">
          Собранная информация используется для:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Предоставления и улучшения услуг Приложения</li>
          <li>Подбора совместимых пользователей на основе ваших данных</li>
          <li>Персонализации вашего опыта использования</li>
          <li>Обеспечения безопасности и предотвращения мошенничества</li>
          <li>Связи с вами по важным вопросам, касающимся Приложения</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">3. Обработка данных с помощью ИИ</h3>
        <p className="text-gray-700 leading-relaxed">
          Мы используем технологии искусственного интеллекта для анализа вашего профиля, сообщений
          и взаимодействий с целью подбора наиболее совместимых людей. Все данные обрабатываются
          конфиденциально и используются только для улучшения качества подбора.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">4. Передача данных третьим лицам</h3>
        <p className="text-gray-700 leading-relaxed">
          Мы не продаем и не передаем ваши персональные данные третьим лицам, за исключением
          следующих случаев:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>С вашего явного согласия</li>
          <li>По требованию законодательства</li>
          <li>Для защиты наших прав и безопасности пользователей</li>
          <li>Поставщикам услуг, работающим от нашего имени (с соблюдением конфиденциальности)</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">5. Защита данных</h3>
        <p className="text-gray-700 leading-relaxed">
          Мы применяем современные технологии шифрования и безопасности для защиты ваших данных.
          Доступ к персональным данным имеют только уполномоченные сотрудники.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">6. Ваши права</h3>
        <p className="text-gray-700 leading-relaxed">
          Вы имеете право:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Получить доступ к своим персональным данным</li>
          <li>Исправить неточные данные</li>
          <li>Удалить свой аккаунт и данные</li>
          <li>Ограничить обработку данных</li>
          <li>Отозвать согласие на обработку данных</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">7. Хранение данных</h3>
        <p className="text-gray-700 leading-relaxed">
          Мы храним ваши данные до тех пор, пока это необходимо для предоставления услуг или пока
          вы не удалите свой аккаунт. После удаления аккаунта данные удаляются в течение 30 дней.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">8. Cookies и аналитика</h3>
        <p className="text-gray-700 leading-relaxed">
          Мы используем cookies и аналогичные технологии для улучшения работы Приложения и анализа
          использования. Вы можете управлять настройками cookies в своем браузере.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">9. Изменения в политике</h3>
        <p className="text-gray-700 leading-relaxed">
          Мы можем обновлять настоящую Политику конфиденциальности. О существенных изменениях мы
          уведомим вас через Приложение или другими способами.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">10. Контакты</h3>
        <p className="text-gray-700 leading-relaxed">
          Правообладатель: Волков Дмитрий Викторович
        </p>
        <p className="text-gray-700 leading-relaxed">
          Если у вас есть вопросы о настоящей Политике конфиденциальности или об обработке ваших
          данных, пожалуйста, свяжитесь с нами через форму обратной связи в Приложении.
        </p>
      </section>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {type === 'terms' ? 'Пользовательское соглашение' : 'Политика конфиденциальности'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {type === 'terms' ? termsContent : privacyContent}
        </div>

        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full bg-forest-600 hover:bg-forest-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalModal;
