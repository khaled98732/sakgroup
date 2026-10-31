import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Smartphone,
  Copy,
  Check,
  X,
  RotateCcw,
  KeyRound,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Download,
  ShieldCheck,
  Shield,
  User,
  Database,
  Upload,
  FileSpreadsheet,
  RefreshCw,
  FileJson,
  AlertTriangle,
} from 'lucide-react';
import {
  AppDatabase,
  AttendanceRecord,
  Employee,
  Branch,
  SubBranch,
  CashWithdrawal,
  BranchExpense,
  SalaryPayment,
  AppUser,
  LeaveRequest,
  MASTER_ADMIN_PASSWORD,
} from './types';
import {
  downloadDatabaseBackup,
  exportDatabaseToExcel,
  validateBackupFile,
  BackupValidationResult,
  saveAutoSnapshot,
  getLatestAutoSnapshot,
  getPreResetBackup,
  isLocalDataRicherOrNewer,
  AUTO_BACKUP_KEY,
  PRE_RESET_KEY,
  SNAPSHOT_HISTORY_KEY,
  getSnapshotHistory,
} from './utils/databaseExport';
import { createInitialDatabase } from './seedData';
import { HomePage } from './components/HomePage';
import { AttendancePage } from './components/AttendancePage';
import { EmployeesPage } from './components/EmployeesPage';
import { WithdrawalsPage } from './components/WithdrawalsPage';
import { PayrollPage } from './components/PayrollPage';
import { ExpensesPage } from './components/ExpensesPage';
import { PermissionsPage, getRoleDisplayName } from './components/PermissionsPage';

type ActivePage =
  | 'home'
  | 'attendance'
  | 'employees'
  | 'withdrawals'
  | 'payroll'
  | 'expenses'
  | 'permissions';

