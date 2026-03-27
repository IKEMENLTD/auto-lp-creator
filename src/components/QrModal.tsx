/**
 * QRコード表示モーダル
 *
 * URLリストをQRコードとして表示する。
 * 複数URLの場合は改行区切りで1つのQRにまとめる。
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';

interface QrModalProps {
  readonly urls: readonly string[];
  readonly title?: string;
  readonly onClose: () => void;
}

export const QrModal: React.FC<QrModalProps> = ({ urls, title, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const qrText = urls.join('\n');

  useEffect(() => {
    QRCode.toDataURL(qrText, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then(setQrDataUrl)
      .catch(() => setError('QRコードの生成に失敗しました'));
  }, [qrText]);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qrText);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('URLをコピーしてください:', qrText);
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${title ?? 'qr-code'}.png`;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl max-w-sm w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-100">QRコード</h3>
          <button
            type="button"
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {title && (
          <p className="text-sm text-gray-400 mb-4">{title}</p>
        )}

        <div className="flex justify-center mb-4">
          {error ? (
            <p className="text-red-400 text-sm">{error}</p>
          ) : qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QRコード"
              className="w-[250px] h-[250px] rounded-lg bg-white p-2"
            />
          ) : (
            <div className="w-[250px] h-[250px] flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 text-center mb-4 break-all line-clamp-3">
          {urls.length === 1 ? urls[0] : `${urls.length}件のURL`}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800 transition-colors"
            onClick={() => void handleCopy()}
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'コピー済み' : 'URLコピー'}
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
            onClick={handleDownload}
            disabled={!qrDataUrl}
          >
            <Download className="w-4 h-4" />
            画像保存
          </button>
        </div>
      </div>
    </div>
  );
};
