import React, { useState } from 'react';
import {
  Shield,
  ShieldCheck,
  UserPlus,
  Edit,
  Trash2,
  Check,
  X,
  Lock,
  UserCheck,
  Key,
  Smartphone,
  RotateCcw,
  Building2,
  Briefcase,
  ShoppingBag,
  Truck,
  Download,
  Upload,
  FileSpreadsheet,
  Database,
  AlertTriangle,
  RefreshCw,
  FileJson,
} from 'lucide-react';
import { AppDatabase, AppUser, PermissionKey, Employee } from '../types';
import {
  downloadDatabaseBackup,
  exportDatabaseToExcel,
  validateBackupFile,
  BackupValidationResult,
  getSnapshotHistory,
  getPreResetBackup,
  saveAutoSnapshot,
  SavedSnapshot,
} from '../utils/databaseExport';

interface PermissionsPageProps {
  db: AppDatabase;
  currentUser: AppUser | null;
  onUpdateUsers: (users: AppUser[]) => void;
  onUpdateEmployees: (employees: Employee[]) => void;
  onRestoreDatabase?: (newDb: AppDatabase) => void;
}

export const PERMISSION_DEFINITIONS: {
  key: PermissionKey;
  label: string;
  category: 'الموظفون' | 'الفروع' | 'السلف والمسحوبات' | 'الرواتب والمصاريف' | 'النظام والصلاحيات';
  description: string;
}[] = [
  {
    key: 'employees_view',
    label: 'عرض شؤون الموظفين',
    category: 'الموظفون',
    description: 'الاطلاع على قائمة الموظفين وملفاتهم وبياناتهم',
  },
  {
    key: 'employees_add',
    label: 'إضافة موظف جديد',
    category: 'الموظفون',
    description: 'صلاحية تسجيل وإضافة موظفين جدد إلى المؤسسة',
  },
  {
    key: 'employees_edit',
    label: 'تعديل بيانات الموظف',
    category: 'الموظفون',
    description: 'تعديل بيانات الموظف والفرع والوردية ورقم الهاتف',
  },
  {
    key: 'employees_delete',
    label: 'حذف / إزالة موظف',
    category: 'الموظفون',
    description: 'حذف سجل الموظف نهائياً من قاعدة البيانات',
  },
  {
    key: 'branches_manage',
    label: 'إدارة الفروع والباركود',
    category: 'الفروع',
    description: 'إضافة وتعديل وحذف الفروع وطباعة وتوليد باركود الفرع',
  },
  {
    key: 'withdrawals_view',
    label: 'عرض المسحوبات والسلف',
    category: 'السلف والمسحوبات',
    description: 'الاطلاع على كشف وسجلات السلف والمسحوبات النقدية',
  },
  {
    key: 'withdrawals_add',
    label: 'إضافة سلفة جديدة',
    category: 'السلف والمسحوبات',
    description: 'تسجيل وصرف سلفة نقدية للموظف',
  },
  {
    key: 'withdrawals_edit',
    label: 'تعديل سلفة قائمة',
    category: 'السلف والمسحوبات',
    description: 'تعديل مبلغ أو تاريخ أو بيان سلفة مسجلة مسبقاً',
  },
  {
    key: 'withdrawals_delete',
    label: 'حذف سلفة',
    category: 'السلف والمسحوبات',
    description: 'حذف قيد سلفة نقدية وإلغاء خصمها من الراتب',
  },
  {
    key: 'payroll_view',
    label: 'عرض قسم الرواتب',
    category: 'الرواتب والمصاريف',
    description: 'الاطلاع على جدول الرواتب ومسحوبات الفترة وصافي المستحق',
  },
  {
    key: 'payroll_edit',
    label: 'إدخال الراتب الإجمالي واعتماد الصرف',
    category: 'الرواتب والمصاريف',
    description: 'تعديل الراتب الإجمالي للموظف يدودياً واعتماد صرف الرواتب',
  },
  {
    key: 'expenses_manage',
    label: 'إدارة مصروفات الفروع',
    category: 'الرواتب والمصاريف',
    description: 'إضافة وتعديل وتصفية مصروفات الفروع اليومية',
  },
  {
    key: 'attendance_manage',
    label: 'إدارة سجل الدوام وفك ربط الهواتف',
    category: 'النظام والصلاحيات',
    description: 'مراجعة الدوام وإضافة قيود دوام يدوية وفك ربط أجهزة هواتف الموظفين',
  },
  {
    key: 'permissions_manage',
    label: 'إدارة المستخدمين والصلاحيات',
    category: 'النظام والصلاحيات',
    description: 'إضافة مستخدمين إداريين وتوزيع الصلاحيات وتغيير كلمات المرور',
  },
  {
    key: 'backup_manage',
    label: 'النسخ الاحتياطي واستعادة البيانات',
    category: 'النظام والصلاحيات',
    description: 'صلاحية تصدير واستعادة وتنزيل النسخ الاحتياطية الشاملة للنظام',
  },
];

