import React, { useState, useMemo } from 'react';
import {
  UserPlus,
  Search,
  Edit3,
  Trash2,
  X,
  Plus,
  MapPin,
  Phone,
  Clock,
  Users,
  Building2,
  CheckCircle2,
  Smartphone,
  RotateCcw,
  Printer,
  Shield,
  AlertCircle,
  QrCode,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { AppDatabase, Employee, Branch, EmployeeStatus, AppUser } from '../types';
import { QRCodeDisplay } from './QRCodeDisplay';
import {
  exportEmployeeFullProfileToExcel,
  printEmployeeProfile,
} from '../utils/databaseExport';
import { getCurrentUserCoordinates } from '../utils/geoFence';

interface EmployeesPageProps {
  db: AppDatabase;
  currentUser?: AppUser | null;
  onUpdateEmployees: (employees: Employee[]) => void;
  onUpdateBranches: (branches: Branch[]) => void;
}

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: 'على رأس العمل',
  on_leave: 'في إجازة',
  suspended: 'موقوف مؤقتاً',
};

export const EmployeesPage: React.FC<EmployeesPageProps> = ({
  db,
  currentUser,
  onUpdateEmployees,
  onUpdateBranches,
}) => {
  // Permission Checks
  const canAddEmployee =
    !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.employees_add);
  const canEditEmployee =
    !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.employees_edit);
  const canDeleteEmployee =
    !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.employees_delete);
  const canManageBranches =
    !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.branches_manage);
  const canUnbindPhone =
    !currentUser ||
    currentUser.isAdmin ||
    Boolean(currentUser.permissions?.attendance_manage || currentUser.permissions?.permissions_manage);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'employees' | 'branches'>('employees');

  // Employee Add/Edit Modal
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Employee Full Profile Dossier Modal
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);

  // Form fields for Employee (without baseSalary, allowances, or monthly total)
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formBranchId, setFormBranchId] = useState(db.branches[0]?.id || '');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNationalId, setFormNationalId] = useState('');
  const [formHireDate, setFormHireDate] = useState('2025-01-01');
  const [formShiftStart, setFormShiftStart] = useState('08:00');
  const [formShiftEnd, setFormShiftEnd] = useState('16:00');
  const [formStatus, setFormStatus] = useState<EmployeeStatus>('active');

  // Withdrawal Limit state (Request 6)
  const [formWithdrawalLimitType, setFormWithdrawalLimitType] = useState<'unlimited' | 'fixed'>('unlimited');
  const [formWithdrawalLimitAmount, setFormWithdrawalLimitAmount] = useState<string>('100');

  // Branch Add/Edit Modal state
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchCity, setBranchCity] = useState('الأردن - عمّان');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchManager, setBranchManager] = useState('');
  const [branchBarcodeText, setBranchBarcodeText] = useState('');
  const [branchQrToken, setBranchQrToken] = useState('');
  const [branchLatitude, setBranchLatitude] = useState<string>('31.9539');
  const [branchLongitude, setBranchLongitude] = useState<string>('35.9106');
  const [branchRadiusMeters, setBranchRadiusMeters] = useState<string>('15');
  const [isCapturingGps, setIsCapturingGps] = useState<boolean>(false);

  // Branch Barcode Print Modal
  const [printingBranch, setPrintingBranch] = useState<Branch | null>(null);

  // Unbind feedback
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const openAddEmployeeModal = () => {
    if (!canAddEmployee) {
      alert('عذراً، ليس لديك صلاحية إضافة موظف جديد.');
      return;
    }
    setEditingEmployee(null);
    const nextNum = db.employees.length + 101;
    setFormName('');
    setFormCode(`EMP-${nextNum}`);
    setFormPin(String(Math.floor(1000 + Math.random() * 9000)));
    setFormBranchId(db.branches[0]?.id || '');
    setFormJobTitle('');
    setFormDepartment('المبيعات والتشغيل');
    setFormPhone('');
    setFormNationalId('');
    setFormHireDate(new Date().toISOString().slice(0, 10));
    setFormShiftStart('08:00');
    setFormShiftEnd('16:00');
    setFormStatus('active');
    setFormWithdrawalLimitType('unlimited');
    setFormWithdrawalLimitAmount('100');
    setIsModalOpen(true);
  };

  const openEditEmployeeModal = (emp: Employee) => {
    if (!canEditEmployee) {
      alert('عذراً، ليس لديك صلاحية تعديل بيانات الموظفين.');
      return;
    }
    setEditingEmployee(emp);
    setFormName(emp.name);
    setFormCode(emp.code);
    setFormPin(emp.pin);
    setFormBranchId(emp.branchId);
    setFormJobTitle(emp.jobTitle);
    setFormDepartment(emp.department);
    setFormPhone(emp.phone);
    setFormNationalId(emp.nationalId);
    setFormHireDate(emp.hireDate);
    setFormShiftStart(emp.shiftStart);
    setFormShiftEnd(emp.shiftEnd);
    setFormStatus(emp.status);
    setFormWithdrawalLimitType(emp.withdrawalLimitType || 'unlimited');
    setFormWithdrawalLimitAmount(
      emp.withdrawalLimitAmount !== undefined ? String(emp.withdrawalLimitAmount) : '100'
    );
    setIsModalOpen(true);
  };

  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const payload: Employee = {
      id: editingEmployee ? editingEmployee.id : `emp-${Date.now()}`,
      code: formCode.trim() || `EMP-${Date.now().toString().slice(-3)}`,
      name: formName.trim(),
      pin: formPin.trim() || '1234',
      branchId: formBranchId,
      jobTitle: formJobTitle.trim() || 'موظف',
      department: formDepartment.trim() || 'عام',
      phone: formPhone.trim(),
      nationalId: formNationalId.trim(),
      hireDate: formHireDate,
      baseSalary: editingEmployee?.baseSalary || 0,
      housingAllowance: editingEmployee?.housingAllowance || 0,
      transportAllowance: editingEmployee?.transportAllowance || 0,
      manualGrossSalary: editingEmployee?.manualGrossSalary || 0,
      shiftStart: formShiftStart,
      shiftEnd: formShiftEnd,
      status: formStatus,
      boundDeviceId: editingEmployee?.boundDeviceId || null,
      boundDeviceName: editingEmployee?.boundDeviceName || null,
      boundDeviceAt: editingEmployee?.boundDeviceAt || null,
      withdrawalLimitType: formWithdrawalLimitType,
      withdrawalLimitAmount:
        formWithdrawalLimitType === 'fixed' ? Number(formWithdrawalLimitAmount) || 0 : undefined,
    };

    if (editingEmployee) {
      onUpdateEmployees(
        db.employees.map((item) => (item.id === editingEmployee.id ? payload : item))
      );
      setActionFeedback(`تم تعديل بيانات الموظف "${payload.name}" بنجاح.`);
    } else {
      onUpdateEmployees([...db.employees, payload]);
      setActionFeedback(`تمت إضافة الموظف الجديد "${payload.name}" بنجاح.`);
    }
    setIsModalOpen(false);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const handleDeleteEmployee = (id: string) => {
    if (!canDeleteEmployee) {
      alert('عذراً، ليس لديك صلاحية حذف الموظفين.');
      return;
    }
    const emp = db.employees.find((e) => e.id === id);
    if (!emp) return;

    if (confirm(`هل أنت متأكد من حذف الموظف "${emp.name}" نهائياً من النظام؟`)) {
      onUpdateEmployees(db.employees.filter((e) => e.id !== id));
      if (viewingEmployee?.id === id) {
        setViewingEmployee(null);
      }
      setActionFeedback(`تم حذف سجل الموظف "${emp.name}".`);
      setTimeout(() => setActionFeedback(null), 3500);
    }
  };

  // Unbind Phone Device from employee
  const handleUnbindEmployeePhone = (emp: Employee) => {
    if (!canUnbindPhone) {
      alert('عذراً، ليس لديك صلاحية فك ربط أجهزة هواتف الموظفين.');
      return;
    }
    if (
      confirm(
        `هل تريد فك ربط هاتف الموظف "${emp.name}"؟\nسيتمكن الموظف من تسجيل الدوام من هاتف جديد بعد فك الربط.`
      )
    ) {
      const updated = db.employees.map((e) =>
        e.id === emp.id
          ? {
              ...e,
              boundDeviceId: null,
              boundDeviceName: null,
              boundDeviceAt: null,
            }
          : e
      );
      onUpdateEmployees(updated);
      if (viewingEmployee?.id === emp.id) {
        setViewingEmployee({
          ...viewingEmployee,
          boundDeviceId: null,
          boundDeviceName: null,
          boundDeviceAt: null,
        });
      }
      setActionFeedback(`تم فك ربط الهاتف للموظف "${emp.name}". يمكنه الآن استخدام هاتف جديد.`);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Branch Operations: Add / Edit / Delete
  const handleCaptureCurrentGps = async () => {
    setIsCapturingGps(true);
    try {
      const coords = await getCurrentUserCoordinates();
      setBranchLatitude(coords.latitude.toFixed(6));
      setBranchLongitude(coords.longitude.toFixed(6));
      setActionFeedback(`📍 تم التقاط إحداثيات موقعك الحالي بنجاح: (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}) بدقة ±${Math.round(coords.accuracy)}م`);
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'تعذر تحديد الموقع الجغرافي للهاتف.');
    } finally {
      setIsCapturingGps(false);
    }
  };

  const openAddBranchModal = () => {
    if (!canManageBranches) {
      alert('عذراً، ليس لديك صلاحية إدارة الفروع.');
      return;
    }
    setEditingBranch(null);
    setBranchName('');
    setBranchCity('الأردن - عمّان');
    setBranchAddress('');
    setBranchManager('');
    const randomCode = Math.floor(100 + Math.random() * 900);
    setBranchBarcodeText(`SAKHR-QR-${randomCode}`);
    setBranchQrToken(`SAKHR-QR-${randomCode}`);
    setBranchLatitude('31.9539');
    setBranchLongitude('35.9106');
    setBranchRadiusMeters('15');
    setIsBranchModalOpen(true);
  };

  const openEditBranchModal = (b: Branch) => {
    if (!canManageBranches) {
      alert('عذراً، ليس لديك صلاحية تعديل الفروع.');
      return;
    }
    setEditingBranch(b);
    setBranchName(b.name);
    setBranchCity(b.city);
    setBranchAddress(b.address);
    setBranchManager(b.managerName);
    setBranchBarcodeText(b.qrToken || b.barcodeText || `SAKHR-QR-${b.id}`);
    setBranchQrToken(b.qrToken || b.barcodeText || `SAKHR-QR-${b.id}`);
    setBranchLatitude(b.latitude !== undefined && b.latitude !== 0 ? String(b.latitude) : '31.9539');
    setBranchLongitude(b.longitude !== undefined && b.longitude !== 0 ? String(b.longitude) : '35.9106');
    setBranchRadiusMeters(b.radiusMeters !== undefined && b.radiusMeters > 0 ? String(b.radiusMeters) : '15');
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) return;

    const qrValue = (branchQrToken.trim() || branchBarcodeText.trim() || `SAKHR-QR-${Math.floor(100 + Math.random() * 900)}`).toUpperCase();

    const parsedLat = parseFloat(branchLatitude);
    const parsedLng = parseFloat(branchLongitude);
    const parsedRadius = parseFloat(branchRadiusMeters);

    const latVal = !isNaN(parsedLat) ? parsedLat : 31.9539;
    const lngVal = !isNaN(parsedLng) ? parsedLng : 35.9106;
    const radiusVal = !isNaN(parsedRadius) && parsedRadius > 0 ? parsedRadius : 15;

    if (editingBranch) {
      const updated: Branch = {
        ...editingBranch,
        name: branchName.trim(),
        city: branchCity.trim() || 'الأردن - عمّان',
        address: branchAddress.trim() || 'عمّان',
        managerName: branchManager.trim() || 'مدير الفرع',
        barcodeText: qrValue,
        qrToken: qrValue,
        latitude: latVal,
        longitude: lngVal,
        radiusMeters: radiusVal,
      };

      onUpdateBranches(db.branches.map((b) => (b.id === editingBranch.id ? updated : b)));
      setActionFeedback(`تم تعديل بيانات فرع "${updated.name}" ورمز الـ QR والموقع الجغرافي بنجاح.`);
    } else {
      const newBranch: Branch = {
        id: `br-${Date.now()}`,
        name: branchName.trim(),
        city: branchCity.trim() || 'الأردن - عمّان',
        address: branchAddress.trim() || 'عمّان',
        managerName: branchManager.trim() || 'مدير الفرع',
        barcodeText: qrValue,
        qrToken: qrValue,
        latitude: latVal,
        longitude: lngVal,
        radiusMeters: radiusVal,
      };
      onUpdateBranches([...db.branches, newBranch]);
      setActionFeedback(`تمت إضافة الفرع الجديد "${newBranch.name}" مع المحيط الجغرافي (15 متراً) بنجاح.`);
    }

    setIsBranchModalOpen(false);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const handleDeleteBranch = (branchId: string) => {
    if (!canManageBranches) {
      alert('عذراً، ليس لديك صلاحية حذف الفروع.');
      return;
    }
    const targetBranch = db.branches.find((b) => b.id === branchId);
    if (!targetBranch) return;

    const assignedEmployees = db.employees.filter((e) => e.branchId === branchId);
    if (assignedEmployees.length > 0) {
      alert(
        `لا يمكن حذف فرع "${targetBranch.name}" لأنه يحتوي على (${assignedEmployees.length}) موظف مسجل! يرجى نقل الموظفين إلى فرع آخر أولاً.`
      );
      return;
    }

    if (confirm(`هل أنت متأكد من حذف فرع "${targetBranch.name}" نهائياً من النظام؟`)) {
      onUpdateBranches(db.branches.filter((b) => b.id !== branchId));
      setActionFeedback(`تم حذف فرع "${targetBranch.name}".`);
      setTimeout(() => setActionFeedback(null), 3500);
    }
  };

  const filteredEmployees = useMemo(() => {
    return db.employees.filter((emp) => {
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        emp.name.toLowerCase().includes(q) ||
        emp.code.toLowerCase().includes(q) ||
        emp.phone.includes(q) ||
        emp.jobTitle.toLowerCase().includes(q) ||
        emp.nationalId.includes(q);
      const matchBranch = branchFilter === 'all' || emp.branchId === branchFilter;
      const matchStatus = statusFilter === 'all' || emp.status === statusFilter;
      return matchQuery && matchBranch && matchStatus;
    });
  }, [db.employees, searchQuery, branchFilter, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            ٢. شؤون الموظفين والفروع
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            مؤسسة صخر المصري (الأردن - عمّان) · إدارة بيانات الموظفين والفروع، تعديل وحذف السجلات، وإدارة باركود الفروع وقفل الهواتف
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('employees')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'employees'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              قائمة الموظفين ({db.employees.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('branches')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'branches'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              إدارة الفروع والباركود ({db.branches.length})
            </button>
          </div>

          {activeTab === 'employees' ? (
            canAddEmployee && (
              <button
                type="button"
                onClick={openAddEmployeeModal}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة موظف جديد</span>
              </button>
            )
          ) : (
            canManageBranches && (
              <button
                type="button"
                onClick={openAddBranchModal}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة فرع جديد</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{actionFeedback}</span>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">إجمالي عدد الموظفين</p>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1.5 font-mono tabular-nums">
            {db.employees.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            مسجلون في كشوفات مؤسسة صخر المصري
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">فروع المؤسسة المعتمدة</p>
            <Building2 className="w-4 h-4 text-slate-700" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1.5 font-mono tabular-nums">
            {db.branches.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            عمّان: مكة، صويلح، الجبيهة، ماركا وغيرها
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">الهواتف المقترنة للموظفين</p>
            <Smartphone className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1.5 font-mono tabular-nums">
            {db.employees.filter((e) => e.boundDeviceId).length}{' '}
            <span className="text-xs font-normal text-slate-500">من {db.employees.length}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            مقترنة لمنع تسجيل الدوام بالنيابة
          </p>
        </div>
      </div>

      {activeTab === 'employees' ? (
        /* Employees Management View */
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم، الرقم الوظيفي، الهاتف..."
                className="w-full pr-9 pl-4 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none"
              >
                <option value="all">جميع الفروع</option>
                {db.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none"
              >
                <option value="all">جميع الحالات</option>
                <option value="active">على رأس العمل</option>
                <option value="on_leave">في إجازة</option>
                <option value="suspended">موقوف</option>
              </select>
            </div>
          </div>

          {/* Employees Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                  <th className="py-3 px-3">الرقم</th>
                  <th className="py-3 px-3">الموظف والوظيفة</th>
                  <th className="py-3 px-3">الفرع</th>
                  <th className="py-3 px-3">الهاتف والوثيقة</th>
                  <th className="py-3 px-3">الرمز PIN</th>
                  <th className="py-3 px-3">الوردية</th>
                  <th className="py-3 px-3">سقف المسحوبات</th>
                  <th className="py-3 px-3">قفل الهاتف</th>
                  <th className="py-3 px-3">الحالة</th>
                  <th className="py-3 px-3 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400">
                      لا يوجد موظفون يطابقون خيارات البحث.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => {
                    const branch = db.branches.find((b) => b.id === emp.branchId);
                    const isPhoneBound = Boolean(emp.boundDeviceId);

                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-3 font-mono tabular-nums text-slate-600">
                          {emp.code}
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="font-semibold text-slate-900">{emp.name}</div>
                          <div className="text-slate-500">
                            {emp.jobTitle} · {emp.department}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-slate-700">{branch?.name}</td>
                        <td className="py-3.5 px-3 font-mono tabular-nums text-slate-600">
                          <div>{emp.phone}</div>
                          <div className="text-slate-400">الرقم الوطني: {emp.nationalId}</div>
                        </td>
                        <td className="py-3.5 px-3 font-mono tabular-nums font-bold text-emerald-700">
                          {emp.pin}
                        </td>
                        <td className="py-3.5 px-3 font-mono tabular-nums text-slate-700">
                          {emp.shiftStart} - {emp.shiftEnd}
                        </td>
                        <td className="py-3.5 px-3">
                          {emp.withdrawalLimitType === 'fixed' && emp.withdrawalLimitAmount !== undefined ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-slate-900 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md">
                              {emp.withdrawalLimitAmount.toLocaleString()} {db.settings.currency}
                            </span>
                          ) : (
                            <span className="inline-block text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              بدون سقف
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          {isPhoneBound ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <Smartphone className="w-3 h-3 text-emerald-600" />
                                <span>مقترن ({emp.boundDeviceName || 'هاتف'})</span>
                              </span>
                              {canUnbindPhone && (
                                <button
                                  type="button"
                                  onClick={() => handleUnbindEmployeePhone(emp)}
                                  className="text-[10px] text-red-600 hover:text-red-800 underline cursor-pointer"
                                  title="فك ربط الهاتف لهذا الموظف"
                                >
                                  فك الربط
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">غير مقترن بهاتف</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={
                              emp.status === 'active'
                                ? 'text-emerald-700 font-medium'
                                : emp.status === 'on_leave'
                                ? 'text-amber-700 font-medium'
                                : 'text-red-700 font-medium'
                            }
                          >
                            {STATUS_LABELS[emp.status]}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-left">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setViewingEmployee(emp)}
                              className="text-emerald-700 hover:underline font-semibold whitespace-nowrap cursor-pointer"
                            >
                              الملف الكامل
                            </button>
                            {canEditEmployee && (
                              <button
                                type="button"
                                onClick={() => openEditEmployeeModal(emp)}
                                className="p-1 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 cursor-pointer"
                                title="تعديل الموظف"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDeleteEmployee && (
                              <button
                                type="button"
                                onClick={() => handleDeleteEmployee(emp.id)}
                                className="p-1 text-red-500 hover:text-red-700 rounded-md hover:bg-red-50 cursor-pointer"
                                title="حذف الموظف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Branches Management View with Edit / Delete / Print QR Code */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {db.branches.map((b) => {
              const empCount = db.employees.filter((e) => e.branchId === b.id).length;
              const qrValue = b.qrToken || b.barcodeText || `SAKHR-QR-${b.id}`;

              return (
                <div
                  key={b.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-2xs hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">{b.name}</h3>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            {b.city} · {b.address}
                          </span>
                        </p>
                      </div>

                      <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                        {empCount} موظف
                      </span>
                    </div>

                    {/* Geolocation & Strict 15m Perimeter Badge */}
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                            <span>الموقع الجغرافي المعتمد للفرع</span>
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-200/80 text-emerald-900 font-mono">
                              دائرة {b.radiusMeters || 15} متراً
                            </span>
                          </div>
                          <div className="text-[11px] text-emerald-800/80 font-mono mt-0.5">
                            خط العرض: {b.latitude ? b.latitude.toFixed(5) : '31.95390'} · خط الطول: {b.longitude ? b.longitude.toFixed(5) : '35.91060'}
                          </div>
                        </div>
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${b.latitude || 31.9539},${b.longitude || 35.9106}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 underline shrink-0"
                      >
                        عرض بالخريطة ↗
                      </a>
                    </div>

                    {/* QR Code Presentation Box */}
                    <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between gap-3 border border-slate-800">
                      <div className="flex items-center gap-3">
                        {/* Miniature Sharp QR Code */}
                        <div className="p-1 bg-white rounded-xl shrink-0 shadow-xs">
                          <QRCodeDisplay
                            value={qrValue}
                            size={56}
                            showActions={false}
                            className="scale-90"
                          />
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 mb-0.5">رمز QR المعتمد لدوام الفرع:</div>
                          <div className="font-mono text-emerald-400 font-bold tracking-wider text-sm">
                            {qrValue}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            المدير المسؤول: <strong className="text-slate-200">{b.managerName}</strong>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setPrintingBranch(b)}
                        className="px-3 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap transition-colors shrink-0"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>عرض وطباعة الـ QR</span>
                      </button>
                    </div>
                  </div>

                  {/* Branch Action Buttons */}
                  <div className="border-t border-slate-100 pt-3 flex items-center justify-end gap-2">
                    {canManageBranches && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditBranchModal(b)}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>تعديل بيانات الفرع ورمز QR</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteBranch(b.id)}
                          className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف الفرع</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Employee Full Profile Dossier Modal */}
      {viewingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  بطاقة شؤون الموظفين — {viewingEmployee.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  الرقم الوظيفي: <span className="font-mono">{viewingEmployee.code}</span> ·{' '}
                  {viewingEmployee.jobTitle} · {viewingEmployee.department}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => exportEmployeeFullProfileToExcel(viewingEmployee, db)}
                  className="px-2.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  title="تصدير ملف الموظف إلى Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">إكسل</span>
                </button>
                <button
                  type="button"
                  onClick={() => printEmployeeProfile(viewingEmployee, db)}
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  title="طباعة ملف الموظف"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">طباعة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingEmployee(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick KPI Strip */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-center">
                <span className="text-[11px] text-emerald-800 font-medium block">أيام الحضور</span>
                <span className="text-sm sm:text-base font-bold text-emerald-950 font-mono tabular-nums mt-0.5 block">
                  {db.attendance.filter((a) => a.employeeId === viewingEmployee.id).length} يوم
                </span>
              </div>
              <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl text-center">
                <span className="text-[11px] text-teal-800 font-medium block">ساعات العمل</span>
                <span className="text-sm sm:text-base font-bold text-teal-950 font-mono tabular-nums mt-0.5 block">
                  {Math.round(db.attendance.filter((a) => a.employeeId === viewingEmployee.id).reduce((sum, a) => sum + (a.totalHours || 0), 0) * 10) / 10} س
                </span>
              </div>
              <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl text-center">
                <span className="text-[11px] text-rose-800 font-medium block">المسحوبات والسلف</span>
                <span className="text-sm sm:text-base font-bold text-rose-900 font-mono tabular-nums mt-0.5 block">
                  {db.withdrawals.filter((w) => w.employeeId === viewingEmployee.id).reduce((sum, w) => sum + (w.amount || 0), 0).toLocaleString()} {db.settings.currency}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">الفرع</span>
                <span className="font-semibold text-slate-900 mt-1 block">
                  {db.branches.find((b) => b.id === viewingEmployee.branchId)?.name || 'جميع الفروع'}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">رقم الهاتف</span>
                <span className="font-mono font-semibold text-slate-900 mt-1 block">
                  {viewingEmployee.phone}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">الرقم الوطني / الوثيقة</span>
                <span className="font-mono font-semibold text-slate-900 mt-1 block">
                  {viewingEmployee.nationalId}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">تاريخ المباشرة</span>
                <span className="font-mono font-semibold text-slate-900 mt-1 block">
                  {viewingEmployee.hireDate}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">رمز الدوام السري (PIN)</span>
                <span className="font-mono font-bold text-emerald-700 mt-1 block">
                  {viewingEmployee.pin}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">أوقات الوردية</span>
                <span className="font-mono font-semibold text-slate-900 mt-1 block">
                  {viewingEmployee.shiftStart} - {viewingEmployee.shiftEnd}
                </span>
              </div>
            </div>

            {/* Withdrawal Limit Status in Dossier (Request 6) */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800">سقف المسحوبات النقدية:</span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  الحد المسموح به للموظف من السلف النقدية
                </p>
              </div>
              <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-900">
                {viewingEmployee.withdrawalLimitType === 'fixed' && viewingEmployee.withdrawalLimitAmount !== undefined
                  ? `${viewingEmployee.withdrawalLimitAmount.toLocaleString()} ${db.settings.currency}`
                  : 'بدون سقف (مفتوح)'}
              </span>
            </div>

            {/* Device Binding Status in Dossier */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <div>
                  <span className="font-bold text-slate-900">هاتف الدوام المقترن:</span>
                  <div className="text-slate-600">
                    {viewingEmployee.boundDeviceId
                      ? `مقترن بـ ${viewingEmployee.boundDeviceName || 'هاتف موظف'} (قفل أمني نشط)`
                      : 'لم يتم ربط هاتف بهذا الموظف بعد'}
                  </div>
                </div>
              </div>

              {viewingEmployee.boundDeviceId && canUnbindPhone && (
                <button
                  type="button"
                  onClick={() => handleUnbindEmployeePhone(viewingEmployee)}
                  className="px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer"
                >
                  فك ربط الهاتف
                </button>
              )}
            </div>

            {/* Employee Withdrawals History */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-semibold text-slate-900">
                سجل المسحوبات والسلف للموظف (
                {db.withdrawals.filter((w) => w.employeeId === viewingEmployee.id).length} عملية)
              </h4>
              <div className="divide-y divide-slate-100 text-xs max-h-40 overflow-y-auto">
                {db.withdrawals
                  .filter((w) => w.employeeId === viewingEmployee.id)
                  .map((w) => (
                    <div key={w.id} className="py-2 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-slate-600">{w.date}</span> ·{' '}
                        <span className="text-slate-800">{w.reason}</span>
                      </div>
                      <span className="font-mono font-semibold text-red-600">
                        -{w.amount.toLocaleString()} {db.settings.currency}
                      </span>
                    </div>
                  ))}
                {db.withdrawals.filter((w) => w.employeeId === viewingEmployee.id).length === 0 && (
                  <p className="text-slate-400 py-2">لا توجد مسحوبات نقدية مسجلة على الموظف.</p>
                )}
              </div>
            </div>

            {/* Recent Attendance Preview */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-900">
                  سجل دوام وحضور الموظف (
                  {db.attendance.filter((a) => a.employeeId === viewingEmployee.id).length} حركة)
                </h4>
                <span className="text-[11px] text-slate-400">آخر الحركات</span>
              </div>
              <div className="divide-y divide-slate-100 text-xs max-h-36 overflow-y-auto">
                {db.attendance
                  .filter((a) => a.employeeId === viewingEmployee.id)
                  .slice(0, 6)
                  .map((a) => (
                    <div key={a.id} className="py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-600">{a.date}</span>
                        <span className="text-emerald-700 font-semibold">{a.checkInTime || '-'}</span>
                        <span className="text-slate-400">←</span>
                        <span className="text-slate-700">{a.checkOutTime || 'قيد العمل'}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        {a.totalHours || 0} ساعة
                      </span>
                    </div>
                  ))}
                {db.attendance.filter((a) => a.employeeId === viewingEmployee.id).length === 0 && (
                  <p className="text-slate-400 py-2">لا توجد حركات دوام مسجلة للموظف بعد.</p>
                )}
              </div>
            </div>

            {/* Action Buttons in Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportEmployeeFullProfileToExcel(viewingEmployee, db)}
                  className="px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>تصدير ملف الموظف إلى إكسل</span>
                </button>

                <button
                  type="button"
                  onClick={() => printEmployeeProfile(viewingEmployee, db)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <Printer className="w-4 h-4 text-slate-600" />
                  <span>طباعة ملف الموظف</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {canEditEmployee && (
                  <button
                    type="button"
                    onClick={() => {
                      const emp = viewingEmployee;
                      setViewingEmployee(null);
                      openEditEmployeeModal(emp);
                    }}
                    className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 cursor-pointer"
                  >
                    تعديل بيانات الموظف
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingEmployee(null)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              {editingEmployee
                ? `تعديل بيانات الموظف: ${editingEmployee.name}`
                : 'إضافة موظف جديد — مؤسسة صخر المصري'}
            </h3>
            <form onSubmit={handleSaveEmployee} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    الاسم الكامل للموظف *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="مثال: أحمد محمود النسور"
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    الرقم الوظيفي
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">الفرع</label>
                  <select
                    value={formBranchId}
                    onChange={(e) => setFormBranchId(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                  >
                    {db.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    المسمى الوظيفي
                  </label>
                  <input
                    type="text"
                    value={formJobTitle}
                    onChange={(e) => setFormJobTitle(e.target.value)}
                    placeholder="مثال: مسؤول مبيعات"
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">القسم</label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    رقم الهاتف الخلوي
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="079xxxxxxx"
                    className="w-full px-3.5 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    الرقم الوطني / الوثيقة
                  </label>
                  <input
                    type="text"
                    value={formNationalId}
                    onChange={(e) => setFormNationalId(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    الرمز السري للدوام (PIN)
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={formPin}
                    onChange={(e) => setFormPin(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    تاريخ المباشرة
                  </label>
                  <input
                    type="date"
                    value={formHireDate}
                    onChange={(e) => setFormHireDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    بداية الدوام
                  </label>
                  <input
                    type="time"
                    value={formShiftStart}
                    onChange={(e) => setFormShiftStart(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    نهاية الدوام
                  </label>
                  <input
                    type="time"
                    value={formShiftEnd}
                    onChange={(e) => setFormShiftEnd(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    الحالة الوظيفية
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as EmployeeStatus)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="active">على رأس العمل</option>
                    <option value="on_leave">في إجازة</option>
                    <option value="suspended">موقوف مؤقتاً</option>
                  </select>
                </div>
              </div>

              {/* Withdrawal Limit Setting (Request 6) */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-0.5">
                    سقف المسحوبات النقدية والسلف للموظف:
                  </label>
                  <p className="text-[11px] text-slate-500">
                    حدد ما إذا كان للموظف سقف محدد للمسحوبات أو تركه مفتوحاً بدون سقف.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                      formWithdrawalLimitType === 'unlimited'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="formWithdrawalLimitType"
                      checked={formWithdrawalLimitType === 'unlimited'}
                      onChange={() => setFormWithdrawalLimitType('unlimited')}
                      className="accent-emerald-600 w-4 h-4 cursor-pointer"
                    />
                    <span>بدون سقف (مفتوح)</span>
                  </label>

                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                      formWithdrawalLimitType === 'fixed'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="formWithdrawalLimitType"
                      checked={formWithdrawalLimitType === 'fixed'}
                      onChange={() => setFormWithdrawalLimitType('fixed')}
                      className="accent-emerald-600 w-4 h-4 cursor-pointer"
                    />
                    <span>تحديد قيمة (سقف محدد)</span>
                  </label>
                </div>

                {formWithdrawalLimitType === 'fixed' && (
                  <div className="pt-2 border-t border-slate-200/90">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      قيمة سقف المسحوبات بالـ ({db.settings.currency}) *
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        required={formWithdrawalLimitType === 'fixed'}
                        value={formWithdrawalLimitAmount}
                        onChange={(e) => setFormWithdrawalLimitAmount(e.target.value)}
                        placeholder="مثال: 150"
                        className="w-full px-3.5 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-white"
                      />
                      <span className="text-xs font-bold text-slate-600 shrink-0 font-mono">
                        {db.settings.currency}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      سيتم تنبيه المسؤول إذا تجاوزت مسحوبات الموظف هذا السقف عند الصرف.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 cursor-pointer"
                >
                  حفظ بيانات الموظف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Branch Modal */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              {editingBranch ? `تعديل الفرع: ${editingBranch.name}` : 'إضافة فرع جديد للمؤسسة'}
            </h3>
            <form onSubmit={handleSaveBranch} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  اسم الفرع *
                </label>
                <input
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="مثال: فرع طبربور - عمّان"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">المدينة</label>
                <input
                  type="text"
                  value={branchCity}
                  onChange={(e) => setBranchCity(e.target.value)}
                  placeholder="الأردن - عمّان"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  العنوان التفصيلي
                </label>
                <input
                  type="text"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                  placeholder="عمّان، الشارع العام..."
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  اسم مدير الفرع المسؤول
                </label>
                <input
                  type="text"
                  value={branchManager}
                  onChange={(e) => setBranchManager(e.target.value)}
                  placeholder="اسم مدير الفرع..."
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  رمز كود QR المخصص لدوام الفرع (QR Code Token) *
                </label>
                <input
                  type="text"
                  required
                  value={branchQrToken || branchBarcodeText}
                  onChange={(e) => {
                    setBranchQrToken(e.target.value);
                    setBranchBarcodeText(e.target.value);
                  }}
                  placeholder="مثال: SAKHR-QR-TBR-505"
                  className="w-full px-3.5 py-2 text-xs font-mono font-bold border border-slate-300 rounded-xl bg-slate-50 focus:bg-white"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  هذا الكود يتم تشفيره في رمز الـ QR ويمسحه الموظف بكاميرا هاتفه لتسجيل الحضور
                </span>
              </div>

              {/* Geographic Perimeter Settings (Strict 15m Circle) */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-900">
                      الموقع الجغرافي ونطاق الـ 15 متراً (GPS)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCaptureCurrentGps}
                    disabled={isCapturingGps}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-100 hover:bg-emerald-200/80 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{isCapturingGps ? 'جاري الالتقاط...' : '📍 التقاط موقعي الحالي'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      خط العرض (Latitude) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={branchLatitude}
                      onChange={(e) => setBranchLatitude(e.target.value)}
                      placeholder="31.9539"
                      className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      خط الطول (Longitude) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={branchLongitude}
                      onChange={(e) => setBranchLongitude(e.target.value)}
                      placeholder="35.9106"
                      className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700">
                      نصف قطر دائرة التواجد المسموح بها (متر) *
                    </label>
                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      المعتمد: 15 متر
                    </span>
                  </div>
                  <input
                    type="number"
                    min="5"
                    max="500"
                    required
                    value={branchRadiusMeters}
                    onChange={(e) => setBranchRadiusMeters(e.target.value)}
                    placeholder="15"
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-xl bg-white"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    يمنع النظام تسجيل الدوام قطعياً إذا كان الموظف خارج هذه الدائرة (15 متراً) حتى لو قام بمسح رمز الـ QR.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 cursor-pointer"
                >
                  {editingBranch ? 'تحديث بيانات الفرع والموقع الجغرافي' : 'إضافة الفرع'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Branch QR Poster Modal */}
      {printingBranch && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-5 shadow-2xl text-center">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <span className="text-xs font-semibold text-slate-500">
                لافتة رمز QR المعتمدة للفرع للطباعة والتعليق
              </span>
              <button
                type="button"
                onClick={() => setPrintingBranch(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Poster Area */}
            <div className="border-4 border-slate-900 rounded-2xl p-6 space-y-4 bg-white print:border-none shadow-xs">
              <div className="text-center">
                <div className="text-xs font-extrabold text-emerald-700 tracking-wide uppercase">
                  مؤسسة صخر المصري
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 mt-1">
                  {printingBranch.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {printingBranch.city} · {printingBranch.address}
                </p>
              </div>

              <div className="py-4 border-y-2 border-dashed border-slate-200 flex flex-col items-center">
                <div className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-emerald-600" />
                  <span>نقطة تسجيل دوام الموظفين — امسح رمز الـ QR بهاتفك</span>
                </div>

                {/* High-Resolution QR Code */}
                <QRCodeDisplay
                  value={printingBranch.qrToken || printingBranch.barcodeText || `SAKHR-QR-${printingBranch.id}`}
                  size={200}
                  showActions={true}
                  className="my-1"
                />

                <p className="text-[11px] text-slate-500 mt-3 font-medium">
                  وجّه كاميرا هاتفك الذكي نحو الرمز لتسجيل الحضور أو الانصراف فوراً
                </p>
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-center">
                🔒 النظام محمي بسياسة ربط الهاتف الواحد للموظف — يمنع تسجيل الدوام لزميل آخر.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة اللافتة للتعليق</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintingBranch(null)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
