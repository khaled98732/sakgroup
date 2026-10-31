import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, CameraDevice } from 'html5-qrcode';
import {
  Camera,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  SwitchCamera,
  Lock,
  Smartphone,
  HelpCircle,
} from 'lucide-react';
import { Branch } from '../types';
import { analyzePhotoForScreenSpoof } from '../utils/antiSpoofDetection';

interface QRCameraScannerProps {
  branches: Branch[];
  onScanSuccess: (decodedText: string, branch?: Branch) => void;
  onClose: () => void;
}

export const QRCameraScanner: React.FC<QRCameraScannerProps> = ({
  branches,
  onScanSuccess,
  onClose,
}) => {
  const containerId = useRef(`qr-scanner-${Math.random().toString(36).substring(2, 9)}`).current;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const [cameraState, setCameraState] = useState<
    'starting' | 'running' | 'permission_denied' | 'error'
  >('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successPayload, setSuccessPayload] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Play short sound on successful scan
  const playBeep = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // AudioContext may be restricted by browser autoplay policy
    }
  };

  const handleDecoded = (decodedText: string) => {
    const clean = decodedText.trim();
    const cleanUpper = clean.toUpperCase();
    playBeep();
    setSuccessPayload(clean);

    // Find if this code matches any branch
    const matched = branches.find(
      (b) =>
        (b.qrToken && b.qrToken.toUpperCase() === cleanUpper) ||
        (b.barcodeText && b.barcodeText.toUpperCase() === cleanUpper) ||
        b.id.toUpperCase() === cleanUpper
    );

    // Visual confirmation before trigger
    setTimeout(() => {
      onScanSuccess(decodedText, matched);
    }, 600);
  };

  // Safe camera stop helper
  const safelyStopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        console.warn('Notice while stopping scanner:', e);
      }
    }
  };

  // Start Camera with permission pre-check and graceful error handling
  const startCamera = async (
    targetFacing: 'environment' | 'user' = facingMode,
    specificCameraId?: string
  ) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      setCameraState('starting');
      setErrorMessage(null);

      // Check permissions API if available to avoid unnecessary unhandled rejections
      if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
        try {
          const perm = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (perm.state === 'denied') {
            isStartingRef.current = false;
            setCameraState('permission_denied');
            setErrorMessage(
              'تم رفض إذن كاميرا الفيديو في المتصفح. يمكنك التقاط صورة لكود QR بكاميرا هاتفك مباشرة أدناه.'
            );
            return;
          }
        } catch {
          // Permissions query for camera not supported in this browser, continue
        }
      }

      // Verify mediaDevices availability
      if (
        typeof window === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        isStartingRef.current = false;
        setCameraState('permission_denied');
        setErrorMessage(
          'متصفحك لا يدعم بث الفيديو المباشر. يمكنك التقاط صورة للرمز بكاميرا الهاتف مباشرة أدناه.'
        );
        return;
      }

      // Stop previous instance cleanly
      await safelyStopScanner();

      // Ensure target element is mounted in DOM
      const elem = document.getElementById(containerId);
      if (!elem) {
        isStartingRef.current = false;
        return;
      }

      const html5Qr = new Html5Qrcode(containerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = html5Qr;

      const cameraConfig = specificCameraId ? specificCameraId : { facingMode: targetFacing };

      const scanConfig = {
        fps: 15,
        qrbox: { width: 240, height: 240 },
        aspectRatio: 1.0,
      };

      await html5Qr.start(
        cameraConfig,
        scanConfig,
        (decodedText) => {
          handleDecoded(decodedText);
        },
        () => {
          // Regular frame without QR - no-op
        }
      );

      if (isMountedRef.current) {
        setCameraState('running');

        // Query available cameras only after permission is successfully granted
        try {
          const availableDevices = await Html5Qrcode.getCameras();
          if (availableDevices && availableDevices.length > 0 && isMountedRef.current) {
            setCameras(availableDevices);
          }
        } catch {
          // Ignore enumeration failure
        }
      }
    } catch (err: unknown) {
      console.warn('Camera request not granted or unavailable:', err);

      if (!isMountedRef.current) return;

      const msg = err instanceof Error ? err.message : String(err);
      const isPermissionDenied =
        msg.includes('NotAllowedError') ||
        msg.includes('Permission') ||
        msg.includes('denied') ||
        msg.includes('SecurityError');

      if (isPermissionDenied) {
        setCameraState('permission_denied');
        setErrorMessage(
          'لم يمنح المتصفح إذن فتح كاميرا الفيديو المباشرة. يمكنك التقاط صورة لكود QR بكاميرا هاتفك الأصلية فوراً.'
        );
      } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
        setCameraState('permission_denied');
        setErrorMessage(
          'لم يتم العثور على كاميرا فيديو متصلة. يرجى استخدام زر "التقاط صورة بكاميرا الهاتف".'
        );
      } else {
        setCameraState('permission_denied');
        setErrorMessage(
          'تعذر فتح كاميرا الفيديو المباشرة. يرجى التقاط صورة للرمز بكاميرا الهاتف.'
        );
      }
    } finally {
      isStartingRef.current = false;
    }
  };

  // Flip camera between front and back
  const handleFlipCamera = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    setSelectedCameraId(null);
    await startCamera(nextFacing);
  };

  // Switch to specific camera device
  const handleSelectCameraDevice = async (deviceId: string) => {
    setSelectedCameraId(deviceId);
    await startCamera(facingMode, deviceId);
  };

  // Handle native camera capture (photo snapshot) with Anti-Screen Spoof check
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setErrorMessage(null);

    // 1. Strict Anti-Screen Spoof / Phone-from-Phone Protection Check
    const spoofCheck = await analyzePhotoForScreenSpoof(file);
    if (!spoofCheck.isAllowed) {
      setIsProcessingFile(false);
      setErrorMessage(
        spoofCheck.reason ||
          '⛔ تم رفض العملية أمنياً: تم رصد محاولة تصوير كود QR من شاشة هاتف آخر أو صورة غير مباشرة!'
      );
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([100, 100, 200]);
        } catch {}
      }
      e.target.value = '';
      return;
    }

    try {
      await safelyStopScanner();

      let scanner = scannerRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = scanner;
      }

      const decoded = await scanner.scanFile(file, true);
      setIsProcessingFile(false);
      handleDecoded(decoded);
    } catch {
      setIsProcessingFile(false);
      setErrorMessage(
        'لم يتم التعرف على كود QR في الصورة الملتقطة. يرجى التأكد من توجيه الكاميرا مباشرة للرمز الورقي المطبوع وإعادة التقاط صورة واضحة.'
      );
    } finally {
      e.target.value = '';
    }
  };

  // Mount effect to start camera
  useEffect(() => {
    isMountedRef.current = true;
    startCamera();

    return () => {
      isMountedRef.current = false;
      safelyStopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-950 text-white p-4 sm:p-5 border-2 border-emerald-500 shadow-xl transition-all">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>قارئ كاميرا الـ QR للفرع</span>
              {cameraState === 'running' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              )}
            </h4>
            <p className="text-[11px] text-slate-400">
              امسح رمز QR الفرع أو التقط صورة له لتسجيل الحضور
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {cameras.length > 1 && cameraState === 'running' && (
            <button
              type="button"
              onClick={handleFlipCamera}
              className="p-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              title="تبديل الكاميرا (أمامية / خلفية)"
            >
              <SwitchCamera className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تبديل</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="إغلاق الكاميرا"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div className="relative my-3 rounded-xl overflow-hidden bg-black flex flex-col items-center justify-center min-h-[260px] sm:min-h-[290px] border border-slate-800">
        {/* Real Video Scanner Element */}
        <div
          id={containerId}
          className="w-full max-w-[320px] aspect-square rounded-xl overflow-hidden [&_video]:object-cover [&_video]:w-full [&_video]:h-full"
        />

        {/* Loading Overlay */}
        {cameraState === 'starting' && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 p-4 text-center z-10">
            <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
            <div className="text-xs font-medium text-emerald-200">
              جاري تشغيل كاميرا الهاتف...
            </div>
            <p className="text-[11px] text-slate-400 max-w-xs">
              يرجى الموافقة على طلب إذن استخدام الكاميرا عند ظهوره في المتصفح.
            </p>
          </div>
        )}

        {/* Scan Reticle Overlay when camera is active */}
        {cameraState === 'running' && !successPayload && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-56 h-56 border-2 border-emerald-400/70 rounded-2xl shadow-[0_0_20px_rgba(52,211,153,0.3)] bg-emerald-950/10">
              {/* Corner Accents */}
              <div className="absolute -top-1 -left-1 w-5 h-5 border-t-3 border-l-3 border-emerald-400 rounded-tl-sm" />
              <div className="absolute -top-1 -right-1 w-5 h-5 border-t-3 border-r-3 border-emerald-400 rounded-tr-sm" />
              <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-3 border-l-3 border-emerald-400 rounded-bl-sm" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-3 border-r-3 border-emerald-400 rounded-br-sm" />

              {/* Scanning Laser Beam */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-pulse mt-12" />
            </div>
          </div>
        )}

        {/* Success Splash */}
        {successPayload && (
          <div className="absolute inset-0 bg-emerald-950/95 flex flex-col items-center justify-center gap-2 p-4 text-center z-20 animate-in fade-in">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
            <div className="text-sm font-bold text-white">تمت قراءة رمز الـ QR بنجاح!</div>
            <div className="text-xs font-mono bg-emerald-900/60 text-emerald-200 px-3 py-1 rounded-md border border-emerald-700/50">
              {successPayload}
            </div>
          </div>
        )}

        {/* Permission Denied or Not Working UI */}
        {(cameraState === 'permission_denied' || cameraState === 'error') && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-2.5 p-4 text-center z-15">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-0.5">
              <Camera className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-emerald-300">
              التقاط صورة لكود QR الفرع
            </div>
            <p className="text-[11px] text-slate-300 max-w-xs leading-relaxed">
              {errorMessage || 'يرجى التقاط صورة للرمز بكاميرا الهاتف مباشرة لتسجيل دوامك.'}
            </p>

            <div className="flex flex-col gap-2 mt-2 w-full max-w-xs">
              {/* Primary Option: Native Phone Camera via capture */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingFile}
                className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg"
              >
                <Smartphone className="w-4 h-4" />
                <span>
                  {isProcessingFile ? 'جاري تحليل الصورة والرمز...' : '📸 التقاط صورة لكود QR بكاميرا الهاتف'}
                </span>
              </button>

              {/* Retry video camera */}
              <button
                type="button"
                onClick={() => startCamera()}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1 py-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>إعادة محاولة فتح كاميرا الفيديو المباشرة</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden File Input for Native Camera Snapshot */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoCapture}
        className="hidden"
      />

      {/* Action Footer: Photo capture & tools */}
      <div className="space-y-2.5 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Prominent Photo Capture Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFile}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Camera className="w-4 h-4" />
              <span>{isProcessingFile ? 'جاري معالجة الصورة...' : 'التقاط صورة للـ QR'}</span>
            </button>

            {cameras.length > 1 && cameraState === 'running' && (
              <select
                value={selectedCameraId || ''}
                onChange={(e) => handleSelectCameraDevice(e.target.value)}
                className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2 py-1 text-[11px] focus:outline-none"
              >
                <option value="">الكاميرا الافتراضية</option>
                {cameras.map((c, i) => (
                  <option key={c.id} value={c.id}>
                    {c.label || `كاميرا ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-slate-400 hover:text-white cursor-pointer underline"
          >
            إغلاق
          </button>
        </div>

        {/* Anti-Screen Spoof Security Badge & Tip */}
        <div className="space-y-1.5 text-[10px]">
          <div className="flex items-center gap-1.5 bg-emerald-950/40 text-emerald-300 p-2 rounded-lg border border-emerald-500/30">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              <strong>حماية أمنية مشددة مفعلة:</strong> التسجيل مسموح حصرياً بالتقاط صورة مباشرة للرمز الورقي المطبوع في الفرع. يُمنع تصوير كود QR من شاشة هاتف آخر أو شاشات الكمبيوتر.
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-900/60 text-slate-400 p-2 rounded-lg border border-slate-800">
            <HelpCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              زر "التقاط صورة للـ QR" يفتح تطبيق كاميرا هاتفك فوراً لالتقاط صورة للرمز وقراءتها بدقة وسرعة.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
