import React, { useState, useMemo } from 'react';
import {
  Printer,
  CheckCircle2,
  Download,
  X,
  Wallet,
  TrendingDown,
  Banknote,
} from 'lucide-react';
import { AppDatabase, Employee, SalaryPayment, CashWithdrawal, AppUser } from '../types';

interface PayrollPageProps {
  db: AppDatabase;
  currentUser?: AppUser | null;
  onUpdateSalaryPayments: (payments: SalaryPayment[]) => void;
  onUpdateEmployees: (employees: Employee[]) => void;
  onUpdateWithdrawals?: (withdrawals: CashWithdrawal[]) => void;
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function getDaysOffsetStr(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const PayrollPage: React.FC<PayrollPageProps> = ({
  db,
  currentUser,
  onUpdateSalaryPayments,
  onUpdateEmployees,
  onUpdateWithdrawals,
}) => {
  const defaultRange = useMemo(() => {
    return {
      start: getDaysOffsetStr(-30),
      end: getDaysOffsetStr(0),
    };
  }, []);

  const [startDate, setStartDate] = useState<string>(defaultRange.start);
  const [endDate, setEndDate] = useState<string>(defaultRange.end);
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');

  // Optional per-employee adjustments (bonus / extra deduction)
  const [bonuses, setBonuses] = useState<Record<string, number>>({});
  const [extraDeductions, setExtraDeductions] = useState<Record<string, number>>({});

  // Detailed Payslip Modal
  const [selectedPayslipEmp, setSelectedPayslipEmp] = useState<Employee | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string>('');

  const applyPresetRange = (preset: 'this_month' | 'last_7_days' | 'last_30_days') => {
    if (preset === 'this_month') {
      const r = getMonthRange();
      setStartDate(r.start);
      setEndDate(r.end);
    } else if (preset === 'last_7_days') {
      setStartDate(getDaysOffsetStr(-7));
      setEndDate(getDaysOffsetStr(0));
    } else {
      setStartDate(getDaysOffsetStr(-30));
      setEndDate(getDaysOffsetStr(0));
    }
  };

  // Handler for manual gross salary input
  const handleManualSalaryChange = (employeeId: string, valStr: string) => {
    const numeric = valStr === '' ? 0 : Number(valStr);
    if (isNaN(numeric)) return;
    const updatedEmployees = db.employees.map((emp) =>
      emp.id === employeeId ? { ...emp, manualGrossSalary: numeric } : emp
    );
    onUpdateEmployees(updatedEmployees);
  };

  // Compute payroll rows for each employee in the selected date range
  const payrollRows = useMemo(() => {
    return db.employees
      .filter((emp) => {
        const matchBranch = branchFilter === 'all' || emp.branchId === branchFilter;
        const matchEmp = employeeFilter === 'all' || emp.id === employeeFilter;
        return matchBranch && matchEmp;
      })
      .map((emp) => {
        const branch = db.branches.find((b) => b.id === emp.branchId);
        const grossSalary =
          emp.manualGrossSalary !== undefined
            ? emp.manualGrossSalary
            : emp.baseSalary + emp.housingAllowance + emp.transportAllowance;

        // Filter withdrawals strictly within [startDate, endDate]
        const empWithdrawals: CashWithdrawal[] = db.withdrawals.filter((w) => {
          if (w.employeeId !== emp.id) return false;
          const afterStart = !startDate || w.date >= startDate;
          const beforeEnd = !endDate || w.date <= endDate;
          return afterStart && beforeEnd;
        });

        const totalWithdrawnInPeriod = empWithdrawals.reduce(
          (sum, w) => sum + w.amount,
          0
        );

        const bonus = bonuses[emp.id] || 0;
        const extraDed = extraDeductions[emp.id] || 0;
        const netSalary = grossSalary + bonus - totalWithdrawnInPeriod - extraDed;

        const isPaid = db.salaryPayments.some(
          (p) =>
            p.employeeId === emp.id &&
            p.periodStart === startDate &&
            p.periodEnd === endDate
        );

        return {
          employee: emp,
          branchName: branch?.name || '',
          grossSalary,
          withdrawalsList: empWithdrawals,
          totalWithdrawnInPeriod,
          bonus,
          extraDed,
          netSalary,
          isPaid,
        };
      });
  }, [
    db.employees,
    db.branches,
    db.withdrawals,
    db.salaryPayments,
    branchFilter,
    employeeFilter,
    startDate,
    endDate,
    bonuses,
    extraDeductions,
  ]);

  const totals = useMemo(() => {
    return payrollRows.reduce(
      (acc, row) => {
        acc.gross += row.grossSalary;
        acc.withdrawn += row.totalWithdrawnInPeriod;
        acc.bonus += row.bonus;
        acc.extraDed += row.extraDed;
        acc.net += row.netSalary;
        return acc;
      },
      { gross: 0, withdrawn: 0, bonus: 0, extraDed: 0, net: 0 }
    );
  }, [payrollRows]);

  const handleSettleSalary = (row: (typeof payrollRows)[number]) => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // اليوم الذي يلي تسليم الراتب
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const totalEarned = row.grossSalary + row.bonus - row.extraDed;
    const isWithdrawalHigher = row.totalWithdrawnInPeriod > totalEarned;
    const diffAmount = isWithdrawalHigher ? row.totalWithdrawnInPeriod - totalEarned : 0;
    const netSalaryPaid = isWithdrawalHigher ? 0 : Math.max(0, row.netSalary);

    const newPayment: SalaryPayment = {
      id: `pay-${Date.now()}`,
      employeeId: row.employee.id,
      periodStart: startDate,
      periodEnd: endDate,
      baseSalary: row.grossSalary,
      allowances: 0,
      totalWithdrawals: row.totalWithdrawnInPeriod,
      bonus: row.bonus,
      extraDeduction: row.extraDed,
      netSalary: netSalaryPaid,
      paidAt: todayStr,
      approvedBy: isWithdrawalHigher
        ? `الإدارة المالية (تم تسليم الراتب وترحيل فرق سلف بقيمة ${diffAmount.toLocaleString()} د.أ إلى يوم ${tomorrowStr} كباقي من الشهر السابق)`
        : `${currentUser?.name || 'الإدارة المالية'} (تم تسليم الراتب)`,
    };

    onUpdateSalaryPayments([newPayment, ...db.salaryPayments]);

    // إذا كانت قيمة المسحوبات أعلى من الراتب: ترحيل الفرق إلى اليوم التالي بقيمة موجبة في السلف بملاحظة (باقي من الشهر السابق)
    if (isWithdrawalHigher && diffAmount > 0 && onUpdateWithdrawals) {
      const rolloverAdvance: CashWithdrawal = {
        id: `wd-rollover-${Date.now()}`,
        employeeId: row.employee.id,
        branchId: row.employee.branchId,
        date: tomorrowStr,
        amount: diffAmount, // بقيمة موجبة في السلف
        type: 'daily_advance',
        reason: 'باقي من الشهر السابق',
        approvedBy: currentUser?.name || 'الإدارة المالية (ترحيل بعد تسليم الراتب)',
        createdAt: new Date().toISOString(),
      };

      onUpdateWithdrawals([rolloverAdvance, ...db.withdrawals]);

      setConfirmMessage(
        `✓ تم تسليم الراتب للموظف "${row.employee.name}". ونظراً لأن قيمة المسحوبات (${row.totalWithdrawnInPeriod.toLocaleString()} ${db.settings.currency}) أعلى من الراتب (${totalEarned.toLocaleString()} ${db.settings.currency})، تم ترحيل الفرق (${diffAmount.toLocaleString()} ${db.settings.currency}) كقيمة موجبة في السلف لتاريخ اليوم التالي (${tomorrowStr}) بملاحظة: «باقي من الشهر السابق».`
      );
    } else {
      setConfirmMessage(
        `✓ تم تسليم الراتب للموظف "${row.employee.name}" بمبلغ صافي ${row.netSalary.toLocaleString()} ${db.settings.currency} للفترة من ${startDate} إلى ${endDate}. وتمت إضافة ملاحظة بتسليم الراتب.`
      );
    }

    setTimeout(() => setConfirmMessage(''), 8000);
  };

  const handleExportCsv = () => {
    const headers = [
      'الرقم الوظيفي',
      'اسم الموظف',
      'الفرع',
      'الراتب الإجمالي',
      'مجموع المسحوبات خلال الفترة',
      'المكافآت',
      'خصومات أخرى',
      'صافي الراتب المستحق',
    ];
    const lines = payrollRows.map((r) =>
      [
        r.employee.code,
        `"${r.employee.name}"`,
        `"${r.branchName}"`,
        r.grossSalary,
        r.totalWithdrawnInPeriod,
        r.bonus,
        r.extraDed,
        r.netSalary,
      ].join(',')
    );
    const csvContent = '\uFEFF' + [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salaries_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const payslipRow = useMemo(() => {
    if (!selectedPayslipEmp) return null;
    return payrollRows.find((r) => r.employee.id === selectedPayslipEmp.id) || null;
  }, [selectedPayslipEmp, payrollRows]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            ٤. الرواتب
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            أدخل الراتب الإجمالي يدوياً لكل موظف وحدد التاريخين ليقوم النظام تلقائياً بحساب مجموع المسحوبات وطرحها من الراتب الإجمالي
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto no-print">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 text-xs font-medium bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير الرواتب (CSV)</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة</span>
          </button>
        </div>
      </div>

      {/* Date Period Filter Card */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 space-y-4 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 flex-1">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                من تاريخ (بداية حساب المسحوبات)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                إلى تاريخ (نهاية حساب المسحوبات)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                تصفية حسب الفرع
              </label>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
              >
                <option value="all">جميع الفروع</option>
                {db.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                تصفية حسب الموظف
              </label>
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
              >
                <option value="all">جميع الموظفين</option>
                {db.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 no-print">
            <button
              type="button"
              onClick={() => applyPresetRange('last_30_days')}
              className="px-3 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              آخر ٣٠ يوماً
            </button>
            <button
              type="button"
              onClick={() => applyPresetRange('this_month')}
              className="px-3 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              الشهر الحالي
            </button>
            <button
              type="button"
              onClick={() => applyPresetRange('last_7_days')}
              className="px-3 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              آخر ٧ أيام
            </button>
          </div>
        </div>
      </div>

      {/* Summary Formula Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">١. مجموع الرواتب الإجمالية المدخلة</p>
            <Wallet className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1.5 font-mono tabular-nums">
            {totals.gross.toLocaleString()}{' '}
            <span className="text-xs font-normal text-slate-500">{db.settings.currency}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            لعدد <span className="font-mono">{payrollRows.length}</span> موظفين
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">
              ٢. يطرح منه: مجموع المسحوبات خلال الفترة
            </p>
            <TrendingDown className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-700 mt-1.5 font-mono tabular-nums">
            -{totals.withdrawn.toLocaleString()}{' '}
            <span className="text-xs font-normal text-slate-500">{db.settings.currency}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            الفترة: {startDate || 'البداية'} إلى {endDate || 'اليوم'}
          </p>
        </div>

        <div className="bg-emerald-50/40 border border-emerald-300 rounded-xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-xs text-emerald-800 font-semibold">
              ٣. يساوي: صافي الرواتب المستحقة للصرف
            </p>
            <Banknote className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-1.5 font-mono tabular-nums">
            {totals.net.toLocaleString()}{' '}
            <span className="text-xs font-normal text-slate-600">{db.settings.currency}</span>
          </p>
          <p className="text-xs text-emerald-700/80 mt-1">
            الراتب الإجمالي مطروحاً منه المسحوبات النقدية
          </p>
        </div>
      </div>

      {confirmMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{confirmMessage}</span>
        </div>
      )}

      {/* Mobile Cards View for Phones (md:hidden) */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {payrollRows.map((row) => (
          <div
            key={row.employee.id}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 shadow-2xs"
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="font-bold text-sm text-slate-900">{row.employee.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {row.branchName} · <span className="font-mono">{row.employee.code}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayslipEmp(row.employee)}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                كشف تفصيلي
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  الراتب الإجمالي ({db.settings.currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.grossSalary || ''}
                  onChange={(e) => handleManualSalaryChange(row.employee.id, e.target.value)}
                  placeholder="أدخل الراتب..."
                  className="w-full px-3 py-2 text-sm font-mono font-bold border border-emerald-500 rounded-xl bg-emerald-50/30 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div>
                <span className="block text-slate-500 mb-1">المسحوبات خلال الفترة</span>
                <div className="px-3 py-2 rounded-xl bg-red-50/60 border border-red-200 text-sm font-mono font-bold text-red-700">
                  -{row.totalWithdrawnInPeriod.toLocaleString()} {db.settings.currency}
                </div>
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  {row.withdrawalsList.length} عمليات سحب
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs no-print">
              <div>
                <label className="block text-slate-500 mb-1">مكافأة إضافية (+)</label>
                <input
                  type="number"
                  min="0"
                  value={bonuses[row.employee.id] || ''}
                  onChange={(e) =>
                    setBonuses({
                      ...bonuses,
                      [row.employee.id]: Number(e.target.value) || 0,
                    })
                  }
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded-lg text-emerald-700"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">خصم إضافي (-)</label>
                <input
                  type="number"
                  min="0"
                  value={extraDeductions[row.employee.id] || ''}
                  onChange={(e) =>
                    setExtraDeductions({
                      ...extraDeductions,
                      [row.employee.id]: Number(e.target.value) || 0,
                    })
                  }
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded-lg text-red-700"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div>
                <span className="text-xs text-slate-500 block">صافي الراتب المستحق</span>
                <span className="text-lg font-mono font-bold text-emerald-700">
                  {row.netSalary.toLocaleString()} {db.settings.currency}
                </span>
              </div>

              {row.isPaid ? (
                <span className="text-xs text-emerald-700 font-semibold">تم الصرف</span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSettleSalary(row)}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
                >
                  اعتماد الصرف
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Payroll Table (hidden on mobile, shown on md+) */}
      <div className="hidden md:block bg-white border border-slate-200/90 rounded-xl p-6 shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/80">
                <th className="py-3.5 px-3 font-medium">الموظف والفرع</th>
                <th className="py-3.5 px-3 font-semibold text-slate-900">
                  الراتب الإجمالي (إدخال يدوي)
                </th>
                <th className="py-3.5 px-3 font-medium text-red-700">
                  مجموع المسحوبات (خلال الفترة)
                </th>
                <th className="py-3.5 px-3 font-medium no-print">مكافأة (+)</th>
                <th className="py-3.5 px-3 font-medium no-print">خصم إضافي (-)</th>
                <th className="py-3.5 px-3 font-semibold text-emerald-800">
                  صافي الراتب المستحق
                </th>
                <th className="py-3.5 px-3 font-medium no-print">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {payrollRows.map((row) => (
                <tr key={row.employee.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-3">
                    <div className="font-semibold text-slate-900">{row.employee.name}</div>
                    <div className="text-xs text-slate-500">
                      {row.branchName} · <span className="font-mono">{row.employee.code}</span>
                    </div>
                  </td>

                  {/* Manual Total Salary Input Field */}
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.grossSalary || ''}
                        onChange={(e) =>
                          handleManualSalaryChange(row.employee.id, e.target.value)
                        }
                        placeholder="أدخل الراتب..."
                        className="w-32 px-3 py-1.5 text-sm font-mono tabular-nums font-semibold border border-slate-300 focus:border-emerald-600 rounded-xl bg-slate-50/60 focus:bg-white text-slate-900 focus:outline-none"
                      />
                      <span className="text-xs text-slate-500">{db.settings.currency}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-3">
                    <div className="text-xs font-mono tabular-nums font-semibold text-red-600">
                      -{row.totalWithdrawnInPeriod.toLocaleString()} {db.settings.currency}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {row.withdrawalsList.length > 0
                        ? `${row.withdrawalsList.length} عمليات سحب في الفترة`
                        : 'لا توجد مسحوبات في الفترة'}
                    </div>
                  </td>

                  <td className="py-3.5 px-3 no-print">
                    <input
                      type="number"
                      min="0"
                      value={bonuses[row.employee.id] || ''}
                      onChange={(e) =>
                        setBonuses({
                          ...bonuses,
                          [row.employee.id]: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="w-20 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg text-emerald-700"
                    />
                  </td>

                  <td className="py-3.5 px-3 no-print">
                    <input
                      type="number"
                      min="0"
                      value={extraDeductions[row.employee.id] || ''}
                      onChange={(e) =>
                        setExtraDeductions({
                          ...extraDeductions,
                          [row.employee.id]: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="w-20 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg text-red-700"
                    />
                  </td>

                  <td className="py-3.5 px-3">
                    {row.netSalary < 0 ? (
                      <div>
                        <span className="text-sm font-mono tabular-nums font-bold text-slate-800">
                          0 {db.settings.currency}
                        </span>
                        <span className="inline-block text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium mt-0.5">
                          ترحيل سلف: {Math.abs(row.netSalary).toLocaleString()} {db.settings.currency}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm font-mono tabular-nums font-bold text-emerald-700">
                        {row.netSalary.toLocaleString()} {db.settings.currency}
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-3 text-xs no-print">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPayslipEmp(row.employee)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                      >
                        كشف تفصيلي
                      </button>
                      {row.isPaid ? (
                        <span className="text-emerald-700 font-semibold whitespace-nowrap">
                          تم التسليم ✓
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSettleSalary(row)}
                          className={`px-3 py-1.5 rounded-lg text-white font-medium whitespace-nowrap cursor-pointer transition-colors ${
                            row.netSalary < 0
                              ? 'bg-amber-600 hover:bg-amber-700'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          {row.netSalary < 0 ? 'تسليم وترحيل الفرق' : 'تسليم الراتب'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-xs">
                <td className="py-3.5 px-3 text-slate-900">الإجمالي الكلي للرواتب</td>
                <td className="py-3.5 px-3 font-mono tabular-nums text-slate-900">
                  {totals.gross.toLocaleString()} {db.settings.currency}
                </td>
                <td className="py-3.5 px-3 font-mono tabular-nums text-red-700">
                  -{totals.withdrawn.toLocaleString()} {db.settings.currency}
                </td>
                <td className="py-3.5 px-3 font-mono tabular-nums text-emerald-700 no-print">
                  +{totals.bonus.toLocaleString()}
                </td>
                <td className="py-3.5 px-3 font-mono tabular-nums text-red-700 no-print">
                  -{totals.extraDed.toLocaleString()}
                </td>
                <td className="py-3.5 px-3 font-mono tabular-nums text-sm font-bold text-emerald-700">
                  {totals.net.toLocaleString()} {db.settings.currency}
                </td>
                <td className="no-print"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Detailed Employee Payslip Modal */}
      {payslipRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  كشف راتب وتصفية مستحقات الموظف — مؤسسة صخر المصري
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  الفترة المحاسبية: من {startDate} إلى {endDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayslipEmp(null)}
                className="text-slate-400 hover:text-slate-700 no-print"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 block">اسم الموظف:</span>
                <span className="font-semibold text-slate-900">{payslipRow.employee.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block">الفرع والمسمى:</span>
                <span className="text-slate-800">
                  {payslipRow.branchName} · {payslipRow.employee.jobTitle}
                </span>
              </div>
            </div>

            {/* Salary Breakdown */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-700 font-medium">الراتب الإجمالي</span>
                <span className="font-mono font-bold text-slate-900">
                  {payslipRow.grossSalary.toLocaleString()} {db.settings.currency}
                </span>
              </div>
              {payslipRow.bonus > 0 && (
                <div className="flex justify-between py-1.5 border-b border-slate-100 text-emerald-700">
                  <span>مكافآت وحوافز إضافية</span>
                  <span className="font-mono font-semibold">
                    +{payslipRow.bonus.toLocaleString()} {db.settings.currency}
                  </span>
                </div>
              )}
              {payslipRow.extraDed > 0 && (
                <div className="flex justify-between py-1.5 border-b border-slate-100 text-red-700">
                  <span>خصومات إضافية</span>
                  <span className="font-mono font-semibold">
                    -{payslipRow.extraDed.toLocaleString()} {db.settings.currency}
                  </span>
                </div>
              )}
            </div>

            {/* Detailed Withdrawals Subtracted During Period */}
            <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-red-700">
                <span>
                  المسحوبات النقدية المخصومة خلال الفترة ({payslipRow.withdrawalsList.length})
                </span>
                <span className="font-mono">
                  -{payslipRow.totalWithdrawnInPeriod.toLocaleString()} {db.settings.currency}
                </span>
              </div>
              {payslipRow.withdrawalsList.length === 0 ? (
                <p className="text-xs text-slate-400">
                  لا توجد أي مسحوبات نقدية مسجلة على الموظف بين التاريخين المحددين.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {payslipRow.withdrawalsList.map((w) => (
                    <div key={w.id} className="py-1.5 flex justify-between">
                      <span>
                        <span className="font-mono text-slate-500">{w.date}</span> — {w.reason}
                      </span>
                      <span className="font-mono text-red-600 font-medium">
                        -{w.amount.toLocaleString()} {db.settings.currency}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Final Net Payable */}
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-xs text-emerald-800 block font-semibold">
                  صافي الراتب النهائي المستحق للتسليم
                </span>
                <span className="text-[11px] text-emerald-700">
                  (الراتب الإجمالي ناقص مجموع المسحوبات خلال الفترة)
                </span>
              </div>
              <span className="text-xl font-mono font-bold text-emerald-800">
                {payslipRow.netSalary.toLocaleString()} {db.settings.currency}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-800 flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة كشف الراتب</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPayslipEmp(null)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
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
