import React, { useState, useMemo, useRef } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Printer,
  Download,
  CheckCircle2,
  Building2,
  Car,
  Filter,
  Calendar,
  Search,
  X,
  FileSpreadsheet,
  Layers,
  ChevronDown,
  Sparkles,
  Info,
} from 'lucide-react';
import { AppDatabase, BranchExpense, ExpenseCategory, SubBranch, Branch } from '../types';

interface ExpensesPageProps {
  db: AppDatabase;
  onUpdateExpenses: (expenses: BranchExpense[]) => void;
  onUpdateSubBranches?: (subBranches: SubBranch[]) => void;
  onUpdateBranches?: (branches: Branch[]) => void;
}

const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent_utilities: 'إيجارات ومرافق عامة',
  electricity_water: 'فواتير كهرباء ومياه وإنترنت',
  maintenance: 'صيانة وإصلاحات وقطع غيار',
  hospitality: 'ضيافة ونثرية يومية',
  supplies: 'مستلزمات تشغيلية وقرطاسية',
  transport: 'محروقات ونقل وشحن ومواصلات',
  other: 'مصاريف متنوعة أخرى',
};

function getTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFirstDayOfMonthStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export const ExpensesPage: React.FC<ExpensesPageProps> = ({
  db,
  onUpdateExpenses,
  onUpdateSubBranches,
}) => {
  // Find or identify the cars branch
  const carsBranch = useMemo(() => {
    return (
      db.branches.find((b) => b.id === 'br-cars' || b.name.includes('سيار')) ||
      db.branches[0]
    );
  }, [db.branches]);

  // Sub-branches list from db
  const subBranchesList = useMemo(() => {
    return db.subBranches || [];
  }, [db.subBranches]);

  // Sub-branches specifically for cars branch
  const carSubBranches = useMemo(() => {
    if (!carsBranch) return [];
    return subBranchesList.filter((sb) => sb.parentBranchId === carsBranch.id);
  }, [subBranchesList, carsBranch]);

  // -------------------------------------------------------------
  // NEW EXPENSE FORM STATE
  // -------------------------------------------------------------
  const [branchId, setBranchId] = useState<string>(
    carsBranch ? carsBranch.id : db.branches[0]?.id || ''
  );
  const [subBranchId, setSubBranchId] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayStr());
  const [category, setCategory] = useState<ExpenseCategory>('transport');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // -------------------------------------------------------------
  // SUB-BRANCH MANAGEMENT & EDITING MODAL STATE
  // -------------------------------------------------------------
  const [showAddSubBranchModal, setShowAddSubBranchModal] = useState<boolean>(false);
  const [editingSubBranchId, setEditingSubBranchId] = useState<string | null>(null);
  const [newSubBranchName, setNewSubBranchName] = useState<string>('');
  const [newSubBranchPlate, setNewSubBranchPlate] = useState<string>('');
  const [newSubBranchDriver, setNewSubBranchDriver] = useState<string>('');
  const [newSubBranchNotes, setNewSubBranchNotes] = useState<string>('');
  const [subBranchFeedback, setSubBranchFeedback] = useState<string>('');

  // -------------------------------------------------------------
  // FILTERING STATE: DATE RANGE & BRANCHES
  // -------------------------------------------------------------
  const [dateFilterMode, setDateFilterMode] = useState<'date_range' | 'single_date' | 'all'>('date_range');
  const [rangeStart, setRangeStart] = useState<string>(getFirstDayOfMonthStr());
  const [rangeEnd, setRangeEnd] = useState<string>(getTodayStr());
  const [selectedExactDate, setSelectedExactDate] = useState<string>(getTodayStr());
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');
  const [selectedSubBranchFilter, setSelectedSubBranchFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Active sub-branches for the currently selected branch in the form
  const availableSubBranchesForForm = useMemo(() => {
    if (!branchId) return [];
    return subBranchesList.filter((sb) => sb.parentBranchId === branchId);
  }, [subBranchesList, branchId]);

  // -------------------------------------------------------------
  // EDIT & ADD SUB-BRANCH HANDLERS
  // -------------------------------------------------------------
  const handleStartEditSubBranch = (sb: SubBranch) => {
    setEditingSubBranchId(sb.id);
    setNewSubBranchName(sb.name);
    setNewSubBranchPlate(sb.plateNumber || '');
    setNewSubBranchDriver(sb.driverName || '');
    setNewSubBranchNotes(sb.notes || '');
    setSubBranchFeedback('');
  };

  const handleCancelEditSubBranch = () => {
    setEditingSubBranchId(null);
    setNewSubBranchName('');
    setNewSubBranchPlate('');
    setNewSubBranchDriver('');
    setNewSubBranchNotes('');
    setSubBranchFeedback('');
  };

  const handleSaveSubBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubBranchName.trim() || !carsBranch) return;

    const trimmedName = newSubBranchName.trim();

    if (editingSubBranchId) {
      // 1. Updating existing sub-branch
      const updated = subBranchesList.map((sb) =>
        sb.id === editingSubBranchId
          ? {
              ...sb,
              name: trimmedName,
              plateNumber: newSubBranchPlate.trim() || undefined,
              driverName: newSubBranchDriver.trim() || undefined,
              notes: newSubBranchNotes.trim() || undefined,
            }
          : sb
      );

      if (onUpdateSubBranches) {
        onUpdateSubBranches(updated);
      }

      // Also update subBranchName in existing expenses that match this sub-branch ID
      const updatedExpenses = db.expenses.map((exp) =>
        exp.subBranchId === editingSubBranchId
          ? { ...exp, subBranchName: trimmedName }
          : exp
      );
      onUpdateExpenses(updatedExpenses);

      setSubBranchFeedback(`تم تحديث بيانات الفرع الفرعي "${trimmedName}" بنجاح ✓`);
      setEditingSubBranchId(null);
      setNewSubBranchName('');
      setNewSubBranchPlate('');
      setNewSubBranchDriver('');
      setNewSubBranchNotes('');

      setTimeout(() => {
        setSubBranchFeedback('');
      }, 2500);
    } else {
      // 2. Creating new sub-branch
      const newSb: SubBranch = {
        id: `sub-car-${Date.now()}`,
        name: trimmedName,
        parentBranchId: carsBranch.id,
        plateNumber: newSubBranchPlate.trim() || undefined,
        driverName: newSubBranchDriver.trim() || undefined,
        notes: newSubBranchNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      const updated = [...subBranchesList, newSb];
      if (onUpdateSubBranches) {
        onUpdateSubBranches(updated);
      }

      // Auto-select in form
      setBranchId(carsBranch.id);
      setSubBranchId(newSb.id);

      setSubBranchFeedback(`تمت إضافة الفرع الفرعي "${trimmedName}" تحت فرع السيارات بنجاح ✓`);
      setNewSubBranchName('');
      setNewSubBranchPlate('');
      setNewSubBranchDriver('');
      setNewSubBranchNotes('');

      setTimeout(() => {
        setSubBranchFeedback('');
        setShowAddSubBranchModal(false);
      }, 1500);
    }
  };

  const handleDeleteSubBranch = (sbId: string) => {
    const target = subBranchesList.find((s) => s.id === sbId);
    if (!target) return;
    if (confirm(`هل أنت متأكد من حذف الفرع الفرعي "${target.name}"؟ ستظل المصاريف السابقة محفوظة في الأرشيف.`)) {
      const updated = subBranchesList.filter((s) => s.id !== sbId);
      if (onUpdateSubBranches) {
        onUpdateSubBranches(updated);
      }
      if (subBranchId === sbId) {
        setSubBranchId('');
      }
      if (selectedSubBranchFilter === sbId) {
        setSelectedSubBranchFilter('all');
      }
    }
  };

  // -------------------------------------------------------------
  // ADD EXPENSE HANDLER
  // -------------------------------------------------------------
  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!branchId || isNaN(numericAmount) || numericAmount <= 0) return;

    const chosenSubBranch = subBranchesList.find((sb) => sb.id === subBranchId);

    const newExp: BranchExpense = {
      id: `exp-${Date.now()}`,
      branchId,
      subBranchId: chosenSubBranch ? chosenSubBranch.id : undefined,
      subBranchName: chosenSubBranch ? chosenSubBranch.name : undefined,
      date,
      category,
      amount: numericAmount,
      description: description.trim() || EXPENSE_CATEGORY_LABELS[category],
      invoiceNumber: '',
      paidBy: '',
      createdAt: new Date().toISOString(),
    };

    onUpdateExpenses([newExp, ...db.expenses]);
    setAmount('');
    setDescription('');

    const branchObj = db.branches.find((b) => b.id === branchId);
    const branchName = branchObj ? branchObj.name : '';
    const targetName = chosenSubBranch ? `${branchName} - ${chosenSubBranch.name}` : branchName;

    setSuccessMsg(
      `تم تسجيل مصروف بقيمة ${numericAmount.toLocaleString()} ${db.settings.currency} على "${targetName}" بتاريخ ${date} بنجاح ✓`
    );
    setTimeout(() => setSuccessMsg(''), 4500);
  };

  const handleDeleteExpense = (id: string) => {
    if (confirm('هل أنت متأكد من رغبتك في حذف هذا المصروف؟')) {
      onUpdateExpenses(db.expenses.filter((x) => x.id !== id));
    }
  };

  // -------------------------------------------------------------
  // FILTERING LOGIC
  // -------------------------------------------------------------
  const filteredExpenses = useMemo(() => {
    return db.expenses.filter((exp) => {
      // 1. Date filter
      if (dateFilterMode === 'single_date') {
        if (selectedExactDate && exp.date !== selectedExactDate) return false;
      } else if (dateFilterMode === 'date_range') {
        if (rangeStart && exp.date < rangeStart) return false;
        if (rangeEnd && exp.date > rangeEnd) return false;
      }

      // 2. Main branch filter
      if (selectedBranchFilter !== 'all' && exp.branchId !== selectedBranchFilter) {
        return false;
      }

      // 3. Sub-branch filter
      if (selectedSubBranchFilter !== 'all') {
        if (selectedSubBranchFilter === 'unassigned') {
          if (exp.subBranchId) return false;
        } else if (exp.subBranchId !== selectedSubBranchFilter) {
          return false;
        }
      }

      // 4. Text search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const branchName = db.branches.find((b) => b.id === exp.branchId)?.name.toLowerCase() || '';
        const subName = (exp.subBranchName || '').toLowerCase();
        const desc = exp.description.toLowerCase();
        const cat = (EXPENSE_CATEGORY_LABELS[exp.category] || '').toLowerCase();
        const match =
          branchName.includes(q) ||
          subName.includes(q) ||
          desc.includes(q) ||
          cat.includes(q) ||
          String(exp.amount).includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [
    db.expenses,
    db.branches,
    dateFilterMode,
    selectedExactDate,
    rangeStart,
    rangeEnd,
    selectedBranchFilter,
    selectedSubBranchFilter,
    searchQuery,
  ]);

  const displayedTotal = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // -------------------------------------------------------------
  // BRANCH TOTALS & CARS BREAKDOWN
  // -------------------------------------------------------------
  const branchTotals = useMemo(() => {
    const totalAll = filteredExpenses.reduce((s, e) => s + e.amount, 0);
    return db.branches.map((branch) => {
      const branchExps = filteredExpenses.filter((e) => e.branchId === branch.id);
      const total = branchExps.reduce((s, e) => s + e.amount, 0);
      const count = branchExps.length;
      const percentage = totalAll > 0 ? Math.round((total / totalAll) * 100) : 0;

      // Sub-branches breakdown for this branch
      const subList = subBranchesList.filter((sb) => sb.parentBranchId === branch.id);
      const subBreakdown = subList.map((sb) => {
        const sbExps = branchExps.filter((e) => e.subBranchId === sb.id);
        const sbTotal = sbExps.reduce((s, e) => s + e.amount, 0);
        return {
          subBranch: sb,
          total: sbTotal,
          count: sbExps.length,
        };
      });

      return {
        branch,
        total,
        count,
        percentage,
        subBreakdown,
      };
    });
  }, [db.branches, subBranchesList, filteredExpenses]);

  // -------------------------------------------------------------
  // CSV EXPORT
  // -------------------------------------------------------------
  const handleExportCsv = () => {
    const headers = ['التاريخ', 'الفرع الرئيسي', 'الفرع الفرعي / السيارة', 'التصنيف', 'البيان والتفاصيل', 'المبلغ (د.أ)'];
    const rows = filteredExpenses.map((e) => {
      const bName = db.branches.find((b) => b.id === e.branchId)?.name || '';
      const subName = e.subBranchName || '-';
      return [
        e.date,
        `"${bName}"`,
        `"${subName}"`,
        `"${EXPENSE_CATEGORY_LABELS[e.category]}"`,
        `"${e.description.replace(/"/g, '""')}"`,
        e.amount,
      ].join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `branch_expenses_${rangeStart}_to_${rangeEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // -------------------------------------------------------------
  // PRINT ACTION
  // -------------------------------------------------------------
  const handleTriggerPrint = () => {
    window.print();
  };

  const selectedBranchName = useMemo(() => {
    if (selectedBranchFilter === 'all') return 'جميع الفروع';
    return db.branches.find((b) => b.id === selectedBranchFilter)?.name || '';
  }, [db.branches, selectedBranchFilter]);

  const selectedSubBranchName = useMemo(() => {
    if (selectedSubBranchFilter === 'all') return 'كافة السيارات والفروع الفرعية';
    if (selectedSubBranchFilter === 'unassigned') return 'بدون تخصيص فرع فرعي';
    return subBranchesList.find((sb) => sb.id === selectedSubBranchFilter)?.name || '';
  }, [subBranchesList, selectedSubBranchFilter]);

  return (
    <div className="space-y-6">
      {/* ============================================================== */}
      {/* 1. SCREEN HEADER (Hidden in print)                            */}
      {/* ============================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5 no-print">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-600" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              ٥. مصروفات الفروع والسيارات وإدارة الفروع الفرعية
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            تسجيل وإدارة مصاريف فروع مؤسسة صخر المصري، مع إمكانية إضافة وإسناد فروع فرعية تحت فرع السيارات (مثل: سيارة صالح)، والفلترة المتقدمة والطباعة الرسمية
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {carsBranch && (
            <button
              type="button"
              onClick={() => {
                handleCancelEditSubBranch();
                setShowAddSubBranchModal(true);
              }}
              className="px-3.5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              title="إضافة وتعديل وحذف الفروع الفرعية لفرع السيارات (مثل: سيارة صالح)"
            >
              <Car className="w-4 h-4 text-slate-950" />
              <span>إدارة وتعديل فروع السيارات</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>تصدير (CSV)</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerPrint}
            className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex items-center gap-2 cursor-pointer shadow-xs transition-all hover:scale-105 active:scale-95"
            title="طباعة كشف المصاريف بتنسيق رسمي معتمد"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>طباعة كشف المصاريف</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. ADVANCED FILTER BAR: DATE RANGE & BRANCHES (Hidden in print)*/}
      {/* ============================================================== */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Mode Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>فترة الحساب والفلترة:</span>
            </span>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setDateFilterMode('date_range')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  dateFilterMode === 'date_range'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                فترة بين تاريخين
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode('single_date')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  dateFilterMode === 'single_date'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                يوم محدد
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  dateFilterMode === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                جميع التواريخ
              </button>
            </div>
          </div>

          {/* Quick Date Shortcuts */}
          {dateFilterMode === 'date_range' && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setRangeStart(getFirstDayOfMonthStr());
                  setRangeEnd(getTodayStr());
                }}
                className="px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded-lg font-bold cursor-pointer transition-colors"
              >
                هذا الشهر
              </button>
              <button
                type="button"
                onClick={() => {
                  setRangeStart(getTodayStr());
                  setRangeEnd(getTodayStr());
                }}
                className="px-2.5 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                اليوم فقط
              </button>
            </div>
          )}
        </div>

        {/* Inputs Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {/* Date Pickers */}
          {dateFilterMode === 'date_range' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  من تاريخ (بداية الفترة) *
                </label>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  إلى تاريخ (نهاية الفترة) *
                </label>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-white"
                />
              </div>
            </>
          )}

          {dateFilterMode === 'single_date' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                تاريخ اليوم المطلوب *
              </label>
              <input
                type="date"
                value={selectedExactDate}
                onChange={(e) => setSelectedExactDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-white"
              />
            </div>
          )}

          {/* Branch Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              الفرع الرئيسي *
            </label>
            <select
              value={selectedBranchFilter}
              onChange={(e) => {
                setSelectedBranchFilter(e.target.value);
                setSelectedSubBranchFilter('all');
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-medium"
            >
              <option value="all">جميع الفروع ({db.branches.length})</option>
              {db.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sub-Branch Filter (when relevant or all) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              الفرع الفرعي / السيارة *
            </label>
            <select
              value={selectedSubBranchFilter}
              onChange={(e) => setSelectedSubBranchFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-medium"
            >
              <option value="all">كافة الفروع الفرعية والسيارات ({subBranchesList.length})</option>
              {subBranchesList
                .filter((sb) => selectedBranchFilter === 'all' || sb.parentBranchId === selectedBranchFilter)
                .map((sb) => (
                  <option key={sb.id} value={sb.id}>
                    🚗 {sb.name} {sb.plateNumber ? `[${sb.plateNumber}]` : ''}
                  </option>
                ))}
              <option value="unassigned">مصاريف عامة بدون تخصيص فرع فرعي</option>
            </select>
          </div>
        </div>

        {/* Search Query */}
        <div className="relative pt-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث سريع في المصاريف (مثال: سيارة صالح، بنزين، تصليح، ضيافة...)"
            className="w-full pr-9 pl-4 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-3 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. PER-BRANCH EXPENSES CARDS + CARS SUB-BRANCH PILLS           */}
      {/* ============================================================== */}
      <div className="space-y-3 no-print">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800">
              ملخص إجمالي المصاريف حسب الفرع (
              {dateFilterMode === 'date_range'
                ? `من ${rangeStart} إلى ${rangeEnd}`
                : dateFilterMode === 'single_date'
                ? `بتاريخ ${selectedExactDate}`
                : 'كافة التواريخ'}
              )
            </span>
          </div>
          {(selectedBranchFilter !== 'all' || selectedSubBranchFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSelectedBranchFilter('all');
                setSelectedSubBranchFilter('all');
              }}
              className="text-xs text-emerald-700 hover:underline font-bold cursor-pointer"
            >
              إلغاء التخصيص وإظهار كافة الفروع
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {branchTotals.map((item) => {
            const isSelected = selectedBranchFilter === item.branch.id;
            const isCars = item.branch.id === 'br-cars' || item.branch.name.includes('سيار');

            return (
              <div
                key={item.branch.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all shadow-2xs flex flex-col justify-between ${
                  isSelected
                    ? 'bg-emerald-50/70 border-emerald-600 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200/90 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBranchFilter(isSelected ? 'all' : item.branch.id);
                        setSelectedSubBranchFilter('all');
                      }}
                      className="text-right font-bold text-xs sm:text-sm text-slate-900 hover:text-emerald-700 cursor-pointer flex items-center gap-1.5"
                    >
                      {isCars ? <Car className="w-4 h-4 text-amber-600 shrink-0" /> : <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      <span>{item.branch.name}</span>
                    </button>
                    <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {item.percentage}%
                    </span>
                  </div>

                  <div className="mt-2.5">
                    <p className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                      {item.total.toLocaleString()}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        {db.settings.currency}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      عدد السندات: <strong className="font-mono text-slate-800">{item.count}</strong>
                    </p>
                  </div>
                </div>

                {/* Sub-branches pills for Cars Branch (e.g. سيارة صالح) */}
                {isCars && item.subBreakdown.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                      <span>فروع السيارات التابعة:</span>
                      <button
                        type="button"
                        onClick={() => {
                          handleCancelEditSubBranch();
                          setShowAddSubBranchModal(true);
                        }}
                        className="text-[10px] text-amber-700 hover:underline cursor-pointer flex items-center gap-1 font-bold"
                        title="إضافة وتعديل بيانات فروع السيارات"
                      >
                        <Edit2 className="w-2.5 h-2.5" />
                        <span>إدارة وتعديل</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {item.subBreakdown.map((sbItem) => {
                        const isSbActive = selectedSubBranchFilter === sbItem.subBranch.id;
                        return (
                          <button
                            key={sbItem.subBranch.id}
                            type="button"
                            onClick={() => {
                              setSelectedBranchFilter(item.branch.id);
                              setSelectedSubBranchFilter(isSbActive ? 'all' : sbItem.subBranch.id);
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                              isSbActive
                                ? 'bg-amber-500 text-slate-950 shadow-xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                            title={`فلترة مصاريف ${sbItem.subBranch.name}`}
                          >
                            <span>🚗 {sbItem.subBranch.name}:</span>
                            <span className="font-mono">{sbItem.total} {db.settings.currency}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. MAIN WORKSPACE: ADD EXPENSE FORM (5 cols) + TABLE (7 cols)  */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start no-print">
        {/* Form Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                تسجيل مصروف جديد (فرع أو سيارة)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                اختر الفرع والسيارة التابعة والمبلغ لتسجيل المصروف فورياً
              </p>
            </div>
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full">
              سند قيد فوري
            </span>
          </div>

          <form onSubmit={handleAddExpense} className="space-y-3.5">
            {/* Main Branch Select */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                الفرع الرئيسي *
              </label>
              <select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setSubBranchId('');
                }}
                className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-emerald-600"
              >
                {db.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
              </select>
            </div>

            {/* Sub-Branch / Car Select (Key User Requirement!) */}
            {(branchId === 'br-cars' || availableSubBranchesForForm.length > 0) && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-amber-950 flex items-center gap-1">
                    <Car className="w-3.5 h-3.5 text-amber-800" />
                    <span>الفرع الفرعي / السيارة التابعة:</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddSubBranchModal(true)}
                    className="text-[11px] font-bold text-amber-800 hover:underline cursor-pointer"
                  >
                    + إضافة سيارة يدوياً
                  </button>
                </div>

                <select
                  value={subBranchId}
                  onChange={(e) => setSubBranchId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold border border-amber-300 rounded-xl bg-white focus:outline-none focus:border-amber-600 text-slate-900"
                >
                  <option value="">-- عام (مصروف عام على فرع السيارات بدون تخصيص سيارة) --</option>
                  {availableSubBranchesForForm.map((sb) => (
                    <option key={sb.id} value={sb.id}>
                      🚗 {sb.name} {sb.plateNumber ? `[لوحة: ${sb.plateNumber}]` : ''} {sb.driverName ? `(السائق: ${sb.driverName})` : ''}
                    </option>
                  ))}
                </select>

                <p className="text-[10px] text-amber-800">
                  مثال: عند اختيار &quot;سيارة صالح&quot; يتم توثيق المصروف باسمها وحسابه في تقارير كشف السيارات.
                </p>
              </div>
            )}

            {/* Amount & Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  المبلغ ({db.settings.currency}) *
                </label>
                <input
                  type="number"
                  min="0.25"
                  step="any"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="مثال: 35"
                  className="w-full px-3.5 py-2 text-sm font-mono font-bold tabular-nums border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  تاريخ المصروف *
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

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                تصنيف وبند المصروف *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl bg-white"
              >
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                البيان وتفاصيل المصروف *
              </label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="مثال: تعبئة وقود وبنزين لسيارة صالح، أو غيار زيت وفلاتر..."
                className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600"
              />
            </div>

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>تسجيل وحفظ قيد المصروف فوراً</span>
            </button>
          </form>
        </div>

        {/* Filtered Expenses Ledger & Table (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                كشف المصاريف المفلتر
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                إجمالي المصروفات:{' '}
                <strong className="font-mono text-emerald-700 font-bold text-sm">
                  {displayedTotal.toLocaleString()} {db.settings.currency}
                </strong>{' '}
                · القيود: <span className="font-mono font-bold text-slate-800">{filteredExpenses.length}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={handleTriggerPrint}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-700" />
              <span>طباعة الكشف</span>
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 bg-slate-50/80 font-bold">
                  <th className="py-3 px-2.5">التاريخ</th>
                  <th className="py-3 px-2.5">الفرع والسيارة</th>
                  <th className="py-3 px-2.5">التصنيف والبيان</th>
                  <th className="py-3 px-2.5">المبلغ</th>
                  <th className="py-3 px-2.5 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-slate-500">
                      لا توجد مصروفات تطابق خيارات الفلترة المحددة.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => {
                    const branch = db.branches.find((b) => b.id === exp.branchId);
                    const isCarBranch = exp.branchId === 'br-cars' || branch?.name.includes('سيار');

                    return (
                      <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-2.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {exp.date}
                        </td>
                        <td className="py-3 px-2.5">
                          <div className="font-bold text-slate-900 flex items-center gap-1">
                            {isCarBranch ? (
                              <Car className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            ) : (
                              <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            )}
                            <span>{branch?.name}</span>
                          </div>
                          {exp.subBranchName && (
                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              🚗 {exp.subBranchName}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2.5">
                          <div className="font-bold text-slate-900 leading-snug">
                            {exp.description}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {EXPENSE_CATEGORY_LABELS[exp.category]}
                          </div>
                        </td>
                        <td className="py-3 px-2.5 font-mono font-black text-slate-900 whitespace-nowrap text-sm">
                          {exp.amount.toLocaleString()}{' '}
                          <span className="text-[10px] font-normal text-slate-500 font-sans">
                            {db.settings.currency}
                          </span>
                        </td>
                        <td className="py-3 px-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer transition-colors"
                            title="حذف هذا المصروف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredExpenses.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                    <td colSpan={3} className="py-3 px-2.5 text-slate-900">
                      مجموع المصروفات المفلترة ({filteredExpenses.length} قيد):
                    </td>
                    <td className="py-3 px-2.5 font-mono text-sm font-black text-emerald-800 whitespace-nowrap">
                      {displayedTotal.toLocaleString()} {db.settings.currency}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 5. ADD SUB-BRANCH MODAL (CAR BRANCH SUB-BRANCHES)             */}
      {/* ============================================================== */}
      {showAddSubBranchModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-2xl text-right my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    إدارة وإضافة فروع فرعية تحت فرع السيارات
                  </h3>
                  <p className="text-xs text-slate-500">
                    أضف سيارة مخصصة مثل &quot;سيارة صالح&quot; ليتم تسجيل مصروفاتها وحسابها بشكل منفصل
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSubBranchModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Existing Sub-branches list */}
            {carSubBranches.length > 0 && (
              <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>السيارات والفروع الفرعية المسجلة حالياً ({carSubBranches.length}):</span>
                  <span className="text-[10px] text-slate-500 font-normal">اضغط على زر القلم لتعديل البيانات</span>
                </div>
                <div className="divide-y divide-slate-200/80 max-h-48 overflow-y-auto">
                  {carSubBranches.map((sb) => {
                    const isBeingEdited = editingSubBranchId === sb.id;
                    return (
                      <div
                        key={sb.id}
                        className={`py-2 px-2 rounded-xl flex items-center justify-between text-xs transition-colors ${
                          isBeingEdited ? 'bg-amber-100/70 border border-amber-300' : 'hover:bg-slate-100/70'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">🚗 {sb.name}</span>
                            {isBeingEdited && (
                              <span className="text-[10px] bg-amber-600 text-white font-bold px-1.5 py-0.5 rounded">
                                قيد التعديل الآن
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            {sb.plateNumber && (
                              <span className="font-mono">لوحة: {sb.plateNumber}</span>
                            )}
                            {sb.driverName && (
                              <span>السائق: {sb.driverName}</span>
                            )}
                            {sb.notes && (
                              <span className="text-slate-400">({sb.notes})</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEditSubBranch(sb)}
                            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                              isBeingEdited
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                            }`}
                            title="تعديل بيانات هذا الفرع الفرعي"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubBranch(sb.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                            title="حذف هذا الفرع الفرعي"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add or Edit Sub-Branch Form */}
            <form onSubmit={handleSaveSubBranch} className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  {editingSubBranchId ? (
                    <>
                      <Edit2 className="w-3.5 h-3.5 text-amber-700" />
                      <span className="text-amber-950 font-black">
                        تعديل بيانات الفرع الفرعي (السيارة):
                      </span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 text-emerald-600" />
                      <span>إضافة فرع فرعي (سيارة) جديد:</span>
                    </>
                  )}
                </h4>
                {editingSubBranchId && (
                  <button
                    type="button"
                    onClick={handleCancelEditSubBranch}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    إلغاء التعديل والعودة للإضافة
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اسم الفرع الفرعي / السيارة *
                </label>
                <input
                  type="text"
                  required
                  value={newSubBranchName}
                  onChange={(e) => setNewSubBranchName(e.target.value)}
                  placeholder="مثال: سيارة صالح أو باص التوزيع 3"
                  className={`w-full px-3.5 py-2 text-xs border rounded-xl focus:outline-none ${
                    editingSubBranchId
                      ? 'border-amber-400 focus:border-amber-600 bg-amber-50/30'
                      : 'border-slate-300 focus:border-amber-500'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    رقم اللوحة / المركبة (اختياري)
                  </label>
                  <input
                    type="text"
                    value={newSubBranchPlate}
                    onChange={(e) => setNewSubBranchPlate(e.target.value)}
                    placeholder="مثال: عمّان 12-34567"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    اسم السائق / المسؤول (اختياري)
                  </label>
                  <input
                    type="text"
                    value={newSubBranchDriver}
                    onChange={(e) => setNewSubBranchDriver(e.target.value)}
                    placeholder="مثال: صالح العبادي"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ملاحظات إضافية (اختياري)
                </label>
                <input
                  type="text"
                  value={newSubBranchNotes}
                  onChange={(e) => setNewSubBranchNotes(e.target.value)}
                  placeholder="نوع المركبة، طبيعة العمل، إلخ..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>

              {subBranchFeedback && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{subBranchFeedback}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    handleCancelEditSubBranch();
                    setShowAddSubBranchModal(false);
                  }}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 text-xs font-bold rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5 transition-all ${
                    editingSubBranchId
                      ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  {editingSubBranchId ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>حفظ وتحديث بيانات السيارة ✓</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة الفرع الفرعي والسيارة</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 6. OFFICIAL PRINT TEMPLATE (Styled strictly for printing)      */}
      {/* ============================================================== */}
      <div id="expenses-print-sheet" className="hidden print:block p-8 bg-white text-black text-right" dir="rtl">
        {/* Print Document Header */}
        <div className="border-b-2 border-black pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-black">مؤسسة صخر المصري</h1>
              <p className="text-xs font-bold text-gray-700 tracking-wider">
                SAKHER GROUP · MOBILE SERVICES
              </p>
              <p className="text-[11px] text-gray-600 mt-0.5">
                نظام إدارة الفروع والدوام السحابي · المملكة الأردنية الهاشمية - عمّان
              </p>
            </div>
            <div className="text-left font-mono text-xs text-gray-700 space-y-1">
              <div>
                <strong>تاريخ الطباعة:</strong> {new Date().toLocaleDateString('ar-JO')}
              </div>
              <div>
                <strong>وقت الطباعة:</strong> {new Date().toLocaleTimeString('ar-JO')}
              </div>
              <div className="text-[10px] text-gray-500">SAKHR-EXP-REP-{Date.now().toString().slice(-6)}</div>
            </div>
          </div>

          <div className="text-center mt-4 pt-3 border-t border-gray-300">
            <h2 className="text-xl font-black text-black underline underline-offset-4">
              كشف وسجل مصروفات الفروع والسيارات التفصيلي
            </h2>
          </div>
        </div>

        {/* Print Filter Metadata Summary Box */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 border border-black rounded-lg mb-6 text-xs bg-gray-50">
          <div>
            <span className="text-gray-600 block">فترة التقرير:</span>
            <strong className="text-black font-mono">
              {dateFilterMode === 'date_range'
                ? `من ${rangeStart} إلى ${rangeEnd}`
                : dateFilterMode === 'single_date'
                ? `يوم ${selectedExactDate}`
                : 'كافة التواريخ المسجلة'}
            </strong>
          </div>
          <div>
            <span className="text-gray-600 block">الفرع المختار:</span>
            <strong className="text-black">{selectedBranchName}</strong>
          </div>
          <div>
            <span className="text-gray-600 block">الفرع الفرعي / السيارة:</span>
            <strong className="text-black">{selectedSubBranchName}</strong>
          </div>
          <div>
            <span className="text-gray-600 block">إجمالي المبلغ المطلوب:</span>
            <strong className="text-black font-mono text-sm font-black">
              {displayedTotal.toLocaleString()} {db.settings.currency}
            </strong>
          </div>
        </div>

        {/* Print Table */}
        <table className="w-full text-right border-collapse text-xs border border-black mb-8">
          <thead>
            <tr className="bg-gray-200 border-b border-black text-black font-black">
              <th className="border border-black p-2 text-center w-10">#</th>
              <th className="border border-black p-2 w-24">التاريخ</th>
              <th className="border border-black p-2 w-36">الفرع الرئيسي</th>
              <th className="border border-black p-2 w-36">الفرع الفرعي / السيارة</th>
              <th className="border border-black p-2 w-32">بند المصروف</th>
              <th className="border border-black p-2">البيان والتفاصيل</th>
              <th className="border border-black p-2 text-center w-28">المبلغ ({db.settings.currency})</th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-black p-6 text-center text-gray-500">
                  لا توجد مصروفات مسجلة ضمن هذه الفترة المحددة.
                </td>
              </tr>
            ) : (
              filteredExpenses.map((exp, index) => {
                const branch = db.branches.find((b) => b.id === exp.branchId);
                return (
                  <tr key={exp.id} className="border-b border-gray-300">
                    <td className="border border-black p-2 text-center font-mono">{index + 1}</td>
                    <td className="border border-black p-2 font-mono whitespace-nowrap">{exp.date}</td>
                    <td className="border border-black p-2 font-bold">{branch?.name || exp.branchId}</td>
                    <td className="border border-black p-2 font-semibold">
                      {exp.subBranchName ? `🚗 ${exp.subBranchName}` : 'فرع عام'}
                    </td>
                    <td className="border border-black p-2">{EXPENSE_CATEGORY_LABELS[exp.category]}</td>
                    <td className="border border-black p-2">{exp.description}</td>
                    <td className="border border-black p-2 text-center font-mono font-bold">
                      {exp.amount.toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 border-t-2 border-black font-black text-xs">
              <td colSpan={6} className="border border-black p-2.5 text-left pl-4">
                المجموع الكلي لكافة المصروفات المدرجة في هذا الكشف ({filteredExpenses.length} قيد):
              </td>
              <td className="border border-black p-2.5 text-center font-mono text-sm font-black text-black">
                {displayedTotal.toLocaleString()} {db.settings.currency}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Signatures & Approvals Section */}
        <div className="grid grid-cols-3 gap-6 pt-8 mt-12 border-t border-black text-center text-xs">
          <div>
            <span className="font-bold block mb-12">منظم الكشف / المحاسب</span>
            <div className="border-b border-dotted border-black w-36 mx-auto mb-1"></div>
            <span className="text-[11px] text-gray-500">التوقيع والتاريخ</span>
          </div>
          <div>
            <span className="font-bold block mb-12">المدير المالي وتدقيق الحسابات</span>
            <div className="border-b border-dotted border-black w-36 mx-auto mb-1"></div>
            <span className="text-[11px] text-gray-500">التوقيع والتاريخ</span>
          </div>
          <div>
            <span className="font-bold block mb-12">اعتماد الإدارة العامة (صخر المصري)</span>
            <div className="border-b border-dotted border-black w-36 mx-auto mb-1"></div>
            <span className="text-[11px] text-gray-500">الختم الرسمي والاعتماد</span>
          </div>
        </div>
      </div>
    </div>
  );
};
