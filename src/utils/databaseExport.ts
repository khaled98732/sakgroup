import { AppDatabase, Employee, AttendanceRecord, Branch } from '../types';

export function downloadDatabaseBackup(db: AppDatabase): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `sakhr-almasri-backup-${timestamp}.json`;
  const jsonStr = JSON.stringify(db, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Also notify server to store timestamped snapshot in data/backups
  fetch('/api/backup').catch(() => {});
}

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  db?: AppDatabase;
  stats?: {
    employees: number;
    branches: number;
    attendance: number;
    withdrawals: number;
    expenses: number;
    salaryPayments: number;
    users: number;
    companyName: string;
    backupDate: string;
  };
}

export function validateBackupFile(content: string): BackupValidationResult {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'الملف لا يحتوي على كائن بيانات صالح.' };
    }

    if (!Array.isArray(parsed.employees) || !Array.isArray(parsed.branches)) {
      return {
        valid: false,
        error: 'الملف يفتقر إلى الجداول الأساسية (الموظفين والفروع). يرجى التأكد من اختيار ملف نسخة احتياطية لنظام صخر المصري.',
      };
    }

    const normalized: AppDatabase = {
      branches: parsed.branches || [],
      employees: parsed.employees || [],
      attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
      withdrawals: Array.isArray(parsed.withdrawals) ? parsed.withdrawals : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      salaryPayments: Array.isArray(parsed.salaryPayments) ? parsed.salaryPayments : [],
      users: Array.isArray(parsed.users) ? parsed.users : [],
      settings: parsed.settings || {
        companyName: 'مؤسسة صخر المصري',
        currency: 'د.أ',
        adminUsername: 'admin',
        adminPassword: '123456',
      },
    };

    return {
      valid: true,
      db: normalized,
      stats: {
        employees: normalized.employees.length,
        branches: normalized.branches.length,
        attendance: normalized.attendance.length,
        withdrawals: normalized.withdrawals.length,
        expenses: normalized.expenses.length,
        salaryPayments: normalized.salaryPayments.length,
        users: normalized.users.length,
        companyName: normalized.settings?.companyName || 'مؤسسة صخر المصري',
        backupDate: new Date().toLocaleDateString('ar-JO'),
      },
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `الملف غير صالح (خطأ في قراءة JSON): ${err?.message || 'تنسيق غير معروف'}`,
    };
  }
}

/**
 * Exports complete database to an Excel (.xls) file containing all tables
 * Opens natively in Microsoft Excel, Google Sheets, LibreOffice Calc with proper RTL formatting.
 */
