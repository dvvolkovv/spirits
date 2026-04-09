import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Share2, Globe, Zap, Users, MessageCircle } from 'lucide-react';

const CardPage: React.FC = () => {
  const cardRef = useRef<HTMLDivElement>(null);
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://my.linkeon.io';

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, { scale: 3, backgroundColor: null });
      const link = document.createElement('a');
      link.download = 'linkeon-card.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      alert('Для скачивания обновите страницу и попробуйте снова');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'LINKEON.IO', text: 'Нейросеть для роста и развития бизнеса', url: siteUrl });
    } else {
      navigator.clipboard.writeText(siteUrl);
      alert('Ссылка скопирована!');
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-gray-100 to-gray-200 flex flex-col items-center justify-center p-4 pb-24 md:pb-4">
      {/* Card */}
      <div ref={cardRef} className="w-full max-w-sm">
        <div className="bg-gradient-to-br from-[#0d9488] via-[#0f766e] to-[#134e4a] rounded-3xl p-6 shadow-2xl text-white relative overflow-hidden">
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
          </div>

          {/* Content */}
          <div className="relative z-10">
            {/* Logo + Title */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <img src="/logo-Photoroom.png" alt="Logo" className="w-8 h-8 object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-wide">LINKEON.IO</h1>
                <p className="text-[10px] text-white/70 uppercase tracking-widest">Нейросеть для бизнеса</p>
              </div>
            </div>

            {/* Tagline */}
            <p className="text-sm text-white/90 mb-5 leading-relaxed">
              Где ИИ помогает, люди направляют, а партнёры ускоряют рост твоего бизнеса
            </p>

            {/* Features */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
                <MessageCircle className="w-3.5 h-3.5 text-white/80" />
                <span className="text-[11px] text-white/90">ИИ-ассистенты</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
                <Users className="w-3.5 h-3.5 text-white/80" />
                <span className="text-[11px] text-white/90">Нетворкинг</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
                <Zap className="w-3.5 h-3.5 text-white/80" />
                <span className="text-[11px] text-white/90">Генерация</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
                <Globe className="w-3.5 h-3.5 text-white/80" />
                <span className="text-[11px] text-white/90">Совместимость</span>
              </div>
            </div>

            {/* QR + URL */}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Сканируй и начни</p>
                <p className="text-lg font-bold">my.linkeon.io</p>
              </div>
              <div className="bg-white rounded-xl p-2 shadow-lg">
                <QRCodeSVG
                  value={siteUrl}
                  size={80}
                  level="M"
                  fgColor="#134e4a"
                  bgColor="#ffffff"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-5 py-2.5 bg-white rounded-xl shadow-md hover:shadow-lg transition-all text-gray-800 text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          Скачать
        </button>
        <button
          onClick={handleShare}
          className="flex items-center gap-2 px-5 py-2.5 bg-forest-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-medium"
        >
          <Share2 className="w-4 h-4" />
          Поделиться
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-4 text-center">
        Покажите QR-код или отправьте визитку — партнёр попадёт на платформу
      </p>
    </div>
  );
};

export default CardPage;