export interface RolePreset {
  id: AppUser['role'];
  name: string;
  badge: string;
  description: string;
  isAdmin: boolean;
  colorClass: string;
  permissions: Record<PermissionKey, boolean>;
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'admin',
    name: '١. ادمن',
    badge: 'كامل الصلاحيات',
    description: 'صلاحيات إدارية كاملة وشاملة لكافة أقسام النظام والمستخدمين والرواتب',
    isAdmin: true,
    colorClass: 'border-emerald-600 bg-emerald-50 text-emerald-900',
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
  },
  {
    id: 'branch_supervisor',
    name: '٢. مشرف فرع',
    badge: 'إشراف الفرع',
    description: 'متابعة دوام موظفي الفرع، تسجيل السلف، وإدارة المصروفات اليومية للفرع',
    isAdmin: false,
    colorClass: 'border-amber-600 bg-amber-50 text-amber-900',
    permissions: {
      employees_view: true,
      employees_add: false,
      employees_edit: false,
      employees_delete: false,
      branches_manage: false,
      withdrawals_view: true,
      withdrawals_add: true,
      withdrawals_edit: false,
      withdrawals_delete: false,
      payroll_view: false,
      payroll_edit: false,
      expenses_manage: true,
      attendance_manage: true,
      permissions_manage: false,
      backup_manage: false,
    },
  },
  {
    id: 'general_supervisor',
    name: '٣. مشرف عام',
    badge: 'إشراف عام',
    description: 'إشراف شامل على كافة الفروع والموظفين والدوام والسلف ومصروفات الفروع والاطلاع على الرواتب',
    isAdmin: false,
    colorClass: 'border-blue-600 bg-blue-50 text-blue-900',
    permissions: {
      employees_view: true,
      employees_add: true,
      employees_edit: true,
      employees_delete: false,
      branches_manage: true,
      withdrawals_view: true,
      withdrawals_add: true,
      withdrawals_edit: true,
      withdrawals_delete: false,
      payroll_view: true,
      payroll_edit: false,
      expenses_manage: true,
      attendance_manage: true,
      permissions_manage: false,
      backup_manage: false,
    },
  },
  {
    id: 'sales',
    name: '٤. مبيعات',
    badge: 'فريق المبيعات',
    description: 'صلاحيات مسؤولي المبيعات: تسجيل مصروفات البيع اليومية وعرض الموظفين والسلف',
    isAdmin: false,
    colorClass: 'border-purple-600 bg-purple-50 text-purple-900',
    permissions: {
      employees_view: true,
      employees_add: false,
      employees_edit: false,
      employees_delete: false,
      branches_manage: false,
      withdrawals_view: true,
      withdrawals_add: false,
      withdrawals_edit: false,
      withdrawals_delete: false,
      payroll_view: false,
      payroll_edit: false,
      expenses_manage: true,
      attendance_manage: false,
      permissions_manage: false,
      backup_manage: false,
    },
  },
  {
    id: 'delivery',
    name: '٥. توصيل',
    badge: 'فريق التوصيل',
    description: 'صلاحيات مناديب التوصيل: تسجيل مصاريف النقل والوقود اليومية وعرض البيانات الأساسية',
    isAdmin: false,
    colorClass: 'border-cyan-600 bg-cyan-50 text-cyan-900',
    permissions: {
      employees_view: true,
      employees_add: false,
      employees_edit: false,
      employees_delete: false,
      branches_manage: false,
      withdrawals_view: false,
      withdrawals_add: false,
      withdrawals_edit: false,
      withdrawals_delete: false,
      payroll_view: false,
      payroll_edit: false,
      expenses_manage: true,
      attendance_manage: false,
      permissions_manage: false,
      backup_manage: false,
    },
  },
];

export const getRoleDisplayName = (role?: string, isAdmin?: boolean): string => {
  if (isAdmin || role === 'admin') return 'ادمن';
  if (role === 'branch_supervisor') return 'مشرف فرع';
  if (role === 'general_supervisor') return 'مشرف عام';
  if (role === 'sales') return 'مبيعات';
  if (role === 'delivery') return 'توصيل';
  // Legacy / fallback support:
  if (role === 'supervisor') return 'مشرف فرع';
  if (role === 'hr') return 'شؤون موظفين';
  if (role === 'accountant') return 'محاسب مالي';
  return 'صلاحيات مخصصة';
};

