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

  // Юридически значимая версия — русская: соглашение описывает отношения по
  // праву РФ и называет конкретного исполнителя с ИНН. Для всех остальных
  // языков отдаём английскую редакцию как ознакомительную — она написана
  // человеком, в отличие от машинного перевода, и понятнее кириллицы
  // испанцу, немцу, французу или китайцу.
  // Переводить оферту и политику на es/de/fr/zh машинно нельзя — только через юриста.
  const isRu = i18n.language.startsWith('ru');

  const termsContentRu = (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Пользовательское соглашение</h2>
      <p className="text-sm text-gray-500">Редакция от 5 августа 2026 г.</p>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">1. Общие положения</h3>
        <p className="text-gray-700 leading-relaxed">
          Настоящее Пользовательское соглашение регулирует отношения между администрацией приложения
          LINKEON.IO (далее - Приложение) и пользователями Приложения.
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
          Приложение предоставляет пользователю доступ к AI-ассистентам, к генерации
          контента (текст, изображения, видео) и к ведению единого профиля.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Приложение также обеспечивает нетворкинг: поиск других пользователей по
          совместимости профилей, отправку откликов и переписку с ними. Нетворкинг
          в Приложении направлен на профессиональные и дружеские контакты и не является
          сервисом знакомств.
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
        <h3 className="text-lg font-semibold text-gray-800">4.1. Платные услуги и токены</h3>
        <p className="text-gray-700 leading-relaxed">
          Приложение предоставляет как бесплатные, так и платные услуги. Основной расчетной
          единицей внутри Приложения являются токены. Токены расходуются при обращении
          к AI-ассистентам, при генерации изображений и видео и при использовании иных
          функций Приложения, требующих вычислительных ресурсов.
        </p>
        <p className="text-gray-700 leading-relaxed">
          При регистрации пользователю единовременно начисляется приветственный бонус —
          25 000 токенов. Дополнительные токены приобретаются пакетами: 50 000 токенов —
          149 ₽, 200 000 токенов — 499 ₽, 1 000 000 токенов — 1 990 ₽. Актуальный состав
          пакетов и цены отображаются в Приложении в разделе покупки токенов.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Покупка токенов является разовой операцией.</strong> Подписка, регулярные
          платежи и автоматическое списание средств в Приложении не применяются. Каждое
          списание производится только по инициативе пользователя при оформлении конкретной
          покупки; платежные данные для последующих списаний не сохраняются.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Оплата производится через интегрированные платежные системы. Исполнитель не обрабатывает
          и не хранит данные банковских карт. После оплаты направляется чек в соответствии
          с требованиями законодательства РФ.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Приобретенные токены не имеют срока действия и не сгорают. Неиспользованный
          остаток токенов не подлежит возврату и не обменивается на денежные средства,
          в том числе при удалении аккаунта, за исключением случаев, предусмотренных
          разделом 8.
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
          <li>Что пользователь найдет подходящие контакты по результатам поиска совместимости</li>
          <li>Что установленные через Приложение контакты приведут к сотрудничеству или иному результату</li>
          <li>Точность и надежность ответов AI-ассистентов, сгенерированного контента и алгоритмов подбора</li>
          <li>Непрерывную и безошибочную работу Приложения</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Процент совместимости, ответы AI-ассистентов и иные рекомендации AI являются
          исключительно информационными, не являются профессиональной консультацией
          (в том числе юридической, медицинской, психологической или финансовой) и не
          должны рассматриваться как гарантия результата.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Исполнитель НЕ НЕСЕТ ОТВЕТСТВЕННОСТИ за:</strong>
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>Содержание профилей других пользователей и достоверность информации</li>
          <li>Действия и заявления пользователей</li>
          <li>Результаты и последствия контактов, переписки и встреч между пользователями</li>
          <li>Решения, принятые пользователем на основании ответов AI-ассистентов</li>
          <li>Действия третьих лиц (платежные системы, хостинг, AI-сервисы)</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Исполнитель не проверяет личность пользователей, достоверность указанных ими
          сведений и их намерения.
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
          Возврат НЕ ПРОИЗВОДИТСЯ при: субъективной неудовлетворенности ответами
          AI-ассистентов, сгенерированным контентом или результатами поиска контактов,
          блокировке за нарушение правил, добровольном удалении аккаунта.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Неиспользованный остаток приобретенных токенов возврату не подлежит.
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
      <p className="text-sm text-gray-500">Last updated: 5 August 2026</p>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
        This English version is a courtesy translation. In case of any discrepancy, the Russian-language version is governing and legally binding under the laws of the Russian Federation.
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">1. General provisions</h3>
        <p className="text-gray-700 leading-relaxed">
          These Terms of Service govern the relationship between the administration of the
          LINKEON.IO application (hereinafter — the Application) and users of the Application.
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
          The Application gives the user access to AI assistants, to content generation
          (text, images, video) and to a single unified user profile.
        </p>
        <p className="text-gray-700 leading-relaxed">
          The Application also provides networking features: searching for other users by
          profile compatibility, sending them responses and exchanging messages. Networking
          in the Application is aimed at professional and friendly contacts and is not a
          dating service.
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
        <h3 className="text-lg font-semibold text-gray-800">4.1. Paid services and tokens</h3>
        <p className="text-gray-700 leading-relaxed">
          The Application provides both free and paid services. The internal unit of account
          is the token. Tokens are consumed when the user interacts with AI assistants,
          generates images and video, and uses other features of the Application that require
          computing resources.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Upon registration the user receives a one-time welcome bonus of 25,000 tokens.
          Additional tokens are purchased in packages: 50,000 tokens — RUB 149; 200,000
          tokens — RUB 499; 1,000,000 tokens — RUB 1,990. The current package composition and
          prices are displayed in the Application in the token purchase section.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>The purchase of tokens is a one-off transaction.</strong> The Application
          does not use subscriptions, recurring payments or automatic charges. Every charge is
          made solely on the user's initiative when placing a specific order; payment
          credentials are not stored for subsequent charges.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Payment is made through integrated payment systems. The Operator does not process
          or store bank card data. After payment, a receipt is issued in accordance with the
          legislation of the Russian Federation.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Purchased tokens have no expiry date and do not lapse. Any unused token balance is
          non-refundable and is not exchangeable for money, including upon deletion of the
          account, except in the cases provided for in Section 8.
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
          <li>That the user will find suitable contacts through the compatibility search</li>
          <li>That contacts established through the Application will lead to cooperation or any other outcome</li>
          <li>The accuracy and reliability of AI assistants' responses, generated content and matching algorithms</li>
          <li>Continuous and error-free operation of the Application</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Compatibility percentages, AI assistants' responses and other AI recommendations are
          informational only, do not constitute professional advice (including legal, medical,
          psychological or financial advice) and must not be treated as a guarantee of any
          outcome.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>The Operator IS NOT LIABLE for:</strong>
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>The content of other users' profiles and the accuracy of the information</li>
          <li>Actions and statements of users</li>
          <li>The outcomes and consequences of contacts, correspondence and meetings between users</li>
          <li>Decisions taken by the user on the basis of AI assistants' responses</li>
          <li>Actions of third parties (payment systems, hosting, AI services)</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          The Operator does not verify users' identity, the accuracy of the information they
          provide, or their intentions.
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
          Refunds are NOT made for: subjective dissatisfaction with AI assistants' responses,
          generated content or contact search results; account blocking for rule violations;
          or voluntary account deletion.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Any unused balance of purchased tokens is non-refundable.
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
      <p className="text-sm text-gray-500">Редакция от 5 августа 2026 г.</p>

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
        Приложения LINKEON.IO.
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
          Для работы AI-ассистентов, генерации контента, распознавания речи и анализа
          совместимости пользователей Приложение использует технологии искусственного
          интеллекта, предоставляемые сторонними провайдерами.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Используемые сервисы:</strong>
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li><strong>OpenAI</strong> (ChatGPT, GPT-4) — обработка текстовых запросов</li>
          <li><strong>Anthropic</strong> (Claude) — обработка текстовых запросов</li>
          <li><strong>Google</strong> — Gemini (обработка текста и мультимодальных данных),
            Imagen 4.0 Ultra и Nano Banana (генерация и редактирование изображений),
            Veo (генерация видео)</li>
          <li><strong>DeepSeek</strong> — формирование приветственных сообщений и части
            ответов в чате</li>
          <li><strong>Kling (Kuaishou)</strong> — генерация видео</li>
          <li><strong>ElevenLabs</strong> — создание голосовой модели по загруженному
            пользователем образцу голоса и озвучивание видео этим голосом</li>
          <li><strong>Яндекс SpeechKit</strong> — распознавание речи при голосовом вводе</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          <strong>Клонирование голоса.</strong> В разделе создания видео пользователь
          может включить озвучивание собственным голосом. В этом случае загруженный им
          аудиообразец голоса передаётся в Google (модель Gemini) — для составления
          текстового описания голоса, и в ElevenLabs — для создания голосовой модели,
          которой затем озвучивается сгенерированное видео. Образец загружается только
          по инициативе пользователя и только при подтверждении им отдельного согласия;
          без такого подтверждения загрузка не выполняется. Сам аудиофайл образца
          Оператором не сохраняется — сохраняются идентификатор голосовой модели на
          стороне ElevenLabs и текстовое описание голоса. Пользователь может удалить
          голосовую модель в интерфейсе Приложения; при этом она удаляется и на стороне
          ElevenLabs.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Передаваемые данные:</strong> имя и фамилия (если указаны
          пользователем), интересы, ценности, убеждения, желания, намерения и навыки
          из профиля пользователя, содержание переписки и история диалога
          с AI-ассистентом, файлы, которые пользователь прикрепляет к сообщениям
          (документы, изображения, аудио), а также аудиопоток при использовании
          голосового ввода.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Не передаются:</strong> номер телефона пользователя и идентификатор
          его учетной записи — ни в составе профиля, ни в составе запроса
          к AI-провайдеру. Данные банковских карт и иные платежные реквизиты
          AI-провайдерам также не передаются.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Цели AI-обработки:</strong> формирование ответов AI-ассистентов, генерация
          изображений и видео по заданию пользователя, распознавание речи, определение
          ценностей и личностных характеристик, расчет совместимости, персонализация опыта.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Трансграничная передача данных.</strong> Все перечисленные выше
          AI-провайдеры, кроме Яндекс SpeechKit, находятся за пределами Российской
          Федерации, поэтому передача им данных является трансграничной в значении
          статьи 12 Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных».
          Распознавание речи при голосовом вводе (Яндекс SpeechKit) выполняется на
          территории Российской Федерации. Аудиообразец голоса при использовании функции
          озвучивания видео собственным голосом передаётся за пределы Российской
          Федерации (Google, ElevenLabs).
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Передача данных в Китайскую Народную Республику.</strong> Данные
          передаются в том числе на территорию <strong>КНР</strong>: в сервис
          <strong> DeepSeek</strong> (приветственные сообщения и часть ответов в чате)
          и в сервис <strong>Kling (Kuaishou)</strong> (генерация видео). КНР не является
          участником Конвенции Совета Европы о защите физических лиц при автоматизированной
          обработке персональных данных и не относится к государствам, обеспечивающим
          адекватную защиту прав субъектов персональных данных. Такая передача
          осуществляется на основании согласия пользователя в соответствии с частью 4
          статьи 12 указанного закона. Пользователь вправе не использовать функции чата
          и генерации видео, если не согласен с передачей своих данных в КНР.
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
          Мы используем cookies и аналогичные технологии (в том числе localStorage браузера)
          для работы аутентификации, сохранения пользовательских настроек, анализа
          использования Приложения и оценки эффективности рекламы.
        </p>
        <p className="text-gray-700 leading-relaxed">
          В Приложении установлены следующие сторонние счетчики и трекеры:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>
            <strong>Яндекс.Метрика</strong>, номер счетчика <strong>105897773</strong>.
            Включены Вебвизор (запись действий пользователя на странице), карта кликов,
            отслеживание переходов по ссылкам и передача данных электронной коммерции.
          </li>
          <li>
            <strong>VK Ads / top.Mail.Ru</strong>, номер счетчика <strong>3773048</strong>.
            Фиксирует просмотры страниц и событие регистрации нового пользователя
            для оптимизации рекламных кампаний.
          </li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Указанные сервисы получают технические данные: IP-адрес, идентификаторы cookies,
          тип и версию браузера и операционной системы, параметры экрана, источник перехода,
          просмотренные страницы и совершенные в интерфейсе действия. В отношении собираемых
          ими данных эти сервисы выступают самостоятельными операторами и обрабатывают данные
          в соответствии со своими политиками конфиденциальности.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Вы можете отключить cookies в настройках своего браузера. При этом часть функций
          Приложения, включая вход в аккаунт, может стать недоступной.
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
      <p className="text-sm text-gray-500">Last updated: 5 August 2026</p>

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
        the user during the use of the LINKEON.IO Application.
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
          For the operation of AI assistants, content generation, speech recognition and
          analysis of user compatibility, the Application uses artificial-intelligence
          technologies provided by third-party vendors.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Services used:</strong>
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li><strong>OpenAI</strong> (ChatGPT, GPT-4) — processing of text requests</li>
          <li><strong>Anthropic</strong> (Claude) — processing of text requests</li>
          <li><strong>Google</strong> — Gemini (processing of text and multimodal data),
            Imagen 4.0 Ultra and Nano Banana (image generation and editing),
            Veo (video generation)</li>
          <li><strong>DeepSeek</strong> — generation of welcome messages and part of the
            chat responses</li>
          <li><strong>Kling (Kuaishou)</strong> — video generation</li>
          <li><strong>ElevenLabs</strong> — creation of a voice model from the voice sample
            uploaded by the user, and voicing of videos with that voice</li>
          <li><strong>Yandex SpeechKit</strong> — speech recognition for voice input</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          <strong>Voice cloning.</strong> In the video creation section the user may enable
          voicing with their own voice. In that case the audio sample they upload is
          transmitted to Google (Gemini model) to produce a textual description of the voice,
          and to ElevenLabs to create a voice model that is then used to voice the generated
          video. The sample is uploaded only on the user's initiative and only after they
          confirm a separate consent; without that confirmation no upload takes place. The
          audio file of the sample is not retained by the Operator — what is stored is the
          identifier of the voice model on the ElevenLabs side and the textual description of
          the voice. The user may delete the voice model in the Application interface, upon
          which it is also deleted on the ElevenLabs side.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Data transmitted:</strong> first and last name (if provided by the user),
          interests, values, beliefs, desires, intentions and skills from the user's profile,
          the content of the correspondence and the dialogue history with the AI assistant,
          files the user attaches to messages (documents, images, audio), and the audio
          stream when voice input is used.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Not transmitted:</strong> the user's phone number and account identifier —
          neither as part of the profile nor as part of the request to the AI vendor. Bank
          card data and other payment credentials are likewise NOT transmitted to AI vendors.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Purposes of AI processing:</strong> generating AI assistants' responses,
          generating images and video at the user's request, speech recognition, determining
          values and personality traits, calculating compatibility, personalizing the
          experience.
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Cross-border data transfer.</strong> All the AI vendors listed above,
          except Yandex SpeechKit, are located outside the Russian Federation, and therefore
          the transfer of data to them constitutes a cross-border transfer within the meaning
          of Article 12 of Federal Law No. 152-FZ of 27 July 2006 "On Personal Data". Speech
          recognition for voice input (Yandex SpeechKit) is performed within the Russian
          Federation. The voice sample used for voicing videos with the user's own voice is
          transferred outside the Russian Federation (Google, ElevenLabs).
        </p>
        <p className="text-gray-700 leading-relaxed">
          <strong>Transfer of data to the People's Republic of China.</strong> Data is
          transferred, among other destinations, to the territory of the
          <strong> PRC</strong>: to <strong>DeepSeek</strong> (welcome messages and part of
          the chat responses) and to <strong>Kling (Kuaishou)</strong> (video generation).
          The PRC is not a party to the Council of Europe Convention for the Protection of
          Individuals with regard to Automatic Processing of Personal Data and is not among
          the states providing adequate protection of the rights of personal data subjects.
          Such transfer is carried out on the basis of the user's consent pursuant to
          Part 4 of Article 12 of that law. A user who does not agree to the transfer of
          their data to the PRC may refrain from using the chat and video generation
          features.
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
          We use cookies and similar technologies (including the browser's localStorage) to
          operate authentication, store user preferences, analyze use of the Application and
          measure advertising performance.
        </p>
        <p className="text-gray-700 leading-relaxed">
          The following third-party counters and trackers are installed in the Application:
        </p>
        <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
          <li>
            <strong>Yandex.Metrica</strong>, counter number <strong>105897773</strong>.
            Webvisor (recording of the user's actions on the page), click map, link-click
            tracking and e-commerce data transmission are enabled.
          </li>
          <li>
            <strong>VK Ads / top.Mail.Ru</strong>, counter number <strong>3773048</strong>.
            Records page views and the new-user registration event in order to optimize
            advertising campaigns.
          </li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          These services receive technical data: IP address, cookie identifiers, browser and
          operating system type and version, screen parameters, referral source, pages viewed
          and actions taken in the interface. With respect to the data they collect, these
          services act as independent operators and process the data in accordance with their
          own privacy policies.
        </p>
        <p className="text-gray-700 leading-relaxed">
          You can disable cookies in your browser settings. Some features of the Application,
          including signing in to your account, may then become unavailable.
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

  const termsContent = isRu ? termsContentRu : termsContentEn;
  const privacyContent = isRu ? privacyContentRu : privacyContentEn;

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
