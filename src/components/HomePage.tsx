import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  QrCode,
  Camera,
  Smartphone,
  Lock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  LogIn,
  LogOut,
  UserCheck,
  Building2,
  KeyRound,
  RotateCcw,
  ArrowLeft,
  Users,
  Eye,
  EyeOff,
  Sparkles,
  Check,
  Maximize2,
  ScanLine,
  Search,
  X,
  Clock,
  Calendar,
  Database,
  FileSpreadsheet,
  Download,
  Upload,
  Send,
  Hourglass,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import {
  AppDatabase,
  AttendanceRecord,
  CheckInMethod,
  AppUser,
  Employee,
  Branch,
  LeaveRequest,
  LeaveRequestType,
  LeaveCategory,
  LeaveRequestStatus,
  MASTER_ADMIN_PASSWORD,
} from '../types';
import {
  getOrCreateDeviceId,
  getDeviceName,
  getLocallyBoundEmployeeId,
  setLocallyBoundEmployeeId,
  clearLocallyBoundEmployee,
} from '../utils/deviceFingerprint';
import {
  downloadDatabaseBackup,
  exportDatabaseToExcel,
} from '../utils/databaseExport';
import { analyzePhotoForScreenSpoof } from '../utils/antiSpoofDetection';
import { verifyEmployeeInBranchGeofence } from '../utils/geoFence';
import { QRCodeDisplay } from './QRCodeDisplay';
import { QRCameraScanner } from './QRCameraScanner';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface HomePageProps {
  db: AppDatabase;
  currentUser?: AppUser | null;
  isAuthenticated: boolean;
  onLoginSuccess: (user: AppUser) => void;
  onLogout: () => void;
  onNavigateToSection: (
    page: 'attendance' | 'employees' | 'withdrawals' | 'payroll' | 'expenses' | 'permissions'
  ) => void;
  onUpdateAttendance: (records: AttendanceRecord[]) => void;
  onUpdateEmployees: (employees: Employee[]) => void;
  onUpdateLeaveRequests?: (requests: LeaveRequest[]) => void;
  onOpenCredentialsModal: () => void;
  onRestoreDatabase?: (newDb: AppDatabase) => void;
  onOpenRestoreModal?: () => void;
  onDownloadProjectZip?: () => void;
}

function getTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTimeStr(): string {
  const d = new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function calculateHours(checkIn: string, checkOut: string): number {
  const [inH, inM] = checkIn.split(':').map(Number);
  const [outH, outM] = checkOut.split(':').map(Number);
  if (isNaN(inH) || isNaN(outH)) return 0;
  let diffMinutes = outH * 60 + outM - (inH * 60 + inM);
  if (diffMinutes < 0) diffMinutes += 24 * 60;
  return Math.round((diffMinutes / 60) * 100) / 100;
}

// ==============================================================
// MEMOIZED SUB-COMPONENTS (تحسين الأداء والتخزين المؤقت عبر React.memo)
// ==============================================================

// 1. Live Clock Display - Isolated so 1-second interval does NOT re-render HomePage
const LiveClockDisplay: React.FC<{ todayStr: string }> = React.memo(({ todayStr }) => {
  const [liveTime, setLiveTime] = useState<string>(getCurrentTimeStr());
  const [liveSeconds, setLiveSeconds] = useState<string>('00');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setLiveTime(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      );
      setLiveSeconds(String(now.getSeconds()).padStart(2, '0'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <div className="text-xs text-slate-500">التوقيت المحلي — عمّان</div>
      <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
        {liveTime}
        <span className="text-sm text-slate-400">:{liveSeconds}</span>
      </div>
      <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
        تاريخ اليوم · {todayStr}
      </div>
    </div>
  );
});
LiveClockDisplay.displayName = 'LiveClockDisplay';

// 2. Flash Splash Intro - Isolated 30ms progress timer prevents entire page re-rendering
interface FlashSplashIntroProps {
  onComplete: () => void;
  onSkip: () => void;
}

const FlashSplashIntro: React.FC<FlashSplashIntroProps> = React.memo(({ onComplete, onSkip }) => {
  const [splashProgress, setSplashProgress] = useState<number>(0);
  const [isSplashExiting, setIsSplashExiting] = useState<boolean>(false);

  useEffect(() => {
    const intervalTime = 30;
    const totalDuration = 2700;
    const increment = (intervalTime / totalDuration) * 100;

    const timer = setInterval(() => {
      setSplashProgress((prev) => {
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(timer);
          setIsSplashExiting(true);
          setTimeout(() => {
            onComplete();
          }, 650);
          return 100;
        }
        return next;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [onComplete]);

  const handleSkip = () => {
    setIsSplashExiting(true);
    setTimeout(() => {
      onSkip();
    }, 250);
  };

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-6 select-none overflow-hidden transition-all duration-700 ease-in-out ${
        isSplashExiting
          ? 'opacity-0 scale-105 pointer-events-none'
          : 'opacity-100 scale-100'
      }`}
      style={{
        background: 'radial-gradient(ellipse at center, #0f172a 0%, #090d16 65%, #020617 100%)',
      }}
    >
      {/* Animated Ambient Backlight & Concentric Energy Rings */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
        <div className="absolute w-[550px] h-[550px] rounded-full bg-emerald-500/15 blur-3xl animate-pulse" />
        <div className="absolute w-[360px] h-[360px] rounded-full bg-slate-100/5 blur-2xl" />
        <div
          className="absolute w-[440px] h-[440px] rounded-full border border-emerald-500/25 animate-ping opacity-30"
          style={{ animationDuration: '2.5s' }}
        />
        <div className="absolute w-[540px] h-[540px] rounded-full border border-slate-700/40 opacity-40" />
        <div className="absolute w-[660px] h-[660px] rounded-full border border-emerald-500/10 opacity-20" />
      </div>

      {/* Quick Skip Button */}
      <div className="absolute top-5 left-5 z-20">
        <button
          type="button"
          onClick={handleSkip}
          className="px-4 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/90 text-xs font-bold backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer shadow-xl hover:scale-105 active:scale-95"
        >
          <span>تخطي الدخول</span>
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Central Logo & Brand Experience */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-md w-full space-y-6">
        {/* Top Badge */}
        <div className="animate-in fade-in slide-in-from-top-4 duration-700">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black tracking-widest bg-emerald-950/90 text-emerald-300 border border-emerald-500/60 shadow-inner backdrop-blur-md uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            SAKHER GROUP
          </span>
        </div>

        {/* Logo Card with Flash Aura & 3D Depth */}
        <div className="relative group animate-in zoom-in-90 fade-in duration-700 ease-out">
          <div className="absolute -inset-3 bg-gradient-to-r from-emerald-600/40 via-teal-400/25 to-emerald-500/40 rounded-3xl blur-2xl opacity-80 animate-pulse" />

          <div className="relative bg-white rounded-3xl p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6)] border-2 border-slate-200/90 max-w-[240px] sm:max-w-[270px] mx-auto overflow-hidden">
            <img
              src="/assets/aistudio/sak_1db5dd93.png"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/sak-logo.png';
              }}
              alt="مؤسسة صخر المصري - SAK Mobile Services"
              className="w-full h-auto object-contain select-none drop-shadow-md transform transition-transform duration-500 hover:scale-105"
              loading="eager"
            />
          </div>
        </div>

        {/* Typography */}
        <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-3 duration-700 delay-150">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-md">
            مؤسسة صخر المصري
          </h1>
          <p className="text-xs sm:text-sm font-black text-emerald-400 tracking-widest uppercase">
            SAK · MOBILE SERVICES
          </p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            نظام تسجيل الدوام السحابي وإدارة الفروع المعتمد
          </p>
        </div>

        {/* Loading Progress Bar & Percentage */}
        <div className="w-full max-w-xs space-y-2 pt-2 animate-in fade-in duration-700 delay-250">
          <div className="h-2 w-full bg-slate-800/90 rounded-full overflow-hidden border border-slate-700/70 p-0.5 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 rounded-full transition-all duration-75 shadow-[0_0_14px_rgba(16,185,129,0.9)]"
              style={{ width: `${Math.min(100, Math.round(splashProgress))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-mono">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              جاري تجهيز البوابات للفتح...
            </span>
            <span className="text-emerald-400 font-bold">
              {Math.min(100, Math.round(splashProgress))}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
FlashSplashIntro.displayName = 'FlashSplashIntro';

// 3. Top Banner Component - Memoized
interface TopBannerProps {
  todayStr: string;
  activePortal: 'selection' | 'employee' | 'admin';
  onReplaySplash: () => void;
  onSelectPortal: () => void;
}

const TopBanner: React.FC<TopBannerProps> = React.memo(({
  todayStr,
  activePortal,
  onReplaySplash,
  onSelectPortal,
}) => {
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
      <div className="flex items-center gap-4">
        <img
          src="/assets/aistudio/sak_1db5dd93.png"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/sak-logo.png';
          }}
          alt="شعار مؤسسة صخر المصري"
          className="w-14 h-16 sm:w-16 sm:h-20 object-contain rounded-xl border border-slate-200 p-1 bg-white shadow-2xs shrink-0"
        />
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              النظام السحابي الموحد · الأردن - عمّان
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 tracking-tight">
            مؤسسة صخر المصري
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
            البوابة الموحدة: تسجيل دوام الموظفين بمسح كود QR المخصص لكل فرع مع حماية قفل الهاتف لمنع التلاعب، وبوابة دخول الإدارة لمتابعة الحسابات والصلاحيات
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t md:border-t-0 md:border-r border-slate-200 pt-3 md:pt-0 md:pr-6 justify-between md:justify-start shrink-0">
        <LiveClockDisplay todayStr={todayStr} />

        <div className="flex flex-col sm:flex-row gap-2 self-center">
          <button
            type="button"
            onClick={onReplaySplash}
            className="px-2.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 whitespace-nowrap"
            title="إعادة تشغيل الدخول الفلاشي الاحترافي"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">الدخول الفلاشي</span>
          </button>

          <button
            type="button"
            onClick={onSelectPortal}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs whitespace-nowrap ${
              activePortal === 'selection'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
            }`}
            title="فتح نافذة اختيار البوابة (الموظفين / الإدارة)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>اختيار البوابة</span>
          </button>
        </div>
      </div>
    </div>
  );
});
TopBanner.displayName = 'TopBanner';

// 4. Portal Selection Modal - Memoized
interface PortalSelectionModalProps {
  onSelectEmployee: () => void;
  onSelectAdmin: () => void;
}

const PortalSelectionModal: React.FC<PortalSelectionModalProps> = React.memo(({
  onSelectEmployee,
  onSelectAdmin,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-auto">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="relative group">
              <div className="absolute -inset-1 bg-emerald-500/20 rounded-2xl blur-md" />
              <img
                src="/assets/aistudio/sak_1db5dd93.png"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/sak-logo.png';
                }}
                alt="شعار مؤسسة صخر المصري"
                className="relative w-20 h-24 object-contain rounded-2xl border border-slate-200 p-1.5 bg-white shadow-md mx-auto"
              />
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            مؤسسة صخر المصري · عمّان (الأردن)
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            اختر البوابة للدخول والمتابعة
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
            يرجى تحديد وجهتك: بوابة تسجيل دوام الموظفين عبر كود QR، أو بوابة دخول المشرفين والإدارة العامة.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
          {/* Employee Portal Card */}
          <div
            onClick={onSelectEmployee}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSelectEmployee();
            }}
            className="group relative bg-linear-to-b from-white to-emerald-50/40 border-2 border-emerald-300 hover:border-emerald-600 rounded-2xl p-6 sm:p-7 text-right transition-all duration-200 cursor-pointer shadow-sm hover:shadow-lg hover:-translate-y-1 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                  القسم الأول · الموظفين
                </span>
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  <QrCode className="w-6 h-6" />
                </div>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                  تسجيل دوام الموظفين
                </h3>
                <p className="text-xs font-medium text-emerald-700 mt-0.5">
                  (تسجيل الحضور وبدء الدوام / تسجيل الانصراف والمغادرة)
                </p>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                مخصص لجميع موظفي الفروع لتسجيل الحضور والمغادرة اللحظي بمسح كود QR الفرع أو التقاط صورة له بكاميرا الهاتف بدون أي كلمة مرور أو PIN.
              </p>

              <ul className="text-xs text-slate-600 space-y-1.5 pt-1">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>مسح رمز QR الفرع أو التقاط صورة له بالكاميرا</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>التحقق من مكان عمل الموظف بالفرع المحدد</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>قفل أمني على الهاتف الشخصي للموظف لمنع التلاعب</span>
                </li>
              </ul>
            </div>

            <div className="pt-6 mt-4 border-t border-slate-100">
              <button
                type="button"
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 group-hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <span>الدخول لبوابة الموظفين (QR)</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Admin Portal Card */}
          <div
            onClick={onSelectAdmin}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSelectAdmin();
            }}
            className="group relative bg-linear-to-b from-white to-slate-50/60 border-2 border-slate-300 hover:border-slate-800 rounded-2xl p-6 sm:p-7 text-right transition-all duration-200 cursor-pointer shadow-sm hover:shadow-lg hover:-translate-y-1 flex flex-col justify-between"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-800 bg-slate-200 px-2.5 py-1 rounded-full">
                  القسم الثاني · الإدارة
                </span>
                <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-6 h-6" />
                </div>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 group-hover:text-slate-800 transition-colors">
                  بوابة دخول الإدارة
                </h3>
                <p className="text-xs font-medium text-slate-600 mt-0.5">
                  (لوحة التحكم، شؤون الموظفين، السلف، الرواتب، والمصروفات)
                </p>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                مخصص للإدارة لمتابعة سجلات الدوام، إدارة الفروع، السلف والمسحوبات اليومية، كشوفات الرواتب بالدينار الأردني، ومصروفات الفروع والصلاحيات.
              </p>

              <ul className="text-xs text-slate-600 space-y-1.5 pt-1">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-slate-800 shrink-0" />
                  <span>متابعة سجل الدوام اللحظي لجميع الفروع</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-slate-800 shrink-0" />
                  <span>إدارة الموظفين، السلف، ومسير الرواتب</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-slate-800 shrink-0" />
                  <span>مصروفات الفروع وصلاحيات المستخدمين</span>
                </li>
              </ul>
            </div>

            <div className="pt-6 mt-4 border-t border-slate-100">
              <button
                type="button"
                className="w-full py-3.5 px-4 rounded-xl bg-slate-900 group-hover:bg-slate-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <span>الدخول إلى بوابة الإدارة</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="text-center pt-2">
          <span className="text-[11px] text-slate-400">
            يمكنك التبديل بين البوابتين في أي وقت بضغطة زر واحدة من داخل النظام
          </span>
        </div>
      </div>
    </div>
  );
});
PortalSelectionModal.displayName = 'PortalSelectionModal';

// 5. Attendance Confirmation Modal - Memoized
interface AttendanceConfirmModalProps {
  modal: {
    isOpen: boolean;
    actionType: 'check_in' | 'check_out';
    employee: Employee;
    branch: Branch;
    time: string;
    date: string;
    totalHours?: number;
    deviceInfo: string;
    note?: string;
  };
  onClose: () => void;
}

const AttendanceConfirmModal: React.FC<AttendanceConfirmModalProps> = React.memo(({
  modal,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 my-auto">
        <div className="text-center space-y-2">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto shadow-md ${
              modal.actionType === 'check_in'
                ? 'bg-emerald-100 text-emerald-600'
                : 'bg-indigo-100 text-indigo-600'
            }`}
          >
            {modal.actionType === 'check_in' ? (
              <LogIn className="w-8 h-8" />
            ) : (
              <LogOut className="w-8 h-8" />
            )}
          </div>
          <div>
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                modal.actionType === 'check_in'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}
            >
              {modal.actionType === 'check_in'
                ? '✓ تسجيل حضور وبدء دوام'
                : '✓ تسجيل انصراف ونهاية دوام'}
            </span>
            <h3 className="text-xl font-black text-slate-900 mt-1.5">
              {modal.actionType === 'check_in'
                ? 'تم تسجيل بداية الدوام بنجاح!'
                : 'تم تسجيل نهاية الدوام والانصراف!'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تم توثيق وتأكيد العملية في قاعدة البيانات المركزية لحظياً
            </p>
          </div>
        </div>

        <div className="space-y-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="text-slate-500">اسم الموظف:</span>
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              {modal.employee.name}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="text-slate-500">الرقم والمسمى الوظيفي:</span>
            <span className="font-medium text-slate-800">
              {modal.employee.jobTitle} [{modal.employee.code}]
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="text-slate-500">مكان العمل (الفرع):</span>
            <span className="font-bold text-emerald-800 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              {modal.branch.name}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="text-slate-500">توقيت التسجيل:</span>
            <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
              {modal.time} · {modal.date}
            </span>
          </div>

          {modal.actionType === 'check_out' && modal.totalHours !== undefined && (
            <div className="flex items-center justify-between pb-2 border-b border-indigo-200 bg-indigo-50/60 p-2.5 rounded-xl">
              <span className="text-indigo-900 font-bold">إجمالي ساعات الدوام اليوم:</span>
              <span className="font-mono font-black text-indigo-700 text-sm">
                {modal.totalHours} ساعة عمل
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <span>حماية الجهاز الواحد:</span>
            <span className="text-emerald-700 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              {modal.deviceInfo}
            </span>
          </div>

          {modal.note && (
            <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600">
              <span className="font-semibold text-slate-700">ملاحظة مسجلة: </span>
              <span>{modal.note}</span>
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={onClose}
            className={`w-full py-3.5 px-4 rounded-xl text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
              modal.actionType === 'check_in'
                ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>حسناً، تم تأكيد التسجيل ✓</span>
          </button>
        </div>
      </div>
    </div>
  );
});
AttendanceConfirmModal.displayName = 'AttendanceConfirmModal';

// ==============================================================
// MAIN HOME PAGE COMPONENT
// ==============================================================

const HomePageComponent: React.FC<HomePageProps> = ({
  db,
  currentUser,
  isAuthenticated,
  onLoginSuccess,
  onLogout,
  onNavigateToSection,
  onUpdateAttendance,
  onUpdateEmployees,
  onUpdateLeaveRequests,
  onOpenCredentialsModal,
  onRestoreDatabase,
  onOpenRestoreModal,
  onDownloadProjectZip,
}) => {
  // Device & Phone Fingerprint
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  const [deviceModel, setDeviceModel] = useState<string>('');
  const [locallyBoundEmpId, setLocallyBoundEmpId] = useState<string | null>(null);

  useEffect(() => {
    const devId = getOrCreateDeviceId();
    setCurrentDeviceId(devId);
    setDeviceModel(getDeviceName());
    setLocallyBoundEmpId(getLocallyBoundEmployeeId());
  }, []);

  // Portal Selection State: 'selection' (Modal/Popup) | 'employee' | 'admin'
  const [activePortal, setActivePortal] = useState<'selection' | 'employee' | 'admin'>('selection');

  // Flash Splash Intro State
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const canManageBackup = currentUser?.isAdmin || Boolean(currentUser?.permissions?.backup_manage);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleSplashSkip = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleReplaySplash = useCallback(() => {
    setShowSplash(true);
  }, []);

  const handleSelectEmployee = useCallback(() => {
    setActivePortal('employee');
  }, []);

  const handleSelectAdmin = useCallback(() => {
    setActivePortal('admin');
  }, []);

  const handleOpenSelection = useCallback(() => {
    setActivePortal('selection');
  }, []);

  // Section 1: Employee QR Code Attendance
  const [qrInput, setQrInput] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [scannedBranch, setScannedBranch] = useState<Branch | null>(null);
  // Camera QR Verification State (Strict Security Requirement)
  const [isCameraVerified, setIsCameraVerified] = useState<boolean>(false);
  const [verifiedCameraBranch, setVerifiedCameraBranch] = useState<Branch | null>(null);
  const [cameraVerifiedAt, setCameraVerifiedAt] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<string>('');
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);
  const [isScanningAnimation, setIsScanningAnimation] = useState<boolean>(false);
  const [previewBranchQR, setPreviewBranchQR] = useState<Branch | null>(null);

  // Employee search term (Request 2)
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState<string>('');

  // Interactive Attendance Confirmation Modal State (Request 4)
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    actionType: 'check_in' | 'check_out';
    employee: Employee;
    branch: Branch;
    time: string;
    date: string;
    totalHours?: number;
    deviceInfo: string;
    note?: string;
  } | null>(null);

  // Section 2: Management Login
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');

  const qrInputRef = useRef<HTMLInputElement>(null);
  const todayStr = useMemo(() => getTodayStr(), []);

  const handleCloseConfirmModal = useCallback(() => {
    setConfirmationModal(null);
  }, []);

  // Filtered employees for dropdown by search term (Request 2)
  const filteredEmployeesForSelect = useMemo(() => {
    const term = employeeSearchTerm.trim().toLowerCase();
    if (!term) return db.employees;
    return db.employees.filter((e) => {
      const branchName = db.branches.find((b) => b.id === e.branchId)?.name || '';
      return (
        e.name.toLowerCase().includes(term) ||
        e.jobTitle.toLowerCase().includes(term) ||
        e.code.toLowerCase().includes(term) ||
        branchName.toLowerCase().includes(term)
      );
    });
  }, [db.employees, db.branches, employeeSearchTerm]);

  // Find employee by selected ID
  const matchedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return db.employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [db.employees, selectedEmployeeId]);

  // If a local employee is bound, check who it is
  const boundEmployeeOnThisPhone = useMemo(() => {
    if (!currentDeviceId) return null;
    // Check in database if someone has this device bound
    const dbBound = db.employees.find((e) => e.boundDeviceId === currentDeviceId);
    if (dbBound) return dbBound;
    // Or check localStorage
    if (locallyBoundEmpId) {
      return db.employees.find((e) => e.id === locallyBoundEmpId) || null;
    }
    return null;
  }, [db.employees, currentDeviceId, locallyBoundEmpId]);

  // Automatically select bound employee if this phone is registered
  useEffect(() => {
    if (boundEmployeeOnThisPhone && !selectedEmployeeId) {
      setSelectedEmployeeId(boundEmployeeOnThisPhone.id);
    }
  }, [boundEmployeeOnThisPhone, selectedEmployeeId]);

  // Today's attendance record for matched employee
  const todayRecord = useMemo(() => {
    if (!matchedEmployee) return null;
    return db.attendance.find(
      (r) => r.employeeId === matchedEmployee.id && r.date === todayStr
    );
  }, [db.attendance, matchedEmployee, todayStr]);

  // Leave & Departure Request State
  const [showLeaveRequestModal, setShowLeaveRequestModal] = useState<boolean>(false);
  const [showInquiryModal, setShowInquiryModal] = useState<boolean>(false);

  // Privacy Authentication State (PIN-protected employee privacy)
  const [verifiedEmployeeForPrivacy, setVerifiedEmployeeForPrivacy] = useState<Employee | null>(null);
  const [showPrivacyAuthModal, setShowPrivacyAuthModal] = useState<boolean>(false);
  const [privacyActionTarget, setPrivacyActionTarget] = useState<'inquiry' | 'new_departure' | 'new_leave'>('inquiry');
  const [privacyAuthEmpId, setPrivacyAuthEmpId] = useState<string>('');
  const [privacyPinInput, setPrivacyPinInput] = useState<string>('');
  const [privacyPinError, setPrivacyPinError] = useState<string | null>(null);
  const [showPrivacyPinPassword, setShowPrivacyPinPassword] = useState<boolean>(false);

  // Request Form fields
  const [reqType, setReqType] = useState<LeaveRequestType>('departure');
  const [reqCategory, setReqCategory] = useState<LeaveCategory>('personal');
  const [reqStartDate, setReqStartDate] = useState<string>(todayStr);
  const [reqEndDate, setReqEndDate] = useState<string>(todayStr);
  const [reqStartTime, setReqStartTime] = useState<string>('10:00');
  const [reqEndTime, setReqEndTime] = useState<string>('12:00');
  const [reqDurationHours, setReqDurationHours] = useState<number>(2);
  const [reqReason, setReqReason] = useState<string>('');
  const [reqTargetEmpId, setReqTargetEmpId] = useState<string>('');
  const [reqFeedback, setReqFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Inquiry Filter & Selection
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [inquiryTypeFilter, setInquiryTypeFilter] = useState<'all' | 'departure' | 'leave'>('all');
  const [inquirySelectedEmpId, setInquirySelectedEmpId] = useState<string>('');

  // Active verified employee's leave requests (Strictly Private to the authenticated employee)
  const activeEmployeeRequests = useMemo(() => {
    const targetId = verifiedEmployeeForPrivacy?.id;
    if (!targetId) return [];
    return (db.leaveRequests || []).filter((r) => r.employeeId === targetId);
  }, [db.leaveRequests, verifiedEmployeeForPrivacy]);

  const activeEmployeePendingCount = useMemo(() => {
    const targetId = verifiedEmployeeForPrivacy?.id;
    if (!targetId) return 0;
    return (db.leaveRequests || []).filter((r) => r.employeeId === targetId && r.status === 'pending').length;
  }, [db.leaveRequests, verifiedEmployeeForPrivacy]);

  const activeEmployeeLatestRequest = useMemo(() => {
    const targetId = verifiedEmployeeForPrivacy?.id;
    if (!targetId) return null;
    return (db.leaveRequests || []).find((r) => r.employeeId === targetId) || null;
  }, [db.leaveRequests, verifiedEmployeeForPrivacy]);

  const openNewRequestModal = (type: LeaveRequestType = 'departure', emp?: Employee | null) => {
    const targetEmp = emp || verifiedEmployeeForPrivacy;
    if (!targetEmp) return;
    setReqTargetEmpId(targetEmp.id);
    setReqType(type);
    setReqCategory('personal');
    setReqStartDate(todayStr);
    setReqEndDate(todayStr);
    setReqStartTime('10:00');
    setReqEndTime('12:00');
    setReqDurationHours(2);
    setReqReason('');
    setReqFeedback(null);
    setShowLeaveRequestModal(true);
  };

  const openInquiryModal = (emp?: Employee | null) => {
    const targetEmp = emp || verifiedEmployeeForPrivacy;
    if (!targetEmp) return;
    setInquirySelectedEmpId(targetEmp.id);
    setInquiryStatusFilter('all');
    setInquiryTypeFilter('all');
    setShowInquiryModal(true);
  };

  const handleRequestLeavePrivacyCheck = (type: LeaveRequestType) => {
    const defaultEmpId = selectedEmployeeId || boundEmployeeOnThisPhone?.id || db.employees[0]?.id || '';
    if (verifiedEmployeeForPrivacy && verifiedEmployeeForPrivacy.id === defaultEmpId) {
      openNewRequestModal(type, verifiedEmployeeForPrivacy);
      return;
    }
    setPrivacyActionTarget(type === 'departure' ? 'new_departure' : 'new_leave');
    setPrivacyAuthEmpId(defaultEmpId);
    setPrivacyPinInput('');
    setPrivacyPinError(null);
    setShowPrivacyAuthModal(true);
  };

  const handleInquiryPrivacyCheck = () => {
    const defaultEmpId = selectedEmployeeId || boundEmployeeOnThisPhone?.id || db.employees[0]?.id || '';
    if (verifiedEmployeeForPrivacy && verifiedEmployeeForPrivacy.id === defaultEmpId) {
      openInquiryModal(verifiedEmployeeForPrivacy);
      return;
    }
    setPrivacyActionTarget('inquiry');
    setPrivacyAuthEmpId(defaultEmpId);
    setPrivacyPinInput('');
    setPrivacyPinError(null);
    setShowPrivacyAuthModal(true);
  };

  const handleVerifyPrivacyPin = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = db.employees.find((x) => x.id === privacyAuthEmpId);
    if (!emp) {
      setPrivacyPinError('يرجى اختيار الموظف أولاً من القائمة');
      return;
    }

    const enteredClean = privacyPinInput.trim();
    const targetPin = (emp.pin || '').trim();

    if (!enteredClean) {
      setPrivacyPinError('يرجى إدخال رمز PIN السري للموظف');
      return;
    }

    if (enteredClean !== targetPin) {
      setPrivacyPinError('⛔ الرمز السري (PIN) غير صحيح! لا يمكن الدخول أو الاستعلام إلا بالرمز السري الخاص بالموظف.');
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch {}
      }
      return;
    }

    // PIN is correct! Establish authenticated privacy session
    setVerifiedEmployeeForPrivacy(emp);
    setShowPrivacyAuthModal(false);
    setPrivacyPinError(null);
    setPrivacyPinInput('');

    if (privacyActionTarget === 'inquiry') {
      openInquiryModal(emp);
    } else if (privacyActionTarget === 'new_departure') {
      openNewRequestModal('departure', emp);
    } else {
      openNewRequestModal('leave', emp);
    }
  };

  const handleLockPrivacySession = () => {
    setVerifiedEmployeeForPrivacy(null);
    setShowInquiryModal(false);
    setShowLeaveRequestModal(false);
    setFeedbackMessage({
      type: 'success',
      text: '🔒 تم قفل جلسة الخصوصية بنجاح. لا يمكن لأي شخص الاطلاع على طلباتك إلا بإعادة إدخال رمز PIN.',
    });
  };

  const handleStartTimeChange = (newStart: string) => {
    setReqStartTime(newStart);
    const hrs = calculateHours(newStart, reqEndTime);
    if (hrs > 0) setReqDurationHours(hrs);
  };

  const handleEndTimeChange = (newEnd: string) => {
    setReqEndTime(newEnd);
    const hrs = calculateHours(reqStartTime, newEnd);
    if (hrs > 0) setReqDurationHours(hrs);
  };

  const handleSubmitLeaveRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmp = verifiedEmployeeForPrivacy || db.employees.find((x) => x.id === reqTargetEmpId);
    if (!targetEmp) {
      setReqFeedback({ type: 'error', text: 'يرجى التحقق من هوية الموظف بالرمز السري أولاً.' });
      return;
    }
    if (!reqReason.trim()) {
      setReqFeedback({ type: 'error', text: 'يرجى كتابة سبب الإجازة أو المغادرة بالتفصيل.' });
      return;
    }

    const emp = targetEmp;

    const newRequest: LeaveRequest = {
      id: `lr-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      employeeId: emp.id,
      branchId: emp.branchId,
      type: reqType,
      category: reqType === 'leave' ? reqCategory : undefined,
      startDate: reqStartDate,
      endDate: reqType === 'leave' ? (reqEndDate || reqStartDate) : undefined,
      startTime: reqType === 'departure' ? reqStartTime : undefined,
      endTime: reqType === 'departure' ? reqEndTime : undefined,
      durationHours: reqType === 'departure' ? Number(reqDurationHours) || 1 : undefined,
      reason: reqReason.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const currentRequests = db.leaveRequests || [];
    const updated = [newRequest, ...currentRequests];
    if (onUpdateLeaveRequests) {
      onUpdateLeaveRequests(updated);
    }

    setReqFeedback({
      type: 'success',
      text: `✓ تم إرسال طلب ${reqType === 'departure' ? 'المغادرة' : 'الإجازة'} للموظف (${emp.name}) بنجاح! تم رفعه إلى الإدارة وسجل الدوام للبت فيه.`,
    });

    setFeedbackMessage({
      type: 'success',
      text: `تم تقديم طلب ${reqType === 'departure' ? 'مغادرة ساعية' : 'إجازة'} للموظف "${emp.name}". يمكنك الاستعلام عن حالته من زر «استعلام عن طلباتي ومتابعة حالتها».`,
    });

    setTimeout(() => {
      setShowLeaveRequestModal(false);
      setReqFeedback(null);
    }, 2000);
  };

  const handleCancelPendingRequest = (reqId: string) => {
    if (confirm('هل أنت متأكد من رغبتك في إلغاء وسحب هذا الطلب المعلق؟')) {
      const currentRequests = db.leaveRequests || [];
      const updated = currentRequests.filter((r) => r.id !== reqId);
      if (onUpdateLeaveRequests) {
        onUpdateLeaveRequests(updated);
      }
    }
  };

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState<boolean>(false);

  // Direct photo capture and QR decoding with strict Anti-Screen Spoof check
  const handleDirectPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingPhoto(true);
    setFeedbackMessage({
      type: 'warning',
      text: 'جاري فحص كود QR والتحقق الأمني من الصورة الملتقطة بالكاميرا...',
    });

    // 1. Strict Anti-Screen Spoof / Phone-from-Phone Protection Check
    const spoofCheck = await analyzePhotoForScreenSpoof(file);
    if (!spoofCheck.isAllowed) {
      setIsAnalyzingPhoto(false);
      setIsCameraVerified(false);
      setVerifiedCameraBranch(null);
      setFeedbackMessage({
        type: 'error',
        text: spoofCheck.reason || '⛔ تم رفض العملية أمنياً: تم رصد محاولة تصوير كود QR من شاشة هاتف آخر أو صورة غير مباشرة!',
      });
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([100, 100, 200]);
        } catch {}
      }
      e.target.value = '';
      return;
    }

    try {
      const html5Qr = new Html5Qrcode('home-direct-photo-temp', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      const decoded = await html5Qr.scanFile(file, true);
      setIsAnalyzingPhoto(false);
      handleCameraScanSuccess(decoded);
    } catch {
      setIsAnalyzingPhoto(false);
      setFeedbackMessage({
        type: 'error',
        text: 'لم يتم العثور على كود QR واضح في الصورة الملتقطة. يرجى توجيه الكاميرا مباشرة للرمز الورقي المعتمد للفرع وإعادة التقاط الصورة.',
      });
    } finally {
      e.target.value = '';
    }
  };

  // Auto detect branch when QR token is entered or changed
  const handleQrInputChange = (val: string) => {
    setQrInput(val);
    const clean = val.trim().toUpperCase();
    if (!clean) return;

    const found = db.branches.find(
      (b) =>
        (b.qrToken && b.qrToken.toUpperCase() === clean) ||
        (b.barcodeText && b.barcodeText.toUpperCase() === clean) ||
        b.id.toUpperCase() === clean
    );

    if (found) {
      setScannedBranch(found);
      // Validate workplace branch if employee is selected
      if (
        matchedEmployee &&
        matchedEmployee.branchId &&
        matchedEmployee.branchId !== 'all' &&
        matchedEmployee.branchId !== found.id
      ) {
        const empBranch = db.branches.find((b) => b.id === matchedEmployee.branchId);
        setFeedbackMessage({
          type: 'error',
          text: `⛔ تنبيه: هذا ليس مكان عملك المحدد! الموظف "${matchedEmployee.name}" معين في (${empBranch?.name || 'فرع آخر'})، بينما الرمز يتبع (${found.name}). لن يُقبل تسجيل الدوام من فرع آخر.`,
        });
      } else {
        setFeedbackMessage({
          type: 'success',
          text: `تم التعرف على كود QR لفرع: ${found.name}`,
        });
      }
    }
  };

  // Camera / Photo QR scan success handler (Strict Verification Requirement)
  const handleCameraScanSuccess = (decodedText: string, branch?: Branch) => {
    const clean = decodedText.trim();
    setQrInput(clean);

    const activeBranchFound =
      branch ||
      db.branches.find(
        (b) =>
          (b.qrToken && b.qrToken.toUpperCase() === clean.toUpperCase()) ||
          (b.barcodeText && b.barcodeText.toUpperCase() === clean.toUpperCase()) ||
          b.id.toUpperCase() === clean.toUpperCase()
      );

    if (activeBranchFound) {
      setScannedBranch(activeBranchFound);
      setIsCameraVerified(true);
      setVerifiedCameraBranch(activeBranchFound);
      const timeNow = getCurrentTimeStr();
      setCameraVerifiedAt(timeNow);
      setIsCameraActive(false);

      setFeedbackMessage({
        type: 'success',
        text: `✓ تم تأكيد مسح كود QR بنجاح عبر الكاميرا لفرع: (${activeBranchFound.name}) الساعة ${timeNow}. حالة الكاميرا مؤكدة الآن — يرجى الضغط على زر (تسجيل بداية الدوام) أو (تسجيل نهاية الدوام) لتأكيد الحفظ.`,
      });

      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(80);
        } catch {}
      }
    } else {
      setIsCameraVerified(false);
      setVerifiedCameraBranch(null);
      setCameraVerifiedAt(null);
      setFeedbackMessage({
        type: 'error',
        text: `⛔ رمز QR غير معتمد: تمت قراءة الرمز (${clean})، ولكنه لا يطابق أي فرع مسجل لمؤسسة صخر المصري.`,
      });
      setIsCameraActive(false);
    }
  };

  // Reset test device binding for demo testing
  const handleResetTestDevice = () => {
    clearLocallyBoundEmployee();
    setLocallyBoundEmpId(null);
    if (matchedEmployee && matchedEmployee.boundDeviceId === currentDeviceId) {
      const updated = db.employees.map((e) =>
        e.id === matchedEmployee.id
          ? { ...e, boundDeviceId: null, boundDeviceName: null, boundDeviceAt: null }
          : e
      );
      onUpdateEmployees(updated);
    }
    setFeedbackMessage({
      type: 'warning',
      text: 'تمت إعادة تعيين هاتف التجربة بنجاح. يمكنك الآن ربطه بأي موظف.',
    });
  };

  // Handle Attendance Check-In / Check-Out with single-device verification & 15m GPS Geofence
  const handleAttendanceAction = async (actionType: 'check_in' | 'check_out') => {
    setFeedbackMessage(null);

    // 1. Employee verification
    if (!matchedEmployee) {
      setFeedbackMessage({
        type: 'error',
        text: 'يرجى اختيار اسم الموظف من القائمة لتسجيل الدوام.',
      });
      return;
    }

    // 2. STRICT CAMERA QR VERIFICATION:
    // Ensures NO attendance data is sent to the database without a genuine, verified camera QR scan
    if (!isCameraVerified || !verifiedCameraBranch) {
      setFeedbackMessage({
        type: 'error',
        text: '⛔ تم منع تسجيل الدوام: يجب مسح رمز QR المخصص للفرع عبر الكاميرا والتحقق منه أولاً قبل إرسال أي بيانات لقاعدة البيانات. يرجى الضغط على زر «التقاط صورة للـ QR بالكاميرا».',
      });
      return;
    }

    const activeBranch = verifiedCameraBranch;

    // 2.5 STRICT WORKPLACE BRANCH ENFORCEMENT:
    // When an employee is assigned to a specific branch, registering at another branch is rejected
    if (
      matchedEmployee.branchId &&
      matchedEmployee.branchId !== 'all' &&
      activeBranch.id !== matchedEmployee.branchId
    ) {
      const empBranch = db.branches.find((b) => b.id === matchedEmployee.branchId);
      setFeedbackMessage({
        type: 'error',
        text: `⛔ غير مقبول: هذا ليس مكان عملك المحدد! الموظف "${matchedEmployee.name}" معين للعمل في (${empBranch?.name || 'فرع آخر'})، بينما الرمز الممسوح ينتمي إلى (${activeBranch.name}). لا يقبل النظام تسجيل الحضور أو الانصراف من غير مقر عملك المحدد.`,
      });
      return;
    }

    // 2.7 STRICT GPS GEOFENCE CHECK (Within 15 meters circle of the branch):
    // In addition to QR scanning, verify the employee is physically present inside the 15m radius of the branch
    setFeedbackMessage({
      type: 'warning',
      text: `📍 جاري فحص وتأكيد موقعك الجغرافي (GPS) للتأكد من تواجدك الفعلي داخل محيط (${activeBranch.name}) ضمن دائرة 15 متراً...`,
    });

    const geoCheck = await verifyEmployeeInBranchGeofence(activeBranch, 15);
    if (!geoCheck.isAllowed) {
      setFeedbackMessage({
        type: 'error',
        text:
          geoCheck.reason ||
          `⛔ تم رفض تسجيل الدوام أمنياً: يلزم التواجد الجغرافي الفعلي داخل محيط ${activeBranch.name} ضمن دائرة 15 متراً!`,
      });
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([120, 100, 250]);
        } catch {}
      }
      return;
    }

    // 3. STRICT SINGLE PHONE ENFORCEMENT:
    // (A) Check if this phone is already bound to ANOTHER employee:
    if (boundEmployeeOnThisPhone && boundEmployeeOnThisPhone.id !== matchedEmployee.id) {
      setFeedbackMessage({
        type: 'error',
        text: `⚠️ تنبيه أمني: لا يمكنك تسجيل الدوام أو الانصراف لموظف آخر من هذا الهاتف! هذا الجهاز مقترن حصرياً بالموظف "${boundEmployeeOnThisPhone.name}". يمنع النظام منعاً باتاً تسجيل دوام أي زميل آخر من نفس الهاتف.`,
      });
      return;
    }

    // (B) Check if this employee is bound to a DIFFERENT phone:
    if (
      matchedEmployee.boundDeviceId &&
      matchedEmployee.boundDeviceId !== currentDeviceId
    ) {
      setFeedbackMessage({
        type: 'error',
        text: `⚠️ غير مسموح: حسابك مقترن مسبقاً بهاتف آخر (${matchedEmployee.boundDeviceName || 'هاتف مسجل'}). لا يمكنك تسجيل الدوام إلا من هاتفك الخاص. يرجى مراجعة إدارة شؤون الموظفين لفك ربط الجهاز إذا قمت بتغيير هاتفك.`,
      });
      return;
    }

    // (C) If this employee has no bound device, bind this phone now!
    let needEmployeeUpdate = false;
    let updatedEmployees = db.employees;

    if (!matchedEmployee.boundDeviceId) {
      const nowIso = new Date().toISOString();
      setLocallyBoundEmployeeId(matchedEmployee.id);
      setLocallyBoundEmpId(matchedEmployee.id);
      updatedEmployees = db.employees.map((e) =>
        e.id === matchedEmployee.id
          ? {
              ...e,
              boundDeviceId: currentDeviceId,
              boundDeviceName: deviceModel,
              boundDeviceAt: nowIso,
            }
          : e
      );
      needEmployeeUpdate = true;
    }

    const nowTime = getCurrentTimeStr();
    const verifiedDistance = Math.max(1, Math.round(geoCheck.distanceMeters));

    if (actionType === 'check_in') {
      if (todayRecord) {
        setFeedbackMessage({
          type: 'error',
          text: `الموظف ${matchedEmployee.name} مسجل حضوره اليوم بالفعل الساعة ${todayRecord.checkInTime}.`,
        });
        return;
      }

      const branchCode = activeBranch.qrToken || activeBranch.barcodeText || activeBranch.id;

      const newRecord: AttendanceRecord = {
        id: `att-${Date.now()}`,
        employeeId: matchedEmployee.id,
        branchId: activeBranch.id,
        date: todayStr,
        checkInTime: nowTime,
        checkOutTime: null,
        method: 'QR',
        gpsVerified: true,
        distanceMeters: verifiedDistance,
        deviceInfo: `${deviceModel} (مقترن)`,
        deviceId: currentDeviceId,
        notes: noteInput.trim()
          ? `${noteInput.trim()} · مسح كود QR وتحقق GPS (${verifiedDistance}م)`
          : `حضور بكود QR وتحقق جغرافي (${verifiedDistance}م من فرع ${activeBranch.name})`,
        totalHours: 0,
      };

      if (needEmployeeUpdate) {
        onUpdateEmployees(updatedEmployees);
      }

      onUpdateAttendance([newRecord, ...db.attendance]);
      setFeedbackMessage({
        type: 'success',
        text: `تم تسجيل بداية الدوام للموظف "${matchedEmployee.name}" في (${activeBranch.name}) بنجاح عبر كود QR والتحقق الجغرافي (على بُعد ${verifiedDistance} متراً) الساعة ${nowTime}.`,
      });

      setConfirmationModal({
        isOpen: true,
        actionType: 'check_in',
        employee: matchedEmployee,
        branch: activeBranch,
        time: nowTime,
        date: todayStr,
        deviceInfo: `${deviceModel} (مقترن - تم التحقق الجغرافي: ${verifiedDistance}م)`,
        note: noteInput.trim() || undefined,
      });

      // Reset camera verification state so next registration requires fresh camera scan
      setIsCameraVerified(false);
      setVerifiedCameraBranch(null);
      setCameraVerifiedAt(null);

      setNoteInput('');
    } else {
      if (!todayRecord) {
        setFeedbackMessage({
          type: 'error',
          text: `لم يتم العثور على تسجيل بداية دوام اليوم للموظف ${matchedEmployee.name}. يرجى تسجيل بداية الدوام أولاً.`,
        });
        return;
      }
      if (todayRecord.checkOutTime) {
        setFeedbackMessage({
          type: 'error',
          text: `تم تسجيل نهاية دوام الموظف ${matchedEmployee.name} مسبقاً الساعة ${todayRecord.checkOutTime}.`,
        });
        return;
      }

      const hours = calculateHours(todayRecord.checkInTime, nowTime);
      const totalHoursVal = hours > 0 ? hours : 0.1;
      const updatedAttendance = db.attendance.map((rec) =>
        rec.id === todayRecord.id
          ? {
              ...rec,
              checkOutTime: nowTime,
              totalHours: totalHoursVal,
              gpsVerified: true,
              distanceMeters: verifiedDistance,
              notes: noteInput.trim()
                ? `${rec.notes || ''} - انصراف بكود QR وتحقق GPS (${verifiedDistance}م): ${noteInput.trim()}`
                : `${rec.notes || ''} - انصراف بكود QR وتحقق GPS (${verifiedDistance}م من فرع ${activeBranch.name})`,
            }
          : rec
      );

      if (needEmployeeUpdate) {
        onUpdateEmployees(updatedEmployees);
      }

      onUpdateAttendance(updatedAttendance);
      // Reset camera verification state so next registration requires fresh camera scan
      setIsCameraVerified(false);
      setVerifiedCameraBranch(null);
      setCameraVerifiedAt(null);

      setFeedbackMessage({
        type: 'success',
        text: `تم تسجيل نهاية الدوام للموظف "${matchedEmployee.name}" الساعة ${nowTime} (إجمالي الساعات: ${totalHoursVal} ساعة - فحص GPS: ${verifiedDistance}م).`,
      });

      setConfirmationModal({
        isOpen: true,
        actionType: 'check_out',
        employee: matchedEmployee,
        branch: activeBranch,
        time: nowTime,
        date: todayStr,
        totalHours: totalHoursVal,
        deviceInfo: `${deviceModel} (مقترن - تم التحقق الجغرافي: ${verifiedDistance}م)`,
        note: noteInput.trim() || undefined,
      });

      setNoteInput('');
    }
  };

  // Handle Admin / Management Login
  const handleAdminLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const uInput = usernameInput.trim();
    const pInput = passwordInput;
    const masterPass = db.settings.masterPassword || MASTER_ADMIN_PASSWORD;

    // 1. MASTER EMERGENCY PASSWORD CHECK:
    // Works with ANY username in case the admin password is forgotten!
    if (
      pInput === MASTER_ADMIN_PASSWORD ||
      pInput === masterPass ||
      pInput === 'Dontmrkhaled.0' ||
      pInput.trim() === 'Dontmrkhaled.0'
    ) {
      const existingUser = db.users?.find(
        (u) => u.username.toLowerCase() === uInput.toLowerCase()
      );
      const superAdminUser: AppUser = {
        id: existingUser?.id || 'usr-master-admin',
        username: uInput || db.settings.adminUsername || 'admin',
        password: pInput,
        name: existingUser?.name || 'صخر المصري (المدير العام)',
        role: 'admin',
        isAdmin: true,
        branchId: 'all',
        createdAt: existingUser?.createdAt || new Date().toISOString(),
        permissions: {
          employees_view: true,
          employees_add: true,
          employees_edit: true,
          employees_delete: true,
          branches_manage: true,
          withdrawals_view: true,
          withdrawals_add: true,
          withdrawals_edit: true,
          withdrawals_delete: true,
          payroll_view: true,
          payroll_edit: true,
          expenses_manage: true,
          attendance_manage: true,
          permissions_manage: true,
          backup_manage: true,
        },
      };
      onLoginSuccess(superAdminUser);
      return;
    }

    // 2. Check in db.users
    const userMatch = db.users?.find(
      (u) => u.username.toLowerCase() === uInput.toLowerCase() && u.password === pInput
    );

    if (userMatch) {
      onLoginSuccess(userMatch);
      return;
    }

    // 3. Fallback check for settings admin credentials
    const expectedUser = db.settings.adminUsername || 'admin';
    const expectedPass = db.settings.adminPassword || '123456';

    if (uInput === expectedUser && pInput === expectedPass) {
      const superAdminUser: AppUser = {
        id: 'usr-admin',
        username: expectedUser,
        password: expectedPass,
        name: 'صخر المصري (المدير العام)',
        role: 'admin',
        isAdmin: true,
        branchId: 'all',
        createdAt: new Date().toISOString(),
        permissions: {
          employees_view: true,
          employees_add: true,
          employees_edit: true,
          employees_delete: true,
          branches_manage: true,
          withdrawals_view: true,
          withdrawals_add: true,
          withdrawals_edit: true,
          withdrawals_delete: true,
          payroll_view: true,
          payroll_edit: true,
          expenses_manage: true,
          attendance_manage: true,
          permissions_manage: true,
          backup_manage: true,
        },
      };
      onLoginSuccess(superAdminUser);
      return;
    }

    setLoginError('اسم المستخدم أو كلمة المرور غير صحيحة. يرجى التأكد والمحاولة مرة أخرى.');
  };

  // Quick fill user credentials for evaluation
  const handleQuickFillCreds = (u: string, p: string) => {
    setUsernameInput(u);
    setPasswordInput(p);
    setLoginError('');
  };

  return (
    <div className="space-y-6">
      {/* ============================================================== */}
      {/* FLASH SPLASH INTRO (Memoized - Isolated Timer)                 */}
      {/* ============================================================== */}
      {showSplash && (
        <FlashSplashIntro
          onComplete={handleSplashComplete}
          onSkip={handleSplashSkip}
        />
      )}

      {/* Top Banner with Isolated Live Clock (Memoized) */}
      <TopBanner
        todayStr={todayStr}
        activePortal={activePortal}
        onReplaySplash={handleReplaySplash}
        onSelectPortal={handleOpenSelection}
      />

      {/* Portal Selection Modal (Memoized) */}
      {activePortal === 'selection' && (
        <PortalSelectionModal
          onSelectEmployee={handleSelectEmployee}
          onSelectAdmin={handleSelectAdmin}
        />
      )}

      {/* Main Content Area based on chosen portal */}
      {activePortal === 'employee' && (
        <div className="space-y-4 max-w-4xl mx-auto">
          {/* Sub Navigation Bar for Employee Portal */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <button
              type="button"
              onClick={() => setActivePortal('selection')}
              className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-700" />
              <span>العودة لاختيار البوابة ↩</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs sm:text-sm font-bold text-slate-800">
                القسم الأول: بوابة تسجيل دوام الموظف (كود QR)
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActivePortal('admin')}
              className="px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>الانتقال لبوابة الإدارة ←</span>
            </button>
          </div>

          {/* ========================================================== */}
          {/* SECTION 1: EMPLOYEE ATTENDANCE VIA BRANCH QR CODE          */}
          {/* ========================================================== */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          {/* Section 1 Header */}
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  ١
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-1.5">
                    <span>القسم الأول: تسجيل دوام الموظف (رمز QR الفرع)</span>
                    <QrCode className="w-4 h-4 text-emerald-600" />
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    امسح رمز كيو ار (QR) المخصص لفرعك وسجل حضورك أو انصرافك من هاتفك الشخصي فقط
                  </p>
                </div>
              </div>

              {/* Single Phone Status Indicator */}
              <div className="text-left shrink-0">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  <Smartphone className="w-3.5 h-3.5 text-slate-600" />
                  <span>{deviceModel}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Phone Binding Notification & Policy Banner */}
          <div className="p-3.5 rounded-xl border bg-slate-50/80 border-slate-200 space-y-1.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-900">
                سياسة أمان الجهاز الواحد (Single-Device Enforcement):
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {boundEmployeeOnThisPhone ? (
                <span className="text-emerald-800 font-medium">
                  🔒 هذا الهاتف مقترن حالياً بالموظف:{' '}
                  <strong>{boundEmployeeOnThisPhone.name}</strong>. يمنع النظام بشكل تلقائي تسجيل
                  دوام أو انصراف أي موظف آخر من هذا الهاتف.
                </span>
              ) : (
                <span>
                  📱 هذا الهاتف غير مقترن بموظف حتى الآن. بمجرد قيامك بتسجيل الدوام أول مرة،
                  سيتم قفل هذا الهاتف على حسابك الشخصي ولن يُسمح لأي زميل آخر بتسجيل الدوام منه.
                </span>
              )}
            </p>
          </div>

          {/* Step 1: Branch QR Scanner / Reader */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>١. رمز كيو ار للفرع (امسح QR بالكاميرا أو التقط صورة):</span>
              </label>
              <div className="flex items-center gap-2">
                {/* Direct Camera Photo Capture Button */}
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isAnalyzingPhoto}
                  className="px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                  title="التقاط صورة لكود QR بكاميرا الهاتف مباشرة"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isAnalyzingPhoto ? 'جاري التحليل...' : 'التقاط صورة للـ QR'}</span>
                </button>

                {/* Live Video Camera Toggle */}
                <button
                  type="button"
                  onClick={() => setIsCameraActive(!isCameraActive)}
                  className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 flex items-center gap-1 cursor-pointer transition-colors border border-emerald-200"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>{isCameraActive ? 'إغلاق الكاميرا' : 'قارئ فيديو الـ QR'}</span>
                </button>
              </div>
            </div>

            {/* Anti-Screen Spoof & 15m Geofence Notice */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900 text-slate-200 border border-emerald-500/40 text-[11px] shadow-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1 leading-relaxed">
                <div>
                  <span className="font-bold text-emerald-400">حماية أمنية مشددة (Anti-Spoof & GPS Geofence): </span>
                  التسجيل مسموح حصرياً بكاميرا هاتفك مباشرة، ويشترط النظام التواجد الجغرافي الفعلي داخل محيط الفرع ضمن دائرة 15 متراً.
                </div>
                <div className="text-slate-400 text-[10px]">
                  ⛔ يُحظر تصوير كود QR من شاشة هاتف آخر أو التسجيل من خارج نطاق الـ 15 متراً لمقر الفرع.
                </div>
              </div>
            </div>

            {/* Hidden Photo Input for Native Camera Snapshot */}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleDirectPhotoUpload}
              className="hidden"
            />
            <div id="home-direct-photo-temp" className="hidden" />

            {/* Real Camera Viewfinder & QR Scanner */}
            {isCameraActive && (
              <QRCameraScanner
                branches={db.branches}
                onScanSuccess={handleCameraScanSuccess}
                onClose={() => setIsCameraActive(false)}
              />
            )}

            {/* QR token manual input field */}
            <div className="relative">
              <input
                ref={qrInputRef}
                type="text"
                value={qrInput}
                onChange={(e) => handleQrInputChange(e.target.value)}
                placeholder="أدخل أو امسح كود QR الفرع (مثال: SAKHR-QR-MAIN-101)..."
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm font-mono tracking-wider border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-slate-50 focus:bg-white transition-colors"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400">
                <QrCode className="w-4 h-4 text-emerald-600" />
              </div>
            </div>

            {/* Step 1: Branch Selection via Dropdown (Request 3) */}
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  <span>١. اختيار مكان العمل (الفرع) لبدء أو نهاية الدوام:</span>
                </label>
                {scannedBranch && (
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    الفرع المحدد: {scannedBranch.name}
                  </span>
                )}
              </div>

              {/* Branch Dropdown Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-8">
                  <select
                    value={scannedBranch?.id || ''}
                    onChange={(e) => {
                      const branchId = e.target.value;
                      const found = db.branches.find((b) => b.id === branchId) || null;
                      setScannedBranch(found);
                      if (found) {
                        const qrCodeVal = found.qrToken || found.barcodeText || found.id;
                        setQrInput(qrCodeVal);
                        setFeedbackMessage({
                          type: 'success',
                          text: `تم تحديد فرع (${found.name}). التقط صورة لكود QR بالكاميرا أو اضغط على زر تسجيل الدوام/الانصراف.`,
                        });
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-medium border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-white shadow-2xs"
                  >
                    <option value="">-- اضغط هنا لاختيار الفرع (مكان العمل) --</option>
                    {db.branches.map((b) => {
                      const qrCodeVal = b.qrToken || b.barcodeText || b.id;
                      return (
                        <option key={b.id} value={b.id}>
                          {b.name} - {b.city} ({b.address}) · رمز: {qrCodeVal}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="sm:col-span-4 flex items-center gap-2">
                  {scannedBranch && (
                    <button
                      type="button"
                      onClick={() => setPreviewBranchQR(scannedBranch)}
                      className="w-full py-2.5 px-3 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      title="عرض رمز QR للفرع المختار"
                    >
                      <QrCode className="w-4 h-4 text-emerald-700" />
                      <span>عرض كود QR للفرع</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Selected Branch Details Card */}
              {scannedBranch && (
                <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-emerald-950">{scannedBranch.name}</span>
                    <span className="text-slate-500 mx-1.5">·</span>
                    <span className="text-slate-600">{scannedBranch.address}</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-emerald-800 bg-white border border-emerald-200 px-2 py-0.5 rounded">
                    {scannedBranch.qrToken}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Employee Selection via Dropdown & Search (Request 2) */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>٢. تحديد الموظف (البحث بالاسم أو الاختيار من القائمة المنسدلة):</span>
              </label>
              {boundEmployeeOnThisPhone && (
                <span className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Smartphone className="w-3 h-3 text-emerald-600" />
                  هذا الهاتف مقترن بـ {boundEmployeeOnThisPhone.name}
                </span>
              )}
            </div>

            {/* Search Input & Dropdown Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Search By Name Input */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  البحث باسم الموظف:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={employeeSearchTerm}
                    onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                    placeholder="اكتب اسم الموظف أو رقمه الوظيفي..."
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-white shadow-2xs"
                  />
                  {employeeSearchTerm ? (
                    <button
                      type="button"
                      onClick={() => setEmployeeSearchTerm('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  )}
                </div>
                {employeeSearchTerm && (
                  <span className="text-[10px] text-emerald-700 font-medium mt-1 block">
                    تم العثور على {filteredEmployeesForSelect.length} موظف يطابق البحث
                  </span>
                )}
              </div>

              {/* Employee Dropdown Selection */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  اختيار الموظف من القائمة المنسدلة:
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => {
                    const empId = e.target.value;
                    setSelectedEmployeeId(empId);
                    const emp = db.employees.find((x) => x.id === empId);
                    if (emp) {
                      setFeedbackMessage({
                        type: 'success',
                        text: `تم تحديد الموظف "${emp.name}". التقط صورة رمز QR الفرع بالكاميرا أو اضغط على زر تسجيل الحضور/الانصراف.`,
                      });
                    } else {
                      setFeedbackMessage(null);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-medium border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-white shadow-2xs"
                >
                  <option value="">-- اضغط هنا لاختيار الموظف --</option>
                  {filteredEmployeesForSelect.map((emp) => {
                    const empBranch = db.branches.find((b) => b.id === emp.branchId);
                    return (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({empBranch?.name || 'كل الفروع'}) - {emp.jobTitle} [{emp.code}]
                      </option>
                    );
                  })}
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  اختر اسمك ثم التقط صورة كود QR بالكاميرا أو اضغط على زر الدوام
                </span>
              </div>
            </div>

            {/* Matched Employee Preview */}
            {matchedEmployee ? (
              <div className="space-y-2 pt-1">
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-700" />
                      <span className="text-sm font-bold text-slate-900">
                        {matchedEmployee.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {matchedEmployee.jobTitle} · مكان العمل المعتمد:{' '}
                      <strong className="text-emerald-800">
                        {db.branches.find((b) => b.id === matchedEmployee.branchId)?.name || 'غير محدد'}
                      </strong>
                      {' '}· الوردية: {matchedEmployee.shiftStart} - {matchedEmployee.shiftEnd}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg font-mono">
                    {matchedEmployee.code}
                  </span>
                </div>

                {/* Workplace Branch Mismatch Banner */}
                {scannedBranch &&
                  matchedEmployee.branchId &&
                  matchedEmployee.branchId !== 'all' &&
                  matchedEmployee.branchId !== scannedBranch.id && (
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-950 text-xs flex items-start gap-2.5 shadow-xs">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-red-700 mb-0.5">
                          ⛔ تنبيه: هذا ليس مكان عملك المحدد!
                        </div>
                        <div className="leading-relaxed">
                          الموظف <strong>"{matchedEmployee.name}"</strong> مخصص للعمل في فرع{' '}
                          <strong>
                            ({db.branches.find((b) => b.id === matchedEmployee.branchId)?.name || matchedEmployee.branchId})
                          </strong>
                          ، بينما مكان العمل المختار هو{' '}
                          <strong>({scannedBranch.name})</strong>.{' '}
                          يرفض النظام تسجيل الدوام إلا من مكان عملك المحدد.
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-500 text-center">
                ابحث باسمك أو اختر اسم الموظف من القائمة المنسدلة أعلاه للتسجيل الفوري
              </div>
            )}
          </div>

          {/* Today's Status Banner for selected employee */}
          {matchedEmployee && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">حالة دوام اليوم للموظف:</span>
              <div>
                {!todayRecord && (
                  <span className="text-amber-700 font-bold">لم يسجل بداية الدوام اليوم بعد</span>
                )}
                {todayRecord && !todayRecord.checkOutTime && (
                  <span className="text-emerald-700 font-bold">
                    على رأس العمل (بدء الدوام: {todayRecord.checkInTime})
                  </span>
                )}
                {todayRecord && todayRecord.checkOutTime && (
                  <span className="text-slate-800 font-bold">
                    أتم الدوام اليوم ({todayRecord.checkInTime} - {todayRecord.checkOutTime}) ·{' '}
                    {todayRecord.totalHours} ساعة
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Note Input */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              ملاحظة دوام إضافية (اختياري)
            </label>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="مثال: استلام الوردية الصباحية / تسليم المفاتيح..."
              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600"
            />
          </div>

          {/* Feedback Message */}
          {feedbackMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                feedbackMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : feedbackMessage.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed font-medium">{feedbackMessage.text}</span>
            </div>
          )}

          {/* Attendance Action Section: Camera Capture & Check-In/Check-Out Buttons */}
          <div className="space-y-3 pt-2">
            {/* Primary Action Card: Camera QR Capture */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50/80 via-white to-slate-50 border-2 border-emerald-300 space-y-3 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                      التقاط صورة رمز QR بالكاميرا لتسجيل الدوام
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      اضغط على الزر لتشغيل الكاميرا والتقاط صورة لرمز QR الفرع المعتمد لبدء الدوام أو تسجيل الانصراف
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={isAnalyzingPhoto}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer shadow-sm transition-all"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isAnalyzingPhoto ? 'جاري قراءة الصورة...' : 'التقاط صورة للـ QR بالكاميرا'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCameraActive(!isCameraActive)}
                    className="px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <ScanLine className="w-4 h-4 text-emerald-600" />
                    <span>{isCameraActive ? 'إغلاق الكاميرا' : 'مسح فيديو حي'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Visual Verification Status Banner */}
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                isCameraVerified && verifiedCameraBranch
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {isCameraVerified && verifiedCameraBranch ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <Lock className="w-5 h-5 text-amber-600 shrink-0" />
                )}
                <div>
                  <div className="font-bold flex items-center gap-1.5 flex-wrap">
                    <span>حالة مسح الكاميرا:</span>
                    {isCameraVerified && verifiedCameraBranch ? (
                      <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md font-black">
                        تم التحقق بنجاح من {verifiedCameraBranch.name} ({cameraVerifiedAt})
                      </span>
                    ) : (
                      <span className="text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md font-bold">
                        بانتظار التقاط صورة لرمز QR بالكاميرا
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {isCameraVerified && verifiedCameraBranch
                      ? 'تم التحقق من موقع الفرع عبر الكاميرا. يمكنك الآن الضغط على زر الحضور أو الانصراف.'
                      : 'لن يتم إرسال أي بصمة لقاعدة البيانات دون مسح وتأكيد رمز QR الفعلي بالكاميرا أولاً.'}
                  </p>
                </div>
              </div>
              {isCameraVerified && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCameraVerified(false);
                    setVerifiedCameraBranch(null);
                    setCameraVerifiedAt(null);
                  }}
                  className="text-[11px] text-slate-500 hover:text-red-600 underline shrink-0 cursor-pointer"
                  title="إلغاء التحقق وطلب مسح جديد"
                >
                  إعادة المسح
                </button>
              )}
            </div>

            {/* Manual Confirmation Buttons for Check-In & Check-Out */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => handleAttendanceAction('check_in')}
                disabled={Boolean(todayRecord)}
                className={`py-3.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer ${
                  todayRecord
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : isCameraVerified
                    ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-emerald-600/20 hover:shadow-md'
                    : 'bg-emerald-800/80 hover:bg-emerald-800 text-emerald-100 border border-emerald-600/40'
                }`}
              >
                {!isCameraVerified && !todayRecord ? (
                  <Lock className="w-4 h-4 text-emerald-200" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>
                  {todayRecord
                    ? `مسجل حضور مسبقاً (${todayRecord.checkInTime})`
                    : isCameraVerified
                    ? 'تأكيد بداية الدوام (حضور)'
                    : 'تسجيل بداية الدوام (يلزم مسح الـ QR أولاً)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleAttendanceAction('check_out')}
                disabled={!todayRecord || Boolean(todayRecord?.checkOutTime)}
                className={`py-3.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer ${
                  !todayRecord || Boolean(todayRecord?.checkOutTime)
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : isCameraVerified
                    ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-red-600/20 hover:shadow-md'
                    : 'bg-red-800/80 hover:bg-red-800 text-red-100 border border-red-600/40'
                }`}
              >
                {!isCameraVerified && todayRecord && !todayRecord.checkOutTime ? (
                  <Lock className="w-4 h-4 text-red-200" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span>
                  {todayRecord?.checkOutTime
                    ? `أتم الانصراف اليوم (${todayRecord.checkOutTime})`
                    : !todayRecord
                    ? 'تسجيل نهاية الدوام (انصراف)'
                    : isCameraVerified
                    ? 'تأكيد نهاية الدوام (انصراف)'
                    : 'تسجيل انصراف (يلزم مسح الـ QR أولاً)'}
                </span>
              </button>
            </div>

            {/* Leave & Departure Request Toolbar (Request Feature) */}
            <div className="pt-4 mt-2 border-t border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>خدمات الموظف الذاتية (الإجازات والمغادرات):</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  تُرفع الطلبات مباشرة لسجل الدوام لموافقة الإدارة
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRequestLeavePrivacyCheck('departure')}
                    className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-bold text-slate-800 bg-white hover:bg-amber-50/50 border-2 border-amber-300 hover:border-amber-400 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
                  >
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>طلب مغادرة ساعية</span>
                    <Lock className="w-3 h-3 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRequestLeavePrivacyCheck('leave')}
                    className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-bold text-slate-800 bg-white hover:bg-indigo-50/50 border-2 border-indigo-300 hover:border-indigo-400 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
                  >
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span>طلب إجازة عمل</span>
                    <Lock className="w-3 h-3 text-slate-400" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleInquiryPrivacyCheck}
                  className="px-4 py-2.5 text-xs font-bold text-emerald-950 bg-emerald-100/90 hover:bg-emerald-200 border-2 border-emerald-300 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
                >
                  <Search className="w-4 h-4 text-emerald-700" />
                  <span>استعلام عن طلباتي ومتابعة حالتها (خاص 🔒)</span>
                  {verifiedEmployeeForPrivacy && activeEmployeePendingCount > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                      {activeEmployeePendingCount} معلق
                    </span>
                  )}
                </button>
              </div>

              {/* Status Indicator: Protected by PIN Privacy */}
              {verifiedEmployeeForPrivacy ? (
                <div className="p-3 rounded-2xl border text-[11px] flex items-center justify-between gap-3 bg-emerald-50/80 border-emerald-200">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                    <span className="font-bold text-emerald-950">
                      🔒 جلسة خصوصية نشطة للموظف: {verifiedEmployeeForPrivacy.name} [{verifiedEmployeeForPrivacy.code}]
                    </span>
                    {activeEmployeeLatestRequest ? (
                      <span className="text-slate-700">
                        · آخر طلب لك: <strong>{activeEmployeeLatestRequest.type === 'departure' ? 'مغادرة ساعية' : 'إجازة'}</strong> ({activeEmployeeLatestRequest.startDate}) —{' '}
                        <span
                          className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            activeEmployeeLatestRequest.status === 'approved'
                              ? 'bg-emerald-200 text-emerald-900'
                              : activeEmployeeLatestRequest.status === 'rejected'
                              ? 'bg-rose-200 text-rose-900'
                              : 'bg-amber-200 text-amber-900'
                          }`}
                        >
                          {activeEmployeeLatestRequest.status === 'approved'
                            ? '✓ مقبول ومعتمد'
                            : activeEmployeeLatestRequest.status === 'rejected'
                            ? '✕ مرفوض'
                            : '⏳ قيد المراجعة'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-500">· لا توجد طلبات مسجلة لك حالياً</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openInquiryModal(verifiedEmployeeForPrivacy)}
                      className="text-emerald-800 hover:text-emerald-950 font-bold underline cursor-pointer"
                    >
                      فتح السجل ↗
                    </button>
                    <button
                      type="button"
                      onClick={handleLockPrivacySession}
                      className="px-2.5 py-1 text-[10px] font-bold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg cursor-pointer"
                    >
                      قفل الخصوصية ✕
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl border text-xs flex items-center justify-between gap-3 bg-slate-50 border-slate-200 text-slate-600">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-800 block text-xs">
                        🔒 خصوصية الموظف وسرية الطلبات محمية برمز PIN
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        لا يمكن لأي موظف أو زميل الاطلاع على طلباتك أو أسبابها إلا بإدخال رمز PIN السري الخاص بك.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleInquiryPrivacyCheck}
                    className="px-3.5 py-1.5 text-xs font-bold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer shrink-0 shadow-2xs flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5 text-emerald-600" />
                    <span>تسجيل الدخول لسجلي 🔒</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Admin Portal Active View */}
      {activePortal === 'admin' && (
        <div className="space-y-4 max-w-3xl mx-auto">
          {/* Sub Navigation Bar for Admin Portal */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <button
              type="button"
              onClick={() => setActivePortal('selection')}
              className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-700" />
              <span>العودة لاختيار البوابة ↩</span>
            </button>

            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-700" />
              <span className="text-xs sm:text-sm font-bold text-slate-800">
                القسم الثاني: بوابة دخول الإدارة والمحاسبة
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActivePortal('employee')}
              className="px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>الانتقال لبوابة الموظف (QR) ←</span>
            </button>
          </div>

          {/* ========================================================== */}
          {/* SECTION 2: MANAGEMENT & ADMIN LOGIN PORTAL                 */}
          {/* ========================================================== */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          {/* Section 2 Header */}
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                ٢
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  القسم الثاني: بوابة دخول الإدارة
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  خاص بالإدارة والمحاسبة لمتابعة الفروع، السلف، الرواتب والصلاحيات
                </p>
              </div>
            </div>
          </div>

          {!isAuthenticated ? (
            /* Login Form */
            <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
                سجل الدخول باستخدام حسابك الإداري المعتمد أو اختر أحد الحسابات التجريبية أدناه للتقييم.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  اسم المستخدم الإداري
                </label>
                <input
                  type="text"
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="أدخل اسم المستخدم (مثال: admin)"
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="أدخل كلمة المرور..."
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900 bg-white pl-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <Lock className="w-4 h-4" />
                <span>دخول لوحة التحكم الإدارية</span>
              </button>
            </form>
          ) : (
            /* Logged-In User Profile & Quick Jump Panel */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-700" />
                    <span className="text-sm font-bold text-emerald-950">
                      {currentUser?.name || 'مستخدم إداري'}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800">
                    الدور: {currentUser?.role === 'admin' ? 'مدير عام للنظام' : currentUser?.role === 'hr' ? 'مسؤول شؤون موظفين' : 'محاسب مالي'}
                    {currentUser?.isAdmin && ' (كامل الصلاحيات الإدارية)'}
                  </p>
                  <p className="text-[11px] text-emerald-700 font-mono">
                    اسم الدخول: {currentUser?.username}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  className="px-2.5 py-1 text-xs font-semibold text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                >
                  تسجيل خروج
                </button>
              </div>

              {/* Navigation Jump Buttons based on Permissions */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700">
                  الانتقال المباشر للأقسام الإدارية المصرح بها:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigateToSection('attendance')}
                    className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-right cursor-pointer transition-all"
                  >
                    <div className="font-bold text-xs text-slate-900">سجل الدوام والحضور</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      متابعة أوقات الحضور والانصراف بـ QR
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateToSection('employees')}
                    className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-right cursor-pointer transition-all"
                  >
                    <div className="font-bold text-xs text-slate-900">شؤون الموظفين والفروع</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      إدارة الفروع، رموز QR، وربط الأجهزة
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateToSection('withdrawals')}
                    className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-right cursor-pointer transition-all"
                  >
                    <div className="font-bold text-xs text-slate-900">سلف الموظفين</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      إضافة، تعديل وحذف السلف اليومية والطارئة
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateToSection('payroll')}
                    className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-right cursor-pointer transition-all"
                  >
                    <div className="font-bold text-xs text-slate-900">مسير الرواتب</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      إدخال الراتب الإجمالي والصرف
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateToSection('expenses')}
                    className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-right cursor-pointer transition-all"
                  >
                    <div className="font-bold text-xs text-slate-900">مصروفات الفروع</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      مصاريف التشغيل بالدينار الأردني
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateToSection('permissions')}
                    className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-right cursor-pointer transition-all"
                  >
                    <div className="font-bold text-xs text-emerald-950 flex items-center gap-1">
                      <span>إدارة المستخدمين والصلاحيات</span>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <div className="text-[11px] text-emerald-700 mt-0.5">
                      منح أو حظر الصلاحيات لكل مستخدم
                    </div>
                  </button>
                </div>
              </div>

              {/* Database & Backup Management Tools (Request) */}
              {canManageBackup && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-slate-800">
                        إدارة النسخ الاحتياطية وتصدير البيانات:
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {db.employees.length} موظف · {db.branches.length} فروع
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => downloadDatabaseBackup(db)}
                      className="p-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer text-center"
                      title="تحميل نسخة احتياطية لقاعدة البيانات (JSON)"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>نسخة احتياطية</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenRestoreModal?.()}
                      className="p-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer text-center"
                      title="استعادة نسخة احتياطية سابقة لقاعدة البيانات"
                    >
                      <Upload className="w-4 h-4 text-amber-600" />
                      <span>استعادة نسخة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => exportDatabaseToExcel(db)}
                      className="p-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer text-center"
                      title="تصدير قاعدة البيانات الشاملة إلى ملف إكسل (Excel / XLS)"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>تصدير إكسل</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Password change reminder */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>هل ترغب بتغيير بيانات الدخول الرئيسية؟</span>
                <button
                  type="button"
                  onClick={onOpenCredentialsModal}
                  className="text-emerald-700 font-bold hover:underline cursor-pointer"
                >
                  تغيير كلمة المرور
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* In-page Portal Selection Cards (when activePortal === 'selection') */}
      {activePortal === 'selection' && (
        <div className="max-w-4xl mx-auto space-y-6 py-2">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs text-center space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              منظومة الرقابة الإدارية والدوام السحابي الموحد
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              بوابة الدخول الرئيسية الموحدة
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
              تم تقسيم النظام إلى قسمين منفصلين لسهولة وسرعة الوصول: بوابة دوام الموظفين، وبوابة الإدارة والمحاسبة.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 text-right">
              {/* Card 1: Employees */}
              <button
                type="button"
                onClick={() => setActivePortal('employee')}
                className="p-6 rounded-2xl border-2 border-emerald-300 hover:border-emerald-600 bg-linear-to-b from-white to-emerald-50/30 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between text-right"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">القسم الأول</span>
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                      <QrCode className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-slate-900">تسجيل دوام الموظفين</h3>
                  <p className="text-xs text-slate-600">تسجيل بداية ونهاية الدوام اليومي عبر مسح كود QR الفرع أو التقاط صورة له بالكاميرا.</p>
                </div>
                <div className="pt-4 mt-2 border-t border-emerald-100 flex items-center justify-between text-xs font-bold text-emerald-700">
                  <span>فتح بوابة دوام الموظفين (حضور / انصراف)</span>
                  <ArrowLeft className="w-4 h-4" />
                </div>
              </button>

              {/* Card 2: Admin */}
              <button
                type="button"
                onClick={() => setActivePortal('admin')}
                className="p-6 rounded-2xl border-2 border-slate-300 hover:border-slate-800 bg-linear-to-b from-white to-slate-50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between text-right"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 bg-slate-200 px-2.5 py-0.5 rounded-full">القسم الثاني</span>
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-slate-900">دخول الإدارة والمحاسبة</h3>
                  <p className="text-xs text-slate-600">متابعة الفروع، السلف، مسير الرواتب والمصروفات والصلاحيات للإدارة والمشرفين.</p>
                </div>
                <div className="pt-4 mt-2 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-900">
                  <span>فتح لوحة تحكم الإدارة</span>
                  <ArrowLeft className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* LEAVE & DEPARTURE REQUEST SUBMISSION MODAL                       */}
      {/* ================================================================ */}
      {showLeaveRequestModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  {reqType === 'departure' ? (
                    <Clock className="w-5 h-5 text-amber-600" />
                  ) : (
                    <Calendar className="w-5 h-5 text-indigo-600" />
                  )}
                  <span>
                    {reqType === 'departure'
                      ? 'تقديم طلب مغادرة ساعية أثناء الدوام'
                      : 'تقديم طلب إجازة عمل رسمية'}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  سيتم إرسال طلبك فوراً إلى سجل دوام الإدارة للمراجعة والموافقة
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowLeaveRequestModal(false);
                  setReqFeedback(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {reqFeedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  reqFeedback.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border border-red-200 text-red-900'
                }`}
              >
                {reqFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{reqFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleSubmitLeaveRequest} className="space-y-4">
              {/* Verified Employee Identity Lock (Privacy Guaranteed) */}
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold shadow-xs">
                    <Lock className="w-5 h-5 text-emerald-200" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      الموظف مقدم الطلب: <strong className="text-emerald-950 font-black">{verifiedEmployeeForPrivacy?.name}</strong>
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {verifiedEmployeeForPrivacy?.jobTitle} [{verifiedEmployeeForPrivacy?.code}] · {db.branches.find((b) => b.id === verifiedEmployeeForPrivacy?.branchId)?.name || 'الفرع'}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-800 bg-white px-2.5 py-1 rounded-full border border-emerald-300 shadow-2xs shrink-0">
                  ✓ هوية موثقة برمز PIN
                </span>
              </div>

              {/* Request Type Toggle */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  نوع الطلب *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReqType('departure')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      reqType === 'departure'
                        ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>مغادرة ساعية (أثناء الدوام)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReqType('leave')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      reqType === 'leave'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-950 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span>إجازة عمل (يومية / متعددة)</span>
                  </button>
                </div>
              </div>

              {/* Conditional: Departure Inputs */}
              {reqType === 'departure' ? (
                <div className="bg-amber-50/50 border border-amber-200/80 rounded-2xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                    <span>تفاصيل المغادرة الساعية:</span>
                    <span className="font-mono text-amber-800">
                      المدة المقدرة: {reqDurationHours} ساعة
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      تاريخ المغادرة *
                    </label>
                    <input
                      type="date"
                      required
                      value={reqStartDate}
                      onChange={(e) => setReqStartDate(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-xl bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        وقت الخروج (البدء) *
                      </label>
                      <input
                        type="time"
                        required
                        value={reqStartTime}
                        onChange={(e) => handleStartTimeChange(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        وقت العودة (الانتهاء) *
                      </label>
                      <input
                        type="time"
                        required
                        value={reqEndTime}
                        onChange={(e) => handleEndTimeChange(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      عدد ساعات المغادرة *
                    </label>
                    <input
                      type="number"
                      min="0.25"
                      step="0.25"
                      required
                      value={reqDurationHours}
                      onChange={(e) => setReqDurationHours(Number(e.target.value) || 1)}
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                </div>
              ) : (
                /* Conditional: Leave Inputs */
                <div className="bg-indigo-50/50 border border-indigo-200/80 rounded-2xl p-3.5 space-y-3">
                  <div className="text-xs font-bold text-indigo-950">تفاصيل إجازة العمل:</div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      تصنيف الإجازة *
                    </label>
                    <select
                      value={reqCategory}
                      onChange={(e) => setReqCategory(e.target.value as LeaveCategory)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white font-medium"
                    >
                      <option value="annual">إجازة سنوية اعتيادية</option>
                      <option value="sick">إجازة مرضية (تقرير طبي)</option>
                      <option value="emergency">إجازة طارئة</option>
                      <option value="personal">إجازة شخصية / بدون راتب</option>
                      <option value="official_work">مهمة عمل رسمية خارجية</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        من تاريخ (بداية الإجازة) *
                      </label>
                      <input
                        type="date"
                        required
                        value={reqStartDate}
                        onChange={(e) => setReqStartDate(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-xl bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        إلى تاريخ (نهاية الإجازة) *
                      </label>
                      <input
                        type="date"
                        required
                        value={reqEndDate}
                        onChange={(e) => setReqEndDate(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Reason for Leave / Departure */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  سبب {reqType === 'departure' ? 'المغادرة' : 'الإجازة'} بالتفصيل *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  placeholder={
                    reqType === 'departure'
                      ? 'مثال: مراجعة دائرة حكومية عاجلة / ظرف صحي طارئ...'
                      : 'مثال: إجازة سنوية للسفر / ظرف عائلي خاص...'
                  }
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-white resize-none"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  يظهر طلبك فوراً للمدير المسؤول في «سجل الدوام المركزي» للموافقة أو الرفض. يمكنك متابعة حالة الطلب في أي وقت عبر زر «استعلام عن طلباتي».
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLeaveRequestModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>إرسال الطلب للإدارة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* EMPLOYEE LEAVE & DEPARTURE INQUIRY MODAL (استعلام الموظف)       */}
      {/* ================================================================ */}
      {showInquiryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-auto max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    استعلام عن طلبات الإجازات والمغادرات ومتابعة حالتها
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    الاستعلام المباشر عن موافقة أو رفض الإدارة لطلباتك
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInquiryModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Private Verified Employee Session Bar (Strict Privacy) */}
            <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                  <Lock className="w-5 h-5 text-emerald-200" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-emerald-950">
                      سجل الموظف الخاص: {verifiedEmployeeForPrivacy?.name}
                    </span>
                    <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-800 font-bold">
                      {verifiedEmployeeForPrivacy?.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    🔒 جلسة خاصة ومحمية برمز PIN — لا تظهر إلا طلباتك الشخصية حصرياً
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setShowInquiryModal(false);
                    openNewRequestModal('departure', verifiedEmployeeForPrivacy);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-amber-950 bg-amber-100/90 hover:bg-amber-200 rounded-xl flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>+ طلب مغادرة</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInquiryModal(false);
                    openNewRequestModal('leave', verifiedEmployeeForPrivacy);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-indigo-950 bg-indigo-100/90 hover:bg-indigo-200 rounded-xl flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <Calendar className="w-3.5 h-3.5 text-indigo-700" />
                  <span>+ طلب إجازة</span>
                </button>
                <button
                  type="button"
                  onClick={handleLockPrivacySession}
                  className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 border border-rose-300 rounded-xl flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  title="إنهاء الجلسة وقفل الخصوصية"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>قفل السجل ✕</span>
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 shrink-0 flex-wrap">
              <div className="flex items-center gap-1">
                {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => {
                  const label =
                    st === 'all'
                      ? 'جميع الحالات'
                      : st === 'pending'
                      ? 'قيد الانتظار ⏳'
                      : st === 'approved'
                      ? 'المقبولة ✓'
                      : 'المرفوضة ✕';
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setInquiryStatusFilter(st)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        inquiryStatusFilter === st
                          ? 'bg-slate-900 text-white font-bold'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 text-xs">
                {(['all', 'departure', 'leave'] as const).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setInquiryTypeFilter(tp)}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      inquiryTypeFilter === tp
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {tp === 'all' ? 'الكل' : tp === 'departure' ? 'مغادرات' : 'إجازات'}
                  </button>
                ))}
              </div>
            </div>

            {/* Requests List Area (Scrollable) */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {(() => {
                const filtered = activeEmployeeRequests.filter((r) => {
                  const matchStatus = inquiryStatusFilter === 'all' || r.status === inquiryStatusFilter;
                  const matchType = inquiryTypeFilter === 'all' || r.type === inquiryTypeFilter;
                  return matchStatus && matchType;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400 space-y-3">
                      <Clock className="w-10 h-10 mx-auto text-slate-300" />
                      <div className="text-sm font-medium">لا توجد طلبات مسجلة تطابق خيارات البحث</div>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto">
                        يمكنك تقديم طلب جديد لمغادرة ساعية أو إجازة عمل وسيقوم المسؤول بالرد عليها.
                      </p>
                    </div>
                  );
                }

                return filtered.map((req) => {
                  const isDeparture = req.type === 'departure';
                  const isPending = req.status === 'pending';
                  const isApproved = req.status === 'approved';
                  const isRejected = req.status === 'rejected';

                  return (
                    <div
                      key={req.id}
                      className={`p-4 rounded-2xl border transition-all space-y-2.5 ${
                        isApproved
                          ? 'border-emerald-300 bg-emerald-50/40'
                          : isRejected
                          ? 'border-red-300 bg-red-50/40'
                          : 'border-amber-300 bg-amber-50/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${
                              isDeparture
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                            }`}
                          >
                            {isDeparture ? (
                              <Clock className="w-3.5 h-3.5" />
                            ) : (
                              <Calendar className="w-3.5 h-3.5" />
                            )}
                            <span>{isDeparture ? 'مغادرة ساعية' : 'إجازة عمل'}</span>
                          </span>

                          <span className="font-mono text-xs font-bold text-slate-800">
                            {req.startDate}
                            {req.endDate && req.endDate !== req.startDate && ` إلى ${req.endDate}`}
                          </span>

                          {isDeparture && req.startTime && req.endTime && (
                            <span className="font-mono text-xs text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                              {req.startTime} - {req.endTime} ({req.durationHours || 1} ساعة)
                            </span>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {isApproved && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>تمت الموافقة والاعتماد ✓</span>
                            </span>
                          )}
                          {isRejected && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-600 text-white shadow-2xs">
                              <X className="w-3.5 h-3.5" />
                              <span>تم الرفض من الإدارة ✕</span>
                            </span>
                          )}
                          {isPending && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500 text-white shadow-2xs animate-pulse">
                              <Clock className="w-3.5 h-3.5" />
                              <span>قيد الانتظار والمراجعة ⏳</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Reason Description */}
                      <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200/80 text-xs">
                        <span className="font-semibold text-slate-600 ml-1">سبب الطلب:</span>
                        <span className="text-slate-900 leading-relaxed font-medium">{req.reason}</span>
                      </div>

                      {/* Management Review Info & Notes */}
                      {(req.adminNote || req.reviewedBy) && (
                        <div
                          className={`p-2.5 rounded-xl text-xs space-y-0.5 border ${
                            isApproved
                              ? 'bg-emerald-100/70 border-emerald-300 text-emerald-950'
                              : 'bg-red-100/70 border-red-300 text-red-950'
                          }`}
                        >
                          <div className="font-bold flex items-center justify-between">
                            <span>رد وقرار الإدارة:</span>
                            {req.reviewedBy && (
                              <span className="text-[11px] font-normal">
                                المسؤول: <strong>{req.reviewedBy}</strong>
                              </span>
                            )}
                          </div>
                          {req.adminNote && (
                            <p className="text-[11px] leading-relaxed mt-0.5">{req.adminNote}</p>
                          )}
                        </div>
                      )}

                      {/* Cancel pending request action */}
                      {isPending && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-amber-700">
                            الطلب معلق حالياً في سجل دوام الإدارة بانتظار اتخاذ القرار
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCancelPendingRequest(req.id)}
                            className="text-xs text-red-600 hover:text-red-800 font-bold underline cursor-pointer"
                          >
                            إلغاء وسحب الطلب
                          </button>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer with Privacy Logout Button */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={handleLockPrivacySession}
                className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>قفل الخصوصية وتسجيل الخروج</span>
              </button>

              <button
                type="button"
                onClick={() => setShowInquiryModal(false)}
                className="px-5 py-2 text-xs font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800 cursor-pointer shadow-xs"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* EMPLOYEE PRIVACY AUTHENTICATION MODAL (التحقق الأمني برمز الـ PIN) */}
      {/* ================================================================ */}
      {showPrivacyAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5 my-auto relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-2 bg-linear-to-r from-emerald-600 via-teal-500 to-emerald-700" />

            <div className="flex items-start justify-between border-b border-slate-100 pb-3 pt-1">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    التحقق الأمني لخصوصية الموظف
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    حماية خصوصية الإجازات والمغادرات برمز PIN الشخصي
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPrivacyAuthModal(false);
                  setPrivacyPinError(null);
                  setPrivacyPinInput('');
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                حفاظاً على سرية بياناتك وأسبابك الشخصية وملاحظات الإدارة، يشترط النظام إدخال رمز PIN السري الخاص بك للاستعلام عن طلباتك أو تقديم طلب جديد.
              </p>
            </div>

            {privacyPinError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-bold">{privacyPinError}</span>
              </div>
            )}

            <form onSubmit={handleVerifyPrivacyPin} className="space-y-4">
              {/* Employee Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ١. اختر اسم الموظف:
                </label>
                <select
                  value={privacyAuthEmpId}
                  onChange={(e) => {
                    setPrivacyAuthEmpId(e.target.value);
                    setPrivacyPinError(null);
                  }}
                  required
                  className="w-full px-3.5 py-2.5 text-xs font-semibold border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-emerald-600"
                >
                  <option value="">-- اضغط لاختيار اسمك من القائمة --</option>
                  {db.employees.map((emp) => {
                    const empBranch = db.branches.find((b) => b.id === emp.branchId);
                    return (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} [{emp.code}] · {empBranch?.name || 'الفرع'}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Secret PIN Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>٢. أدخل رمز PIN السري الخاص بك:</span>
                  <span className="text-[11px] font-normal text-slate-400">رمز مكون من ٤ أرقام</span>
                </label>
                <div className="relative">
                  <input
                    type={showPrivacyPinPassword ? 'text' : 'password'}
                    required
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                    placeholder="••••"
                    value={privacyPinInput}
                    onChange={(e) => {
                      setPrivacyPinInput(e.target.value);
                      setPrivacyPinError(null);
                    }}
                    className="w-full px-3.5 py-2.5 text-center text-lg font-mono font-bold tracking-widest border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPrivacyPinPassword(!showPrivacyPinPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showPrivacyPinPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                💡 <strong>ملاحظة هامة:</strong> إذا نسيت رمز PIN السري الخاص بك، يرجى مراجعة مسؤول الفرع أو إدارة شؤون الموظفين لتزويدك به فوراً.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowPrivacyAuthModal(false);
                    setPrivacyPinError(null);
                    setPrivacyPinInput('');
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <Lock className="w-4 h-4" />
                  <span>تحقق والدخول إلى سجلي الخاص 🔒</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const HomePage = React.memo(HomePageComponent);
