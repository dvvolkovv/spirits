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
          Приложение принадлежит и управляется <strong>Волковым Дмитрием Викторовичем
          (ИНН 463404496646)</strong>, плательщиком налога на профессиональный доход
          (самозанятый), далее - "Исполнитель" или "Администрация".
        </p>
        <p className="text-gray-700 leading-relaxed">
          Контактный email: support@linkeon.ru
        </p>
        <p className="text-gray-700 leading-relaxed">
          Настоящее Соглашение является публичной офертой в соответствии со
          статьей 437 Гражданского кодекса РФ. Использование Приложения означает
          полное и безоговорочное принятие условий настоящего Соглашения.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">2. Цель Приложения</h3>
        <p className="text-gray-700 leading-relaxed">
          Приложение предназначено для поиска и общения с людьми, близкими по духу, ценностям и
          интересам. Приложение использует искусственный интеллект для анализа и подбора совместимых
          пользователей.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">3. Регистрация и аккаунт</h3>
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
        <h3 className="text-lg font-semibold text-gray-800">3.1. Возрастные ограничения</h3>
        <p className="text-gray-700 leading-relaxed">
          Приложение предназначено исключительно для лиц, достигших 18 лет.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Регистрируясь в Приложении, пользователь подтверждает, что на момент
          регистрации ему исполнилось полных 18 лет.
        </p>
        <p className="text-gray-700 leading-relaxed">
          В случае обнаружения аккаунта пользователя младше 18 лет, такой аккаунт
          немедленно блокируется без права восстановления и без возврата средств
          за оплаченные услуги.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">4. Правила поведения</h3>
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
        <h3 className="text-lg font-semibold text-gray-800">4.1. Платные услуги и подписки</h3>
        <p className="text-gray-700 leading-relaxed">
          Приложение предоставляет как бесплатные, так и платные услуги (премиум-подписка).
        </p>
        <p className="text-gray-700 leading-relaxed">
          Платные услуги включают, но не ограничиваются: расширенный доступ к просмотру профилей,
          приоритет в результатах поиска, дополнительные фильтры, детальный анализ совместимости.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Оплата производится через интегрированные платежные системы. Исполнитель не обрабатывает
          и не хранит данные банковских карт. После оплаты направляется чек в соответствии
          с требованиями законодательства РФ.
        </p>
        <p className="text-gray-700 leading-relaxed">
          При оформлении подписки пользователь соглашается с автоматическим списанием
          средств по окончании оплаченного периода до момента отмены подписки.
          Для отмены необходимо отключить подписку в настройках не позднее чем за 24 часа
          до даты следующего списания.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Неиспользованный период подписки не продлевается, не компенсируется и не
          возвращается, за исключением случаев, предусмотренных разделом 8.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">5. Интеллектуальная собственность</h3>
        <p className="text-gray-700 leading-relaxed">
          Все права на Приложение, включая исходный код, дизайн, логотипы и другие материалы,
          принадлежат Волкову Дмитрию Викторовичу.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Регистрируясь, пользователь предоставляет исполнителю неисключительную лицензию на
          использование загруженных фотографий и контента для целей функционирования сервиса.
          Пользователь гарантирует, что размещаемые фотографии не нарушают права третьих лиц.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">6. Ограничение ответственности</h3>
        <p className="text-gray-700 leading-relaxed">
          Приложение и все его функции предоставляются на условиях "как есть" (as is),
          без каких-либо явных или подразумеваемых гарантий.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Исполнитель НЕ ГАРАНТИРУЕТ:</strong>
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Что пользователь найдет совместимого партнера</li>
          <li>Что знакомства приведут к долгосрочным отношениям</li>
          <li>Точность и надежность AI-алгоритмов подбора</li>
          <li>Непрерывную и безошибочную работу Приложения</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Процент совместимости и рекомендации AI являются исключительно информационными
          и не должны рассматриваться как гарантия успешных отношений.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Исполнитель НЕ НЕСЕТ ОТВЕТСТВЕННОСТИ за:</strong>
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Содержание профилей других пользователей и достоверность информации</li>
          <li>Действия и заявления пользователей</li>
          <li>Результаты или последствия знакомств и встреч</li>
          <li>Действия третьих лиц (платежные системы, хостинг, AI-сервисы)</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Исполнитель не проверяет личность, семейное положение, намерения пользователей.
        </p>
        <p className="text-gray-700 leading-relaxed">
          В любом случае максимальная ответственность Исполнителя ограничена суммой,
          уплаченной пользователем за последние 30 дней.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Исполнитель не несет ответственности за моральный вред, упущенную выгоду,
          косвенные или последующие убытки.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">7. Рекомендации по безопасности</h3>
        <p className="text-gray-700 leading-relaxed">
          Исполнитель рекомендует пользователям:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Встречаться с новыми знакомыми только в общественных местах</li>
          <li>Сообщать близким о планируемых встречах</li>
          <li>Не передавать денежные средства другим пользователям</li>
          <li>Не сообщать конфиденциальную информацию (адрес, финансовые данные)</li>
          <li>Сообщать администрации о подозрительной активности</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Несоблюдение этих рекомендаций осуществляется на риск самого пользователя.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">8. Возврат средств</h3>
        <p className="text-gray-700 leading-relaxed">
          Возврат денежных средств производится ТОЛЬКО в следующих случаях:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Технический сбой более 72 часов подряд</li>
          <li>Двойное списание по технической ошибке</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Возврат НЕ ПРОИЗВОДИТСЯ при: субъективной неудовлетворенности, отсутствии результата
          знакомств, блокировке за нарушение правил, добровольном удалении аккаунта,
          частичном использовании подписки.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Претензия направляется на email support@linkeon.ru и рассматривается
          в течение 10 рабочих дней. Возврат производится в течение 30 дней за вычетом
          комиссий платежных систем (3-5%).
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">9. Разрешение споров</h3>
        <p className="text-gray-700 leading-relaxed">
          Все споры разрешаются путем переговоров с соблюдением обязательного
          досудебного порядка.
        </p>
        <p className="text-gray-700 leading-relaxed">
          До обращения в суд пользователь обязан направить письменную претензию на
          email support@linkeon.ru. Претензия рассматривается в течение 30 дней.
        </p>
        <p className="text-gray-700 leading-relaxed">
          При недостижении согласия споры разрешаются в судебном порядке по месту
          нахождения ответчика в соответствии с законодательством РФ.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">10. Изменение условий</h3>
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

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
        <h3 className="text-lg font-semibold text-gray-900">Оператор персональных данных</h3>
        <p className="text-gray-700"><strong>Наименование:</strong> Волков Дмитрий Викторович</p>
        <p className="text-gray-700"><strong>ИНН:</strong> 463404496646</p>
        <p className="text-gray-700"><strong>Статус:</strong> Плательщик налога на профессиональный доход (самозанятый)</p>
        <p className="text-gray-700"><strong>Контактный email:</strong> support@linkeon.ru</p>
      </div>

      <p className="text-gray-700 leading-relaxed">
        Настоящая Политика конфиденциальности действует в отношении всех персональных
        данных, которые Оператор может получить о пользователе во время использования
        Приложения "Kindred Spirits".
      </p>

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
        <h3 className="text-lg font-semibold text-gray-800">2.1. Обработка платежной информации</h3>
        <p className="text-gray-700 leading-relaxed">
          Приложение <strong>НЕ обрабатывает и НЕ хранит</strong> данные банковских карт
          (номер карты, срок действия, CVV-код).
        </p>
        <p className="text-gray-700 leading-relaxed">
          Все платежные данные обрабатываются исключительно сертифицированными платежными
          агрегаторами, соответствующими стандарту PCI DSS.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Приложение получает только информацию о факте совершения платежа, сумме
          платежа и идентификаторе транзакции.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Чеки за оказанные услуги формируются автоматически через приложение "Мой налог"
          и направляются пользователю в соответствии с требованиями законодательства РФ.
        </p>
        <p className="text-gray-700 leading-relaxed">
          История платежей хранится в течение 5 лет в соответствии с требованиями
          налогового законодательства РФ.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">3. Обработка данных с помощью искусственного интеллекта</h3>
        <p className="text-gray-700 leading-relaxed">
          Для анализа совместимости пользователей Приложение использует технологии
          искусственного интеллекта, предоставляемые сторонними провайдерами.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Используемые сервисы:</strong> OpenAI (ChatGPT, GPT-4), Anthropic (Claude),
          другие AI-сервисы.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Передаваемые данные:</strong> текст профиля, ответы на вопросы,
          история сообщений, демографическая информация в обезличенном виде.
          Номер телефона, фамилия и фотографии НЕ передаются AI-провайдерам.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Цели AI-обработки:</strong> определение ценностей и личностных
          характеристик, расчет совместимости, персонализация опыта.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>ВАЖНО:</strong> После передачи данных AI-провайдерам Оператор не контролирует
          их дальнейшую обработку. Обработка осуществляется в соответствии с
          политиками конфиденциальности соответствующих провайдеров.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Оператор не гарантирует точность, надежность или применимость результатов
          AI-анализа. Все рекомендации носят исключительно информационный характер.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Используя Приложение, пользователь явно соглашается с передачей своих данных
          для обработки с помощью AI-технологий.
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
          <strong>Конкретные сроки хранения:</strong>
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li><strong>Активные аккаунты:</strong> бессрочно до удаления пользователем</li>
          <li><strong>Удаленные аккаунты:</strong> 30 календарных дней, затем полное удаление</li>
          <li><strong>История платежей:</strong> 5 лет (требование налогового законодательства)</li>
          <li><strong>Логи безопасности:</strong> 6 месяцев</li>
          <li><strong>Данные переписки:</strong> удаляются вместе с аккаунтом</li>
          <li><strong>Резервные копии:</strong> перезаписываются каждые 30 дней</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">7.1. Обработка фотографий</h3>
        <p className="text-gray-700 leading-relaxed">
          Загружая фотографии в Приложение, пользователь:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Подтверждает, что является правообладателем изображения</li>
          <li>Предоставляет Оператору неисключительную лицензию на использование</li>
          <li>Гарантирует, что на изображениях не присутствуют третьи лица без их согласия</li>
          <li>Берет на себя полную ответственность за содержание изображений</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Фотографии хранятся до момента удаления пользователем или удаления аккаунта.
          При удалении аккаунта все фотографии удаляются в течение 30 дней.
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
