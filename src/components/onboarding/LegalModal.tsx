import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'terms' | 'privacy';
}

const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose, type }) => {
  const { t, i18n } = useTranslation();
  if (!isOpen) return null;

  const isEn = i18n.language.startsWith('en');

  const termsContentRu = (
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

  const termsContentEn = (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Terms of Service</h2>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
        This English version is a courtesy translation. In case of any discrepancy, the Russian-language version is governing and legally binding under the laws of the Russian Federation.
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">1. General provisions</h3>
        <p className="text-gray-700 leading-relaxed">
          These Terms of Service govern the relationship between the administration of the
          "Kindred Spirits" application (hereinafter — the Application) and users of the Application.
        </p>
        <p className="text-gray-700 leading-relaxed">
          The Application is owned and operated by <strong>Dmitry Viktorovich Volkov
          (INN 463404496646)</strong>, payer of professional-income tax (self-employed),
          hereinafter — the "Operator" or "Administration".
        </p>
        <p className="text-gray-700 leading-relaxed">
          Contact email: support@linkeon.ru
        </p>
        <p className="text-gray-700 leading-relaxed">
          These Terms constitute a public offer under Article 437 of the Civil Code of the
          Russian Federation. Use of the Application means full and unconditional acceptance
          of these Terms.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">2. Purpose of the Application</h3>
        <p className="text-gray-700 leading-relaxed">
          The Application is intended for finding and communicating with people who share similar
          values, spirit and interests. The Application uses artificial intelligence to analyze
          and match compatible users.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">3. Registration and account</h3>
        <p className="text-gray-700 leading-relaxed">
          To use the Application you must complete the registration procedure using a phone
          number. You undertake to provide truthful information about yourself.
        </p>
        <p className="text-gray-700 leading-relaxed">
          You are responsible for the security of access to your account and for all actions
          taken under it.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">3.1. Age restrictions</h3>
        <p className="text-gray-700 leading-relaxed">
          The Application is intended exclusively for persons aged 18 and over.
        </p>
        <p className="text-gray-700 leading-relaxed">
          By registering in the Application, the user confirms that, at the moment of
          registration, they are at least 18 years old.
        </p>
        <p className="text-gray-700 leading-relaxed">
          If an account belonging to a user under 18 is discovered, such account is
          immediately blocked with no right of restoration and no refund for paid services.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">4. Rules of conduct</h3>
        <p className="text-gray-700 leading-relaxed">
          Users are prohibited from:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Posting offensive, discriminatory or unlawful content</li>
          <li>Distributing spam or advertising without consent of the administration</li>
          <li>Impersonating another person</li>
          <li>Using the Application for fraudulent purposes</li>
          <li>Violating the rights of other users</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">4.1. Paid services and subscriptions</h3>
        <p className="text-gray-700 leading-relaxed">
          The Application provides both free and paid services (premium subscription).
        </p>
        <p className="text-gray-700 leading-relaxed">
          Paid services include, but are not limited to: extended profile viewing, priority in
          search results, additional filters, detailed compatibility analysis.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Payment is made through integrated payment systems. The Operator does not process
          or store bank card data. After payment, a receipt is issued in accordance with the
          legislation of the Russian Federation.
        </p>
        <p className="text-gray-700 leading-relaxed">
          By subscribing, the user agrees to automatic charges at the end of the paid period
          until the subscription is cancelled. To cancel, the subscription must be disabled in
          settings no later than 24 hours before the next charge date.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Unused subscription time is not extended, compensated or refunded, except in the
          cases provided for in Section 8.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">5. Intellectual property</h3>
        <p className="text-gray-700 leading-relaxed">
          All rights to the Application, including source code, design, logos and other
          materials, belong to Dmitry Viktorovich Volkov.
        </p>
        <p className="text-gray-700 leading-relaxed">
          By registering, the user grants the Operator a non-exclusive license to use uploaded
          photos and content for the purposes of operating the service. The user warrants that
          photos they upload do not infringe the rights of third parties.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">6. Limitation of liability</h3>
        <p className="text-gray-700 leading-relaxed">
          The Application and all its features are provided on an "as is" basis, without
          express or implied warranties of any kind.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>The Operator DOES NOT GUARANTEE:</strong>
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>That the user will find a compatible partner</li>
          <li>That matches will lead to long-term relationships</li>
          <li>The accuracy and reliability of AI matching algorithms</li>
          <li>Continuous and error-free operation of the Application</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Compatibility percentages and AI recommendations are informational only and should
          not be treated as a guarantee of successful relationships.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>The Operator IS NOT LIABLE for:</strong>
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>The content of other users' profiles and the accuracy of the information</li>
          <li>Actions and statements of users</li>
          <li>The outcomes or consequences of introductions and meetings</li>
          <li>Actions of third parties (payment systems, hosting, AI services)</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          The Operator does not verify the identity, marital status, or intentions of users.
        </p>
        <p className="text-gray-700 leading-relaxed">
          In any case, the Operator's maximum liability is limited to the amount paid by the
          user during the last 30 days.
        </p>
        <p className="text-gray-700 leading-relaxed">
          The Operator is not liable for moral harm, lost profit, or indirect or consequential
          losses.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">7. Safety recommendations</h3>
        <p className="text-gray-700 leading-relaxed">
          The Operator recommends that users:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Meet new acquaintances only in public places</li>
          <li>Tell people they trust about planned meetings</li>
          <li>Do not transfer money to other users</li>
          <li>Do not share confidential information (address, financial details)</li>
          <li>Report suspicious activity to the administration</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Failure to follow these recommendations is at the user's own risk.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">8. Refunds</h3>
        <p className="text-gray-700 leading-relaxed">
          Refunds are made ONLY in the following cases:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Technical failure lasting more than 72 consecutive hours</li>
          <li>Duplicate charge due to a technical error</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Refunds are NOT made for: subjective dissatisfaction, lack of dating results,
          account blocking for rule violations, voluntary account deletion, or partial use
          of a subscription.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Complaints are submitted to support@linkeon.ru and reviewed within 10 business days.
          Refunds are processed within 30 days, less payment-system fees (3–5%).
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">9. Dispute resolution</h3>
        <p className="text-gray-700 leading-relaxed">
          All disputes are resolved through negotiations, subject to a mandatory pre-litigation
          procedure.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Before going to court, the user must send a written claim to support@linkeon.ru.
          The claim is reviewed within 30 days.
        </p>
        <p className="text-gray-700 leading-relaxed">
          If no agreement is reached, disputes are resolved in court at the respondent's
          location in accordance with the legislation of the Russian Federation.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">10. Changes to the Terms</h3>
        <p className="text-gray-700 leading-relaxed">
          The administration reserves the right to change these Terms at any time. Continued
          use of the Application after changes means your agreement to the new terms.
        </p>
      </section>
    </div>
  );

  const privacyContentRu = (
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

  const privacyContentEn = (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Privacy Policy</h2>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
        This English version is a courtesy translation. In case of any discrepancy, the Russian-language version is governing and legally binding under the laws of the Russian Federation.
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
        <h3 className="text-lg font-semibold text-gray-900">Personal data operator</h3>
        <p className="text-gray-700"><strong>Name:</strong> Dmitry Viktorovich Volkov</p>
        <p className="text-gray-700"><strong>INN:</strong> 463404496646</p>
        <p className="text-gray-700"><strong>Status:</strong> Payer of professional-income tax (self-employed)</p>
        <p className="text-gray-700"><strong>Contact email:</strong> support@linkeon.ru</p>
      </div>

      <p className="text-gray-700 leading-relaxed">
        This Privacy Policy applies to all personal data that the Operator may receive about
        the user during the use of the "Kindred Spirits" Application.
      </p>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">1. Information collected</h3>
        <p className="text-gray-700 leading-relaxed">
          We collect the following information:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Phone number for authentication</li>
          <li>First and last name (optional)</li>
          <li>Information about your values, beliefs and interests</li>
          <li>History of messages and interactions in the Application</li>
          <li>Technical information about your device and use of the Application</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">2. Use of information</h3>
        <p className="text-gray-700 leading-relaxed">
          The information collected is used to:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Provide and improve the Application's services</li>
          <li>Match compatible users based on your data</li>
          <li>Personalize your experience</li>
          <li>Ensure security and prevent fraud</li>
          <li>Contact you regarding important matters concerning the Application</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">2.1. Processing of payment information</h3>
        <p className="text-gray-700 leading-relaxed">
          The Application <strong>DOES NOT process and DOES NOT store</strong> bank card data
          (card number, expiry, CVV).
        </p>
        <p className="text-gray-700 leading-relaxed">
          All payment data is processed exclusively by certified payment aggregators compliant
          with the PCI DSS standard.
        </p>
        <p className="text-gray-700 leading-relaxed">
          The Application receives only the fact of payment, the payment amount and the
          transaction identifier.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Receipts for rendered services are generated automatically via the "Moy Nalog" app
          and sent to the user in accordance with the legislation of the Russian Federation.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Payment history is stored for 5 years in accordance with the tax legislation
          of the Russian Federation.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">3. Data processing via artificial intelligence</h3>
        <p className="text-gray-700 leading-relaxed">
          To analyze user compatibility, the Application uses artificial-intelligence
          technologies provided by third-party vendors.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Services used:</strong> OpenAI (ChatGPT, GPT-4), Anthropic (Claude), other
          AI services.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Data transmitted:</strong> profile text, answers to questions, message
          history, demographic information in anonymized form. Phone number, last name and
          photos are NOT transmitted to AI vendors.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Purposes of AI processing:</strong> determining values and personality
          traits, calculating compatibility, personalizing the experience.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>IMPORTANT:</strong> After data is transmitted to AI vendors, the Operator
          does not control its further processing. Processing is carried out in accordance
          with the privacy policies of the respective vendors.
        </p>
        <p className="text-gray-700 leading-relaxed">
          The Operator does not guarantee the accuracy, reliability or applicability of AI
          analysis results. All recommendations are informational only.
        </p>
        <p className="text-gray-700 leading-relaxed">
          By using the Application, the user explicitly consents to the transmission of their
          data for processing by AI technologies.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">4. Transfer of data to third parties</h3>
        <p className="text-gray-700 leading-relaxed">
          We do not sell or transfer your personal data to third parties, except in the
          following cases:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>With your explicit consent</li>
          <li>As required by law</li>
          <li>To protect our rights and the safety of users</li>
          <li>To service providers acting on our behalf (subject to confidentiality)</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">5. Data protection</h3>
        <p className="text-gray-700 leading-relaxed">
          We apply modern encryption and security technologies to protect your data. Access
          to personal data is limited to authorized personnel only.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">6. Your rights</h3>
        <p className="text-gray-700 leading-relaxed">
          You have the right to:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Delete your account and data</li>
          <li>Restrict the processing of data</li>
          <li>Withdraw consent to the processing of data</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">7. Data retention</h3>
        <p className="text-gray-700 leading-relaxed">
          <strong>Specific retention periods:</strong>
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li><strong>Active accounts:</strong> indefinitely until deleted by the user</li>
          <li><strong>Deleted accounts:</strong> 30 calendar days, then fully removed</li>
          <li><strong>Payment history:</strong> 5 years (tax-legislation requirement)</li>
          <li><strong>Security logs:</strong> 6 months</li>
          <li><strong>Conversation data:</strong> removed together with the account</li>
          <li><strong>Backups:</strong> overwritten every 30 days</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">7.1. Photo processing</h3>
        <p className="text-gray-700 leading-relaxed">
          By uploading photos to the Application, the user:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Confirms that they are the rights holder of the image</li>
          <li>Grants the Operator a non-exclusive license to use it</li>
          <li>Warrants that no third parties appear in the images without their consent</li>
          <li>Takes full responsibility for the content of the images</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Photos are kept until they are deleted by the user or until the account is deleted.
          When the account is deleted, all photos are removed within 30 days.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">8. Cookies and analytics</h3>
        <p className="text-gray-700 leading-relaxed">
          We use cookies and similar technologies to improve the Application and analyze
          usage. You can manage cookie settings in your browser.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">9. Policy changes</h3>
        <p className="text-gray-700 leading-relaxed">
          We may update this Privacy Policy. We will notify you of material changes through
          the Application or by other means.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">10. Contacts</h3>
        <p className="text-gray-700 leading-relaxed">
          If you have questions about this Privacy Policy or about the processing of your
          data, please contact us via the feedback form in the Application.
        </p>
      </section>
    </div>
  );

  const termsContent = isEn ? termsContentEn : termsContentRu;
  const privacyContent = isEn ? privacyContentEn : privacyContentRu;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {type === 'terms' ? t('nav.legal.terms') : t('nav.legal.privacy')}
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
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalModal;
