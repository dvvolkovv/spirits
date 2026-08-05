import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, CreditCard, Shield, Info, Mail } from 'lucide-react';

interface PaymentInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PaymentInfoModal: React.FC<PaymentInfoModalProps> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  if (!isOpen) return null;
  const isEn = i18n.language.startsWith('en');

  const ruContent = (
    <>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-blue-900 mb-1">Сервис: Linkeon</h3>
          <p className="text-sm text-blue-800">Сайт: <a href="https://linkeon.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">linkeon.io</a></p>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">1</span>
          Что предоставляет Linkeon
        </h3>
        <p className="text-gray-700 leading-relaxed">
          Linkeon — онлайн-платформа с AI-ассистентами, генерацией контента и единым профилем пользователя. Пользователям предоставляются цифровые услуги, включающие:
        </p>
        <ul className="space-y-2 ml-4">
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">рекомендации и консультации от ИИ-ассистентов по личным и деловым темам (коуч, психолог, HR-специалист, юрист, бухгалтер, финансовый директор, маркетолог, копирайтер, SMM-продюсер, нумеролог, астролог, Human Design, игропрактик и др.)</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">генерация и редактирование изображений, генерация коротких видео</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">анализ личного профиля, ценностей и намерений</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">нетворкинг: подбор людей по совместимости, отклики и переписка</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">анализ карьерных траекторий</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">расширенные функции работы с профилем и ценностями</span></li>
        </ul>
        <p className="text-gray-600 text-sm italic mt-2">
          Все услуги предоставляются исключительно в электронном виде, без физической доставки.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">2</span>
          Модель оплаты
        </h3>
        <p className="text-gray-700 leading-relaxed">
          В сервисе используется внутренняя единица учёта — <strong>токены Linkeon</strong>. При выполнении различных действий расходуются токены (например: ответ ассистента, генерация изображения или видео, глубокий разбор профиля, совместимость и т.п.).
        </p>
        <p className="text-gray-700 leading-relaxed">
          При регистрации пользователю единовременно начисляется приветственный бонус — <strong>25 000 токенов</strong>.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-amber-900 text-sm">
            Покупка токенов осуществляется разовыми платежами. Автоматические списания без дополнительного подтверждения пользователя не выполняются.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">3</span>
          Стоимость пакетов токенов
        </h3>
        <p className="text-gray-700 mb-3">Пользователь может приобрести один из пакетов токенов:</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm">
            <thead className="bg-forest-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Пакет</th>
                <th className="px-4 py-3 text-left font-semibold">Кол-во токенов</th>
                <th className="px-4 py-3 text-left font-semibold">Стоимость</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">Базовый</td><td className="px-4 py-3 text-gray-700">50 000 токенов</td><td className="px-4 py-3 text-forest-600 font-semibold">149 ₽</td></tr>
              <tr className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">Расширенный</td><td className="px-4 py-3 text-gray-700">200 000 токенов</td><td className="px-4 py-3 text-forest-600 font-semibold">499 ₽</td></tr>
              <tr className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">Профессиональный</td><td className="px-4 py-3 text-gray-700">1 000 000 токенов</td><td className="px-4 py-3 text-forest-600 font-semibold">1 990 ₽</td></tr>
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="text-gray-700 text-sm">• Пакет токенов активируется сразу после успешной оплаты</p>
          <p className="text-gray-700 text-sm">• Токены — это внутренняя расчётная единица, не имеющая денежного эквивалента; приобретённые токены не имеют срока действия и не сгорают</p>
          <p className="text-gray-700 text-sm">• Неиспользованный остаток приобретенных токенов возврату не подлежит (порядок возврата денежных средств — в разделе 7)</p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">4</span>
          За что списываются токены
        </h3>
        <p className="text-gray-700 leading-relaxed mb-2">Токены расходуются при использовании вычислительных функций сервиса, включая:</p>
        <ul className="space-y-2 ml-4">
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">ответы ИИ-ассистентов</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">генерацию и редактирование изображений, генерацию видео</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">глубокий анализ профиля</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">подбор совместимости с другими пользователями</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">карьерные рекомендации</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">анализ ценностей, намерений, интересов и навыков</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">дополнительные расширенные функции</span></li>
        </ul>
        <p className="text-gray-600 text-sm italic mt-3">
          Расход токенов зависит от вида действия, сложности анализа и объёма информации. Перед выполнением операций с большим расходом токенов сервис может показывать пользователю предварительную оценку.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">5</span>
          Порядок списания денежных средств
        </h3>
        <ol className="space-y-2 ml-4">
          <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">1.</span><span className="text-gray-700">Пользователь выбирает пакет токенов</span></li>
          <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">2.</span><span className="text-gray-700">Переходит на защищённую платёжную страницу платёжного провайдера</span></li>
          <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">3.</span><span className="text-gray-700">После успешной оплаты стоимость пакета списывается с банковской карты пользователя</span></li>
          <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">4.</span><span className="text-gray-700">Токены начисляются в личный кабинет моментально</span></li>
          <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">5.</span><span className="text-gray-700">Токены расходуются автоматически при использовании функций сервиса</span></li>
        </ol>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-green-900 text-sm font-medium">
            Других списаний, кроме тех, которые пользователь инициирует самостоятельно, сервис не производит.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">6</span>
          Отображение в банковской выписке
        </h3>
        <p className="text-gray-700">В банковской выписке платеж будет отображаться как:</p>
        <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 font-mono text-center">
          <p className="text-gray-900 font-semibold">LINKEON.IO / LINK EON SERVICE</p>
          <p className="text-gray-600 text-xs mt-1">(Descriptor может изменяться по требованиям платёжного провайдера)</p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">7</span>
          Возвраты и отмены
        </h3>
        <p className="text-gray-700 leading-relaxed">
          Условия возврата установлены разделом 8 Пользовательского соглашения. Возврат денежных средств производится ТОЛЬКО в следующих случаях:
        </p>
        <ul className="space-y-2 ml-4">
          <li className="flex items-start"><span className="text-green-500 mr-2">•</span><span className="text-gray-700">Технический сбой более 72 часов подряд</span></li>
          <li className="flex items-start"><span className="text-green-500 mr-2">•</span><span className="text-gray-700">Двойное списание по технической ошибке</span></li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Возврат НЕ ПРОИЗВОДИТСЯ при: субъективной неудовлетворенности ответами AI-ассистентов, сгенерированным контентом или результатами поиска контактов, блокировке за нарушение правил, добровольном удалении аккаунта.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Неиспользованный остаток приобретенных токенов возврату не подлежит.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Претензия направляется на email support@linkeon.ru и рассматривается в течение 10 рабочих дней. Возврат производится в течение 30 дней за вычетом комиссий платежных систем (3-5%).
        </p>
        <ul className="space-y-2 ml-4">
          <li className="flex items-start"><span className="text-green-500 mr-2">•</span><span className="text-gray-700">пользователь может прекратить использование сервиса в любой момент</span></li>
        </ul>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-blue-900 text-sm">
            В случае технических ошибок или некорректного списания сервис выполняет корректировку токенов на балансе пользователя.
          </p>
        </div>
      </section>

      <section className="bg-gradient-to-br from-forest-50 to-warm-50 rounded-lg p-6 border border-forest-200">
        <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
          <Shield className="w-6 h-6 mr-2 text-forest-600" />
          Контакты службы поддержки
        </h3>
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <Mail className="w-5 h-5 text-forest-600 flex-shrink-0" />
            <a href="mailto:support@linkeon.ru" className="text-forest-600 hover:text-forest-700 font-medium">
              support@linkeon.ru
            </a>
          </div>
        </div>
      </section>
    </>
  );

  const enContent = (
    <>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
        This English version is a courtesy translation. In case of any discrepancy, the Russian-language version is governing and legally binding under the laws of the Russian Federation.
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-blue-900 mb-1">Service: Linkeon</h3>
          <p className="text-sm text-blue-800">Website: <a href="https://linkeon.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">linkeon.io</a></p>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">1</span>
          What Linkeon provides
        </h3>
        <p className="text-gray-700 leading-relaxed">
          Linkeon is an online platform with AI assistants, content generation and a single unified user profile. Users are provided with digital services, including:
        </p>
        <ul className="space-y-2 ml-4">
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">recommendations and consultations from AI assistants on personal and business topics (coach, psychologist, HR specialist, lawyer, accountant, CFO, marketer, copywriter, SMM producer, numerologist, astrologer, Human Design reader, game practitioner, and others)</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">generation and editing of images, generation of short videos</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">analysis of your personal profile, values and intentions</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">networking: matching people by compatibility, responses and messaging</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">career-path analysis</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">advanced tools for working with your profile and values</span></li>
        </ul>
        <p className="text-gray-600 text-sm italic mt-2">
          All services are provided exclusively in electronic form, with no physical delivery.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">2</span>
          Payment model
        </h3>
        <p className="text-gray-700 leading-relaxed">
          The service uses an internal accounting unit — <strong>Linkeon tokens</strong>. Various actions consume tokens (for example: an assistant's reply, image or video generation, deep profile analysis, compatibility matching, etc.).
        </p>
        <p className="text-gray-700 leading-relaxed">
          Upon registration the user receives a one-time welcome bonus of <strong>25,000 tokens</strong>.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-amber-900 text-sm">
            Tokens are purchased via one-off payments. No automatic charges are made without additional user confirmation.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">3</span>
          Token pack prices
        </h3>
        <p className="text-gray-700 mb-3">A user can purchase one of the token packs:</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm">
            <thead className="bg-forest-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Pack</th>
                <th className="px-4 py-3 text-left font-semibold">Tokens</th>
                <th className="px-4 py-3 text-left font-semibold">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">Basic</td><td className="px-4 py-3 text-gray-700">50,000 tokens</td><td className="px-4 py-3 text-forest-600 font-semibold">149 ₽</td></tr>
              <tr className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">Extended</td><td className="px-4 py-3 text-gray-700">200,000 tokens</td><td className="px-4 py-3 text-forest-600 font-semibold">499 ₽</td></tr>
              <tr className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-900">Professional</td><td className="px-4 py-3 text-gray-700">1,000,000 tokens</td><td className="px-4 py-3 text-forest-600 font-semibold">1,990 ₽</td></tr>
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="text-gray-700 text-sm">• The token pack is activated immediately after successful payment</p>
          <p className="text-gray-700 text-sm">• Tokens are an internal accounting unit with no monetary equivalent; purchased tokens have no expiry date and do not lapse</p>
          <p className="text-gray-700 text-sm">• Any unused balance of purchased tokens is non-refundable (the refund procedure is set out in section 7)</p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">4</span>
          What tokens are spent on
        </h3>
        <p className="text-gray-700 leading-relaxed mb-2">Tokens are consumed when using the service's compute features, including:</p>
        <ul className="space-y-2 ml-4">
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">replies from AI assistants</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">image generation and editing, video generation</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">deep profile analysis</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">compatibility matching with other users</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">career recommendations</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">analysis of values, intentions, interests and skills</span></li>
          <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">additional advanced features</span></li>
        </ul>
        <p className="text-gray-600 text-sm italic mt-3">
          Token consumption depends on the type of action, the complexity of the analysis and the volume of information. Before operations with a high token cost, the service may show the user a preliminary estimate.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">5</span>
          Payment flow
        </h3>
        <ol className="space-y-2 ml-4">
          <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">1.</span><span className="text-gray-700">The user selects a token pack</span></li>
          <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">2.</span><span className="text-gray-700">Goes to the payment provider's secure payment page</span></li>
          <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">3.</span><span className="text-gray-700">After successful payment, the pack cost is charged to the user's bank card</span></li>
          <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">4.</span><span className="text-gray-700">Tokens are credited to the personal account instantly</span></li>
          <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">5.</span><span className="text-gray-700">Tokens are spent automatically when the service's features are used</span></li>
        </ol>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-green-900 text-sm font-medium">
            No charges are made other than those the user initiates themselves.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">6</span>
          How the charge appears on your statement
        </h3>
        <p className="text-gray-700">On your bank statement the payment will appear as:</p>
        <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 font-mono text-center">
          <p className="text-gray-900 font-semibold">LINKEON.IO / LINK EON SERVICE</p>
          <p className="text-gray-600 text-xs mt-1">(The descriptor may change depending on payment-provider requirements)</p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-bold text-gray-900 flex items-center">
          <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">7</span>
          Refunds and cancellations
        </h3>
        <p className="text-gray-700 leading-relaxed">
          Refund conditions are set out in Section 8 of the Terms of Service. Refunds are made ONLY in the following cases:
        </p>
        <ul className="space-y-2 ml-4">
          <li className="flex items-start"><span className="text-green-500 mr-2">•</span><span className="text-gray-700">Technical failure lasting more than 72 consecutive hours</span></li>
          <li className="flex items-start"><span className="text-green-500 mr-2">•</span><span className="text-gray-700">Duplicate charge due to a technical error</span></li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Refunds are NOT made for: subjective dissatisfaction with AI assistants' responses, generated content or contact search results; account blocking for rule violations; or voluntary account deletion.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Any unused balance of purchased tokens is non-refundable.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Complaints are submitted to support@linkeon.ru and reviewed within 10 business days. Refunds are processed within 30 days, less payment-system fees (3–5%).
        </p>
        <ul className="space-y-2 ml-4">
          <li className="flex items-start"><span className="text-green-500 mr-2">•</span><span className="text-gray-700">the user can stop using the service at any time</span></li>
        </ul>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-blue-900 text-sm">
            In the event of technical errors or incorrect charges, the service adjusts the user's token balance.
          </p>
        </div>
      </section>

      <section className="bg-gradient-to-br from-forest-50 to-warm-50 rounded-lg p-6 border border-forest-200">
        <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
          <Shield className="w-6 h-6 mr-2 text-forest-600" />
          Support contacts
        </h3>
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <Mail className="w-5 h-5 text-forest-600 flex-shrink-0" />
            <a href="mailto:support@linkeon.ru" className="text-forest-600 hover:text-forest-700 font-medium">
              support@linkeon.ru
            </a>
          </div>
        </div>
      </section>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-forest-600 to-warm-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CreditCard className="w-6 h-6 text-white" />
            <h2 className="text-xl font-bold text-white">
              {t('onboarding.payment_info_link')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6 space-y-6">
          {isEn ? enContent : ruContent}
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors font-medium"
          >
            {isEn ? 'Got it' : 'Понятно'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentInfoModal;