export function exportDatabaseToExcel(db: AppDatabase): void {
  const dateStr = new Date().toISOString().slice(0, 10);
  const currency = db.settings?.currency || 'د.أ';
  const company = db.settings?.companyName || 'مؤسسة صخر المصري';

  const branchMap = new Map(db.branches.map((b) => [b.id, b.name]));
  const empMap = new Map(db.employees.map((e) => [e.id, e.name]));

  const excelContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<!--[if gte mso 9]>
<xml>
  <x:ExcelWorkbook>
    <x:ExcelWorksheets>
      <x:ExcelWorksheet>
        <x:Name>قاعدة البيانات الشاملة</x:Name>
        <x:WorksheetOptions>
          <x:DisplayRightToLeft/>
        </x:WorksheetOptions>
      </x:ExcelWorksheet>
    </x:ExcelWorksheets>
  </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 30px; }
  th { background-color: #047857; color: #ffffff; border: 1px solid #065f46; padding: 10px; font-size: 13px; font-weight: bold; }
  td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; }
  tr:nth-child(even) { background-color: #f9fafb; }
  .section-title { font-size: 16px; font-weight: bold; color: #065f46; padding: 12px 0 6px 0; margin-top: 20px; }
  .header-box { background-color: #ecfdf5; border: 2px solid #059669; padding: 15px; margin-bottom: 25px; border-radius: 8px; }
  .amount { font-family: 'Courier New', monospace; font-weight: bold; color: #b91c1c; text-align: left; }
  .bold { font-weight: bold; }
</style>
</head>
<body>

<div class="header-box">
  <h1 style="margin:0; font-size:22px; color:#065f46;">${company} — كشف وتصدير قاعدة البيانات الشاملة</h1>
  <p style="margin:5px 0 0 0; color:#374151; font-size:12px;">
    تاريخ التصدير: <strong>${new Date().toLocaleString('ar-JO')}</strong> | العملة المعتمدة: <strong>${currency}</strong>
  </p>
</div>

<!-- ١. جدول الموظفين -->
<div class="section-title">١. سجل الموظفين وبياناتهم (${db.employees.length} موظف)</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>الرقم الوظيفي</th>
      <th>الاسم الكامل</th>
      <th>الفرع التابع له</th>
      <th>المسمى الوظيفي</th>
      <th>القسم</th>
      <th>رقم الهاتف</th>
      <th>الرقم الوطني</th>
      <th>رمز الدوام PIN</th>
      <th>الوردية</th>
      <th>سقف المسحوبات (${currency})</th>
      <th>قفل الهاتف المقترن</th>
      <th>الحالة</th>
    </tr>
  </thead>
  <tbody>
    ${db.employees
      .map(
        (emp, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="bold">${emp.code}</td>
      <td class="bold">${emp.name}</td>
      <td>${branchMap.get(emp.branchId) || emp.branchId}</td>
      <td>${emp.jobTitle}</td>
      <td>${emp.department}</td>
      <td>${emp.phone}</td>
      <td>${emp.nationalId}</td>
      <td>${emp.pin}</td>
      <td>${emp.shiftStart} - ${emp.shiftEnd}</td>
      <td class="amount">${
        emp.withdrawalLimitType === 'fixed' && emp.withdrawalLimitAmount !== undefined
          ? `${emp.withdrawalLimitAmount} ${currency}`
          : 'بدون سقف'
      }</td>
      <td>${emp.boundDeviceId ? `مقترن (${emp.boundDeviceName || 'هاتف'})` : 'غير مقترن'}</td>
      <td>${emp.status === 'active' ? 'على رأس العمل' : emp.status === 'on_leave' ? 'في إجازة' : 'موقوف'}</td>
    </tr>`
      )
      .join('')}
  </tbody>
</table>

<!-- ٢. جدول الفروع -->
<div class="section-title">٢. فروع المؤسسة المعتمدة (${db.branches.length} فرع)</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>اسم الفرع</th>
      <th>المدينة</th>
      <th>العنوان التفصيلي</th>
      <th>المدير المسؤول</th>
      <th>رمز QR والباركود</th>
      <th>عدد الموظفين</th>
    </tr>
  </thead>
  <tbody>
    ${db.branches
      .map(
        (b, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="bold">${b.name}</td>
      <td>${b.city}</td>
      <td>${b.address}</td>
      <td>${b.managerName}</td>
      <td class="bold">${b.qrToken || b.barcodeText || b.id}</td>
      <td>${db.employees.filter((e) => e.branchId === b.id).length}</td>
    </tr>`
      )
      .join('')}
  </tbody>
</table>

<!-- ٣. جدول المسحوبات والسلف النقدية -->
<div class="section-title">٣. كشف المسحوبات والسلف النقدية (${db.withdrawals.length} عملية)</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>التاريخ</th>
      <th>اسم الموظف</th>
      <th>الفرع</th>
      <th>نوع السحب</th>
      <th>المبلغ (${currency})</th>
      <th>البيان والسبب</th>
      <th>المعتمد للصرف</th>
    </tr>
  </thead>
  <tbody>
    ${db.withdrawals
      .map(
        (w, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${w.date}</td>
      <td class="bold">${empMap.get(w.employeeId) || w.employeeId}</td>
      <td>${branchMap.get(w.branchId) || w.branchId}</td>
      <td>${
        w.type === 'daily_advance'
          ? 'سلفة يومية'
          : w.type === 'emergency_advance'
          ? 'سلفة طارئة'
          : w.type === 'purchases'
          ? 'مشتريات'
          : 'خصم إداري'
      }</td>
      <td class="amount">${w.amount.toLocaleString()} ${currency}</td>
      <td>${w.reason}</td>
      <td>${w.approvedBy}</td>
    </tr>`
      )
      .join('')}
    <tr style="background-color:#fee2e2; font-weight:bold;">
      <td colspan="5">إجمالي المسحوبات والسلف:</td>
      <td class="amount" style="font-size:14px;">${db.withdrawals
        .reduce((sum, w) => sum + w.amount, 0)
        .toLocaleString()} ${currency}</td>
      <td colspan="2"></td>
    </tr>
  </tbody>
</table>

<!-- ٤. جدول سجل الحضور والانصراف -->
<div class="section-title">٤. سجل الحضور والانصراف للدوام (${db.attendance.length} قيد)</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>التاريخ</th>
      <th>اسم الموظف</th>
      <th>مكان العمل (الفرع)</th>
      <th>وقت الحضور</th>
      <th>وقت الانصراف</th>
      <th>إجمالي الساعات</th>
      <th>وسيلة التحقق</th>
      <th>الملاحظات</th>
    </tr>
  </thead>
  <tbody>
    ${db.attendance
      .map(
        (att, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${att.date}</td>
      <td class="bold">${empMap.get(att.employeeId) || att.employeeId}</td>
      <td>${branchMap.get(att.branchId) || att.branchId}</td>
      <td>${att.checkInTime}</td>
      <td>${att.checkOutTime || 'لم ينصرف بعد'}</td>
      <td class="bold">${att.totalHours || 0} ساعة</td>
      <td>${att.deviceInfo || att.method || 'QR هاتف'}</td>
      <td>${att.notes || '-'}</td>
    </tr>`
      )
      .join('')}
  </tbody>
</table>

<!-- ٥. جدول مصروفات الفروع التشغيلية -->
<div class="section-title">٥. مصروفات ونفقات الفروع التشغيلية (${db.expenses.length} مصروف)</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>التاريخ</th>
      <th>الفرع</th>
      <th>بند المصروف</th>
      <th>المبلغ (${currency})</th>
      <th>رقم الفاتورة / السند</th>
      <th>البيان والتفاصيل</th>
      <th>القائم بالصرف</th>
    </tr>
  </thead>
  <tbody>
    ${db.expenses
      .map(
        (exp, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${exp.date}</td>
      <td class="bold">${branchMap.get(exp.branchId) || exp.branchId}${exp.subBranchName ? ' - ' + exp.subBranchName : ''}</td>
      <td>${exp.category}</td>
      <td class="amount">${exp.amount.toLocaleString()} ${currency}</td>
      <td>${exp.invoiceNumber || '-'}</td>
      <td>${exp.description}</td>
      <td>${exp.paidBy || '-'}</td>
    </tr>`
      )
      .join('')}
    <tr style="background-color:#fef3c7; font-weight:bold;">
      <td colspan="4">إجمالي مصروفات الفروع:</td>
      <td class="amount" style="font-size:14px;">${db.expenses
        .reduce((sum, e) => sum + e.amount, 0)
        .toLocaleString()} ${currency}</td>
      <td colspan="3"></td>
    </tr>
  </tbody>
</table>

<!-- ٦. جدول مسير الرواتب المسلّمة -->
<div class="section-title">٦. سجل تسليم الرواتب الشهرية (${db.salaryPayments.length} حركة)</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>تاريخ التسليم</th>
      <th>اسم الموظف</th>
      <th>فترة الراتب</th>
      <th>الراتب الإجمالي</th>
      <th>المسحوبات المخصومة</th>
      <th>المكافآت</th>
      <th>الخصومات الإضافية</th>
      <th>صافي الراتب المسلم (${currency})</th>
      <th>المعتمد والملاحظات</th>
    </tr>
  </thead>
  <tbody>
    ${db.salaryPayments
      .map(
        (pay, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${pay.paidAt}</td>
      <td class="bold">${empMap.get(pay.employeeId) || pay.employeeId}</td>
      <td>${pay.periodStart} إلى ${pay.periodEnd}</td>
      <td>${pay.baseSalary.toLocaleString()}</td>
      <td style="color:#b91c1c;">-${pay.totalWithdrawals.toLocaleString()}</td>
      <td style="color:#047857;">+${pay.bonus.toLocaleString()}</td>
      <td style="color:#b91c1c;">-${pay.extraDeduction.toLocaleString()}</td>
      <td class="amount" style="color:#047857; font-size:13px;">${pay.netSalary.toLocaleString()} ${currency}</td>
      <td>${pay.approvedBy}</td>
    </tr>`
      )
      .join('')}
  </tbody>
</table>

<!-- ٧. مستخدمو النظام -->
<div class="section-title">٧. مستخدمو النظام والصلاحيات (${db.users.length} مستخدم)</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>الاسم</th>
      <th>اسم المستخدم</th>
      <th>الدور / الرتبة</th>
      <th>الفرع المحدد</th>
      <th>مسؤول نظام ادمن</th>
    </tr>
  </thead>
  <tbody>
    ${db.users
      .map(
        (u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="bold">${u.name}</td>
      <td>${u.username}</td>
      <td>${u.role}</td>
      <td>${!u.branchId || u.branchId === 'all' ? 'جميع الفروع' : branchMap.get(u.branchId) || u.branchId}</td>
      <td>${u.isAdmin ? 'نعم (كامل الصلاحيات)' : 'لا'}</td>
    </tr>`
      )
      .join('')}
  </tbody>
</table>

</body>
</html>
`;

  const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `قاعدة_بيانات_${company.replace(/\s+/g, '_')}_${dateStr}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const AUTO_BACKUP_KEY = 'sakhr_almasri_auto_backup_v1';
export const PRE_RESET_KEY = 'sakhr_almasri_pre_reset_backup';
export const SNAPSHOT_HISTORY_KEY = 'sakhr_almasri_snapshot_history_v1';

export interface SavedSnapshot {
  id: string;
  timestamp: number;
  dateStr: string;
  source: 'auto_sync' | 'manual' | 'before_reset';
  stats: {
    employees: number;
    branches: number;
    attendance: number;
    withdrawals: number;
    expenses: number;
  };
  db: AppDatabase;
}

export function saveAutoSnapshot(db: AppDatabase, source: 'auto_sync' | 'manual' | 'before_reset' = 'auto_sync'): void {
  try {
    const raw = JSON.stringify(db);
    localStorage.setItem(AUTO_BACKUP_KEY, raw);

    if (source === 'before_reset') {
      localStorage.setItem(PRE_RESET_KEY, raw);
    }

    // Maintain a rolling list of the last 6 snapshots
    const historyRaw = localStorage.getItem(SNAPSHOT_HISTORY_KEY);
    let history: SavedSnapshot[] = [];
    if (historyRaw) {
      try {
        history = JSON.parse(historyRaw);
      } catch {}
    }

    const now = Date.now();
    const newSnapshot: SavedSnapshot = {
      id: `snap-${now}`,
      timestamp: now,
      dateStr: new Date(now).toLocaleString('ar-JO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      }),
      source,
      stats: {
        employees: db.employees?.length || 0,
        branches: db.branches?.length || 0,
        attendance: db.attendance?.length || 0,
        withdrawals: db.withdrawals?.length || 0,
        expenses: db.expenses?.length || 0,
      },
      db,
    };

    // Keep unique states, limit to 6
    history = [newSnapshot, ...history.filter((s) => Math.abs(s.timestamp - now) > 2000)].slice(0, 6);
    localStorage.setItem(SNAPSHOT_HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.warn('Failed to save local auto snapshot:', err);
  }
}

export function getLatestAutoSnapshot(): AppDatabase | null {
  try {
    const raw = localStorage.getItem(AUTO_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const val = validateBackupFile(raw);
    return val.valid && val.db ? val.db : null;
  } catch {
    return null;
  }
}

export function getPreResetBackup(): AppDatabase | null {
  try {
    const raw = localStorage.getItem(PRE_RESET_KEY);
    if (!raw) return null;
    const val = validateBackupFile(raw);
    return val.valid && val.db ? val.db : null;
  } catch {
    return null;
  }
}

export function getSnapshotHistory(): SavedSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Determines whether local client state is richer or newer than server state.
 * Prevents server restarts / deployment updates from resetting user testing data!
 */
export function isLocalDataRicherOrNewer(localDb: AppDatabase | null | undefined, serverDb: AppDatabase | null | undefined): boolean {
  if (!localDb || !Array.isArray(localDb.employees)) return false;
  if (!serverDb || !Array.isArray(serverDb.employees)) return true;

  const localTime = localDb.settings?.updatedAt || 0;
  const serverTime = serverDb.settings?.updatedAt || 0;

  // If local timestamp is explicitly newer by more than 1 second
  if (localTime > serverTime + 1000) {
    return true;
  }

  // Calculate content richness
  const localScore =
    (localDb.employees?.length || 0) * 10 +
    (localDb.attendance?.length || 0) * 5 +
    (localDb.withdrawals?.length || 0) * 5 +
    (localDb.expenses?.length || 0) * 3 +
    (localDb.salaryPayments?.length || 0) * 3 +
    (localDb.users?.length || 0) * 2;

  const serverScore =
    (serverDb.employees?.length || 0) * 10 +
    (serverDb.attendance?.length || 0) * 5 +
    (serverDb.withdrawals?.length || 0) * 5 +
    (serverDb.expenses?.length || 0) * 3 +
    (serverDb.salaryPayments?.length || 0) * 3 +
    (serverDb.users?.length || 0) * 2;

  if (localScore > serverScore) {
    return true;
  }

  // Check if local has custom additions not present in server
  const serverEmpIds = new Set((serverDb.employees || []).map((e) => e.id));
  const hasLocalNewEmp = (localDb.employees || []).some((e) => !serverEmpIds.has(e.id));
  if (hasLocalNewEmp) return true;

  const serverAttIds = new Set((serverDb.attendance || []).map((a) => a.id));
  const hasLocalNewAtt = (localDb.attendance || []).some((a) => !serverAttIds.has(a.id));
  if (hasLocalNewAtt) return true;

  const serverWithIds = new Set((serverDb.withdrawals || []).map((w) => w.id));
  const hasLocalNewWith = (localDb.withdrawals || []).some((w) => !serverWithIds.has(w.id));
  if (hasLocalNewWith) return true;

  return false;
}

const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export function getArabicDayName(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return ARABIC_DAYS[d.getDay()] || '';
  } catch {
    return '';
  }
}

export function exportEmployeeAttendanceToExcel(
  employee: Employee,
  records: AttendanceRecord[],
  branches: Branch[],
  companyName: string,
  currency: string,
  startDate: string,
  endDate: string
): void {
  const branchMap = new Map<string, string>();
  branches.forEach((b) => branchMap.set(b.id, b.name));

  const totalHours = Math.round(records.reduce((sum, r) => sum + (r.totalHours || 0), 0) * 100) / 100;
  const completedShifts = records.filter((r) => r.checkInTime && r.checkOutTime).length;
  const incompleteShifts = records.filter((r) => r.checkInTime && !r.checkOutTime).length;
  const avgDailyHours = records.length > 0 ? (totalHours / records.length).toFixed(1) : '0';

  const dateRangeLabel =
    startDate && endDate
      ? `من ${startDate} إلى ${endDate}`
      : startDate
      ? `من ${startDate}`
      : endDate
      ? `حتى ${endDate}`
      : 'جميع الفترات المسجلة';

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<!--[if gte mso 9]>
<xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>كشف دوام - ${employee.name.replace(/[\\/?*[\]]/g, '')}</x:Name>
    <x:WorksheetOptions>
     <x:DisplayRightToLeft/>
    </x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 25px; }
  th { background-color: #047857; color: #ffffff; border: 1px solid #065f46; padding: 10px; font-size: 13px; font-weight: bold; }
  td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; }
  tr:nth-child(even) { background-color: #f9fafb; }
  .header-box { background-color: #ecfdf5; border: 2px solid #059669; padding: 15px; margin-bottom: 20px; border-radius: 8px; }
  .info-table td { border: none; padding: 6px 12px; font-size: 13px; }
  .info-table { margin-bottom: 15px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; }
  .kpi-table th { background-color: #0f766e; }
  .kpi-table td { font-size: 14px; font-weight: bold; text-align: center; }
  .bold { font-weight: bold; }
  .text-center { text-align: center; }
  .footer-sig { margin-top: 35px; width: 100%; border: none; }
  .footer-sig td { border: none; padding: 20px 10px; text-align: center; font-size: 13px; font-weight: bold; }
</style>
</head>
<body>

<div class="header-box">
  <h1 style="margin:0; font-size:20px; color:#065f46;">${companyName} — كشف سجل دوام وحضور الموظف</h1>
  <p style="margin:6px 0 0 0; color:#374151; font-size:13px;">
    الفترة الزمنية للكشف: <strong>${dateRangeLabel}</strong> | تاريخ ووقت التصدير: <strong>${new Date().toLocaleString('ar-JO')}</strong>
  </p>
</div>

<table class="info-table">
  <tr>
    <td width="25%"><strong>اسم الموظف:</strong> ${employee.name}</td>
    <td width="25%"><strong>الرقم الوظيفي:</strong> ${employee.code}</td>
    <td width="25%"><strong>المسمى الوظيفي:</strong> ${employee.jobTitle}</td>
    <td width="25%"><strong>القسم:</strong> ${employee.department}</td>
  </tr>
  <tr>
    <td><strong>الفرع المعتمد:</strong> ${branchMap.get(employee.branchId) || employee.branchId}</td>
    <td><strong>الوردية المعتمدة:</strong> ${employee.shiftStart} — ${employee.shiftEnd}</td>
    <td><strong>رقم الهاتف:</strong> ${employee.phone}</td>
    <td><strong>الحالة:</strong> ${employee.status === 'active' ? 'على رأس العمل' : 'إجازة'}</td>
  </tr>
</table>

<table class="kpi-table">
  <thead>
    <tr>
      <th>إجمالي أيام الحضور</th>
      <th>إجمالي ساعات العمل</th>
      <th>الورديات المكتملة</th>
      <th>الورديات غير المكتملة</th>
      <th>متوسط الساعات اليومي</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>${records.length} يوم</td>
      <td style="color:#047857; font-size:16px;">${totalHours} ساعة</td>
      <td style="color:#15803d;">${completedShifts} وردية</td>
      <td style="color:#b91c1c;">${incompleteShifts} وردية</td>
      <td>${avgDailyHours} ساعة/يوم</td>
    </tr>
  </tbody>
</table>

<h3 style="color:#065f46; margin: 20px 0 10px 0;">سجل الحركات التفصيلي للدوام</h3>
<table>
  <thead>
    <tr>
      <th width="40">#</th>
      <th>اليوم</th>
      <th>التاريخ</th>
      <th>مكان العمل (الفرع)</th>
      <th>وقت الحضور</th>
      <th>وقت الانصراف</th>
      <th>ساعات العمل</th>
      <th>وسيلة التحقق</th>
      <th>حالة الوردية</th>
      <th>الملاحظات</th>
    </tr>
  </thead>
  <tbody>
    ${records
      .map((r, idx) => {
        const dayName = getArabicDayName(r.date);
        const isComplete = Boolean(r.checkInTime && r.checkOutTime);
        const statusText = isComplete ? 'مكتمل' : 'غير مكتمل (قيد العمل)';
        const branchName = branchMap.get(r.branchId) || r.branchId;
        return `<tr>
        <td class="text-center">${idx + 1}</td>
        <td>${dayName}</td>
        <td class="text-center">${r.date}</td>
        <td>${branchName}</td>
        <td class="text-center bold" style="color:#047857;">${r.checkInTime || '-'}</td>
        <td class="text-center bold">${r.checkOutTime || 'لم يسجل انصراف'}</td>
        <td class="text-center bold" style="background-color:#f0fdf4;">${r.totalHours || 0} س</td>
        <td>${r.deviceInfo || r.method || 'مسح QR بالكاميرا'}</td>
        <td>${statusText}</td>
        <td>${r.notes || '-'}</td>
      </tr>`;
      })
      .join('')}
    <tr style="background-color:#dcfce7; font-weight:bold;">
      <td colspan="6" style="text-align:left; font-size:13px;">المجموع الإجمالي لساعات العمل:</td>
      <td class="text-center" style="font-size:15px; color:#047857;">${totalHours} ساعة</td>
      <td colspan="3"></td>
    </tr>
  </tbody>
</table>

<table class="footer-sig">
  <tr>
    <td width="33%">
      توقيع الموظف<br><br>
      _________________________
    </td>
    <td width="33%">
      مسؤول شؤون الموظفين والموارد البشرية<br><br>
      _________________________
    </td>
    <td width="33%">
      اعتماد الإدارة والختم الرسمي<br><br>
      _________________________
    </td>
  </tr>
</table>

</body>
</html>`;

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const cleanEmpName = employee.name.replace(/\s+/g, '_');
  a.href = url;
  a.download = `كشف_دوام_${cleanEmpName}_${startDate || 'البداية'}_${endDate || 'اليوم'}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports complete employee profile dossier (personal info, working hours, withdrawal limits,
 * branch, and phone binding status) to Excel (.xls), excluding withdrawals and attendance logs.
 */
export function exportEmployeeFullProfileToExcel(
  employee: Employee,
  db: AppDatabase
): void {
  const companyName = db.settings?.companyName || 'مؤسسة صخر المصري';
  const currency = db.settings?.currency || 'د.أ';
  const branch = db.branches.find((b) => b.id === employee.branchId);
  const branchName = branch ? branch.name : employee.branchId === 'all' ? 'جميع الفروع' : 'غير محدد';

  const statusLabel =
    employee.status === 'active'
      ? 'على رأس العمل'
      : employee.status === 'on_leave'
      ? 'في إجازة'
      : 'موقوف مؤقتاً';

  const withdrawalLimitLabel =
    employee.withdrawalLimitType === 'fixed' && employee.withdrawalLimitAmount !== undefined
      ? `${employee.withdrawalLimitAmount.toLocaleString()} ${currency}`
      : 'بدون سقف (مفتوح)';

  const deviceBoundLabel = employee.boundDeviceId
    ? `مقترن (${employee.boundDeviceName || 'هاتف شخصي'}) - قفل أمني نشط`
    : 'غير مقترن بهاتف';

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<!--[if gte mso 9]>
<xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>ملف الموظف - ${employee.name.replace(/[\\/?*[\]]/g, '')}</x:Name>
    <x:WorksheetOptions>
     <x:DisplayRightToLeft/>
    </x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 25px; }
  th { background-color: #047857; color: #ffffff; border: 1px solid #065f46; padding: 10px; font-size: 13px; font-weight: bold; }
  td { border: 1px solid #d1d5db; padding: 10px; font-size: 12px; }
  tr:nth-child(even) { background-color: #f9fafb; }
  .header-box { background-color: #ecfdf5; border: 2px solid #059669; padding: 18px; margin-bottom: 22px; border-radius: 8px; }
  .info-table { margin-bottom: 25px; background: #ffffff; border: 1.5px solid #059669; }
  .info-table td { padding: 10px 14px; font-size: 13px; border: 1px solid #e2e8f0; }
  .bold { font-weight: bold; }
  .section-title { font-size: 16px; font-weight: bold; color: #065f46; margin: 15px 0 10px 0; border-bottom: 2px solid #059669; padding-bottom: 6px; }
  .footer-sig { margin-top: 45px; width: 100%; border: none; }
  .footer-sig td { border: none; padding: 25px 12px; text-align: center; font-size: 13px; font-weight: bold; }
</style>
</head>
<body>

<div class="header-box">
  <h1 style="margin:0; font-size:22px; color:#065f46;">${companyName} — بطاقة وملف الموظف الرسمي</h1>
  <p style="margin:8px 0 0 0; color:#374151; font-size:13px;">
    الاسم: <strong>${employee.name}</strong> | الرقم الوظيفي: <strong>${employee.code}</strong> | تاريخ التصدير: <strong>${new Date().toLocaleString('ar-JO')}</strong>
  </p>
</div>

<!-- جدول البيانات الشخصية والتعاقدية والوظيفية -->
<div class="section-title">بيانات الموظف والتعاقد الرسمي الكاملة</div>
<table class="info-table">
  <tr>
    <td width="22%" style="background-color:#f8fafc;"><strong>الاسم الكامل للموظف:</strong></td>
    <td width="28%" class="bold" style="font-size:14px; color:#065f46;">${employee.name}</td>
    <td width="22%" style="background-color:#f8fafc;"><strong>الرقم الوظيفي:</strong></td>
    <td width="28%" class="bold" style="font-size:14px; color:#065f46;">${employee.code}</td>
  </tr>
  <tr>
    <td style="background-color:#f8fafc;"><strong>المسمى الوظيفي:</strong></td>
    <td class="bold">${employee.jobTitle}</td>
    <td style="background-color:#f8fafc;"><strong>القسم / الإدارة:</strong></td>
    <td>${employee.department}</td>
  </tr>
  <tr>
    <td style="background-color:#f8fafc;"><strong>مكان العمل (الفرع المعتمد):</strong></td>
    <td class="bold" style="color:#047857;">${branchName}</td>
    <td style="background-color:#f8fafc;"><strong>رقم الهاتف الشخصي:</strong></td>
    <td class="bold">${employee.phone}</td>
  </tr>
  <tr>
    <td style="background-color:#f8fafc;"><strong>الرقم الوطني / الوثيقة:</strong></td>
    <td class="bold">${employee.nationalId}</td>
    <td style="background-color:#f8fafc;"><strong>تاريخ المباشرة بالعمل:</strong></td>
    <td class="bold">${employee.hireDate}</td>
  </tr>
  <tr>
    <td style="background-color:#f8fafc;"><strong>أوقات الوردية الرسمية:</strong></td>
    <td class="bold">من ${employee.shiftStart} إلى ${employee.shiftEnd}</td>
    <td style="background-color:#f8fafc;"><strong>رمز الدوام السري (PIN):</strong></td>
    <td class="bold" style="color:#047857; font-size:14px;">${employee.pin}</td>
  </tr>
  <tr>
    <td style="background-color:#f8fafc;"><strong>الحالة الوظيفية الحالية:</strong></td>
    <td class="bold" style="color:#065f46;">${statusLabel}</td>
    <td style="background-color:#f8fafc;"><strong>سقف المسحوبات النقدية المعتمد:</strong></td>
    <td class="bold" style="color:#b91c1c;">${withdrawalLimitLabel}</td>
  </tr>
  <tr>
    <td style="background-color:#f8fafc;"><strong>هاتف الدوام المقترن (القفل الأمني):</strong></td>
    <td colspan="3" class="bold">${deviceBoundLabel}</td>
  </tr>
</table>

<table class="footer-sig">
  <tr>
    <td width="33%">
      توقيع الموظف وإقراره<br><br><br>
      _________________________
    </td>
    <td width="33%">
      مسؤول شؤون الموظفين والموارد البشرية<br><br><br>
      _________________________
    </td>
    <td width="33%">
      اعتماد الإدارة والختم الرسمي<br><br><br>
      _________________________
    </td>
  </tr>
</table>

</body>
</html>`;

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const cleanEmpName = employee.name.replace(/\s+/g, '_');
  a.href = url;
  a.download = `ملف_الموظف_${cleanEmpName}_${employee.code}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates an executive, printable A4 Employee Profile Dossier in an isolated print window.
 */
export function printEmployeeProfile(
  employee: Employee,
  db: AppDatabase
): void {
  const companyName = db.settings?.companyName || 'مؤسسة صخر المصري';
  const currency = db.settings?.currency || 'د.أ';
  const branch = db.branches.find((b) => b.id === employee.branchId);
  const branchName = branch ? branch.name : employee.branchId === 'all' ? 'جميع الفروع' : 'غير محدد';

  const empWithdrawals = (db.withdrawals || []).filter((w) => w.employeeId === employee.id);
  const totalWithdrawals = empWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);

  const empAttendance = (db.attendance || []).filter((a) => a.employeeId === employee.id);
  const totalAttendanceDays = empAttendance.length;
  const totalHours = Math.round(empAttendance.reduce((sum, a) => sum + (a.totalHours || 0), 0) * 100) / 100;

  const statusLabel =
    employee.status === 'active'
      ? 'على رأس العمل'
      : employee.status === 'on_leave'
      ? 'في إجازة'
      : 'موقوف مؤقتاً';

  const withdrawalLimitLabel =
    employee.withdrawalLimitType === 'fixed' && employee.withdrawalLimitAmount !== undefined
      ? `${employee.withdrawalLimitAmount.toLocaleString()} ${currency}`
      : 'بدون سقف (مفتوح)';

  const deviceBoundLabel = employee.boundDeviceId
    ? `مقترن (${employee.boundDeviceName || 'هاتف شخصي'}) - قفل أمني نشط`
    : 'غير مقترن بهاتف';

  const printHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>ملف الموظف - ${employee.name} (${employee.code})</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 15mm 15mm 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11pt;
      line-height: 1.4;
    }
    .print-header {
      border-bottom: 3px double #047857;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand-title {
      font-size: 18pt;
      font-weight: 900;
      color: #047857;
      margin: 0;
    }
    .brand-sub {
      font-size: 10pt;
      font-weight: bold;
      color: #475569;
      margin: 3px 0 0 0;
    }
    .doc-badge {
      text-align: left;
      font-size: 9pt;
      color: #64748b;
    }
    .doc-badge strong {
      display: block;
      font-size: 12pt;
      color: #0f172a;
    }
    .section-title {
      font-size: 12pt;
      font-weight: bold;
      color: #047857;
      border-bottom: 1.5px solid #047857;
      padding-bottom: 4px;
      margin: 14px 0 8px 0;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 10pt;
    }
    table.data-table th, table.data-table td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
    }
    table.data-table th {
      background-color: #f1f5f9;
      font-weight: bold;
      text-align: right;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-bottom: 14px;
      font-size: 10pt;
    }
    .info-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      background: #f8fafc;
    }
    .info-card span.label {
      color: #64748b;
      font-size: 8.5pt;
      display: block;
    }
    .info-card span.value {
      font-weight: bold;
      color: #0f172a;
      display: block;
      margin-top: 2px;
    }
    .kpi-row {
      display: flex;
      gap: 10px;
      margin-bottom: 14px;
    }
    .kpi-box {
      flex: 1;
      border: 1.5px solid #047857;
      border-radius: 8px;
      padding: 8px;
      text-align: center;
      background: #ecfdf5;
    }
    .kpi-box .num {
      font-size: 14pt;
      font-weight: 900;
      color: #047857;
    }
    .kpi-box .lbl {
      font-size: 8pt;
      color: #065f46;
      font-weight: bold;
    }
    .signatures {
      margin-top: 25px;
      display: flex;
      justify-content: space-between;
      text-align: center;
      font-size: 10pt;
      font-weight: bold;
      page-break-inside: avoid;
    }
    .sig-col {
      width: 30%;
      border-top: 1px dashed #64748b;
      padding-top: 8px;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="print-header">
    <div>
      <h1 class="brand-title">${companyName}</h1>
      <p class="brand-sub">SAKHER GROUP · بطاقة شؤون الموظفين والملف الشامل</p>
    </div>
    <div class="doc-badge">
      <strong>ملف الموظف</strong>
      <span>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-JO')}</span>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi-box">
      <div class="num">${totalAttendanceDays} يوم</div>
      <div class="lbl">أيام الدوام المسجلة</div>
    </div>
    <div class="kpi-box">
      <div class="num">${totalHours} س</div>
      <div class="lbl">ساعات العمل المنجزة</div>
    </div>
    <div class="kpi-box">
      <div class="num">${empWithdrawals.length}</div>
      <div class="lbl">حركات المسحوبات</div>
    </div>
    <div class="kpi-box">
      <div class="num" style="color:#b91c1c;">${totalWithdrawals.toLocaleString()} ${currency}</div>
      <div class="lbl" style="color:#991b1b;">إجمالي السلف والمسحوبات</div>
    </div>
  </div>

  <div class="section-title">١. البيانات الأساسية والتعاقدية</div>
  <div class="info-grid">
    <div class="info-card">
      <span class="label">الاسم الكامل للموظف</span>
      <span class="value">${employee.name}</span>
    </div>
    <div class="info-card">
      <span class="label">الرقم الوظيفي والمسمى</span>
      <span class="value">${employee.code} · ${employee.jobTitle}</span>
    </div>
    <div class="info-card">
      <span class="label">القسم والفرع المعتمد</span>
      <span class="value">${employee.department} — ${branchName}</span>
    </div>
    <div class="info-card">
      <span class="label">رقم الهاتف</span>
      <span class="value">${employee.phone}</span>
    </div>
    <div class="info-card">
      <span class="label">الرقم الوطني / الوثيقة</span>
      <span class="value">${employee.nationalId}</span>
    </div>
    <div class="info-card">
      <span class="label">تاريخ المباشرة</span>
      <span class="value">${employee.hireDate}</span>
    </div>
    <div class="info-card">
      <span class="label">أوقات الوردية (الدوام)</span>
      <span class="value">${employee.shiftStart} — ${employee.shiftEnd}</span>
    </div>
    <div class="info-card">
      <span class="label">الرمز السري (PIN)</span>
      <span class="value" style="color:#047857;">${employee.pin}</span>
    </div>
    <div class="info-card">
      <span class="label">الحالة الوظيفية</span>
      <span class="value">${statusLabel}</span>
    </div>
    <div class="info-card">
      <span class="label">سقف المسحوبات النقدية المعتمد</span>
      <span class="value">${withdrawalLimitLabel}</span>
    </div>
  </div>

  <div class="info-card" style="margin-bottom: 14px;">
    <span class="label">حالة ربط هاتف الدوام الأمني</span>
    <span class="value">${deviceBoundLabel}</span>
  </div>

  <div class="section-title">٢. سجل المسحوبات والسلف النقدية للموظف</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 30px; text-align:center;">#</th>
        <th style="width: 80px; text-align:center;">التاريخ</th>
        <th>نوع السلفة</th>
        <th style="width: 100px; text-align:center;">المبلغ (${currency})</th>
        <th>السبب والبيان</th>
        <th style="width: 100px;">المعتمد</th>
      </tr>
    </thead>
    <tbody>
      ${empWithdrawals.length > 0 ? empWithdrawals.map((w, idx) => `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td style="text-align:center;">${w.date}</td>
          <td>${w.type === 'daily_advance' ? 'سلفة يومية' : w.type === 'emergency_advance' ? 'سلفة طارئة' : w.type === 'purchases' ? 'مشتريات' : 'خصم إداري'}</td>
          <td style="text-align:center; font-weight:bold; color:#b91c1c;">-${w.amount.toLocaleString()} ${currency}</td>
          <td>${w.reason}</td>
          <td>${w.approvedBy || 'الإدارة'}</td>
        </tr>
      `).join('') : `
        <tr><td colspan="6" style="text-align:center; color:#64748b; padding:10px;">لا توجد مسحوبات نقدية مسجلة</td></tr>
      `}
      <tr style="background:#fee2e2; font-weight:bold;">
        <td colspan="3">المجموع الإجمالي للمسحوبات:</td>
        <td style="text-align:center; color:#b91c1c;">-${totalWithdrawals.toLocaleString()} ${currency}</td>
        <td colspan="2"></td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">٣. آخر حركات الحضور والانصراف للدوام</div>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 30px; text-align:center;">#</th>
        <th style="width: 85px; text-align:center;">التاريخ</th>
        <th style="width: 75px; text-align:center;">الحضور</th>
        <th style="width: 75px; text-align:center;">الانصراف</th>
        <th style="width: 75px; text-align:center;">الساعات</th>
        <th>وسيلة التحقق والملاحظات</th>
      </tr>
    </thead>
    <tbody>
      ${empAttendance.slice(0, 8).map((a, idx) => `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td style="text-align:center;">${a.date}</td>
          <td style="text-align:center; font-weight:bold; color:#047857;">${a.checkInTime || '-'}</td>
          <td style="text-align:center;">${a.checkOutTime || 'قيد العمل'}</td>
          <td style="text-align:center; font-weight:bold;">${a.totalHours || 0} س</td>
          <td>${a.deviceInfo || a.method || 'QR'} ${a.notes ? '· ' + a.notes : ''}</td>
        </tr>
      `).join('')}
      ${empAttendance.length === 0 ? `
        <tr><td colspan="6" style="text-align:center; color:#64748b; padding:10px;">لا توجد سجلات دوام بعد</td></tr>
      ` : ''}
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-col">
      توقيع الموظف وإقراره
      <br><br><br>
    </div>
    <div class="sig-col">
      مسؤول شؤون الموظفين
      <br><br><br>
    </div>
    <div class="sig-col">
      اعتماد الإدارة العامة والختم
      <br><br><br>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
  } else {
    // Fallback if popup is blocked
    window.print();
  }
}


