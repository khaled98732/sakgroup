import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Copy, Check, QrCode as QrIcon } from 'lucide-react';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  title?: string;
  subtitle?: string;
  showActions?: boolean;
  className?: string;
  darkColor?: string;
  lightColor?: string;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  value,
  size = 180,
  title,
  subtitle,
  showActions = false,
  className = '',
  darkColor = '#0f172a',
  lightColor = '#ffffff',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [svgString, setSvgString] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!value) {
      setDataUrl('');
      setSvgString('');
      return;
    }

    // Generate high-resolution DataURL for display & download
    QRCode.toDataURL(value, {
      width: Math.max(size * 2, 400),
      margin: 1.5,
      color: {
        dark: darkColor,
        light: lightColor,
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (isMounted) setDataUrl(url);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'فشل توليد رمز QR');
      });

    // Also generate SVG for crisp vector rendering
    QRCode.toString(value, {
      type: 'svg',
      margin: 1.5,
      color: {
        dark: darkColor,
        light: lightColor,
      },
      errorCorrectionLevel: 'H',
    })
      .then((svg) => {
        if (isMounted) setSvgString(svg);
      })
      .catch(() => {
        // Fallback silently if svg fails
      });

    return () => {
      isMounted = false;
    };
  }, [value, size, darkColor, lightColor]);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `QR-${value.replace(/[^a-zA-Z0-9-_]/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) {
    return (
      <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl flex items-center gap-2 border border-red-200">
        <QrIcon className="w-4 h-4 shrink-0" />
        <span>تعذر إنشاء رمز QR: {error}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      {/* QR Code Container */}
      <div
        className="relative bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-center transition-transform hover:scale-[1.02]"
        style={{ width: size + 20, height: size + 20 }}
      >
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={title || `QR Code: ${value}`}
            className="w-full h-full object-contain rounded-xl"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-50 rounded-xl animate-pulse text-slate-400">
            <QrIcon className="w-8 h-8 animate-spin" />
          </div>
        )}
      </div>

      {/* Optional Titles */}
      {title && <h4 className="text-xs font-bold text-slate-900 mt-2">{title}</h4>}
      {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}

      {/* Code Token Badge */}
      <div className="mt-1.5 flex items-center gap-1.5 bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold">
        <span>{value}</span>
      </div>

      {/* Action Buttons: Download & Copy */}
      {showActions && dataUrl && (
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={handleDownload}
            className="px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
            title="تحميل كصورة PNG عالية الدقة"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تحميل QR</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
            title="نسخ كود الفرع"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'تم النسخ' : 'نسخ الكود'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