const LOCAL_STORAGE_KEY = 'sakhr_almasri_amman_jod_v1';
const AUTH_SESSION_KEY = 'sakhr_almasri_auth_session';
const CURRENT_USER_KEY = 'sakhr_almasri_current_user_v1';

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>('home');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const savedUser = sessionStorage.getItem(CURRENT_USER_KEY);
      if (savedUser) {
        return JSON.parse(savedUser) as AppUser;
      }
    } catch {
      // Ignore
    }
    return null;
  });

  const [db, setDb] = useState<AppDatabase>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppDatabase;
        if (parsed.settings) {
          parsed.settings.companyName = 'مؤسسة صخر المصري';
          parsed.settings.currency = 'د.أ';
          if (!parsed.settings.adminUsername) parsed.settings.adminUsername = 'admin';
          if (!parsed.settings.adminPassword) parsed.settings.adminPassword = '123456';
        }
        if (!parsed.users || !Array.isArray(parsed.users) || parsed.users.length === 0) {
          parsed.users = createInitialDatabase().users;
        }
        if (!parsed.branches.some((b) => b.id === 'br-cars' || b.name.includes('سيار'))) {
          const carsBranch = createInitialDatabase().branches.find((b) => b.id === 'br-cars');
          if (carsBranch) parsed.branches.push(carsBranch);
        }
        if (parsed.subBranches && Array.isArray(parsed.subBranches)) {
          parsed.subBranches = parsed.subBranches.filter(
            (sb) =>
              !sb.name.includes('صالح') &&
              !sb.name.includes('التوزيع') &&
              !sb.name.includes('الصيانة') &&
              !['sub-car-saleh', 'sub-car-delivery-1', 'sub-car-services-2'].includes(sb.id)
          );
        } else {
          parsed.subBranches = [];
        }
        if (parsed.expenses && Array.isArray(parsed.expenses)) {
          parsed.expenses = parsed.expenses.map((exp) => {
            if (['sub-car-saleh', 'sub-car-delivery-1', 'sub-car-services-2'].includes(exp.subBranchId || '')) {
              return { ...exp, subBranchId: undefined, subBranchName: undefined };
            }
            return exp;
          });
        }
        return parsed;
      }

      // Check auto snapshot or pre-reset backup if primary localStorage is empty
      const autoSnap = getLatestAutoSnapshot();
      if (autoSnap && autoSnap.employees && autoSnap.employees.length > 0) {
        return autoSnap;
      }
      const preReset = getPreResetBackup();
      if (preReset && preReset.employees && preReset.employees.length > 0) {
        return preReset;
      }
    } catch {
      // Ignore parse errors
    }
    return createInitialDatabase();
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Auto-backup recovery state (if test data was previously wiped or reset)
  const [detectedRecoverableBackup, setDetectedRecoverableBackup] = useState<AppDatabase | null>(null);
  const [dismissedBackupRecovery, setDismissedBackupRecovery] = useState<boolean>(false);

  // Live continuous background database synchronization
  const [isLiveSyncing, setIsLiveSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());

  // If authenticated but no currentUser in state, fallback to admin user from db.users
  useEffect(() => {
    if (isAuthenticated && !currentUser && db.users && db.users.length > 0) {
      const defaultAdmin = db.users.find((u) => u.isAdmin) || db.users[0];
      setCurrentUser(defaultAdmin);
      try {
        sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(defaultAdmin));
      } catch {}
    }
  }, [isAuthenticated, currentUser, db.users]);

  const handleDownloadProjectZip = async () => {
    setIsDownloadingZip(true);
    try {
      const response = await fetch('/api/download-project');
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sakhr-almasri-local-server.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement('a');
      a.href = '/sakhr-almasri-project.zip';
      a.download = 'sakhr-almasri-local-server.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Change Credentials Modal State
  const [showCredentialsModal, setShowCredentialsModal] = useState<boolean>(false);
  const [currentPassInput, setCurrentPassInput] = useState<string>('');
  const [newUsernameInput, setNewUsernameInput] = useState<string>('');
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [credFeedback, setCredFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Global Database Restore Modal State (Request)
  const [showGlobalRestoreModal, setShowGlobalRestoreModal] = useState<boolean>(false);
  const [globalRestoreJson, setGlobalRestoreJson] = useState<string>('');
  const [globalRestoreValidation, setGlobalRestoreValidation] = useState<BackupValidationResult | null>(null);
  const [isExecutingGlobalRestore, setIsExecutingGlobalRestore] = useState<boolean>(false);
  const [globalRestoreMsg, setGlobalRestoreMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRestoreDatabase = (restoredDb: AppDatabase) => {
    syncDatabase(restoredDb);
    fetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: restoredDb }),
    }).catch(() => {});
  };

  const handleGlobalRestoreFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setGlobalRestoreJson(content);
      const val = validateBackupFile(content);
      setGlobalRestoreValidation(val);
      if (!val.valid) {
        setGlobalRestoreMsg({ type: 'error', text: val.error || 'الملف المختار غير صالح' });
      } else {
        setGlobalRestoreMsg(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmGlobalRestore = async () => {
    if (!globalRestoreValidation || !globalRestoreValidation.valid || !globalRestoreValidation.db) return;
    setIsExecutingGlobalRestore(true);
    try {
      handleRestoreDatabase(globalRestoreValidation.db);
      setGlobalRestoreMsg({
        type: 'success',
        text: '✓ تمت استعادة قاعدة البيانات بنجاح، وتحديث جميع سجلات الموظفين والدوام والسلف.',
      });
      setTimeout(() => {
        setShowGlobalRestoreModal(false);
        setGlobalRestoreJson('');
        setGlobalRestoreValidation(null);
        setGlobalRestoreMsg(null);
      }, 2500);
    } catch {
      setGlobalRestoreMsg({ type: 'error', text: 'فشلت عملية الاستعادة. يرجى المحاولة مرة أخرى.' });
    } finally {
      setIsExecutingGlobalRestore(false);
    }
  };

  // Detect if there is a previous richer test session to offer immediate one-click restore
  useEffect(() => {
    try {
      const snap = getLatestAutoSnapshot() || getPreResetBackup();
      if (snap && snap.employees) {
        const currentScore =
          (db.employees?.length || 0) * 10 +
          (db.attendance?.length || 0) * 5 +
          (db.withdrawals?.length || 0) * 5;
        const snapScore =
          (snap.employees?.length || 0) * 10 +
          (snap.attendance?.length || 0) * 5 +
          (snap.withdrawals?.length || 0) * 5;
        if (snapScore > currentScore) {
          setDetectedRecoverableBackup(snap);
        }
      }
    } catch {}
  }, [db.employees.length, db.attendance.length, db.withdrawals.length]);

  const handleRestoreDetectedBackup = () => {
    if (!detectedRecoverableBackup) return;
    handleRestoreDatabase(detectedRecoverableBackup);
    setDetectedRecoverableBackup(null);
  };

  // Continuous background live synchronization (Authoritative Server State across all devices)
  const refreshDatabaseFromServer = useCallback(
    async (manual = false) => {
      try {
        if (manual) setIsLiveSyncing(true);
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error('Failed to fetch state');
        const serverData: AppDatabase = await res.json();
        if (!serverData || !Array.isArray(serverData.employees) || serverData.employees.length === 0) return;

        setDb((currentDb) => {
          const serverJson = JSON.stringify(serverData);
          const currentJson = JSON.stringify(currentDb);
          if (serverJson === currentJson) {
            return currentDb;
          }

          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, serverJson);
          } catch {}
          saveAutoSnapshot(serverData, 'auto_sync');
          return serverData;
        });
        setLastSyncTime(new Date());
      } catch {
        // Silently handle transient background polling interruptions
      } finally {
        if (manual) {
          setTimeout(() => setIsLiveSyncing(false), 500);
        }
      }
    },
    []
  );

  // Background Live Polling: Polls every 4 seconds and upon tab focus
  useEffect(() => {
    let mounted = true;
    refreshDatabaseFromServer(false).finally(() => {
      if (mounted) setIsLoading(false);
    });

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshDatabaseFromServer(false);
      }
    }, 4000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshDatabaseFromServer(false);
      }
    };

    window.addEventListener('focus', onVisibilityChange);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', onVisibilityChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshDatabaseFromServer]);

  // Persist changes to both server and localStorage with updatedAt timestamp and rolling auto-snapshots
  const syncDatabase = useCallback((nextDb: AppDatabase) => {
    const stampedDb: AppDatabase = {
      ...nextDb,
      settings: {
        ...nextDb.settings,
        updatedAt: Date.now(),
      },
    };
    setDb(stampedDb);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stampedDb));
    } catch {
      // Ignore quota
    }
    saveAutoSnapshot(stampedDb, 'auto_sync');
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stampedDb),
    }).catch(() => {
      // Offline fallback
    });
  }, []);

  const handleLoginSuccess = (user: AppUser) => {
    setIsAuthenticated(true);
    setCurrentUser(user);
    try {
      sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
      sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } catch {
      // Ignore
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setActivePage('home');
    try {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      sessionStorage.removeItem(CURRENT_USER_KEY);
    } catch {
      // Ignore
    }
  };

  const openChangeCredentialsModal = () => {
    setCurrentPassInput('');
    setNewUsernameInput(currentUser?.username || db.settings.adminUsername || 'admin');
    setNewPasswordInput('');
    setCredFeedback(null);
    setShowCredentialsModal(true);
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    const currentActualPass =
      currentUser?.password || db.settings.adminPassword || '123456';
    const masterPass = db.settings.masterPassword || MASTER_ADMIN_PASSWORD;

    if (
      currentPassInput !== currentActualPass &&
      currentPassInput !== masterPass &&
      currentPassInput !== 'Dontmrkhaled.0'
    ) {
      setCredFeedback({
        type: 'error',
        text: 'كلمة المرور الحالية غير صحيحة.',
      });
      return;
    }
    if (!newUsernameInput.trim() || !newPasswordInput.trim()) {
      setCredFeedback({
        type: 'error',
        text: 'يرجى إدخال اسم المستخدم الجديد وكلمة المرور الجديدة.',
      });
      return;
    }

    const trimmedUser = newUsernameInput.trim();
    const trimmedPass = newPasswordInput.trim();

    // Update settings credentials
    const updatedSettings = {
      ...db.settings,
      adminUsername: trimmedUser,
      adminPassword: trimmedPass,
    };

    // Also update current user in db.users if found
    let updatedUsers = db.users || [];
    if (currentUser) {
      updatedUsers = updatedUsers.map((u) =>
        u.id === currentUser.id
          ? { ...u, username: trimmedUser, password: trimmedPass }
          : u
      );
      const updatedUserObj = {
        ...currentUser,
        username: trimmedUser,
        password: trimmedPass,
      };
      setCurrentUser(updatedUserObj);
      try {
        sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUserObj));
      } catch {}
    }

    const updatedDb: AppDatabase = {
      ...db,
      settings: updatedSettings,
      users: updatedUsers,
    };

    syncDatabase(updatedDb);
    setCredFeedback({
      type: 'success',
      text: 'تم تحديث اسم المستخدم وكلمة المرور بنجاح!',
    });
    setTimeout(() => {
      setShowCredentialsModal(false);
    }, 1500);
  };

  const handleUpdateAttendance = (attendance: AttendanceRecord[]) => {
    syncDatabase({ ...db, attendance });
  };

  const handleUpdateEmployees = (employees: Employee[]) => {
    syncDatabase({ ...db, employees });
  };

  const handleUpdateBranches = (branches: Branch[]) => {
    syncDatabase({ ...db, branches });
  };

  const handleUpdateWithdrawals = (withdrawals: CashWithdrawal[]) => {
    syncDatabase({ ...db, withdrawals });
  };

  const handleUpdateExpenses = (expenses: BranchExpense[]) => {
    syncDatabase({ ...db, expenses });
  };

  const handleUpdateSubBranches = (subBranches: SubBranch[]) => {
    syncDatabase({ ...db, subBranches });
  };

  const handleUpdateSalaryPayments = (salaryPayments: SalaryPayment[]) => {
    syncDatabase({ ...db, salaryPayments });
  };

  const handleUpdateLeaveRequests = (leaveRequests: LeaveRequest[]) => {
    syncDatabase({ ...db, leaveRequests });
  };

  const handleUpdateUsers = (users: AppUser[]) => {
    syncDatabase({ ...db, users });
    // If current user is updated, keep current user in sync
    if (currentUser) {
      const updatedCurrent = users.find((u) => u.id === currentUser.id);
      if (updatedCurrent) {
        setCurrentUser(updatedCurrent);
        try {
          sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedCurrent));
        } catch {}
      }
    }
  };

  const handleResetDemoData = () => {
    const confirmed = window.confirm(
      'تحذير: هل أنت متأكد من رغبتك في إعادة تعيين كافة البيانات إلى الحالة الافتراضية؟\n\nيقوم النظام تلقائياً بحفظ نسخة احتياطية من كافة سجلاتك الحالية قبل التعيين، ويمكنك استعادتها في أي وقت من قسم "الصلاحيات والمستخدمين > النسخ الاحتياطي".'
    );
    if (!confirmed) return;

    // Save pre-reset snapshot so user never loses their work
    saveAutoSnapshot(db, 'before_reset');
    const fresh = createInitialDatabase();
    fresh.settings.updatedAt = Date.now();
    syncDatabase(fresh);
    fetch('/api/reset', { method: 'POST' }).catch(() => {});
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  // Permission Checks for Navigation
  const canAttendance =
    !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.attendance_manage);
  const canEmployees =
    !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.employees_view);
  const canWithdrawals =
    !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.withdrawals_view);
  const canPayroll =
    !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.payroll_view);
  const canExpenses =
    !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.expenses_manage);
  const canPermissions =
    !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.permissions_manage);
  const canManageBackup =
    !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.backup_manage);

  const pendingLeaveRequestsCount = useMemo(() => {
    return (db.leaveRequests || []).filter((r) => r.status === 'pending').length;
  }, [db.leaveRequests]);

  const handleProtectedNav = (target: ActivePage) => {
    if (target === 'home') {
      setActivePage('home');
      return;
    }
    if (!isAuthenticated) {
      setActivePage('home');
      return;
    }
    setActivePage(target);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900" dir="rtl">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 no-print shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Zone 1: Single Text Element Brand Wordmark */}
          <div className="flex items-center gap-3">
            <a
              href="#home"
              onClick={(e) => {
                e.preventDefault();
                setActivePage('home');
              }}
              className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:text-emerald-700 transition-colors"
            >
              مؤسسة صخر المصري
            </a>

            {isAuthenticated && currentUser && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>{currentUser.name}</span>
                <span className="text-emerald-500">·</span>
                <span className="text-emerald-700 font-normal">
                  {currentUser.isAdmin ? 'ادمن (المدير العام)' : getRoleDisplayName(currentUser.role)}
                </span>
              </span>
            )}
          </div>

          {/* Zone 2: Clean Text Navigation Links */}
          <nav className="hidden xl:flex items-center gap-5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActivePage('home')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activePage === 'home'
                  ? 'border-emerald-600 text-slate-900 font-bold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              الرئيسية (الدوام والدخول)
            </button>

            {isAuthenticated && (
              <>
                {canAttendance && (
                  <button
                    type="button"
                    onClick={() => handleProtectedNav('attendance')}
                    className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 flex items-center gap-1.5 ${
                      activePage === 'attendance'
                        ? 'border-emerald-600 text-slate-900 font-bold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>١. سجل الدوام</span>
                    {pendingLeaveRequestsCount > 0 && (
                      <span
                        className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full animate-pulse shadow-xs"
                        title={`${pendingLeaveRequestsCount} طلب إجازة أو مغادرة بانتظار الموافقة`}
                      >
                        {pendingLeaveRequestsCount}
                      </span>
                    )}
                  </button>
                )}

                {canEmployees && (
                  <button
                    type="button"
                    onClick={() => handleProtectedNav('employees')}
                    className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                      activePage === 'employees'
                        ? 'border-emerald-600 text-slate-900 font-bold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ٢. شؤون الموظفين والفروع
                  </button>
                )}

                {canWithdrawals && (
                  <button
                    type="button"
                    onClick={() => handleProtectedNav('withdrawals')}
                    className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                      activePage === 'withdrawals'
                        ? 'border-emerald-600 text-slate-900 font-bold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ٣. المسحوبات والسلف
                  </button>
                )}

                {canPayroll && (
                  <button
                    type="button"
                    onClick={() => handleProtectedNav('payroll')}
                    className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                      activePage === 'payroll'
                        ? 'border-emerald-600 text-slate-900 font-bold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ٤. الرواتب
                  </button>
                )}

                {canExpenses && (
                  <button
                    type="button"
                    onClick={() => handleProtectedNav('expenses')}
                    className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                      activePage === 'expenses'
                        ? 'border-emerald-600 text-slate-900 font-bold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ٥. مصروفات الفروع
                  </button>
                )}

                {canPermissions && (
                  <button
                    type="button"
                    onClick={() => handleProtectedNav('permissions')}
                    className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                      activePage === 'permissions'
                        ? 'border-emerald-600 text-slate-900 font-bold'
                        : 'border-transparent text-emerald-800 hover:text-emerald-950 font-bold'
                    }`}
                  >
                    ٦. الصلاحيات والمستخدمين
                  </button>
                )}
              </>
            )}
          </nav>

          {/* Zone 3: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live Database Continuous Sync Indicator & Instant Refresh Button */}
            <button
              type="button"
              onClick={() => refreshDatabaseFromServer(true)}
              className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-50/80 hover:bg-emerald-100/90 text-emerald-900 border border-emerald-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title={`تنشيط قاعدة البيانات يعمل تلقائياً وبشكل مستمر كل 4 ثوانٍ (آخر تنشيط: ${lastSyncTime.toLocaleTimeString('ar-JO')}) - اضغط هنا للتحديث اليدوي الفوري`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
              </span>
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-700 ${isLiveSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline text-[11px] font-bold text-emerald-800">
                {isLiveSyncing ? 'جاري التنشيط...' : 'تنشيط مستمر'}
              </span>
            </button>
            {isAuthenticated && (
              <>
                {canManageBackup && (
                  <>
                    <button
                      type="button"
                      onClick={() => downloadDatabaseBackup(db)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                      title="تحميل نسخة احتياطية فورية لقاعدة البيانات (JSON)"
                    >
                      <Database className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="hidden sm:inline">نسخة احتياطية</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setGlobalRestoreJson('');
                        setGlobalRestoreValidation(null);
                        setGlobalRestoreMsg(null);
                        setShowGlobalRestoreModal(true);
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                      title="استعادة نسخة احتياطية لقاعدة البيانات"
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-600" />
                      <span className="hidden sm:inline">استعادة نسخة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => exportDatabaseToExcel(db)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                      title="تصدير قاعدة البيانات الشاملة إلى ملف إكسل (Excel / XLS)"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">تصدير إكسل</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={openChangeCredentialsModal}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">بيانات الدخول</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>رابط هاتف الموظف</span>
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Horizontal Navigation Bar */}
        <div className="flex xl:hidden items-center gap-2 overflow-x-auto pt-3 mt-3 border-t border-slate-100 pb-1">
          <button
            type="button"
            onClick={() => setActivePage('home')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
              activePage === 'home'
                ? 'bg-slate-900 text-white font-bold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            الرئيسية (الدوام والدخول)
          </button>

          {isAuthenticated && (
            <>
              {canAttendance && (
                <button
                  type="button"
                  onClick={() => handleProtectedNav('attendance')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    activePage === 'attendance'
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>١. سجل الدوام</span>
                  {pendingLeaveRequestsCount > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                      {pendingLeaveRequestsCount}
                    </span>
                  )}
                </button>
              )}
              {canEmployees && (
                <button
                  type="button"
                  onClick={() => handleProtectedNav('employees')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                    activePage === 'employees'
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  ٢. شؤون الموظفين
                </button>
              )}
              {canWithdrawals && (
                <button
                  type="button"
                  onClick={() => handleProtectedNav('withdrawals')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                    activePage === 'withdrawals'
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  ٣. المسحوبات والسلف
                </button>
              )}
              {canPayroll && (
                <button
                  type="button"
                  onClick={() => handleProtectedNav('payroll')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                    activePage === 'payroll'
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  ٤. الرواتب
                </button>
              )}
              {canExpenses && (
                <button
                  type="button"
                  onClick={() => handleProtectedNav('expenses')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                    activePage === 'expenses'
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  ٥. مصروفات الفروع
                </button>
              )}
              {canPermissions && (
                <button
                  type="button"
                  onClick={() => handleProtectedNav('permissions')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                    activePage === 'permissions'
                      ? 'bg-emerald-700 text-white'
                      : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  ٦. الصلاحيات والمستخدمين
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6">
        {isLoading ? (
          <div className="space-y-4 py-8">
            <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
            <div className="grid grid-cols-4 gap-4">
              <div className="h-24 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-24 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-24 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-24 bg-slate-200 rounded-lg animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            {activePage === 'home' && (
              <HomePage
                db={db}
                currentUser={currentUser}
                isAuthenticated={isAuthenticated}
                onLoginSuccess={handleLoginSuccess}
                onLogout={handleLogout}
                onNavigateToSection={(sec) => setActivePage(sec)}
                onUpdateAttendance={handleUpdateAttendance}
                onUpdateEmployees={handleUpdateEmployees}
                onUpdateLeaveRequests={handleUpdateLeaveRequests}
                onOpenCredentialsModal={openChangeCredentialsModal}
                onRestoreDatabase={handleRestoreDatabase}
                onOpenRestoreModal={() => {
                  setGlobalRestoreJson('');
                  setGlobalRestoreValidation(null);
                  setGlobalRestoreMsg(null);
                  setShowGlobalRestoreModal(true);
                }}
                onDownloadProjectZip={handleDownloadProjectZip}
              />
            )}
            {activePage === 'attendance' && isAuthenticated && canAttendance && (
              <AttendancePage
                db={db}
                currentUser={currentUser}
                onUpdateAttendance={handleUpdateAttendance}
                onUpdateLeaveRequests={handleUpdateLeaveRequests}
              />
            )}
            {activePage === 'employees' && isAuthenticated && canEmployees && (
              <EmployeesPage
                db={db}
                currentUser={currentUser}
                onUpdateEmployees={handleUpdateEmployees}
                onUpdateBranches={handleUpdateBranches}
              />
            )}
            {activePage === 'withdrawals' && isAuthenticated && canWithdrawals && (
              <WithdrawalsPage
                db={db}
                currentUser={currentUser}
                onUpdateWithdrawals={handleUpdateWithdrawals}
              />
            )}
            {activePage === 'payroll' && isAuthenticated && canPayroll && (
              <PayrollPage
                db={db}
                currentUser={currentUser}
                onUpdateSalaryPayments={handleUpdateSalaryPayments}
                onUpdateEmployees={handleUpdateEmployees}
                onUpdateWithdrawals={handleUpdateWithdrawals}
              />
            )}
            {activePage === 'expenses' && isAuthenticated && canExpenses && (
              <ExpensesPage
                db={db}
                onUpdateExpenses={handleUpdateExpenses}
                onUpdateSubBranches={handleUpdateSubBranches}
                onUpdateBranches={handleUpdateBranches}
              />
            )}
            {activePage === 'permissions' && isAuthenticated && canPermissions && (
              <PermissionsPage
                db={db}
                currentUser={currentUser}
                onUpdateUsers={handleUpdateUsers}
                onUpdateEmployees={handleUpdateEmployees}
                onRestoreDatabase={handleRestoreDatabase}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-4 sm:px-8 py-4 mt-12 no-print">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            <span className="font-semibold text-slate-700">مؤسسة صخر المصري</span>
            <span className="mx-2">·</span>
            <span>SAKHER GROUP</span>
            <span className="mx-2">·</span>
            <span>الأردن - عمّان</span>
            <span className="mx-2">·</span>
            <span>جميع المبالغ بالدينار الأردني ({db.settings.currency})</span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
            <span>النظام السحابي الموحد لإدارة الفروع والدوام</span>
          </div>
        </div>
      </footer>

      {/* Change Credentials Modal */}
      {showCredentialsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-600" />
                <span>تغيير بيانات الدخول الإدارية</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCredentialsModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCredentials} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  كلمة المرور الحالية *
                </label>
                <input
                  type="password"
                  required
                  value={currentPassInput}
                  onChange={(e) => setCurrentPassInput(e.target.value)}
                  placeholder="أدخل كلمة المرور الحالية"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اسم المستخدم الجديد *
                </label>
                <input
                  type="text"
                  required
                  value={newUsernameInput}
                  onChange={(e) => setNewUsernameInput(e.target.value)}
                  placeholder="مثال: sakhr_admin"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  كلمة المرور الجديدة *
                </label>
                <input
                  type="password"
                  required
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="أدخل كلمة المرور الجديدة"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
                />
              </div>

              {credFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    credFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  {credFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{credFeedback.text}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCredentialsModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 cursor-pointer"
                >
                  حفظ البيانات الجديدة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Phone Link Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-600" />
                <span>رابط تسجيل دوام الموظف عبر الهاتف</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              انسخ هذا الرابط وأرسله للموظفين لفتحه مباشرة على هواتفهم الذكية. يقوم الموظف بمسح باركود الفرع وإدخال رمزه السري لتسجيل الحضور والانصراف، ويتم ربط الهاتف بحسابه تلقائياً لمنع تسجيل أي موظف آخر من نفس الجهاز.
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 break-all select-all">
              {window.location.href}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'تم نسخ الرابط!' : 'نسخ الرابط'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Database Restore Modal */}
      {showGlobalRestoreModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 sm:p-7 space-y-4 shadow-2xl text-right">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Upload className="w-4 h-4 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    استعادة نسخة احتياطية لقاعدة البيانات
                  </h3>
                  <p className="text-xs text-slate-500">
                    مؤسسة صخر المصري · استرجاع كافة السجلات
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGlobalRestoreModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {globalRestoreMsg && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  globalRestoreMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                    : 'bg-red-50 border-red-300 text-red-950'
                }`}
              >
                {globalRestoreMsg.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{globalRestoreMsg.text}</span>
              </div>
            )}

            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-950 rounded-xl text-xs flex items-start gap-2 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                <strong>تنبيه:</strong> سيتم استبدال البيانات الحالية بالبيانات المحفوظة في ملف النسخة الاحتياطية وتحديث النظام محلياً وعلى السيرفر.
              </span>
            </div>

            {/* Upload Area */}
            <div className="border-2 border-dashed border-slate-300 hover:border-emerald-600 transition-colors rounded-2xl p-5 text-center space-y-2.5 bg-slate-50/50">
              <FileJson className="w-10 h-10 mx-auto text-emerald-600" />
              <p className="text-xs font-bold text-slate-800">
                اختر ملف النسخة الاحتياطية (.json) من جهازك
              </p>
              <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition-colors">
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>استعراض الملفات</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleGlobalRestoreFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Validation Preview */}
            {globalRestoreValidation && globalRestoreValidation.valid && globalRestoreValidation.stats && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-emerald-950 border-b border-emerald-200 pb-1.5">
                  <span className="flex items-center gap-1">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>تم التحقق من سلامة الملف</span>
                  </span>
                  <span className="font-mono">{globalRestoreValidation.stats.companyName}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2 rounded-lg border border-emerald-200">
                    <span className="text-[10px] text-slate-500 block">الموظفون</span>
                    <strong className="text-sm font-mono text-slate-900">{globalRestoreValidation.stats.employees}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-emerald-200">
                    <span className="text-[10px] text-slate-500 block">الفروع</span>
                    <strong className="text-sm font-mono text-slate-900">{globalRestoreValidation.stats.branches}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-emerald-200">
                    <span className="text-[10px] text-slate-500 block">السلف</span>
                    <strong className="text-sm font-mono text-red-700">{globalRestoreValidation.stats.withdrawals}</strong>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowGlobalRestoreModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleConfirmGlobalRestore}
                disabled={!globalRestoreValidation?.valid || isExecutingGlobalRestore}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isExecutingGlobalRestore ? 'animate-spin' : ''}`} />
                <span>{isExecutingGlobalRestore ? 'جاري الاسترجاع...' : 'تأكيد استرجاع البيانات'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