export const getRoleBadgeStyle = (role?: string, isAdmin?: boolean): string => {
  if (isAdmin || role === 'admin') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (role === 'branch_supervisor' || role === 'supervisor') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (role === 'general_supervisor') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (role === 'sales') return 'bg-purple-100 text-purple-800 border-purple-200';
  if (role === 'delivery') return 'bg-cyan-100 text-cyan-800 border-cyan-200';
  return 'bg-slate-100 text-slate-800 border-slate-200';
};

export const PermissionsPage: React.FC<PermissionsPageProps> = ({
  db,
  currentUser,
  onUpdateUsers,
  onUpdateEmployees,
  onRestoreDatabase,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<AppUser['role']>('custom');
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formBranchId, setFormBranchId] = useState('all');
  const [formPermissions, setFormPermissions] = useState<Record<PermissionKey, boolean>>({
    employees_view: true,
    employees_add: false,
    employees_edit: false,
    employees_delete: false,
    branches_manage: false,
    withdrawals_view: true,
    withdrawals_add: true,
    withdrawals_edit: false,
    withdrawals_delete: false,
    payroll_view: false,
    payroll_edit: false,
    expenses_manage: false,
    attendance_manage: false,
    permissions_manage: false,
    backup_manage: false,
  });

  const [activeTab, setActiveTab] = useState<'users' | 'devices' | 'backup'>('users');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Backup & Restore State
  const [restoreJsonInput, setRestoreJsonInput] = useState<string>('');
  const [restoreValidation, setRestoreValidation] = useState<BackupValidationResult | null>(null);
  const [showRestoreConfirmModal, setShowRestoreConfirmModal] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreStatusMsg, setRestoreStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [snapshotList, setSnapshotList] = useState<SavedSnapshot[]>(() => getSnapshotHistory());
  const [preResetData, setPreResetData] = useState<AppDatabase | null>(() => getPreResetBackup());

  const handleCreateInstantSnapshot = () => {
    saveAutoSnapshot(db, 'manual');
    setSnapshotList(getSnapshotHistory());
    setPreResetData(getPreResetBackup());
    setFeedback('✓ تم حفظ لقطة احتياطية فورية لقاعدة البيانات بنجاح.');
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleRestoreFromSnapshot = (targetDb: AppDatabase) => {
    const val = validateBackupFile(JSON.stringify(targetDb));
    if (val.valid && val.db) {
      setRestoreValidation(val);
      setShowRestoreConfirmModal(true);
    }
  };

  const handleTriggerBackup = () => {
    downloadDatabaseBackup(db);
    saveAutoSnapshot(db, 'manual');
    setSnapshotList(getSnapshotHistory());
    setFeedback('✓ تم إنشاء وتحميل النسخة الاحتياطية لقاعدة البيانات (JSON) بنجاح.');
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleTriggerExcelExport = () => {
    exportDatabaseToExcel(db);
    setFeedback('✓ تم تصدير قاعدة البيانات الشاملة إلى ملف إكسل (Excel / XLS) بنجاح.');
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRestoreJsonInput(content);
      const val = validateBackupFile(content);
      setRestoreValidation(val);
      if (!val.valid) {
        setRestoreStatusMsg({ type: 'error', text: val.error || 'الملف المختار غير صالح' });
      } else {
        setRestoreStatusMsg(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleJsonTextChange = (text: string) => {
    setRestoreJsonInput(text);
    if (!text.trim()) {
      setRestoreValidation(null);
      setRestoreStatusMsg(null);
      return;
    }
    const val = validateBackupFile(text);
    setRestoreValidation(val);
    if (!val.valid) {
      setRestoreStatusMsg({ type: 'error', text: val.error || 'النص المدخل غير صالح' });
    } else {
      setRestoreStatusMsg(null);
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreValidation || !restoreValidation.valid || !restoreValidation.db) {
      alert('يرجى اختيار ملف نسخة احتياطية صالح أولاً.');
      return;
    }
    setIsRestoring(true);
    try {
      if (onRestoreDatabase) {
        onRestoreDatabase(restoreValidation.db);
      }
      await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: restoreValidation.db }),
      });
      setShowRestoreConfirmModal(false);
      setRestoreStatusMsg({
        type: 'success',
        text: '✓ تم استرجاع قاعدة البيانات بنجاح، وتحديث كافة السجلات للموظفين والدوام والسلف.',
      });
      setFeedback('✓ تمت استعادة قاعدة البيانات بنجاح.');
      setTimeout(() => setFeedback(null), 5000);
    } catch {
      setShowRestoreConfirmModal(false);
      setRestoreStatusMsg({
        type: 'success',
        text: '✓ تم استرجاع قاعدة البيانات محلياً وتحديث كافة السجلات بنجاح.',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const canManagePermissions = currentUser?.isAdmin || currentUser?.permissions?.permissions_manage;
  const canManageBackup = currentUser?.isAdmin || Boolean(currentUser?.permissions?.backup_manage);

  const handleOpenAddModal = () => {
    setEditingUser(null);
    setFormName('');
    setFormUsername('');
    setFormPassword('');
    setFormRole('custom');
    setFormIsAdmin(false);
    setFormBranchId('all');
    setFormPermissions({
      employees_view: true,
      employees_add: false,
      employees_edit: false,
      employees_delete: false,
      branches_manage: false,
      withdrawals_view: true,
      withdrawals_add: true,
      withdrawals_edit: false,
      withdrawals_delete: false,
      payroll_view: false,
      payroll_edit: false,
      expenses_manage: false,
      attendance_manage: false,
      permissions_manage: false,
      backup_manage: false,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (u: AppUser) => {
    setEditingUser(u);
    setFormName(u.name);
    setFormUsername(u.username);
    setFormPassword(u.password);
    setFormRole(u.role);
    setFormIsAdmin(u.isAdmin);
    setFormBranchId(u.branchId || 'all');
    setFormPermissions({
      ...u.permissions,
    });
    setIsModalOpen(true);
  };

  const handleApplyRolePreset = (roleId: AppUser['role']) => {
    const preset = ROLE_PRESETS.find((p) => p.id === roleId);
    if (!preset) return;

    setFormRole(preset.id);
    setFormIsAdmin(preset.isAdmin);
    setFormPermissions({ ...preset.permissions });
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUsername.trim() || !formPassword.trim() || !formName.trim()) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    const newUser: AppUser = {
      id: editingUser ? editingUser.id : `usr-${Date.now()}`,
      username: formUsername.trim(),
      password: formPassword.trim(),
      name: formName.trim(),
      role: formRole,
      isAdmin: formIsAdmin,
      branchId: formBranchId,
      permissions: formIsAdmin
        ? (PERMISSION_DEFINITIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {}) as any)
        : formPermissions,
      createdAt: editingUser ? editingUser.createdAt : new Date().toISOString(),
    };

    let updatedUsers: AppUser[];
    if (editingUser) {
      updatedUsers = db.users.map((u) => (u.id === editingUser.id ? newUser : u));
    } else {
      updatedUsers = [...(db.users || []), newUser];
    }

    onUpdateUsers(updatedUsers);
    setIsModalOpen(false);
    setFeedback(`تم حفظ المستخدم "${newUser.name}" بنجاح وتحديث صلاحياته.`);
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleDeleteUser = (userId: string) => {
    if (db.users.length <= 1) {
      alert('لا يمكن حذف المستخدم الأخير في النظام!');
      return;
    }
    const target = db.users.find((u) => u.id === userId);
    if (!target) return;
    if (confirm(`هل أنت متأكد من حذف المستخدم "${target.name}"؟`)) {
      onUpdateUsers(db.users.filter((u) => u.id !== userId));
    }
  };

  // Unbind a device from an employee
  const handleUnbindEmployeeDevice = (employeeId: string) => {
    const emp = db.employees.find((e) => e.id === employeeId);
    if (!emp) return;
    if (confirm(`هل تريد فك ربط الهاتف المسجل للموظف "${emp.name}"؟ سيتمكن الموظف من تسجيل الدوام من جهاز جديد بعد ذلك.`)) {
      const updated = db.employees.map((e) =>
        e.id === employeeId
          ? {
              ...e,
              boundDeviceId: null,
              boundDeviceName: null,
              boundDeviceAt: null,
            }
          : e
      );
      onUpdateEmployees(updated);
      setFeedback(`تم فك ربط الهاتف للموظف "${emp.name}".`);
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const categories = Array.from(new Set(PERMISSION_DEFINITIONS.map((p) => p.category)));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              إدارة الصلاحيات والمستخدمين
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            مؤسسة صخر المصري · التحكم بصلاحيات إضافة وحذف وتعديل الموظفين والسلف والفروع، وإدارة ربط الهواتف
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeTab === 'users' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              المستخدمون والصلاحيات ({db.users?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('devices')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeTab === 'devices' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              أجهزة الهواتف ({db.employees.filter((e) => e.boundDeviceId).length})
            </button>
            {canManageBackup && (
              <button
                type="button"
                onClick={() => setActiveTab('backup')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'backup' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <span>النسخ الاحتياطي والاستعادة</span>
              </button>
            )}
          </div>

          {canManageBackup && (
            <>
              <button
                type="button"
                onClick={handleTriggerBackup}
                className="px-3 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="تحميل نسخة احتياطية فورية لقاعدة البيانات (JSON)"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>نسخة احتياطية</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerExcelExport}
                className="px-3 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="تصدير كافة جداول النظام إلى ملف إكسل (Excel / XLS)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>تصدير إكسل</span>
              </button>
            </>
          )}

          {canManagePermissions && activeTab === 'users' && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة مستخدم</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {activeTab === 'users' ? (
        <div className="space-y-6">
          {/* Users Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {db.users?.map((u) => {
              const activePermCount = u.isAdmin
                ? PERMISSION_DEFINITIONS.length
                : Object.values(u.permissions || {}).filter(Boolean).length;

              return (
                <div
                  key={u.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900">{u.name}</h3>
                          {u.isAdmin && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                              ادمن (كامل الصلاحيات)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 font-mono">
                          اسم المستخدم: <strong className="text-slate-800">{u.username}</strong>
                        </div>
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold">
                        {u.isAdmin ? <ShieldCheck className="w-5 h-5 text-emerald-600" /> : <Lock className="w-4 h-4" />}
                      </div>
                    </div>

                    <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-slate-600">
                        <span>نوع الحساب / الدور:</span>
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${getRoleBadgeStyle(u.role, u.isAdmin)}`}>
                          {getRoleDisplayName(u.role, u.isAdmin)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>عدد الصلاحيات الممنوحة:</span>
                        <span className="font-mono font-bold text-emerald-700">
                          {activePermCount} من {PERMISSION_DEFINITIONS.length}
                        </span>
                      </div>
                    </div>

                    {/* Permissions summary chips */}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {u.isAdmin ? (
                        <span className="text-[11px] text-emerald-700 font-medium">
                          ✓ كامل صلاحيات إدارة الموظفين، السلف، الرواتب، الفروع، والمستخدمين
                        </span>
                      ) : (
                        PERMISSION_DEFINITIONS.filter((p) => u.permissions?.[p.key]).slice(0, 4).map((p) => (
                          <span
                            key={p.key}
                            className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md"
                          >
                            {p.label}
                          </span>
                        ))
                      )}
                      {!u.isAdmin && activePermCount > 4 && (
                        <span className="text-[10px] px-1.5 py-0.5 text-slate-400 font-mono">
                          +{activePermCount - 4} أخرى
                        </span>
                      )}
                    </div>
                  </div>

                  {canManagePermissions && (
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(u)}
                        className="text-emerald-700 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>تعديل الصلاحيات</span>
                      </button>

                      {u.username !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u.id)}
                          className="text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Permissions Matrix Explanation */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-4 shadow-2xs">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              <span>جدول مرجع الصلاحيات المنفصلة في النظام</span>
            </h3>
            <p className="text-xs text-slate-500">
              يمكنك تخصيص الصلاحيات بدقة لكل مستخدم، مثل إعطاء موظف معين صلاحية إضافة السلف دون صلاحية حذفها، أو إعطاء مسؤول آخر صلاحية إدارة الموظفين فقط.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {PERMISSION_DEFINITIONS.map((p) => (
                <div key={p.key} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{p.label}</span>
                    <span className="text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {p.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">{p.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: Bound Devices Management (One Employee per Phone Protection) */
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-5 shadow-2xs">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-600" />
              <span>إدارة ميزة حماية بصمة الهاتف (جهاز واحد لكل موظف)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              هذه الخاصية تمنع أي موظف من تسجيل دوام أو انصراف لزميل آخر من نفس الهاتف. عندما يسجل الموظف أول مرة يتم قفل الهاتف على حسابه. يمكنك فك الربط لأي موظف في حال استبدل هاتفه.
            </p>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {db.employees.map((emp) => {
              const branch = db.branches.find((b) => b.id === emp.branchId);
              return (
                <div key={emp.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{emp.name}</span>
                      <span className="text-xs font-mono text-slate-500">({emp.code})</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {branch?.name} · رمز PIN: <span className="font-mono font-bold text-slate-700">{emp.pin}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    {emp.boundDeviceId ? (
                      <div className="text-left sm:text-right">
                        <div className="font-semibold text-emerald-700 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" />
                          <span>مربوط بهاتف: {emp.boundDeviceName || 'هاتف ذكي'}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          تاريخ القفل: {emp.boundDeviceAt?.slice(0, 10) || 'مؤخراً'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400">لم يتم ربط هاتف بهذا الموظف بعد</span>
                    )}

                    {emp.boundDeviceId && (
                      <button
                        type="button"
                        onClick={() => handleUnbindEmployeeDevice(emp.id)}
                        className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 rounded-lg font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        title="فك ربط الهاتف للسماح بتسجيل الدوام من جهاز جديد"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>فك ربط الهاتف</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 3: DATABASE BACKUP, EXCEL EXPORT & RESTORE             */}
      {/* ========================================================== */}
      {activeTab === 'backup' && canManageBackup && (
        <div className="space-y-6">
          {/* Status Message */}
          {restoreStatusMsg && (
            <div
              className={`p-4 rounded-2xl border text-xs sm:text-sm flex items-start gap-3 shadow-xs ${
                restoreStatusMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-red-50 border-red-300 text-red-950'
              }`}
            >
              {restoreStatusMsg.type === 'success' ? (
                <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-bold block mb-0.5">
                  {restoreStatusMsg.type === 'success' ? 'نجحت العملية:' : 'تنبيه خطأ:'}
                </span>
                <span>{restoreStatusMsg.text}</span>
              </div>
            </div>
          )}

          {/* Action Cards: Backup and Excel Export */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Card 1: JSON Backup */}
            <div className="bg-white border-2 border-slate-200 hover:border-slate-800 transition-colors rounded-2xl p-6 shadow-2xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                    <Database className="w-6 h-6 text-emerald-400" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
                    صيغة JSON الآمنة
                  </span>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    عمل نسخة احتياطية كاملة (Backup)
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    تحميل نسخة احتياطية متكاملة ومؤرخة لقاعدة بيانات مؤسسة صخر المصري، تشمل جميع سجلات الموظفين، الفروع، السلف والمسحوبات، الدوام، والمصروفات لاستعادتها في أي وقت.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">الموظفون</span>
                    <strong className="text-slate-900 font-mono text-sm">{db.employees.length}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">السلف والمسحوبات</span>
                    <strong className="text-red-700 font-mono text-sm">{db.withdrawals.length}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">سجلات الدوام</span>
                    <strong className="text-emerald-700 font-mono text-sm">{db.attendance.length}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTriggerBackup}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>تحميل ملف النسخة الاحتياطية (JSON)</span>
              </button>
            </div>

            {/* Card 2: Excel Export */}
            <div className="bg-white border-2 border-emerald-200 hover:border-emerald-600 transition-colors rounded-2xl p-6 shadow-2xs flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">
                    ملف إكسل (XLS / Excel)
                  </span>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    تصدير قاعدة البيانات إلى ملف إكسل
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    تصدير كافة جداول وبيانات النظام بتنسيق إكسل معتمد يدعم اللغة العربية والاتجاه من اليمين لليار، مع جداول تفصيلية للموظفين، والرواتب، والسلف، والمصروفات.
                  </p>
                </div>

                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <span className="text-emerald-800 block text-[10px]">الفروع</span>
                    <strong className="text-emerald-950 font-mono text-sm">{db.branches.length}</strong>
                  </div>
                  <div>
                    <span className="text-emerald-800 block text-[10px]">المصروفات</span>
                    <strong className="text-emerald-950 font-mono text-sm">{db.expenses.length}</strong>
                  </div>
                  <div>
                    <span className="text-emerald-800 block text-[10px]">مسير الرواتب</span>
                    <strong className="text-emerald-950 font-mono text-sm">{db.salaryPayments.length}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTriggerExcelExport}
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير وتحميل ملف إكسل (Excel)</span>
              </button>
            </div>
          </div>

          {/* Section: النسخ التلقائية ونقاط الاستعادة الفورية (Auto-Snapshots & Emergency Recovery) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                  <RotateCcw className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    نقاط الاستعادة والنسخ التلقائية الفورية (Auto-Snapshots)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    يقوم النظام بحفظ لقطات تلقائية من عملك وتجاربك لحمايتها من أي فقدان، مع إمكانية الاستعادة بنقرة واحدة
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateInstantSnapshot}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap self-start sm:self-auto"
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>حفظ لقطة احتياطية فورية الآن</span>
              </button>
            </div>

            {/* Emergency Pre-Reset Snapshot Card */}
            {preResetData && (
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-950">
                        نسخة محفوظة قبل إعادة التعيين الأخيرة (Pre-Reset Safety Backup)
                      </h4>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        تحتوي على {preResetData.employees?.length || 0} موظف و {preResetData.attendance?.length || 0} قيد دوام و {preResetData.withdrawals?.length || 0} سلفة نقدية.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreFromSnapshot(preResetData)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap self-start sm:self-auto"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>استرجاع هذه النسخة فوراً</span>
                  </button>
                </div>
              </div>
            )}

            {/* Auto-Snapshots History List */}
            {snapshotList.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>سجل النسخ المحفوظة محلياً أثناء الجلسة ({snapshotList.length} لقطات متوفرة):</span>
                  <span className="text-[11px] text-slate-400 font-normal">يتم الاحتفاظ بآخر 6 لقطات تلقائياً</span>
                </div>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                  {snapshotList.map((snap) => (
                    <div
                      key={snap.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              snap.source === 'before_reset'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : snap.source === 'manual'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {snap.source === 'before_reset'
                              ? 'قبل إعادة التعيين'
                              : snap.source === 'manual'
                              ? 'حفظ يدوي'
                              : 'حفظ تلقائي أثناء التعديل'}
                          </span>
                          <span className="text-xs font-mono font-semibold text-slate-700">{snap.dateStr}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-3">
                          <span>الموظفون: <strong className="text-slate-800 font-mono">{snap.stats.employees}</strong></span>
                          <span>•</span>
                          <span>الدوام: <strong className="text-slate-800 font-mono">{snap.stats.attendance}</strong></span>
                          <span>•</span>
                          <span>السلف: <strong className="text-red-700 font-mono">{snap.stats.withdrawals}</strong></span>
                          <span>•</span>
                          <span>الفروع: <strong className="text-slate-800 font-mono">{snap.stats.branches}</strong></span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRestoreFromSnapshot(snap.db)}
                        className="px-3.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto"
                      >
                        <RefreshCw className="w-3 h-3 text-emerald-600" />
                        <span>استرجاع هذه اللقطة</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                لا توجد لقطات تلقائية سابقة حتى الآن. يتم حفظ لقطات تلقائية مستمرة عند أي تعديل في البيانات.
              </div>
            )}
          </div>

          {/* Section: خانة استرجاع البيانات (Database Restore Section) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-2xs space-y-5">
            <div className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Upload className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    خانة استرجاع قاعدة البيانات (Restore Database)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    اختر ملف النسخة الاحتياطية (.json) المحفوظ مسبقاً لاستعادة جميع بيانات وسجلات المؤسسة
                  </p>
                </div>
              </div>
            </div>

            {/* Warning Banner */}
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-950 rounded-xl text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>تنبيه هام قبل الاسترجاع:</strong> سيؤدي استرجاع النسخة الاحتياطية إلى تحديث قاعدة البيانات الحالية واعتماد السجلات الواردة في الملف المختار. يقوم النظام تلقائياً بحفظ نسخة أمان احتياطية قبل أي عملية استرجاع.
              </div>
            </div>

            {/* File Upload Box */}
            <div className="border-2 border-dashed border-slate-300 hover:border-emerald-600 transition-colors rounded-2xl p-6 text-center space-y-3 bg-slate-50/50">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <FileJson className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  اسحب ملف النسخة الاحتياطية (.json) إلى هنا أو اضغط للاختيار من جهازك
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  يدعم ملفات النسخ الاحتياطية المصدرة من نظام مؤسسة صخر المصري بصيغة JSON
                </p>
              </div>

              <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition-colors">
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>استعراض واختيار ملف النسخة (.json)</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Optional Raw JSON Input */}
            <details className="text-xs text-slate-600 border border-slate-200 rounded-xl p-3">
              <summary className="font-semibold text-slate-800 cursor-pointer">
                أو لصق نص كود JSON للنسخة الاحتياطية يدوياً
              </summary>
              <div className="pt-3 space-y-2">
                <textarea
                  rows={4}
                  value={restoreJsonInput}
                  onChange={(e) => handleJsonTextChange(e.target.value)}
                  placeholder="الصق كود JSON الخاص بالنسخة الاحتياطية هنا..."
                  className="w-full p-3 font-mono text-[11px] border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-white"
                  dir="ltr"
                />
              </div>
            </details>

            {/* Live Preview of Validated Backup File */}
            {restoreValidation && restoreValidation.valid && restoreValidation.stats && (
              <div className="p-4 bg-emerald-50/70 border-2 border-emerald-400 rounded-2xl space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-700 font-bold" />
                    <span className="font-bold text-emerald-950 text-xs sm:text-sm">
                      تم فحص ملف النسخة الاحتياطية بنجاح — جاهز للاسترجاع
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-emerald-800 bg-white px-2.5 py-0.5 rounded border border-emerald-200">
                    {restoreValidation.stats.companyName}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                    <span className="text-slate-500 block text-[10px]">الموظفون:</span>
                    <strong className="text-slate-900 font-mono text-sm">
                      {restoreValidation.stats.employees} موظف
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                    <span className="text-slate-500 block text-[10px]">الفروع:</span>
                    <strong className="text-slate-900 font-mono text-sm">
                      {restoreValidation.stats.branches} فرع
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                    <span className="text-slate-500 block text-[10px]">السلف والمسحوبات:</span>
                    <strong className="text-red-700 font-mono text-sm">
                      {restoreValidation.stats.withdrawals} عملية
                    </strong>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-200">
                    <span className="text-slate-500 block text-[10px]">سجلات الدوام:</span>
                    <strong className="text-emerald-700 font-mono text-sm">
                      {restoreValidation.stats.attendance} قيد
                    </strong>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setRestoreJsonInput('');
                      setRestoreValidation(null);
                      setRestoreStatusMsg(null);
                    }}
                    className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    إلغاء الملف
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRestoreConfirmModal(true)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md cursor-pointer transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>تأكيد استرجاع قاعدة البيانات وتحديث النظام</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {showRestoreConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 sm:p-7 space-y-4 shadow-2xl text-right">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                تأكيد استرجاع قاعدة البيانات
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                هل أنت متأكد من رغبتك في استعادة هذه النسخة الاحتياطية؟ سيتم تحديث جميع السجلات للموظفين والدوام والسلف في النظام فوراً.
              </p>
            </div>

            {restoreValidation?.stats && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5 font-medium">
                <div className="flex justify-between">
                  <span className="text-slate-500">المؤسسة:</span>
                  <span className="font-bold text-slate-900">{restoreValidation.stats.companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">عدد الموظفين:</span>
                  <span className="font-mono font-bold text-slate-900">{restoreValidation.stats.employees}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">عدد الفروع:</span>
                  <span className="font-mono font-bold text-slate-900">{restoreValidation.stats.branches}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">السلف والمسحوبات:</span>
                  <span className="font-mono font-bold text-red-600">{restoreValidation.stats.withdrawals}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRestoreConfirmModal(false)}
                className="w-full py-2.5 px-4 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                تراجع وإلغاء
              </button>

              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={isRestoring}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                <span>{isRestoring ? 'جاري الاسترجاع...' : 'نعم، استرجع الآن'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingUser ? `تعديل صلاحيات المستخدم: ${editingUser.name}` : 'إضافة مستخدم إداري جديد وتحديد صلاحياته'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  حدد الدور والصلاحيات الدقيقة الممنوحة لهذا المستخدم
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    اسم الموظف / المسؤول *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="مثال: يوسف المحاسب"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    اسم المستخدم لتسجيل الدخول *
                  </label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="مثال: yousef_acc"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    كلمة المرور *
                  </label>
                  <input
                    type="text"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {/* Roles Presets */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-900">
                    قوالب الأدوار الجاهزة (لتعبئة الصلاحيات بسرعة):
                  </label>
                  <span className="text-[11px] text-slate-500 font-normal">
                    اضغط على أي قالب لتطبيق صلاحياته تلقائياً
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {ROLE_PRESETS.map((preset) => {
                    const isSelected =
                      preset.id === 'admin'
                        ? formIsAdmin
                        : formRole === preset.id && !formIsAdmin;

                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyRolePreset(preset.id)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? `${preset.colorClass} font-bold ring-2 ring-emerald-500/20 shadow-xs`
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 bg-white'
                        }`}
                        title={preset.description}
                      >
                        <span className="text-xs font-bold">{preset.name}</span>
                        <span className="text-[10px] text-slate-500 font-normal">{preset.badge}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Granular Permissions Checkboxes */}
              {!formIsAdmin ? (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-900">
                      تحديد الصلاحيات الدقيقة لهذا المستخدم:
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const allTrue: any = {};
                          PERMISSION_DEFINITIONS.forEach((p) => (allTrue[p.key] = true));
                          setFormPermissions(allTrue);
                        }}
                        className="text-[11px] text-emerald-700 hover:underline cursor-pointer"
                      >
                        تحديد الكل
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          const allFalse: any = {};
                          PERMISSION_DEFINITIONS.forEach((p) => (allFalse[p.key] = false));
                          setFormPermissions(allFalse);
                        }}
                        className="text-[11px] text-slate-500 hover:underline cursor-pointer"
                      >
                        إلغاء الكل
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {categories.map((cat) => (
                      <div key={cat} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="text-xs font-bold text-slate-800 border-b border-slate-200/60 pb-1">
                          {cat}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {PERMISSION_DEFINITIONS.filter((p) => p.category === cat).map((p) => (
                            <label
                              key={p.key}
                              className="flex items-center gap-2 text-xs text-slate-700 hover:text-slate-900 cursor-pointer select-none"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(formPermissions[p.key])}
                                onChange={(e) =>
                                  setFormPermissions({
                                    ...formPermissions,
                                    [p.key]: e.target.checked,
                                  })
                                }
                                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                              />
                              <span>{p.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium">
                  ✓ تم تعيين هذا الحساب كمدير عام (Admin)؛ يمتلك كامل الصلاحيات تلقائياً لإضافة وتعديل وحذف كل شيء في النظام.
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 cursor-pointer shadow-xs"
                >
                  حفظ المستخدم والصلاحيات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
