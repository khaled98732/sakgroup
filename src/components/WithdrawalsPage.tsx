import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  X,
  Edit,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { AppDatabase, CashWithdrawal, WithdrawalType, AppUser } from '../types';

interface WithdrawalsPageProps {
  db: AppDatabase;
  currentUser?: AppUser | null;
  onUpdateWithdrawals: (withdrawals: CashWithdrawal[]) => void;
}

const WITHDRAWAL_TYPE_LABELS: Record<WithdrawalType, string> = {
  daily_advance: 'سلفة نقدية يومية',
  emergency_advance: 'سلفة طارئة',
  purchases: 'مشتريات على حساب الموظف',
  deduction: 'خصم إداري / عجز صندوق',
};

function getTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const WithdrawalsPage: React.FC<WithdrawalsPageProps> = ({
  db,
  currentUser,
  onUpdateWithdrawals,
}) => {
  // Permissions
  const canAdd = !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.withdrawals_add);
  const canEdit = !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.withdrawals_edit);
  const canDelete = !currentUser || currentUser.isAdmin || Boolean(currentUser.permissions?.withdrawals_delete);

  // New withdrawal form state
  const [selectedEmpId, setSelectedEmpId] = useState<string>(db.employees[0]?.id || '');
  const [date, setDate] = useState<string>(getTodayStr());
  const [amount, setAmount] = useState<string>('');
  const [wType, setWType] = useState<WithdrawalType>('daily_advance');
  const [reason, setReason] = useState<string>('');
  const [approvedBy, setApprovedBy] = useState<string>(currentUser?.name || 'الإدارة المالية');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Editing withdrawal state
  const [editingWithdrawal, setEditingWithdrawal] = useState<CashWithdrawal | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editType, setEditType] = useState<WithdrawalType>('daily_advance');
  const [editReason, setEditReason] = useState<string>('');
  const [editApprovedBy, setEditApprovedBy] = useState<string>('');

  // Ledger Filters
  const [filterEmpId, setFilterEmpId] = useState<string>('all');
  const [filterBranchId, setFilterBranchId] = useState<string>('all');
  const [filterFromDate, setFilterFromDate] = useState<string>('');
  const [filterToDate, setFilterToDate] = useState<string>('');

  // Receipt Print Modal
  const [receiptVoucher, setReceiptVoucher] = useState<CashWithdrawal | null>(null);

  // Full Statement Print Modal (Request 5)
  const [showStatementModal, setShowStatementModal] = useState<boolean>(false);

  const selectedEmployee = useMemo(
    () => db.employees.find((e) => e.id === selectedEmpId),
    [db.employees, selectedEmpId]
  );

  // Calculate current employee's total withdrawals so far & withdrawal ceiling (Request 6)
  const employeeStats = useMemo(() => {
    if (!selectedEmployee) {
      return {
        totalWithdrawn: 0,
        count: 0,
        limitType: 'unlimited' as 'unlimited' | 'fixed',
        limitAmount: 0,
        remainingLimit: null as number | null,
      };
    }
    const empWds = db.withdrawals.filter((w) => w.employeeId === selectedEmployee.id);
    const totalWithdrawn = empWds.reduce((sum, w) => sum + w.amount, 0);
    const limitType = selectedEmployee.withdrawalLimitType || 'unlimited';
    const limitAmount = selectedEmployee.withdrawalLimitAmount || 0;
    const remainingLimit = limitType === 'fixed' ? Math.max(0, limitAmount - totalWithdrawn) : null;
    return { totalWithdrawn, count: empWds.length, limitType, limitAmount, remainingLimit };
  }, [selectedEmployee, db.withdrawals]);

  const handleAddWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) {
      alert('ليس لديك صلاحية إضافة سلفة جديدة.');
      return;
    }
    const numericAmount = Number(amount);
    if (!selectedEmployee || isNaN(numericAmount) || numericAmount <= 0) return;

    // Check withdrawal limit (Request 6)
    if (selectedEmployee.withdrawalLimitType === 'fixed') {
      const limitVal = selectedEmployee.withdrawalLimitAmount || 0;
      if (employeeStats.totalWithdrawn + numericAmount > limitVal) {
        const excess = employeeStats.totalWithdrawn + numericAmount - limitVal;
        const confirmOverLimit = confirm(
          `⚠️ تنبيه سقف المسحوبات للموظف (${selectedEmployee.name}):\n` +
            `• سقف المسحوبات المحدد: ${limitVal.toLocaleString()} ${db.settings.currency}\n` +
            `• إجمالي المسحوبات الحالية: ${employeeStats.totalWithdrawn.toLocaleString()} ${db.settings.currency}\n` +
            `• المبلغ المراد صرفه: ${numericAmount.toLocaleString()} ${db.settings.currency}\n` +
            `• التجاوز عن السقف: ${excess.toLocaleString()} ${db.settings.currency}\n\n` +
            `هل ترغب باعتماد وصرف السلفة رغم تجاوز السقف المحدد بموافقة الإدارة؟`
        );
        if (!confirmOverLimit) return;
      }
    }

    const newItem: CashWithdrawal = {
      id: `wd-${Date.now()}`,
      employeeId: selectedEmployee.id,
      branchId: selectedEmployee.branchId,
      date,
      amount: numericAmount,
      type: wType,
      reason: reason.trim() || WITHDRAWAL_TYPE_LABELS[wType],
      approvedBy: approvedBy.trim() || 'الإدارة',
      createdAt: new Date().toISOString(),
    };

    onUpdateWithdrawals([newItem, ...db.withdrawals]);
    setAmount('');
    setReason('');
    setSuccessMsg(
      `تم تسجيل سحب نقدي بمبلغ ${numericAmount.toLocaleString()} ${db.settings.currency} للموظف ${selectedEmployee.name} بنجاح.`
    );
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleOpenEdit = (w: CashWithdrawal) => {
    setEditingWithdrawal(w);
    setEditAmount(String(w.amount));
    setEditDate(w.date);
    setEditType(w.type);
    setEditReason(w.reason);
    setEditApprovedBy(w.approvedBy);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWithdrawal) return;
    const num = Number(editAmount);
    if (isNaN(num) || num <= 0) {
      alert('يرجى إدخال مبلغ صحيح');
      return;
    }

    const updated = db.withdrawals.map((item) =>
      item.id === editingWithdrawal.id
        ? {
            ...item,
            amount: num,
            date: editDate,
            type: editType,
            reason: editReason.trim() || item.reason,
            approvedBy: editApprovedBy.trim() || item.approvedBy,
          }
        : item
    );

    onUpdateWithdrawals(updated);
    setEditingWithdrawal(null);
    setSuccessMsg('تم تعديل بيانات السلفة النقدية بنجاح.');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleDeleteWithdrawal = (id: string) => {
    if (!canDelete) {
      alert('ليس لديك صلاحية حذف السلف.');
      return;
    }
    if (confirm('هل أنت متأكد من حذف هذا السجل من السلف؟')) {
      onUpdateWithdrawals(db.withdrawals.filter((w) => w.id !== id));
    }
  };

  const filteredWithdrawals = useMemo(() => {
    return db.withdrawals.filter((w) => {
      const matchEmp = filterEmpId === 'all' || w.employeeId === filterEmpId;
      const matchBranch = filterBranchId === 'all' || w.branchId === filterBranchId;
      const matchFrom = !filterFromDate || w.date >= filterFromDate;
      const matchTo = !filterToDate || w.date <= filterToDate;
      return matchEmp && matchBranch && matchFrom && matchTo;
    });
  }, [db.withdrawals, filterEmpId, filterBranchId, filterFromDate, filterToDate]);

  const filteredTotalAmount = useMemo(() => {
    return filteredWithdrawals.reduce((sum, w) => sum + w.amount, 0);
  }, [filteredWithdrawals]);

  const todayTotalAmount = useMemo(() => {
    const todayStr = getTodayStr();
    return db.withdrawals
      .filter((w) => w.date === todayStr)
      .reduce((sum, w) => sum + w.amount, 0);
  }, [db.withdrawals]);

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          ٣. تسجيل وتعديل مسحوبات الموظفين النقدية اليومية
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          توثيق السُلف، تعديل مبالغها وتواريخها، وحذفها، وربطها تلقائياً بمسير الرواتب بالدينار الأردني ({db.settings.currency})
        </p>
      </div>

      {/* Top Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">
            إجمالي المسحوبات المسجلة (حسب الفلتر)
          </p>
          <p className="text-2xl font-bold text-red-700 mt-1.5 font-mono tabular-nums">
            {filteredTotalAmount.toLocaleString()}{' '}
            <span className="text-xs font-normal text-slate-500">{db.settings.currency}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            عدد السندات: <span className="font-mono">{filteredWithdrawals.length}</span> عملية سحب
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">
            مسحوبات اليوم ({getTodayStr()})
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1.5 font-mono tabular-nums">
            {todayTotalAmount.toLocaleString()}{' '}
            <span className="text-xs font-normal text-slate-500">{db.settings.currency}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">مجموع المبالغ المسحوبة اليوم</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">
            عدد الموظفين المستفيدين من السُلف
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1.5 font-mono tabular-nums">
            {new Set(db.withdrawals.map((w) => w.employeeId)).size} / {db.employees.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">تخصم تلقائياً في صفحة الرواتب</p>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Card (5 cols) */}
        {canAdd && (
          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-5 shadow-2xs">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                تسجيل عملية سحب نقدي جديدة
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                سجل المبلغ المسحوب للموظف ليتم ترحيله فوراً لحسابه
              </p>
            </div>

            <form onSubmit={handleAddWithdrawal} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  اختيار الموظف *
                </label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-emerald-600"
                >
                  {db.employees.map((emp) => {
                    const branch = db.branches.find((b) => b.id === emp.branchId);
                    return (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} — ({branch?.name})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Live Employee Withdrawals Summary Box */}
              {selectedEmployee && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">إجمالي المسحوبات المسجلة على الموظف:</span>
                    <span className="font-mono font-bold text-red-600">
                      {employeeStats.totalWithdrawn.toLocaleString()} {db.settings.currency}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>عدد عمليات السحب السابقة:</span>
                    <span className="font-mono">{employeeStats.count} عمليات</span>
                  </div>
                  {/* Withdrawal Limit Display (Request 6) */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                    <span className="text-slate-600">سقف المسحوبات المحدد:</span>
                    <span className="font-bold text-slate-800">
                      {employeeStats.limitType === 'fixed'
                        ? `${employeeStats.limitAmount.toLocaleString()} ${db.settings.currency}`
                        : 'بدون سقف (مفتوح)'}
                    </span>
                  </div>
                  {employeeStats.limitType === 'fixed' && employeeStats.remainingLimit !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">المتبقي من سقف السحب:</span>
                      <span
                        className={`font-mono font-bold ${
                          employeeStats.remainingLimit <= 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {employeeStats.remainingLimit.toLocaleString()} {db.settings.currency}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    المبلغ المسحوب ({db.settings.currency}) *
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="any"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="مثال: 25"
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    تاريخ السحب *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    نوع السحب النقدي
                  </label>
                  <select
                    value={wType}
                    onChange={(e) => setWType(e.target.value as WithdrawalType)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="daily_advance">سلفة نقدية يومية</option>
                    <option value="emergency_advance">سلفة طارئة</option>
                    <option value="purchases">مشتريات على حساب الموظف</option>
                    <option value="deduction">خصم إداري / عجز صندوق</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    المعتمد للصرف
                  </label>
                  <input
                    type="text"
                    value={approvedBy}
                    onChange={(e) => setApprovedBy(e.target.value)}
                    placeholder="اسم المدير أو المحاسب"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  البيان / سبب السحب
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="مثال: سلفة نقدية يومية من صندوق الفرع..."
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل وحفظ السحب النقدي</span>
              </button>
            </form>
          </div>
        )}

        {/* Withdrawals History Table & Mobile Cards (7 cols or full width if cannot add) */}
        <div className={`${canAdd ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-5 shadow-2xs`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                سجل المسحوبات والسلف النقدية
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                استعراض، تعديل وحذف السلف وطباعة كشف المسحوبات وسندات الصرف
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowStatementModal(true)}
              className="px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer shrink-0 self-start sm:self-auto"
              title="طباعة كشف المسحوبات والسلف النقدية حسب الفلاتر المحددة"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>طباعة كشف المسحوبات</span>
            </button>
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">الموظف</label>
              <select
                value={filterEmpId}
                onChange={(e) => setFilterEmpId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xl bg-white"
              >
                <option value="all">جميع الموظفين</option>
                {db.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">الفرع</label>
              <select
                value={filterBranchId}
                onChange={(e) => setFilterBranchId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xl bg-white"
              >
                <option value="all">كل الفروع</option>
                {db.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">من تاريخ</label>
              <input
                type="date"
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">إلى تاريخ</label>
              <input
                type="date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          {/* Mobile Cards for Withdrawals */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredWithdrawals.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                لا توجد مسحوبات نقدية مسجلة تطابق الفلتر المحدد.
              </div>
            ) : (
              filteredWithdrawals.map((w) => {
                const emp = db.employees.find((e) => e.id === w.employeeId);
                const branch = db.branches.find((b) => b.id === w.branchId);
                return (
                  <div
                    key={w.id}
                    className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/40 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {emp?.name || 'موظف'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {branch?.name} · <span className="font-mono">{w.date}</span>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-bold text-red-600">
                        {w.amount.toLocaleString()} {db.settings.currency}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200/70 pt-2 text-xs">
                      <span className="text-slate-600 truncate pl-2">{w.reason}</span>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setReceiptVoucher(w)}
                          className="text-slate-700 font-medium px-2 py-1 bg-white border border-slate-200 rounded"
                        >
                          سند
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(w)}
                            className="text-emerald-700 font-semibold px-2 py-1 bg-emerald-50 rounded"
                          >
                            تعديل
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteWithdrawal(w.id)}
                            className="text-red-600 px-1"
                          >
                            حذف
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table for Withdrawals */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/80">
                  <th className="py-3.5 px-3 font-medium">التاريخ</th>
                  <th className="py-3.5 px-3 font-medium">الموظف</th>
                  <th className="py-3.5 px-3 font-medium">النوع والبيان</th>
                  <th className="py-3.5 px-3 font-medium">المبلغ المسحوب</th>
                  <th className="py-3.5 px-3 font-medium">المعتمد</th>
                  <th className="py-3.5 px-3 font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredWithdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                      لا توجد مسحوبات نقدية مسجلة تطابق الفلتر المحدد.
                    </td>
                  </tr>
                ) : (
                  filteredWithdrawals.map((w) => {
                    const emp = db.employees.find((e) => e.id === w.employeeId);
                    const branch = db.branches.find((b) => b.id === w.branchId);
                    return (
                      <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-3 text-xs font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {w.date}
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="text-xs font-semibold text-slate-900">
                            {emp?.name || 'موظف'}
                          </div>
                          <div className="text-[11px] text-slate-500">{branch?.name}</div>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="text-xs text-slate-800">{w.reason}</div>
                          <div className="text-[11px] text-slate-500">
                            {WITHDRAWAL_TYPE_LABELS[w.type]}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-xs font-mono tabular-nums font-bold text-red-600 whitespace-nowrap">
                          {w.amount.toLocaleString()} {db.settings.currency}
                        </td>
                        <td className="py-3.5 px-3 text-xs text-slate-600">{w.approvedBy}</td>
                        <td className="py-3.5 px-3 text-xs">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setReceiptVoucher(w)}
                              className="text-slate-600 hover:text-slate-900 px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                              title="سند صرف"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>سند</span>
                            </button>

                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(w)}
                                className="text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1 cursor-pointer"
                                title="تعديل السلفة"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>تعديل</span>
                              </button>
                            )}

                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeleteWithdrawal(w.id)}
                                className="text-red-600 hover:text-red-700 p-1 cursor-pointer"
                                title="حذف"
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
              {filteredWithdrawals.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-xs">
                    <td colSpan={3} className="py-3.5 px-3 text-slate-800">
                      إجمالي المسحوبات المعروضة
                    </td>
                    <td className="py-3.5 px-3 font-mono tabular-nums text-red-700">
                      {filteredTotalAmount.toLocaleString()} {db.settings.currency}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Edit Withdrawal Modal */}
      {editingWithdrawal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  تعديل بيانات السلفة النقدية
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  للموظف: {db.employees.find((e) => e.id === editingWithdrawal.employeeId)?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingWithdrawal(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    المبلغ المعدل ({db.settings.currency}) *
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="any"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono font-bold border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    التاريخ *
                  </label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  نوع السحب
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as WithdrawalType)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                >
                  <option value="daily_advance">سلفة نقدية يومية</option>
                  <option value="emergency_advance">سلفة طارئة</option>
                  <option value="purchases">مشتريات على حساب الموظف</option>
                  <option value="deduction">خصم إداري / عجز صندوق</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  البيان والسبب
                </label>
                <input
                  type="text"
                  required
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  المعتمد للصرف
                </label>
                <input
                  type="text"
                  value={editApprovedBy}
                  onChange={(e) => setEditApprovedBy(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingWithdrawal(null)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 cursor-pointer"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Voucher Modal */}
      {receiptVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  سند صرف مسحوبات نقدية — مؤسسة صخر المصري
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  الأردن - عمّان · {receiptVoucher.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptVoucher(null)}
                className="text-slate-400 hover:text-slate-700 no-print"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <div className="flex justify-between">
                <span className="text-slate-500">التاريخ:</span>
                <span className="font-mono font-semibold">{receiptVoucher.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">اسم الموظف المستلم:</span>
                <span className="font-semibold text-slate-900">
                  {db.employees.find((e) => e.id === receiptVoucher.employeeId)?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الفرع:</span>
                <span>
                  {db.branches.find((b) => b.id === receiptVoucher.branchId)?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">نوع السحب:</span>
                <span>{WITHDRAWAL_TYPE_LABELS[receiptVoucher.type]}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-700 font-medium">المبلغ المصروف:</span>
                <span className="text-base font-mono font-bold text-red-700">
                  {receiptVoucher.amount.toLocaleString()} {db.settings.currency}
                </span>
              </div>
              <div className="pt-1">
                <span className="text-slate-500 block">البيان:</span>
                <p className="text-slate-800 mt-0.5">{receiptVoucher.reason}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-200 text-center text-slate-500">
                <div>
                  <p>توقيع المستلم</p>
                  <p className="mt-4">........................</p>
                </div>
                <div>
                  <p>اعتماد الإدارة</p>
                  <p className="mt-4 font-medium text-slate-700">{receiptVoucher.approvedBy}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة السند</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptVoucher(null)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* FULL WITHDRAWALS STATEMENT PRINT MODAL (Request 5)               */}
      {/* ================================================================ */}
      {showStatementModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-4xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-auto text-right">
            {/* Modal Actions Header (Hidden in Print) */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 no-print">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  معاينة وطباعة كشف المسحوبات والسلف
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الكشف الآن (Print)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowStatementModal(false)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Print Statement Document Area */}
            <div className="space-y-6 p-4 sm:p-6 bg-white border border-slate-200 rounded-2xl">
              {/* Formal Institution Header */}
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                    مؤسسة صخر المصري
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    النظام الإداري والمالي الموحد · الأردن - عمّان
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    العملة: الدينار الأردني ({db.settings.currency})
                  </p>
                </div>

                <div className="text-left space-y-1">
                  <span className="inline-block px-3 py-1 bg-slate-900 text-white text-xs font-bold rounded-lg">
                    كشف مسحوبات وسلف نقدية
                  </span>
                  <div className="text-[11px] text-slate-500 font-mono">
                    تاريخ الإصدار: {getTodayStr()}
                  </div>
                </div>
              </div>

              {/* Statement Metadata & Filters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">الموظف المشمول:</span>
                  <span className="font-bold text-slate-800">
                    {filterEmpId === 'all'
                      ? 'كافة الموظفين'
                      : db.employees.find((e) => e.id === filterEmpId)?.name || filterEmpId}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[11px]">الفرع:</span>
                  <span className="font-bold text-slate-800">
                    {filterBranchId === 'all'
                      ? 'كافة الفروع'
                      : db.branches.find((b) => b.id === filterBranchId)?.name || filterBranchId}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[11px]">من تاريخ:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {filterFromDate || 'بداية السجلات'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[11px]">إلى تاريخ:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {filterToDate || 'حتى تاريخه'}
                  </span>
                </div>
              </div>

              {/* Withdrawals Detailed Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-300 bg-slate-100/80 text-slate-700">
                      <th className="py-2.5 px-2 font-bold">#</th>
                      <th className="py-2.5 px-2 font-bold">التاريخ</th>
                      <th className="py-2.5 px-2 font-bold">اسم الموظف</th>
                      <th className="py-2.5 px-2 font-bold">الفرع</th>
                      <th className="py-2.5 px-2 font-bold">نوع السحب</th>
                      <th className="py-2.5 px-2 font-bold">البيان والسبب</th>
                      <th className="py-2.5 px-2 font-bold text-left">المبلغ ({db.settings.currency})</th>
                      <th className="py-2.5 px-2 font-bold">المعتمد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredWithdrawals.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-400">
                          لا توجد مسحوبات مسجلة تطابق هذه الفترة أو الفلاتر.
                        </td>
                      </tr>
                    ) : (
                      filteredWithdrawals.map((w, index) => {
                        const emp = db.employees.find((e) => e.id === w.employeeId);
                        const branch = db.branches.find((b) => b.id === w.branchId);
                        return (
                          <tr key={w.id} className="hover:bg-slate-50">
                            <td className="py-2 px-2 font-mono text-slate-400">{index + 1}</td>
                            <td className="py-2 px-2 font-mono tabular-nums whitespace-nowrap">
                              {w.date}
                            </td>
                            <td className="py-2 px-2 font-semibold text-slate-900">
                              {emp?.name || 'موظف'}
                            </td>
                            <td className="py-2 px-2 text-slate-600">{branch?.name || '-'}</td>
                            <td className="py-2 px-2 text-slate-600">
                              {WITHDRAWAL_TYPE_LABELS[w.type]}
                            </td>
                            <td className="py-2 px-2 text-slate-800">{w.reason}</td>
                            <td className="py-2 px-2 font-mono font-bold text-red-700 text-left whitespace-nowrap">
                              {w.amount.toLocaleString()}
                            </td>
                            <td className="py-2 px-2 text-slate-600">{w.approvedBy}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {filteredWithdrawals.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-900 bg-slate-50 font-bold">
                        <td colSpan={6} className="py-3 px-2 text-slate-900">
                          إجمالي المسحوبات والسلف النقدية في الكشف:
                        </td>
                        <td className="py-3 px-2 font-mono text-base font-black text-red-700 text-left whitespace-nowrap">
                          {filteredTotalAmount.toLocaleString()} {db.settings.currency}
                        </td>
                        <td className="py-3 px-2 text-slate-500 font-normal text-[11px]">
                          عدد العمليات: {filteredWithdrawals.length}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Official Signatures Section */}
              <div className="grid grid-cols-3 gap-6 pt-10 border-t border-slate-200 text-center text-xs text-slate-700">
                <div className="space-y-4">
                  <p className="font-bold">إعداد المحاسب المسؤول</p>
                  <p className="font-mono text-slate-400">التوقيع: ............................</p>
                </div>
                <div className="space-y-4">
                  <p className="font-bold">تدقيق شؤون الموظفين</p>
                  <p className="font-mono text-slate-400">التوقيع: ............................</p>
                </div>
                <div className="space-y-4">
                  <p className="font-bold">اعتماد الإدارة المالية والمدير العام</p>
                  <p className="font-mono text-slate-400">التوقيع: ............................</p>
                </div>
              </div>
            </div>

            {/* Bottom Actions (Hidden in Print) */}
            <div className="flex items-center justify-end gap-3 no-print pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowStatementModal(false)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl cursor-pointer"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex items-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>طباعة الكشف</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
