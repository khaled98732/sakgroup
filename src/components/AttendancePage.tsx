import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Smartphone,
  MapPin,
  QrCode,
  LogIn,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  Calendar,
  Building2,
  UserCheck,
  ShieldCheck,
  HelpCircle,
  Camera,
  Upload,
  Search,
  X,
  Check,
  Lock,
  Printer,
  FileSpreadsheet,
  Download,
  FileText,
  Filter,
  User,
  ThumbsUp,
  ThumbsDown,
  Hourglass,
  Send,
} from 'lucide-react';
import {
  AppDatabase,
  AttendanceRecord,
  Employee,
  Branch,
  LeaveRequest,
  LeaveRequestType,
  LeaveCategory,
  LeaveRequestStatus,
  AppUser,
} from '../types';
import { QRCameraScanner } from './QRCameraScanner';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  exportEmployeeAttendanceToExcel,
  getArabicDayName,
} from '../utils/databaseExport';
import { analyzePhotoForScreenSpoof } from '../utils/antiSpoofDetection';
import { verifyEmployeeInBranchGeofence } from '../utils/geoFence';

interface AttendancePageProps {
  db: AppDatabase;
  currentUser?: AppUser | null;
  onUpdateAttendance: (records: AttendanceRecord[]) => void;
  onUpdateLeaveRequests?: (requests: LeaveRequest[]) => void;
}

function getTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFirstDayOfMonthStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function getLastDayOfMonthStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
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

export const AttendancePage: React.FC<AttendancePageProps> = ({
  db,
  currentUser,
  onUpdateAttendance,
  onUpdateLeaveRequests,
}) => {
  const [activeSubView, setActiveSubView] = useState<'mobile_terminal' | 'admin_log' | 'leave_requests' | 'methods_guide'>('admin_log');

  // Live clock
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

  // Mobile Check-in State (QR Code Only)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(db.employees[0]?.id || '');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(db.branches[0]?.id || '');
  const [qrInput, setQrInput] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState<boolean>(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [noteInput, setNoteInput] = useState<string>('');
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);

  // Strict Camera QR Verification State
  const [isCameraVerified, setIsCameraVerified] = useState<boolean>(false);
  const [verifiedCameraBranch, setVerifiedCameraBranch] = useState<Branch | null>(null);
  const [cameraVerifiedAt, setCameraVerifiedAt] = useState<string | null>(null);

  // Statement of Account (كشف سجل دوام الموظف)
  const [showStatementModal, setShowStatementModal] = useState<boolean>(false);
  const [statementEmployeeId, setStatementEmployeeId] = useState<string>(db.employees[0]?.id || '');
  const [statementStartDate, setStatementStartDate] = useState<string>(getFirstDayOfMonthStr());
  const [statementEndDate, setStatementEndDate] = useState<string>(getTodayStr());
  const [statementBranchFilter, setStatementBranchFilter] = useState<string>('all');
  const [statementSearchTerm, setStatementSearchTerm] = useState<string>('');

  // Search by employee name (Request 2)
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState<string>('');

  // Interactive Confirmation Modal (Request 4)
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

  // Admin Filter State
  const [filterDate, setFilterDate] = useState<string>(getTodayStr());
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualEmpId, setManualEmpId] = useState<string>(db.employees[0]?.id || '');
  const [manualDate, setManualDate] = useState<string>(getTodayStr());
  const [manualIn, setManualIn] = useState<string>('08:00');
  const [manualOut, setManualOut] = useState<string>('16:00');
  const [manualNotes, setManualNotes] = useState<string>('');

  // Leave & Departure Requests Management State
  const [leaveReqTypeFilter, setLeaveReqTypeFilter] = useState<'all' | LeaveRequestType>('all');
  const [leaveReqStatusFilter, setLeaveReqStatusFilter] = useState<'all' | LeaveRequestStatus>('all');
  const [leaveReqBranchFilter, setLeaveReqBranchFilter] = useState<string>('all');
  const [leaveReqSearch, setLeaveReqSearch] = useState<string>('');
  const [reviewingRequest, setReviewingRequest] = useState<{
    request: LeaveRequest;
    action: 'approve' | 'reject';
  } | null>(null);
  const [adminDecisionNote, setAdminDecisionNote] = useState<string>('');
  const [leaveFeedbackMsg, setLeaveFeedbackMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const allLeaveRequests = useMemo(() => {
    return db.leaveRequests || [];
  }, [db.leaveRequests]);

  const pendingLeaveRequestsCount = useMemo(() => {
    return allLeaveRequests.filter((r) => r.status === 'pending').length;
  }, [allLeaveRequests]);

  const approvedLeaveRequestsCount = useMemo(() => {
    return allLeaveRequests.filter((r) => r.status === 'approved').length;
  }, [allLeaveRequests]);

  const rejectedLeaveRequestsCount = useMemo(() => {
    return allLeaveRequests.filter((r) => r.status === 'rejected').length;
  }, [allLeaveRequests]);

  const filteredLeaveRequests = useMemo(() => {
    return allLeaveRequests
      .filter((r) => {
        if (leaveReqTypeFilter !== 'all' && r.type !== leaveReqTypeFilter) return false;
        if (leaveReqStatusFilter !== 'all' && r.status !== leaveReqStatusFilter) return false;
        if (leaveReqBranchFilter !== 'all' && r.branchId !== leaveReqBranchFilter) return false;
        if (leaveReqSearch.trim()) {
          const s = leaveReqSearch.trim().toLowerCase();
          const emp = db.employees.find((e) => e.id === r.employeeId);
          const branch = db.branches.find((b) => b.id === r.branchId);
          const matchEmp = emp?.name.toLowerCase().includes(s) || emp?.code.toLowerCase().includes(s);
          const matchBranch = branch?.name.toLowerCase().includes(s);
          const matchReason = r.reason.toLowerCase().includes(s);
          if (!matchEmp && !matchBranch && !matchReason) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allLeaveRequests, leaveReqTypeFilter, leaveReqStatusFilter, leaveReqBranchFilter, leaveReqSearch, db.employees, db.branches]);

  const handleOpenReviewModal = (request: LeaveRequest, action: 'approve' | 'reject') => {
    setReviewingRequest({ request, action });
    setAdminDecisionNote('');
  };

  const handleConfirmDecision = () => {
    if (!reviewingRequest) return;
    const { request, action } = reviewingRequest;
    const currentList = db.leaveRequests || [];
    const reviewerName = currentUser?.name || 'مدير النظام';

    const updated = currentList.map((item) => {
      if (item.id !== request.id) return item;
      return {
        ...item,
        status: action === 'approve' ? ('approved' as const) : ('rejected' as const),
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewerName,
        adminNote:
          adminDecisionNote.trim() ||
          (action === 'approve'
            ? 'تمت الموافقة والاعتماد من قبل الإدارة'
            : 'تم الاعتذار ورفض الطلب لحاجة العمل'),
      };
    });

    if (onUpdateLeaveRequests) {
      onUpdateLeaveRequests(updated);
    }

    const empName = db.employees.find((e) => e.id === request.employeeId)?.name || 'الموظف';
    const actionLabel = action === 'approve' ? 'الموافقة على' : 'رفض';
    const typeLabel = request.type === 'leave' ? 'طلب الإجازة' : 'طلب المغادرة';

    setLeaveFeedbackMsg({
      type: 'success',
      text: `✅ تم بنجاح ${actionLabel} ${typeLabel} لـ (${empName}). سيظهر القرار لحظياً في بوابة الموظف.`,
    });

    setReviewingRequest(null);
    setAdminDecisionNote('');
  };

  const handleDeleteLeaveRequest = (reqId: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا الطلب نهائياً من السجل؟')) return;
    const updated = (db.leaveRequests || []).filter((r) => r.id !== reqId);
    if (onUpdateLeaveRequests) {
      onUpdateLeaveRequests(updated);
    }
  };

  // Find employee matching selected ID
  const matchedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return db.employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [db.employees, selectedEmployeeId]);

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

  // Auto-sync branch when employee is matched (WITHOUT exposing secret QR token)
  useEffect(() => {
    if (matchedEmployee) {
      setSelectedBranchId(matchedEmployee.branchId);
    }
  }, [matchedEmployee]);

  const currentBranch = useMemo(
    () => db.branches.find((b) => b.id === selectedBranchId) || db.branches[0] || null,
    [db.branches, selectedBranchId]
  );

  // Statement calculations
  const statementEmployee = useMemo(() => {
    return db.employees.find((e) => e.id === statementEmployeeId) || db.employees[0] || null;
  }, [db.employees, statementEmployeeId]);

  const statementRecords = useMemo(() => {
    if (!statementEmployee) return [];
    return db.attendance
      .filter((r) => {
        if (r.employeeId !== statementEmployee.id) return false;
        if (statementStartDate && r.date < statementStartDate) return false;
        if (statementEndDate && r.date > statementEndDate) return false;
        if (statementBranchFilter !== 'all' && r.branchId !== statementBranchFilter) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [db.attendance, statementEmployee, statementStartDate, statementEndDate, statementBranchFilter]);

  const statementStats = useMemo(() => {
    const totalDays = statementRecords.length;
    const totalHours =
      Math.round(statementRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0) * 100) / 100;
    const completedShifts = statementRecords.filter((r) => r.checkInTime && r.checkOutTime).length;
    const incompleteShifts = statementRecords.filter((r) => r.checkInTime && !r.checkOutTime).length;
    const avgDailyHours = totalDays > 0 ? (totalHours / totalDays).toFixed(1) : '0';
    return {
      totalDays,
      totalHours,
      completedShifts,
      incompleteShifts,
      avgDailyHours,
    };
  }, [statementRecords]);

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
      const html5QrCode = new Html5Qrcode('qr-reader-temp-attendance');
      const decodedText = await html5QrCode.scanFile(file, true);
      const clean = decodedText.trim();
      setQrInput(clean);

      const foundBranch = db.branches.find(
        (b) =>
          b.qrToken.toUpperCase() === clean.toUpperCase() ||
          clean.toUpperCase().includes(b.qrToken.toUpperCase()) ||
          clean.toUpperCase().includes(b.id.toUpperCase())
      );

      if (foundBranch) {
        setSelectedBranchId(foundBranch.id);
        setIsCameraVerified(true);
        setVerifiedCameraBranch(foundBranch);
        const nowTime = getCurrentTimeStr();
        setCameraVerifiedAt(nowTime);
        setFeedbackMessage({
          type: 'success',
          text: `✅ تم التحقق بنجاح من رمز QR الفرع عبر الكاميرا المباشرة: (${foundBranch.name}) الساعة ${nowTime}. يمكنك الآن الضغط على زر الحضور أو الانصراف.`,
        });
      } else {
        setIsCameraVerified(false);
        setVerifiedCameraBranch(null);
        setFeedbackMessage({
          type: 'error',
          text: `رمز QR المقروء (${clean}) لا ينتمي لأي فرع من فروع المؤسسة المعتمدة.`,
        });
      }
    } catch {
      setIsCameraVerified(false);
      setVerifiedCameraBranch(null);
      setFeedbackMessage({
        type: 'error',
        text: 'تعذر قراءة كود QR من الصورة. يرجى التأكد من توجيه الكاميرا مباشرة وبوضوح إلى رمز QR الفرع الورقي المعتمد وإعادة المحاولة.',
      });
    } finally {
      setIsAnalyzingPhoto(false);
      if (e.target) e.target.value = '';
    }
  };

  // Check if matched employee has an attendance record today
  const todayStr = getTodayStr();
  const todayRecord = useMemo(() => {
    if (!matchedEmployee) return null;
    return db.attendance.find(
      (r) => r.employeeId === matchedEmployee.id && r.date === todayStr
    );
  }, [db.attendance, matchedEmployee, todayStr]);

  // Statement Print and Export Handlers
  const handlePrintStatement = () => {
    if (!statementEmployee) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const branchMap = new Map<string, string>();
    db.branches.forEach((b) => branchMap.set(b.id, b.name));

    const dateRangeLabel =
      statementStartDate && statementEndDate
        ? `من ${statementStartDate} إلى ${statementEndDate}`
        : statementStartDate
        ? `من ${statementStartDate}`
        : statementEndDate
        ? `حتى ${statementEndDate}`
        : 'جميع التواريخ المسجلة';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>كشف دوام الموظف — ${statementEmployee.name}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 15mm; }
          * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
          body { margin: 0; padding: 20px; color: #1e293b; font-size: 11pt; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 15px; }
          .header-title h1 { margin: 0; font-size: 18pt; color: #065f46; }
          .header-title p { margin: 4px 0 0; color: #64748b; font-size: 9pt; }
          .header-meta { text-align: left; font-size: 9pt; color: #475569; }
          .emp-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 15px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 9.5pt; }
          .emp-field span { display: block; color: #64748b; font-size: 8pt; margin-bottom: 2px; }
          .emp-field strong { color: #0f172a; }
          .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 18px; }
          .stat-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: center; background: #fcfcfc; }
          .stat-card .val { font-size: 13pt; font-weight: bold; color: #065f46; font-family: monospace; }
          .stat-card .label { font-size: 8pt; color: #64748b; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9pt; }
          th { background: #047857; color: white; padding: 7px 6px; border: 1px solid #065f46; text-align: right; font-weight: bold; }
          td { padding: 6px; border: 1px solid #cbd5e1; text-align: right; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .text-center { text-align: center; }
          .bold { font-weight: bold; }
          .total-row { background: #dcfce7 !important; font-weight: bold; }
          .footer-signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 40px; padding-top: 20px; border-top: 1px dashed #cbd5e1; text-align: center; font-size: 9.5pt; }
          .sig-line { margin-top: 45px; border-top: 1px solid #94a3b8; width: 80%; margin-left: auto; margin-right: auto; }
          @media print {
            body { padding: 0; }
            button { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-title">
            <h1>مؤسسة صخر المصري للأجهزة الكهربائية والتكييف</h1>
            <p>الإدارة العامة — عمّان، المملكة الأردنية الهاشمية</p>
          </div>
          <div class="header-meta">
            <div><strong>كشف سجل دوام وحضور موظف</strong></div>
            <div style="margin-top: 4px;">تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-JO')}</div>
            <div>الفترة: ${dateRangeLabel}</div>
          </div>
        </div>

        <div class="emp-box">
          <div class="emp-field"><span>اسم الموظف:</span><strong>${statementEmployee.name}</strong></div>
          <div class="emp-field"><span>الرقم الوظيفي:</span><strong>${statementEmployee.code}</strong></div>
          <div class="emp-field"><span>المسمى الوظيفي:</span><strong>${statementEmployee.jobTitle}</strong></div>
          <div class="emp-field"><span>القسم:</span><strong>${statementEmployee.department}</strong></div>
          <div class="emp-field"><span>الفرع المعتمد:</span><strong>${branchMap.get(statementEmployee.branchId) || statementEmployee.branchId}</strong></div>
          <div class="emp-field"><span>مواعيد الوردية:</span><strong>${statementEmployee.shiftStart} — ${statementEmployee.shiftEnd}</strong></div>
          <div class="emp-field"><span>رقم الهاتف:</span><strong>${statementEmployee.phone}</strong></div>
          <div class="emp-field"><span>الرقم الوطني:</span><strong>${statementEmployee.nationalId}</strong></div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="val">${statementStats.totalDays}</div>
            <div class="label">إجمالي أيام الحضور</div>
          </div>
          <div class="stat-card">
            <div class="val">${statementStats.totalHours} س</div>
            <div class="label">ساعات العمل الفعلية</div>
          </div>
          <div class="stat-card">
            <div class="val">${statementStats.completedShifts}</div>
            <div class="label">الورديات المكتملة</div>
          </div>
          <div class="stat-card">
            <div class="val">${statementStats.incompleteShifts}</div>
            <div class="label">ورديات غير مكتملة</div>
          </div>
          <div class="stat-card">
            <div class="val">${statementStats.avgDailyHours} س</div>
            <div class="label">متوسط الساعات اليومي</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th width="30" class="text-center">#</th>
              <th>اليوم</th>
              <th class="text-center">التاريخ</th>
              <th>الفرع / مكان العمل</th>
              <th class="text-center">وقت الحضور</th>
              <th class="text-center">وقت الانصراف</th>
              <th class="text-center">ساعات العمل</th>
              <th>وسيلة التحقق</th>
              <th>الملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${
              statementRecords.length === 0
                ? '<tr><td colspan="9" class="text-center" style="padding: 20px;">لا توجد سجلات دوام مطابقة للفترة المحددة</td></tr>'
                : statementRecords
                    .map((r, i) => {
                      const dayName = getArabicDayName(r.date);
                      const branchName = branchMap.get(r.branchId) || r.branchId;
                      return `<tr>
                        <td class="text-center">${i + 1}</td>
                        <td>${dayName}</td>
                        <td class="text-center font-mono">${r.date}</td>
                        <td>${branchName}</td>
                        <td class="text-center bold" style="color: #047857;">${r.checkInTime || '-'}</td>
                        <td class="text-center bold">${r.checkOutTime || '—'}</td>
                        <td class="text-center bold">${r.totalHours || 0} س</td>
                        <td>${r.deviceInfo || r.method || 'مسح QR بالكاميرا'}</td>
                        <td>${r.notes || '—'}</td>
                      </tr>`;
                    })
                    .join('')
            }
            <tr class="total-row">
              <td colspan="6" style="text-align: left; padding: 8px;">المجموع الإجمالي لساعات العمل:</td>
              <td class="text-center" style="font-size: 11pt; color: #047857;">${statementStats.totalHours} ساعة</td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>

        <div class="footer-signatures">
          <div>
            <strong>توقيع الموظف</strong>
            <div class="sig-line"></div>
          </div>
          <div>
            <strong>مسؤول الموارد البشرية وشؤون الموظفين</strong>
            <div class="sig-line"></div>
          </div>
          <div>
            <strong>اعتماد الإدارة وختم المؤسسة</strong>
            <div class="sig-line"></div>
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
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportStatementExcel = () => {
    if (!statementEmployee) return;
    exportEmployeeAttendanceToExcel(
      statementEmployee,
      statementRecords,
      db.branches,
      db.settings?.companyName || 'مؤسسة صخر المصري للأجهزة الكهربائية والتكييف',
      db.settings?.currency || 'د.أ',
      statementStartDate,
      statementEndDate
    );
  };

  // Strictly Controlled Mobile Action (Check-In / Check-Out) with 15m GPS Geofence Check
  const handleMobileAction = async (actionType: 'check_in' | 'check_out') => {
    setFeedbackMessage(null);

    // 1. Employee verification
    if (!matchedEmployee) {
      setFeedbackMessage({
        type: 'error',
        text: 'يرجى اختيار الموظف أولاً لتسجيل الدوام.',
      });
      return;
    }

    // 2. STRICT CAMERA QR VERIFICATION:
    // Guarantees NO attendance data is sent to the database without a genuine, verified camera QR scan
    if (!isCameraVerified || !verifiedCameraBranch) {
      setFeedbackMessage({
        type: 'error',
        text: '⛔ تم منع تسجيل الدوام: يجب مسح رمز QR المخصص للفرع عبر الكاميرا والتحقق منه أولاً قبل إرسال أي بيانات لقاعدة البيانات. يرجى الضغط على زر «فتح كاميرا الـ QR» أو «التقاط صورة للـ QR».',
      });
      return;
    }

    const activeBranch = verifiedCameraBranch;

    // 3. Strict employee workplace verification:
    if (
      matchedEmployee.branchId &&
      matchedEmployee.branchId !== 'all' &&
      activeBranch.id !== matchedEmployee.branchId
    ) {
      const empBranch = db.branches.find((b) => b.id === matchedEmployee.branchId);
      setFeedbackMessage({
        type: 'error',
        text: `⛔ غير مقبول: هذا ليس مكان عملك المحدد! الموظف "${matchedEmployee.name}" معين في فرع (${empBranch?.name || 'فرع آخر'})، بينما الرمز الممسوح بالكاميرا ينتمي إلى (${activeBranch.name}). لا يقبل النظام تسجيل الدوام إلا من مقر عملك المحدد.`,
      });
      return;
    }

    // 4. STRICT GPS GEOFENCE CHECK (Within 15 meters circle of the branch):
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
        deviceInfo: `بوابة هاتف الموظف (QR كاميرا مؤكد + تحقق جغرافي ${verifiedDistance}م)`,
        notes: noteInput.trim()
          ? `${noteInput.trim()} · مسح QR كاميرا وتحقق GPS (${verifiedDistance}م)`
          : `حضور عبر مسح QR كاميرا فرع ${activeBranch.name} (تحقق جغرافي ${verifiedDistance}م)`,
        totalHours: 0,
      };

      onUpdateAttendance([newRecord, ...db.attendance]);

      // Reset camera verification to require fresh scan for future actions
      setIsCameraVerified(false);
      setVerifiedCameraBranch(null);
      setCameraVerifiedAt(null);

      setFeedbackMessage({
        type: 'success',
        text: `✓ تم تسجيل بدء الدوام للموظف "${matchedEmployee.name}" في (${activeBranch.name}) بنجاح عبر كود QR والتحقق الجغرافي (${verifiedDistance}م) الساعة ${nowTime}.`,
      });

      setConfirmationModal({
        isOpen: true,
        actionType: 'check_in',
        employee: matchedEmployee,
        branch: activeBranch,
        time: nowTime,
        date: todayStr,
        deviceInfo: `بوابة هاتف الموظف (QR مؤكد + تحقق GPS: ${verifiedDistance}م)`,
        note: noteInput.trim() || undefined,
      });

      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch {
          // Ignore
        }
      }

      setNoteInput('');
    } else {
      if (!todayRecord) {
        setFeedbackMessage({
          type: 'error',
          text: `لم يتم العثور على تسجيل بدء دوام اليوم للموظف ${matchedEmployee.name}. يرجى تسجيل الحضور أولاً.`,
        });
        return;
      }
      if (todayRecord.checkOutTime) {
        setFeedbackMessage({
          type: 'error',
          text: `تم تسجيل انصراف الموظف ${matchedEmployee.name} مسبقاً الساعة ${todayRecord.checkOutTime}.`,
        });
        return;
      }

      const hours = calculateHours(todayRecord.checkInTime, nowTime);
      const totalHoursVal = hours > 0 ? hours : 0.1;
      const updated = db.attendance.map((rec) =>
        rec.id === todayRecord.id
          ? {
              ...rec,
              checkOutTime: nowTime,
              totalHours: totalHoursVal,
              gpsVerified: true,
              distanceMeters: verifiedDistance,
              notes: noteInput.trim()
                ? `${rec.notes || ''} - ${noteInput.trim()}`
                : `انصراف عبر مسح QR كاميرا فرع ${activeBranch.name} (تحقق جغرافي ${verifiedDistance}م)`,
            }
          : rec
      );

      onUpdateAttendance(updated);

      // Reset camera verification to require fresh scan for future actions
      setIsCameraVerified(false);
      setVerifiedCameraBranch(null);
      setCameraVerifiedAt(null);

      setFeedbackMessage({
        type: 'success',
        text: `✓ تم تسجيل نهاية الدوام والانصراف للموظف "${matchedEmployee.name}" الساعة ${nowTime} (إجمالي الساعات: ${totalHoursVal} ساعة - فحص GPS: ${verifiedDistance}م).`,
      });

      setConfirmationModal({
        isOpen: true,
        actionType: 'check_out',
        employee: matchedEmployee,
        branch: activeBranch,
        time: nowTime,
        date: todayStr,
        totalHours: totalHoursVal,
        deviceInfo: `بوابة هاتف الموظف (QR مؤكد + تحقق GPS: ${verifiedDistance}م)`,
        note: noteInput.trim() || undefined,
      });

      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([120, 60, 120]);
        } catch {
          // Ignore
        }
      }

      setNoteInput('');
    }
  };

  const handleQuickCheckoutFromTable = (recordId: string) => {
    const nowTime = getCurrentTimeStr();
    const updated = db.attendance.map((rec) => {
      if (rec.id !== recordId) return rec;
      const hours = calculateHours(rec.checkInTime, nowTime);
      return {
        ...rec,
        checkOutTime: nowTime,
        totalHours: hours > 0 ? hours : 0.25,
        notes: 'تم تسجيل الانصراف',
      };
    });
    onUpdateAttendance(updated);
  };

  // Manual Check-In (تسجيل بدء دوام يدوي)
  const handleRecordManualCheckIn = () => {
    const emp = db.employees.find((x) => x.id === manualEmpId);
    if (!emp) {
      alert('يرجى اختيار الموظف أولاً');
      return;
    }
    if (!manualIn) {
      alert('يرجى تحديد وقت بدء الدوام');
      return;
    }

    // Look for existing attendance record on that date
    const existingIndex = db.attendance.findIndex(
      (r) => r.employeeId === emp.id && r.date === manualDate
    );

    let updatedList: AttendanceRecord[];
    if (existingIndex >= 0) {
      const existing = db.attendance[existingIndex];
      const hours = existing.checkOutTime ? calculateHours(manualIn, existing.checkOutTime) : 0;
      const updatedRec: AttendanceRecord = {
        ...existing,
        checkInTime: manualIn,
        totalHours: hours,
        notes: manualNotes.trim()
          ? `${existing.notes || ''} [بدء يدوي: ${manualNotes.trim()}]`.trim()
          : (existing.notes || 'تسجيل بدء دوام يدوي'),
      };
      updatedList = [...db.attendance];
      updatedList[existingIndex] = updatedRec;
    } else {
      const newRec: AttendanceRecord = {
        id: `att-${Date.now()}`,
        employeeId: emp.id,
        branchId: emp.branchId,
        date: manualDate,
        checkInTime: manualIn,
        checkOutTime: null,
        method: 'PIN',
        gpsVerified: true,
        distanceMeters: 5,
        deviceInfo: 'تسجيل بدء دوام يدوي (إداري)',
        notes: manualNotes.trim() || 'تسجيل بدء دوام يدوي',
        totalHours: 0,
      };
      updatedList = [newRec, ...db.attendance];
    }

    onUpdateAttendance(updatedList);
    setShowManualModal(false);
    setManualNotes('');
    alert(`✓ تم تسجيل بدء الدوام للموظف "${emp.name}" بنجاح في الساعة ${manualIn}`);
  };

  // Manual Check-Out (تسجيل نهاية دوام يدوي)
  const handleRecordManualCheckOut = () => {
    const emp = db.employees.find((x) => x.id === manualEmpId);
    if (!emp) {
      alert('يرجى اختيار الموظف أولاً');
      return;
    }
    if (!manualOut) {
      alert('يرجى تحديد وقت نهاية الدوام');
      return;
    }

    // Prefer an open record without checkOutTime on that date
    let existingIndex = db.attendance.findIndex(
      (r) => r.employeeId === emp.id && r.date === manualDate && !r.checkOutTime
    );
    if (existingIndex < 0) {
      existingIndex = db.attendance.findIndex(
        (r) => r.employeeId === emp.id && r.date === manualDate
      );
    }

    let updatedList: AttendanceRecord[];
    if (existingIndex >= 0) {
      const existing = db.attendance[existingIndex];
      const inTime = existing.checkInTime || manualIn || emp.shiftStart || '08:00';
      const hours = calculateHours(inTime, manualOut);
      const updatedRec: AttendanceRecord = {
        ...existing,
        checkInTime: inTime,
        checkOutTime: manualOut,
        totalHours: hours,
        notes: manualNotes.trim()
          ? `${existing.notes || ''} [نهاية يدوي: ${manualNotes.trim()}]`.trim()
          : (existing.notes || 'تسجيل انصراف يدوي'),
      };
      updatedList = [...db.attendance];
      updatedList[existingIndex] = updatedRec;
    } else {
      const inTime = manualIn || emp.shiftStart || '08:00';
      const hours = calculateHours(inTime, manualOut);
      const newRec: AttendanceRecord = {
        id: `att-${Date.now()}`,
        employeeId: emp.id,
        branchId: emp.branchId,
        date: manualDate,
        checkInTime: inTime,
        checkOutTime: manualOut,
        method: 'PIN',
        gpsVerified: true,
        distanceMeters: 5,
        deviceInfo: 'تسجيل نهاية دوام يدوي (إداري)',
        notes: manualNotes.trim() || 'تسجيل انصراف يدوي',
        totalHours: hours,
      };
      updatedList = [newRec, ...db.attendance];
    }

    onUpdateAttendance(updatedList);
    setShowManualModal(false);
    setManualNotes('');
    alert(`✓ تم تسجيل نهاية الدوام للموظف "${emp.name}" بنجاح في الساعة ${manualOut}`);
  };

  // Full Record (بدء ونهاية معاً)
  const handleRecordManualFull = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const emp = db.employees.find((x) => x.id === manualEmpId);
    if (!emp) return;

    const hours = calculateHours(manualIn, manualOut);
    const newRec: AttendanceRecord = {
      id: `att-${Date.now()}`,
      employeeId: emp.id,
      branchId: emp.branchId,
      date: manualDate,
      checkInTime: manualIn,
      checkOutTime: manualOut || null,
      method: 'PIN',
      gpsVerified: true,
      distanceMeters: 5,
      deviceInfo: 'تسجيل قيد دوام كامل يدوي (إداري)',
      notes: manualNotes.trim() || 'قيد إداري يدوي',
      totalHours: manualOut ? hours : 0,
    };

    onUpdateAttendance([newRec, ...db.attendance]);
    setShowManualModal(false);
    setManualNotes('');
    alert(`✓ تم تسجيل سجل الدوام الكامل للموظف "${emp.name}" بنجاح (${manualIn} - ${manualOut})`);
  };

  const handleDeleteRecord = (id: string) => {
    onUpdateAttendance(db.attendance.filter((r) => r.id !== id));
  };

  const filteredRecords = useMemo(() => {
    return db.attendance.filter((r) => {
      const matchDate = !filterDate || r.date === filterDate;
      const matchBranch = filterBranch === 'all' || r.branchId === filterBranch;
      return matchDate && matchBranch;
    });
  }, [db.attendance, filterDate, filterBranch]);

  const filteredTotalHours = useMemo(() => {
    return (
      Math.round(
        filteredRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0) * 100
      ) / 100
    );
  }, [filteredRecords]);

  const filteredCompletedCount = useMemo(() => {
    return filteredRecords.filter((r) => Boolean(r.checkInTime && r.checkOutTime)).length;
  }, [filteredRecords]);

  const filteredWorkingCount = useMemo(() => {
    return filteredRecords.filter((r) => Boolean(r.checkInTime && !r.checkOutTime)).length;
  }, [filteredRecords]);

  const handlePrintFilteredLog = () => {
    window.print();
  };

  const statsToday = useMemo(() => {
    const todays = db.attendance.filter((r) => r.date === todayStr);
    const currentlyWorking = todays.filter((r) => !r.checkOutTime).length;
    const completedShift = todays.filter((r) => Boolean(r.checkOutTime)).length;
    return {
      totalCheckedIn: todays.length,
      currentlyWorking,
      completedShift,
      absentOrNotYet: Math.max(0, db.employees.length - todays.length),
    };
  }, [db.attendance, db.employees.length, todayStr]);

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 no-print">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            ١. تسجيل بدء ونهاية الدوام عبر الهاتف
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            بوابة ذكية لتسجيل حضور وانصراف الموظفين حصرياً عبر كود QR الخاص بالفرع مع التحقق الصارم من مكان العمل
          </p>
        </div>

        {/* Interactive Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setActiveSubView('mobile_terminal')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeSubView === 'mobile_terminal'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>بوابة هاتف الموظف</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('admin_log')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeSubView === 'admin_log'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>سجل الدوام للإدارة ({db.attendance.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('leave_requests')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 relative ${
              activeSubView === 'leave_requests'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-amber-600" />
            <span>طلبات الإجازات والمغادرات</span>
            {pendingLeaveRequestsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                {pendingLeaveRequestsCount} جديد
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('methods_guide')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeSubView === 'methods_guide'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>مقترح طرق التفعيل بالفرع</span>
          </button>
        </div>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">إجمالي المسجلين اليوم</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1 font-mono tabular-nums">
            {statsToday.totalCheckedIn} / {db.employees.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            تاريخ اليوم · <span className="font-mono tabular-nums">{todayStr}</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">متواجدون على رأس العمل الآن</p>
          <p className="text-2xl font-semibold text-emerald-700 mt-1 font-mono tabular-nums">
            {statsToday.currentlyWorking}
          </p>
          <p className="text-xs text-slate-500 mt-1">سجلوا دخول ولم يسجلوا انصراف بعد</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">أتموا الدوام اليوم</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1 font-mono tabular-nums">
            {statsToday.completedShift}
          </p>
          <p className="text-xs text-slate-500 mt-1">سجلوا حضور وانصراف مكتمل</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">لم يسجلوا حضور اليوم</p>
          <p className="text-2xl font-semibold text-amber-700 mt-1 font-mono tabular-nums">
            {statsToday.absentOrNotYet}
          </p>
          <p className="text-xs text-slate-500 mt-1">بانتظار بدء الوردية أو إجازة</p>
        </div>
      </div>

      {/* SUBVIEW 1: MOBILE CHECK-IN TERMINAL */}
      {activeSubView === 'mobile_terminal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Phone Check-in Card (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  شاشة هاتف الموظف — تسجيل فوري
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  اختر طريقة التحقق وأدخل رمزك السري لتسجيل بدء أو نهاية الدوام
                </p>
              </div>
              <div className="text-left">
                <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums tracking-tight">
                  {liveTime}
                  <span className="text-sm text-slate-400">:{liveSeconds}</span>
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums">{todayStr}</div>
              </div>
            </div>

            {/* Step 1: Employee Selection (Dropdown & Search) */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>١. تحديد الموظف (البحث بالاسم أو الاختيار من القائمة):</span>
                  </span>
                  {matchedEmployee && (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                      الموظف: {matchedEmployee.name}
                    </span>
                  )}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Search input by name */}
                  <div className="relative">
                    <input
                      type="text"
                      value={employeeSearchTerm}
                      onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                      placeholder="ابحث باسم الموظف أو المسمى..."
                      className="w-full pl-8 pr-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                    />
                    {employeeSearchTerm ? (
                      <button
                        type="button"
                        onClick={() => setEmployeeSearchTerm('')}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    )}
                  </div>

                  {/* Dropdown select */}
                  <div>
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => {
                        const empId = e.target.value;
                        setSelectedEmployeeId(empId);
                        const emp = db.employees.find((x) => x.id === empId);
                        if (emp) {
                          const empBranch = db.branches.find((b) => b.id === emp.branchId);
                          if (
                            currentBranch &&
                            emp.branchId &&
                            emp.branchId !== 'all' &&
                            emp.branchId !== currentBranch.id
                          ) {
                            setFeedbackMessage({
                              type: 'error',
                              text: `⛔ غير مقبول: هذا ليس مكان عملك المحدد! الموظف "${emp.name}" معين في (${empBranch?.name || 'فرع آخر'})، بينما كود الفرع الممسوح يتبع (${currentBranch.name}). لا يقبل النظام تسجيل الدوام إلا من مقر عملك المحدد.`,
                            });
                          } else {
                            setFeedbackMessage(null);
                          }
                        }
                      }}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                    >
                      <option value="">-- اضغط لاختيار الموظف --</option>
                      {filteredEmployeesForSelect.map((emp) => {
                        const empBranch = db.branches.find((b) => b.id === emp.branchId);
                        return (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({empBranch?.name || 'كل الفروع'}) - {emp.jobTitle}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  <span>مكان العمل (الفرع المعتمد لبدء أو نهاية الدوام):</span>
                </label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => {
                    const bId = e.target.value;
                    setSelectedBranchId(bId);
                    if (
                      matchedEmployee &&
                      matchedEmployee.branchId &&
                      matchedEmployee.branchId !== 'all' &&
                      matchedEmployee.branchId !== bId
                    ) {
                      const empBranch = db.branches.find((b) => b.id === matchedEmployee.branchId);
                      setFeedbackMessage({
                        type: 'error',
                        text: `⛔ تنبيه: الموظف "${matchedEmployee.name}" مخصص لفرع (${empBranch?.name || 'فرع آخر'}). يرفض النظام تسجيل الدوام من غير مقر عملك المحدد.`,
                      });
                    } else {
                      setFeedbackMessage(null);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                >
                  {db.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.city})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Hidden temp element and input for photo QR scanning */}
            <div id="qr-reader-temp-attendance" className="hidden" />
            <input
              type="file"
              ref={photoInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleDirectPhotoUpload}
              className="hidden"
            />

            {/* Step 2: Branch QR Code Verification */}
            {currentBranch && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">
                      ٢. إثبات التواجد بكود QR فرع ({currentBranch.name}):
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCameraActive(!isCameraActive)}
                      className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{isCameraActive ? 'إغلاق الكاميرا' : 'فتح كاميرا الـ QR'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={isAnalyzingPhoto}
                      className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isAnalyzingPhoto ? 'جاري الفحص...' : 'التقاط صورة للـ QR'}</span>
                    </button>
                  </div>
                </div>

                {/* Anti-Screen Spoof Notice */}
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-950/5 border border-emerald-500/30 text-[11px] text-emerald-950">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="leading-relaxed">
                    <span className="font-bold text-emerald-800">حماية أمنية مشددة (Anti-Screen Spoof): </span>
                    التسجيل مسموح حصرياً بالتقاط صورة مباشرة للرمز الورقي المطبوع للفرع. يُمنع تصوير شاشة هاتف آخر أو شاشات الكمبيوتر أو الصور المحفوظة.
                  </div>
                </div>

                {isCameraActive && (
                  <QRCameraScanner
                    branches={db.branches}
                    onScanSuccess={(decodedText, branch) => {
                      const clean = decodedText.trim();
                      setQrInput(clean);
                      setIsCameraActive(false);
                      if (branch) {
                        setSelectedBranchId(branch.id);
                        setIsCameraVerified(true);
                        setVerifiedCameraBranch(branch);
                        const nowTime = getCurrentTimeStr();
                        setCameraVerifiedAt(nowTime);
                        setFeedbackMessage({
                          type: 'success',
                          text: `✅ تم التحقق من رمز QR الفرع عبر الكاميرا بنجاح: (${branch.name}) الساعة ${nowTime}. يرجى الضغط على زر الحضور أو الانصراف لإتمام التسجيل.`,
                        });
                      } else {
                        setIsCameraVerified(false);
                        setVerifiedCameraBranch(null);
                        setFeedbackMessage({
                          type: 'error',
                          text: `رمز QR المقروء (${clean}) لا ينتمي لأي فرع معتمد.`,
                        });
                      }
                    }}
                    onClose={() => setIsCameraActive(false)}
                  />
                )}

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-500">رمز الفرع النشط:</span>
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded">
                    {currentBranch.qrToken}
                  </span>
                </div>
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder={`أدخل كود الفرع مثل ${currentBranch.qrToken}`}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>
            )}

            {/* Matched Employee Preview */}
            {matchedEmployee ? (
              <div className="space-y-2">
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-emerald-700" />
                      <span className="font-semibold text-sm text-slate-900">
                        {matchedEmployee.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {matchedEmployee.jobTitle} · الفرع المعتمد:{' '}
                      <strong className="text-emerald-800">
                        {db.branches.find((b) => b.id === matchedEmployee.branchId)?.name || 'غير محدد'}
                      </strong>
                      {' '}· الرقم الوظيفي <span className="font-mono tabular-nums">{matchedEmployee.code}</span>
                    </p>
                  </div>

                  <div className="text-xs font-medium">
                    {!todayRecord && (
                      <span className="text-amber-700 font-bold">لم يسجل بدء الدوام اليوم بعد</span>
                    )}
                    {todayRecord && !todayRecord.checkOutTime && (
                      <span className="text-emerald-700 font-bold">
                        حاضر منذ الساعة{' '}
                        <span className="font-mono tabular-nums">{todayRecord.checkInTime}</span>
                      </span>
                    )}
                    {todayRecord && todayRecord.checkOutTime && (
                      <span className="text-slate-700 font-bold">
                        أتم الدوام ({todayRecord.checkInTime} - {todayRecord.checkOutTime})
                      </span>
                    )}
                  </div>
                </div>

                {/* Workplace Mismatch Banner if selected branch != employee branch */}
                {currentBranch &&
                  matchedEmployee.branchId &&
                  matchedEmployee.branchId !== 'all' &&
                  matchedEmployee.branchId !== currentBranch.id && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-950 text-xs flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-red-700 mb-0.5">
                          ⛔ تنبيه تعارض مكان العمل:
                        </div>
                        <div className="leading-relaxed">
                          الموظف <strong>"{matchedEmployee.name}"</strong> مخصص للعمل في فرع{' '}
                          <strong>
                            ({db.branches.find((b) => b.id === matchedEmployee.branchId)?.name || matchedEmployee.branchId})
                          </strong>
                          ، بينما الفرع المختار هو{' '}
                          <strong>({currentBranch.name})</strong>. لن يُقبل تسجيل الدوام من غير فرعك المخصص.
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 text-center">
                اختر اسم الموظف من القائمة أعلاه أو من القائمة الجانبية للتسجيل الفوري.
              </div>
            )}

            {/* Optional Note */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ملاحظة إضافية (اختياري)
              </label>
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="مثال: حضور مباشر للميدان / مهمة خارجية..."
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            {/* Feedback Banner */}
            {feedbackMessage && (
              <div
                className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
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
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <span>{feedbackMessage.text}</span>
              </div>
            )}

            {/* Visual Camera Verification Status Card */}
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                isCameraVerified && verifiedCameraBranch
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-2xs'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
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
                      <span className="text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-md font-black">
                        تم التحقق بنجاح من {verifiedCameraBranch.name} ({cameraVerifiedAt})
                      </span>
                    ) : (
                      <span className="text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md font-bold">
                        بانتظار مسح رمز QR بالكاميرا لتفعيل التسجيل
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {isCameraVerified && verifiedCameraBranch
                      ? 'تم التحقق من كود QR الفرع عبر الكاميرا بنجاح. سيتم فحص تواجدك الجغرافي داخل دائرة 15 متراً عند الضغط على تأكيد الدوام.'
                      : 'لن يتم تسجيل أي دوام دون التحقق من كود QR عبر الكاميرا وتواجدك الجغرافي الفعلي داخل محيط الفرع (دائرة 15 متراً).'}
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
                  title="إلغاء التحقق"
                >
                  إعادة المسح
                </button>
              )}
            </div>

            {/* Check-In and Check-Out Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => handleMobileAction('check_in')}
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
                    ? `مسجل حضور (${todayRecord.checkInTime})`
                    : isCameraVerified
                    ? 'تأكيد بداية الدوام (حضور)'
                    : 'تسجيل حضور (يلزم مسح QR الكاميرا)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleMobileAction('check_out')}
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
                    ? `أتم الانصراف (${todayRecord.checkOutTime})`
                    : !todayRecord
                    ? 'تسجيل نهاية الدوام (انصراف)'
                    : isCameraVerified
                    ? 'تأكيد نهاية الدوام (انصراف)'
                    : 'تسجيل انصراف (يلزم مسح QR الكاميرا)'}
                </span>
              </button>
            </div>
          </div>

          {/* Employee Live Status & Attendance Details (5 cols) - Quick buttons removed as requested */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>بيانات الموظف وحالة دوام اليوم</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                متابعة مباشرة لحالة حضور وانصراف الموظف المختار بالوقت الفعلي
              </p>
            </div>

            {matchedEmployee ? (
              <div className="space-y-3.5">
                {/* Employee Profile Header */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="font-bold text-sm text-slate-900">{matchedEmployee.name}</div>
                    <div className="text-xs text-slate-500">
                      {matchedEmployee.jobTitle} · {matchedEmployee.department}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-medium">
                      مكان العمل: {db.branches.find((b) => b.id === matchedEmployee.branchId)?.name || 'كل الفروع'}
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-800 bg-white border border-emerald-200 px-2.5 py-1 rounded-lg">
                    {matchedEmployee.code}
                  </span>
                </div>

                {/* Today's Attendance Status */}
                <div className="p-4 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="text-xs font-bold text-slate-700">سجل اليوم ({todayStr}):</div>
                  {(() => {
                    const empToday = db.attendance.find(
                      (r) => r.employeeId === matchedEmployee.id && r.date === todayStr
                    );
                    if (!empToday) {
                      return (
                        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>لم يسجل بداية الدوام لليوم بعد. امسح كود QR الفرع للبدء.</span>
                        </div>
                      );
                    }
                    if (!empToday.checkOutTime) {
                      return (
                        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs space-y-1">
                          <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>على رأس العمل حالياً</span>
                          </div>
                          <div>
                            وقت الحضور:{' '}
                            <strong className="font-mono tabular-nums">{empToday.checkInTime}</strong>{' '}
                            (بانتظار تسجيل الانصراف)
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 text-xs space-y-1">
                        <div className="font-bold text-slate-800">أتم الدوام لهذا اليوم بنجاح ✓</div>
                        <div className="flex items-center justify-between">
                          <span>
                            الفترة:{' '}
                            <strong className="font-mono tabular-nums">
                              {empToday.checkInTime} — {empToday.checkOutTime}
                            </strong>
                          </span>
                          <span className="font-mono font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                            {empToday.totalHours} ساعة
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Working hours & shift details */}
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">ساعات الوردية المقررة:</span>
                    <span className="font-mono font-bold text-slate-800 mt-0.5 block">
                      {matchedEmployee.shiftStart} — {matchedEmployee.shiftEnd}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">سقف المسحوبات:</span>
                    <span className="font-bold text-slate-800 mt-0.5 block">
                      {matchedEmployee.withdrawalLimitType === 'fixed'
                        ? `${matchedEmployee.withdrawalLimitAmount || 0} ${db.settings.currency}`
                        : 'بدون سقف (مفتوح)'}
                    </span>
                  </div>
                </div>

                {/* Device binding info */}
                <div className="text-[11px] text-slate-500 p-2.5 rounded-lg bg-slate-50 flex items-center justify-between">
                  <span>ربط الجهاز:</span>
                  <span className="font-semibold text-slate-700">
                    {matchedEmployee.boundDeviceId
                      ? `مقترن بـ (${matchedEmployee.boundDeviceName || 'هاتف مسجل'})`
                      : 'غير مقترن بهاتف حتى الآن'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                اختر موظفاً من القائمة أعلاه لعرض بطاقته وحالة دوامه
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBVIEW 2: ADMIN ATTENDANCE LOG TABLE */}
      {activeSubView === 'admin_log' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5 print:border-none print:p-0 print:shadow-none attendance-print-wrapper">
          {/* Print Styles for Centering and Sharp Table Rendering */}
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 10mm auto !important;
              }
              html, body {
                margin: 0 auto !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                width: 100% !important;
                direction: rtl !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              main {
                max-width: 195mm !important;
                margin-left: auto !important;
                margin-right: auto !important;
                padding: 0 !important;
                width: 100% !important;
              }
              .attendance-print-wrapper {
                max-width: 195mm !important;
                margin-left: auto !important;
                margin-right: auto !important;
                width: 100% !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
              }
              .no-print {
                display: none !important;
              }
              .attendance-print-table {
                width: 100% !important;
                border-collapse: collapse !important;
                border: 2px solid #000000 !important;
                margin: 10px auto !important;
                font-size: 9pt !important;
              }
              .attendance-print-table th {
                background-color: #f1f5f9 !important;
                color: #000000 !important;
                border: 1px solid #000000 !important;
                padding: 6px 4px !important;
                font-weight: 800 !important;
                text-align: center !important;
                font-size: 9.5pt !important;
              }
              .attendance-print-table td {
                border: 1px solid #1e293b !important;
                color: #000000 !important;
                padding: 5px 6px !important;
                font-size: 9pt !important;
              }
              .attendance-print-table tr:nth-child(even) td {
                background-color: #f8fafc !important;
              }
              .attendance-print-table tfoot td {
                border-top: 2px solid #000000 !important;
                background-color: #f1f5f9 !important;
                font-weight: bold !important;
                color: #000000 !important;
              }
            }
          `}</style>

          {/* Official Branded Header - PRINT ONLY (Centered on A4) */}
          <div className="hidden print:block text-center border-b-2 border-slate-900 pb-4 mb-5">
            <div className="flex items-center justify-between text-xs text-slate-800">
              <div className="text-right">
                <h1 className="text-xl font-black text-slate-900">
                  {db.settings?.companyName || 'مؤسسة صخر المصري للأجهزة الكهربائية والتكييف'}
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  الإدارة العامة والرقابة المركزية — عمّان، المملكة الأردنية الهاشمية
                </p>
              </div>
              <div className="text-left font-mono text-xs text-slate-700 space-y-0.5">
                <div>تاريخ الاستخراج: <strong>{new Date().toLocaleDateString('ar-JO')}</strong></div>
                <div>وقت الاستخراج: <strong>{getCurrentTimeStr()}</strong></div>
              </div>
            </div>

            <div className="mt-4 inline-block bg-slate-100 border border-slate-300 rounded-lg px-6 py-2 text-center">
              <h2 className="text-sm font-black text-slate-900">
                سجل دوام وحضور العاملين المعتمد — {filterDate ? `بتاريخ: ${filterDate}` : 'كافة التواريخ المسجلة'}
                {filterBranch !== 'all' && ` · فرع (${db.branches.find((b) => b.id === filterBranch)?.name || filterBranch})`}
                {filterBranch === 'all' && ' · (كافة الفروع)'}
              </h2>
            </div>
          </div>

          {/* Summary KPI Strip - PRINT ONLY */}
          <div className="hidden print:grid grid-cols-4 gap-3 mb-4 text-center text-xs">
            <div className="p-2 border border-slate-400 rounded bg-slate-50">
              <span className="text-[10px] text-slate-600 block">إجمالي حركات الدوام</span>
              <span className="font-bold text-slate-900 text-sm font-mono">{filteredRecords.length} حركة</span>
            </div>
            <div className="p-2 border border-slate-400 rounded bg-slate-50">
              <span className="text-[10px] text-slate-600 block">مجموع ساعات العمل الفعلية</span>
              <span className="font-bold text-slate-900 text-sm font-mono">{filteredTotalHours} ساعة</span>
            </div>
            <div className="p-2 border border-slate-400 rounded bg-slate-50">
              <span className="text-[10px] text-slate-600 block">الورديات المكتملة</span>
              <span className="font-bold text-emerald-800 text-sm font-mono">{filteredCompletedCount} وردية</span>
            </div>
            <div className="p-2 border border-slate-400 rounded bg-slate-50">
              <span className="text-[10px] text-slate-600 block">على رأس العمل حالياً</span>
              <span className="font-bold text-amber-800 text-sm font-mono">{filteredWorkingCount} موظف</span>
            </div>
          </div>

          {/* Management Alert Banner for Pending Leave / Departure Requests */}
          {pendingLeaveRequestsCount > 0 && (
            <div className="no-print bg-linear-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <AlertCircle className="w-6 h-6 animate-pulse text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-amber-950">
                      يوجد ({pendingLeaveRequestsCount}) طلب إجازة ومغادرة بانتظار موافقة الإدارة!
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                      بحاجة للبت
                    </span>
                  </div>
                  <p className="text-xs text-amber-800 mt-0.5">
                    قام الموظفون بتقديم طلبات إجازة أو مغادرة جديدة عبر البوابة وتحتاج للمراجعة والاعتماد أو الرفض.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubView('leave_requests')}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors shadow-xs cursor-pointer shrink-0"
              >
                <Calendar className="w-4 h-4" />
                <span>مراجعة واعتماد الطلبات الآن</span>
                <span className="px-1.5 py-0.5 rounded-md bg-amber-800 text-[11px] font-mono">
                  {pendingLeaveRequestsCount}
                </span>
              </button>
            </div>
          )}

          {/* Screen Toolbar: Filters and Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">التاريخ</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => setFilterDate('')}
                    className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md cursor-pointer"
                  >
                    كل التواريخ
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">الفرع</label>
                <select
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white cursor-pointer"
                >
                  <option value="all">جميع الفروع</option>
                  {db.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-start sm:self-end">
              <button
                type="button"
                onClick={handlePrintFilteredLog}
                className="px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-900 active:bg-black text-white rounded-lg transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="طباعة سجل الدوام المفلتر على ورق A4 بتنسيق رسمي موسط"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>طباعة السجل المفلتر</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatementEmployeeId(db.employees[0]?.id || '');
                  setStatementStartDate(getFirstDayOfMonthStr());
                  setStatementEndDate(getTodayStr());
                  setStatementBranchFilter('all');
                  setShowStatementModal(true);
                }}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 active:bg-emerald-800 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>كشف سجل دوام الموظف</span>
              </button>

              <button
                type="button"
                onClick={() => setShowManualModal(true)}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>تسجيل دوام يدوي (إداري)</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse attendance-print-table">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/70">
                  <th className="py-3 px-3 font-medium">الموظف</th>
                  <th className="py-3 px-3 font-medium">الفرع</th>
                  <th className="py-3 px-3 font-medium">التاريخ</th>
                  <th className="py-3 px-3 font-medium">بدء الدوام</th>
                  <th className="py-3 px-3 font-medium">نهاية الدوام</th>
                  <th className="py-3 px-3 font-medium">ساعات العمل</th>
                  <th className="py-3 px-3 font-medium">طريقة التحقق</th>
                  <th className="py-3 px-3 font-medium">ملاحظات</th>
                  <th className="py-3 px-3 font-medium no-print">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-xs text-slate-500">
                      لا توجد سجلات حضور مطابقة للتاريخ أو الفرع المحدد.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => {
                    const emp = db.employees.find((e) => e.id === rec.employeeId);
                    const branch = db.branches.find((b) => b.id === rec.branchId);
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-3 font-medium text-slate-900">
                          {emp?.name || 'موظف محذوف'}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600">{branch?.name}</td>
                        <td className="py-3 px-3 text-xs font-mono tabular-nums text-slate-700">
                          {rec.date}
                        </td>
                        <td className="py-3 px-3 text-xs font-mono tabular-nums text-emerald-700 font-semibold">
                          {rec.checkInTime}
                        </td>
                        <td className="py-3 px-3 text-xs font-mono tabular-nums text-slate-700">
                          {rec.checkOutTime || 'على رأس العمل'}
                        </td>
                        <td className="py-3 px-3 text-xs font-mono tabular-nums text-slate-900">
                          {rec.checkOutTime ? `${rec.totalHours} س` : '—'}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600">
                          {rec.method}
                          {rec.distanceMeters ? ` · ${rec.distanceMeters}م` : ''}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500 max-w-xs truncate">
                          {rec.notes || '—'}
                        </td>
                        <td className="py-3 px-3 text-xs no-print">
                          <div className="flex items-center gap-2">
                            {!rec.checkOutTime && (
                              <button
                                type="button"
                                onClick={() => handleQuickCheckoutFromTable(rec.id)}
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 transition-colors whitespace-nowrap"
                              >
                                تسجيل انصراف الآن
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(rec.id)}
                              className="text-red-600 hover:underline text-xs cursor-pointer"
                            >
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredRecords.length > 0 && (
                <tfoot className="bg-slate-100/90 border-t-2 border-slate-300 font-bold text-xs print:border-t-2 print:border-slate-900 print:bg-slate-100">
                  <tr>
                    <td colSpan={5} className="py-2.5 px-3 text-left print:border print:border-slate-700">
                      المجموع الإجمالي لساعات العمل:
                    </td>
                    <td className="py-2.5 px-3 font-mono font-black text-emerald-800 text-sm text-center print:text-black print:border print:border-slate-700">
                      {filteredTotalHours} ساعة
                    </td>
                    <td colSpan={2} className="py-2.5 px-3 text-slate-600 text-[11px] print:border print:border-slate-700">
                      ({filteredRecords.length} قيد دوام مسجل)
                    </td>
                    <td className="no-print"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Official Signatures Block - PRINT ONLY */}
          <div className="hidden print:grid grid-cols-3 gap-8 mt-10 pt-6 border-t-2 border-slate-400 text-center text-xs">
            <div>
              <span className="font-bold text-slate-900 block">مسؤول الموارد البشرية وشؤون الموظفين</span>
              <div className="mt-12 border-t border-slate-400 w-3/4 mx-auto"></div>
              <span className="text-[10px] text-slate-500 mt-1 block">التوقيع والتاريخ</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 block">مدير الرقابة والعمليات الميدانية</span>
              <div className="mt-12 border-t border-slate-400 w-3/4 mx-auto"></div>
              <span className="text-[10px] text-slate-500 mt-1 block">التوقيع والتاريخ</span>
            </div>
            <div>
              <span className="font-bold text-slate-900 block">اعتماد الإدارة العامة والختم</span>
              <div className="mt-12 border-t border-slate-400 w-3/4 mx-auto"></div>
              <span className="text-[10px] text-slate-500 mt-1 block">الختم الرسمي</span>
            </div>
          </div>
        </div>
      )}

      {/* SUBVIEW 3: QR ATTENDANCE ARCHITECTURE GUIDE */}
      {activeSubView === 'methods_guide' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              آلية ضبط الدوام والانصراف الحصري عبر كود QR
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              تم اعتماد تسجيل الحضور والمغادرة حصرياً عن طريق كود QR الخاص بكل فرع لمنع التسجيل العشوائي وضمان أعلى درجات النزاهة:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="border border-slate-200 rounded-xl p-5 space-y-2.5 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">
                  ١. كود QR الفرع (كاميرا حية أو صورة)
                </span>
                <QrCode className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                يتم وضع رمز QR خاص بكل فرع عند المدخل أو الكاشير. يقوم الموظف بمسح الكود بكاميرا الهاتف أو التقاط صورة واضحة له مباشرة لتسجيل بداية أو نهاية الدوام.
              </p>
              <p className="text-xs text-emerald-700 font-semibold">
                الميزة: سريعة جداً وتضمن تواجد الموظف الفعلي بالفرع دون الحاجة لكتابة أي رمز PIN.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl p-5 space-y-2.5 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">
                  ٢. التحقق الصارم من مكان العمل
                </span>
                <Building2 className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                إذا كان الموظف مخصصاً لفرع معين وقام بمسح كود فرع آخر، يرفض النظام التسجيل فوراً ويظهر رسالة تنبيه واضحة بأنه ليس مكان عمله المعتمد.
              </p>
              <p className="text-xs text-emerald-700 font-semibold">
                الميزة: تمنع تسجيل الموظفين في فروع غير مخصصة لهم.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl p-5 space-y-2.5 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">
                  ٣. قفل الجهاز الأحادي (Single Phone)
                </span>
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                يرتبط هاتف الموظف بحسابه الشخصي، ولا يمكن لأي موظف تسجيل الدوام لزميل آخر من نفس الهاتف لمنع التلاعب وتوكيل الزملاء.
              </p>
              <p className="text-xs text-emerald-700 font-semibold">
                الميزة: أمان تام بدون أجهزة بصمة مكلفة.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SUBVIEW 4: LEAVE & DEPARTURE REQUESTS MANAGEMENT */}
      {activeSubView === 'leave_requests' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  إدارة واعتماد طلبات الإجازات والمغادرات
                </h2>
              </div>
              <p className="text-xs text-slate-500 pr-10">
                مراجعة طلبات الإجازات والمغادرات الساعية المقدمة لحظياً من الموظفين عبر البوابة، واتخاذ قرار الموافقة أو الرفض وتوثيقه رسمياً
              </p>
            </div>

            {pendingLeaveRequestsCount > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping" />
                <span className="text-xs font-bold text-amber-900">
                  يوجد <strong className="text-rose-600 font-mono text-sm">{pendingLeaveRequestsCount}</strong> طلب بانتظار قرار الإدارة
                </span>
              </div>
            )}
          </div>

          {/* Feedback Toast */}
          {leaveFeedbackMsg && (
            <div
              className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in ${
                leaveFeedbackMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{leaveFeedbackMsg.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setLeaveFeedbackMsg(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 4 Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs text-slate-500 block">إجمالي كافة الطلبات</span>
              <span className="text-2xl font-black text-slate-900 mt-1 font-mono block">
                {allLeaveRequests.length}
              </span>
              <span className="text-[11px] text-slate-400 mt-1 block">إجازات ومغادرات مسجلة</span>
            </div>

            <div className="bg-white border-2 border-amber-300 rounded-xl p-4 bg-amber-50/20 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800">قيد المراجعة والانتظار</span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              </div>
              <span className="text-2xl font-black text-amber-700 mt-1 font-mono block">
                {pendingLeaveRequestsCount}
              </span>
              <span className="text-[11px] text-amber-700 mt-1 block">تحتاج لاتخاذ قرار الإدارة</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs text-slate-500 block">الطلبات المقبولة المعتمدة</span>
              <span className="text-2xl font-black text-emerald-700 mt-1 font-mono block">
                {approvedLeaveRequestsCount}
              </span>
              <span className="text-[11px] text-emerald-600 mt-1 block">تمت الموافقة الرسمية عليها</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <span className="text-xs text-slate-500 block">الطلبات المرفوضة</span>
              <span className="text-2xl font-black text-rose-700 mt-1 font-mono block">
                {rejectedLeaveRequestsCount}
              </span>
              <span className="text-[11px] text-rose-500 mt-1 block">تم الاعتذار عنها لحاجة العمل</span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  البحث في الطلبات:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={leaveReqSearch}
                    onChange={(e) => setLeaveReqSearch(e.target.value)}
                    placeholder="ابحث بالاسم، الكود، أو السبب..."
                    className="w-full pl-8 pr-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-amber-600 bg-white"
                  />
                  {leaveReqSearch ? (
                    <button
                      type="button"
                      onClick={() => setLeaveReqSearch('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  )}
                </div>
              </div>

              {/* Type Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  نوع الطلب:
                </label>
                <select
                  value={leaveReqTypeFilter}
                  onChange={(e) => setLeaveReqTypeFilter(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-amber-600 font-medium"
                >
                  <option value="all">كافة الأنواع (إجازات ومغادرات)</option>
                  <option value="departure">مغادرة ساعية فقط</option>
                  <option value="leave">إجازة عمل فقط</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  حالة الطلب:
                </label>
                <select
                  value={leaveReqStatusFilter}
                  onChange={(e) => setLeaveReqStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-amber-600 font-medium"
                >
                  <option value="all">كافة الحالات</option>
                  <option value="pending">قيد الانتظار ⏳ ({pendingLeaveRequestsCount})</option>
                  <option value="approved">مقبولة معتمدة ✅ ({approvedLeaveRequestsCount})</option>
                  <option value="rejected">مرفوضة ❌ ({rejectedLeaveRequestsCount})</option>
                </select>
              </div>

              {/* Branch Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  الفرع:
                </label>
                <select
                  value={leaveReqBranchFilter}
                  onChange={(e) => setLeaveReqBranchFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-amber-600 font-medium"
                >
                  <option value="all">كافة الفروع</option>
                  {db.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Requests Content List */}
          {filteredLeaveRequests.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                <Calendar className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-700">لا توجد طلبات مطابقة</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                لم يتم العثور على أي طلبات إجازة أو مغادرة تطابق معايير البحث والفلترة المحددة أعلاه.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLeaveRequests.map((req) => {
                const emp = db.employees.find((e) => e.id === req.employeeId);
                const branch = db.branches.find((b) => b.id === req.branchId);

                const getCategoryLabel = (cat?: LeaveCategory) => {
                  switch (cat) {
                    case 'annual':
                      return 'إجازة سنوية';
                    case 'sick':
                      return 'إجازة مرضية';
                    case 'emergency':
                      return 'ظرف طارئ';
                    case 'personal':
                      return 'شأن شخصي';
                    case 'official_work':
                      return 'مهمة عمل رسمية';
                    default:
                      return 'إجازة اعتيادية';
                  }
                };

                return (
                  <div
                    key={req.id}
                    className={`bg-white border rounded-2xl p-5 space-y-4 transition-all shadow-xs hover:shadow-md ${
                      req.status === 'pending'
                        ? 'border-amber-300 ring-2 ring-amber-100'
                        : req.status === 'approved'
                        ? 'border-emerald-200'
                        : 'border-slate-200'
                    }`}
                  >
                    {/* Header: Employee & Status */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white shrink-0 ${
                            req.type === 'departure' ? 'bg-sky-600' : 'bg-purple-600'
                          }`}
                        >
                          {req.type === 'departure' ? (
                            <Clock className="w-5 h-5" />
                          ) : (
                            <Calendar className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900">
                              {emp?.name || 'موظف غير محدد'}
                            </h3>
                            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                              {emp?.code || '—'}
                            </span>
                            <span className="text-xs text-slate-600 font-medium">
                              {emp?.jobTitle || ''}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>{branch?.name || 'كل الفروع'}</span>
                            <span>•</span>
                            <span>تاريخ التقديم:</span>
                            <span className="font-mono text-slate-600">
                              {new Date(req.createdAt).toLocaleDateString('ar-JO')} الساعة{' '}
                              {new Date(req.createdAt).toLocaleTimeString('ar-JO', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                            req.type === 'departure'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}
                        >
                          {req.type === 'departure' ? (
                            <>
                              <Clock className="w-3.5 h-3.5" />
                              <span>مغادرة ساعية</span>
                            </>
                          ) : (
                            <>
                              <Calendar className="w-3.5 h-3.5" />
                              <span>إجازة</span>
                            </>
                          )}
                        </span>

                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {getCategoryLabel(req.category)}
                        </span>

                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                            req.status === 'pending'
                              ? 'bg-amber-100 text-amber-800 animate-pulse'
                              : req.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {req.status === 'pending' ? (
                            <>
                              <Hourglass className="w-3 h-3" />
                              <span>قيد الانتظار</span>
                            </>
                          ) : req.status === 'approved' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>مقبول ومعتمد</span>
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3" />
                              <span>مرفوض</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Request Details Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-500 block text-[11px]">
                          {req.type === 'departure' ? 'تاريخ المغادرة:' : 'الفترة المطلوبة:'}
                        </span>
                        <div className="font-mono font-bold text-slate-900 mt-0.5">
                          {req.type === 'departure' ? (
                            req.startDate
                          ) : (
                            <span>
                              من {req.startDate} إلى {req.endDate || req.startDate}
                            </span>
                          )}
                        </div>
                      </div>

                      {req.type === 'departure' && (
                        <div>
                          <span className="text-slate-500 block text-[11px]">توقيت المغادرة:</span>
                          <div className="font-mono font-bold text-sky-800 mt-0.5">
                            {req.startTime} — {req.endTime}
                            {req.durationHours ? ` (${req.durationHours} ساعة)` : ''}
                          </div>
                        </div>
                      )}

                      <div className={req.type === 'departure' ? '' : 'sm:col-span-2'}>
                        <span className="text-slate-500 block text-[11px]">سبب الطلب:</span>
                        <div className="font-medium text-slate-800 mt-0.5">
                          {req.reason || 'لم يحدد سبب'}
                        </div>
                      </div>
                    </div>

                    {/* Admin Review Result (If already reviewed) */}
                    {req.status !== 'pending' && (
                      <div
                        className={`p-3.5 rounded-xl text-xs space-y-1.5 border ${
                          req.status === 'approved'
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                            : 'bg-rose-50/70 border-rose-200 text-rose-950'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="flex items-center gap-1.5">
                            {req.status === 'approved' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-rose-600" />
                            )}
                            <span>
                              {req.status === 'approved'
                                ? 'قرار الإدارة: تمت الموافقة والاعتماد'
                                : 'قرار الإدارة: تم الاعتذار ورفض الطلب'}
                            </span>
                          </span>
                          <span className="text-[11px] font-normal text-slate-500">
                            بواسطة: <strong>{req.reviewedBy || 'الإدارة'}</strong>
                            {req.reviewedAt &&
                              ` · ${new Date(req.reviewedAt).toLocaleDateString('ar-JO')} ${new Date(
                                req.reviewedAt
                              ).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' })}`}
                          </span>
                        </div>
                        {req.adminNote && (
                          <div className="text-[11px] pr-5 font-medium text-slate-700">
                            <strong>ملاحظات وتوجيهات الإدارة: </strong> {req.adminNote}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2">
                        {req.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenReviewModal(req, 'approve')}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                              <span>موافقة (اعتماد الطلب)</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenReviewModal(req, 'reject')}
                              className="px-4 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                              <span>رفض الطلب</span>
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenReviewModal(
                                  req,
                                  req.status === 'approved' ? 'reject' : 'approve'
                                )
                              }
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              {req.status === 'approved' ? 'تعديل القرار إلى رفض' : 'تعديل القرار إلى موافقة'}
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteLeaveRequest(req.id)}
                        className="text-xs text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                        title="حذف الطلب نهائياً"
                      >
                        حذف من السجل
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ADMIN DECISION MODAL (موافقة أو رفض طلب الإجازة/المغادرة) */}
      {reviewingRequest && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-auto p-6 sm:p-7 space-y-5 text-right">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md ${
                    reviewingRequest.action === 'approve'
                      ? 'bg-emerald-600 shadow-emerald-200'
                      : 'bg-rose-600 shadow-rose-200'
                  }`}
                >
                  {reviewingRequest.action === 'approve' ? (
                    <ThumbsUp className="w-5 h-5" />
                  ) : (
                    <ThumbsDown className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {reviewingRequest.action === 'approve'
                      ? 'تأكيد الموافقة على الطلب'
                      : 'تأكيد رفض الطلب والاعتذار'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {reviewingRequest.request.type === 'departure' ? 'مغادرة ساعية' : 'طلب إجازة'} · للموظف{' '}
                    <strong className="text-slate-800">
                      {db.employees.find((e) => e.id === reviewingRequest.request.employeeId)?.name}
                    </strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setReviewingRequest(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Request Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">الفترة / التاريخ:</span>
                <span className="font-bold font-mono text-slate-800">
                  {reviewingRequest.request.type === 'departure'
                    ? `${reviewingRequest.request.startDate} (${reviewingRequest.request.startTime} - ${reviewingRequest.request.endTime})`
                    : `من ${reviewingRequest.request.startDate} إلى ${reviewingRequest.request.endDate || reviewingRequest.request.startDate}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">السبب المقدم:</span>
                <span className="font-medium text-slate-800">
                  {reviewingRequest.request.reason || '—'}
                </span>
              </div>
            </div>

            {/* Admin Notes Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                ملاحظات أو توجيهات الإدارة للموظف (اختياري):
              </label>
              <textarea
                rows={3}
                value={adminDecisionNote}
                onChange={(e) => setAdminDecisionNote(e.target.value)}
                placeholder={
                  reviewingRequest.action === 'approve'
                    ? 'مثال: تمت الموافقة وتخصم من الرصيد السنوي، أو: موافق بالتنسيق مع مسؤول الفرع...'
                    : 'مثال: نعتذر لعدم إمكانية الموافقة لحاجة العمل الماسة ووجود ضغط بالفرع...'
                }
                className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-600 bg-white leading-relaxed resize-none"
              />
              <p className="text-[11px] text-slate-400">
                ستظهر هذه الملاحظة للموظف مباشرة عند قيامه بالاستعلام عن حالة طلبه من البوابة.
              </p>
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReviewingRequest(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleConfirmDecision}
                className={`px-5 py-2.5 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-md cursor-pointer ${
                  reviewingRequest.action === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-200'
                    : 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-rose-200'
                }`}
              >
                {reviewingRequest.action === 'approve' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>تأكيد اعتماد وموافقة الإدارة</span>
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    <span>تأكيد رفض الطلب</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Attendance Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  تسجيل الدوام اليدوي (إداري)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Employee Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  الموظف المستهدف:
                </label>
                <select
                  value={manualEmpId}
                  onChange={(e) => setManualEmpId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  {db.employees.map((e) => {
                    const br = db.branches.find((b) => b.id === e.branchId);
                    return (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.code}) — {e.jobTitle} [{br?.name || 'الفرع الرئيسي'}]
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Date Selection with Quick 'Today' button */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-800">
                    تاريخ الدوام:
                  </label>
                  <button
                    type="button"
                    onClick={() => setManualDate(getTodayStr())}
                    className="text-[11px] text-emerald-700 hover:underline cursor-pointer"
                  >
                    تحديد تاريخ اليوم
                  </button>
                </div>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-white"
                  required
                />
              </div>

              {/* Two Separate Timing & Action Sections */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Section 1: Check-In (بدء الدوام) */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                        <LogIn className="w-4 h-4 text-emerald-600" />
                        <span>١. تسجيل بدء الدوام (حضور)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          setManualIn(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
                        }}
                        className="text-[10px] text-emerald-700 hover:underline cursor-pointer font-medium"
                      >
                        الوقت الآن
                      </button>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">
                        وقت بدء الدوام:
                      </label>
                      <input
                        type="time"
                        value={manualIn}
                        onChange={(e) => setManualIn(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-emerald-300 bg-white rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRecordManualCheckIn}
                    className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>تسجيل بدء الدوام (حضور)</span>
                  </button>
                </div>

                {/* Section 2: Check-Out (نهاية الدوام) */}
                <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-950">
                        <LogOut className="w-4 h-4 text-blue-600" />
                        <span>٢. تسجيل نهاية الدوام (انصراف)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          setManualOut(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
                        }}
                        className="text-[10px] text-blue-700 hover:underline cursor-pointer font-medium"
                      >
                        الوقت الآن
                      </button>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">
                        وقت نهاية الدوام:
                      </label>
                      <input
                        type="time"
                        value={manualOut}
                        onChange={(e) => setManualOut(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-blue-300 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRecordManualCheckOut}
                    className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>تسجيل نهاية الدوام (انصراف)</span>
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  ملاحظات أو سبب القيد اليدوي (اختياري):
                </label>
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="مثال: تسجيل إداري مباشر، نسيان تسجيل الباركود..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Footer: Full Shift Save Option & Cancel */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleRecordManualFull()}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  title="تسجيل كل من وقت البدء ووقت النهاية معاً في سجل واحد وحساب الساعات تلقائياً"
                >
                  تسجيل الفترة كاملة (بدء + نهاية معاً)
                </button>

                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="w-full sm:w-auto px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* INTERACTIVE ATTENDANCE CONFIRMATION MODAL (Request 4)            */}
      {/* ================================================================ */}
      {confirmationModal && confirmationModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5 text-right relative overflow-hidden m-auto">
            {/* Top decorative accent */}
            <div
              className={`absolute top-0 left-0 right-0 h-2 ${
                confirmationModal.actionType === 'check_in'
                  ? 'bg-linear-to-r from-emerald-500 to-teal-400'
                  : 'bg-linear-to-r from-blue-600 to-indigo-500'
              }`}
            />

            {/* Close button */}
            <button
              type="button"
              onClick={() => setConfirmationModal(null)}
              className="absolute top-4 left-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon & Headline */}
            <div className="text-center pt-2 space-y-2">
              <div
                className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center shadow-lg animate-bounce ${
                  confirmationModal.actionType === 'check_in'
                    ? 'bg-emerald-600 text-white shadow-emerald-200'
                    : 'bg-indigo-600 text-white shadow-indigo-200'
                }`}
              >
                {confirmationModal.actionType === 'check_in' ? (
                  <CheckCircle2 className="w-9 h-9" />
                ) : (
                  <Clock className="w-9 h-9" />
                )}
              </div>

              <div>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                    confirmationModal.actionType === 'check_in'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-indigo-100 text-indigo-800'
                  }`}
                >
                  {confirmationModal.actionType === 'check_in'
                    ? '✓ تسجيل حضور وبدء دوام'
                    : '✓ تسجيل انصراف ونهاية دوام'}
                </span>
                <h3 className="text-xl font-black text-slate-900 mt-1.5">
                  {confirmationModal.actionType === 'check_in'
                    ? 'تم تسجيل بداية الدوام بنجاح!'
                    : 'تم تسجيل نهاية الدوام والانصراف!'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تم توثيق وتأكيد العملية في قاعدة البيانات المركزية لحظياً
                </p>
              </div>
            </div>

            {/* Card Information */}
            <div className="space-y-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">اسم الموظف:</span>
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                  {confirmationModal.employee.name}
                </span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">الرقم والمسمى الوظيفي:</span>
                <span className="font-medium text-slate-800">
                  {confirmationModal.employee.jobTitle} [{confirmationModal.employee.code}]
                </span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">مكان العمل (الفرع):</span>
                <span className="font-bold text-emerald-800 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                  {confirmationModal.branch.name}
                </span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">توقيت التسجيل:</span>
                <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {confirmationModal.time} · {confirmationModal.date}
                </span>
              </div>

              {confirmationModal.actionType === 'check_out' &&
                confirmationModal.totalHours !== undefined && (
                  <div className="flex items-center justify-between pb-2 border-b border-indigo-200 bg-indigo-50/60 p-2.5 rounded-xl">
                    <span className="text-indigo-900 font-bold">إجمالي ساعات الدوام اليوم:</span>
                    <span className="font-mono font-black text-indigo-700 text-sm">
                      {confirmationModal.totalHours} ساعة عمل
                    </span>
                  </div>
                )}

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                <span>وسيلة التحقق:</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  {confirmationModal.deviceInfo}
                </span>
              </div>

              {confirmationModal.note && (
                <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-700">ملاحظة مسجلة: </span>
                  <span>{confirmationModal.note}</span>
                </div>
              )}
            </div>

            {/* Interactive Confirmation Button */}
            <div>
              <button
                type="button"
                onClick={() => setConfirmationModal(null)}
                className={`w-full py-3.5 px-4 rounded-xl text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                  confirmationModal.actionType === 'check_in'
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
      )}

      {/* EMPLOYEE ATTENDANCE STATEMENT MODAL (كشف سجل دوام الموظف) */}
      {showStatementModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full border border-slate-200 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold">كشف سجل دوام وحضور الموظف</h3>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    استعلام وتدقيق حركات الدوام، واحتساب ساعات العمل الإجمالية مع إمكانية الطباعة الرسمية والتصدير لإكسل
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStatementModal(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Bar & Controls */}
            <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Employee Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    <span>الموظف:</span>
                  </label>
                  <select
                    value={statementEmployeeId}
                    onChange={(e) => setStatementEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-emerald-600 font-medium"
                  >
                    {db.employees.map((emp) => {
                      const bName = db.branches.find((b) => b.id === emp.branchId)?.name || 'كل الفروع';
                      return (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({bName}) - [{emp.code}]
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span>من تاريخ:</span>
                  </label>
                  <input
                    type="date"
                    value={statementStartDate}
                    onChange={(e) => setStatementStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span>إلى تاريخ:</span>
                  </label>
                  <input
                    type="date"
                    value={statementEndDate}
                    onChange={(e) => setStatementEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>

                {/* Branch Filter */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>الفرع:</span>
                  </label>
                  <select
                    value={statementBranchFilter}
                    onChange={(e) => setStatementBranchFilter(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="all">جميع الفروع المسجلة</option>
                    {db.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="text-slate-500 font-medium">فترات سريعة:</span>
                <button
                  type="button"
                  onClick={() => {
                    setStatementStartDate(getFirstDayOfMonthStr());
                    setStatementEndDate(getTodayStr());
                  }}
                  className="px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors font-medium cursor-pointer"
                >
                  هذا الشهر
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    setStatementStartDate(getFirstDayOfMonthStr(prevMonthDate));
                    setStatementEndDate(getLastDayOfMonthStr(prevMonthDate));
                  }}
                  className="px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors font-medium cursor-pointer"
                >
                  الشهر الماضي
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 30);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    setStatementStartDate(`${y}-${m}-${day}`);
                    setStatementEndDate(getTodayStr());
                  }}
                  className="px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors font-medium cursor-pointer"
                >
                  آخر 30 يوماً
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const day = d.getDay(); // 0 is Sunday
                    const diff = d.getDate() - day; // Start from Sunday
                    const startOfWeek = new Date(d.setDate(diff));
                    const y = startOfWeek.getFullYear();
                    const m = String(startOfWeek.getMonth() + 1).padStart(2, '0');
                    const dayStr = String(startOfWeek.getDate()).padStart(2, '0');
                    setStatementStartDate(`${y}-${m}-${dayStr}`);
                    setStatementEndDate(getTodayStr());
                  }}
                  className="px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors font-medium cursor-pointer"
                >
                  هذا الأسبوع
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatementStartDate('');
                    setStatementEndDate('');
                  }}
                  className="px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors font-medium cursor-pointer"
                >
                  كل التواريخ (سجل شامل)
                </button>
              </div>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* Employee Summary Card */}
              {statementEmployee && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                      {statementEmployee.name.slice(0, 1)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{statementEmployee.name}</div>
                      <div className="text-slate-600 mt-0.5">
                        {statementEmployee.jobTitle} · {statementEmployee.department} · الفرع:{' '}
                        <strong>
                          {db.branches.find((b) => b.id === statementEmployee.branchId)?.name || 'كل الفروع'}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-slate-700">
                    <span className="bg-white px-2.5 py-1 rounded border border-slate-200 font-mono font-bold">
                      كود: {statementEmployee.code}
                    </span>
                    <span className="bg-white px-2.5 py-1 rounded border border-slate-200">
                      الوردية: {statementEmployee.shiftStart} - {statementEmployee.shiftEnd}
                    </span>
                  </div>
                </div>
              )}

              {/* Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs">
                  <span className="text-[11px] text-slate-500 block">إجمالي أيام الحضور</span>
                  <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                    {statementStats.totalDays} <span className="text-xs font-normal text-slate-500">يوم</span>
                  </span>
                </div>

                <div className="bg-white border border-emerald-200 bg-emerald-50/30 rounded-xl p-3 text-center shadow-2xs">
                  <span className="text-[11px] text-emerald-800 block font-semibold">إجمالي الساعات الفعلية</span>
                  <span className="text-xl font-black font-mono text-emerald-700 mt-1 block">
                    {statementStats.totalHours} <span className="text-xs font-normal text-emerald-600">ساعة</span>
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs">
                  <span className="text-[11px] text-slate-500 block">الورديات المكتملة</span>
                  <span className="text-xl font-bold font-mono text-emerald-600 mt-1 block">
                    {statementStats.completedShifts}
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs">
                  <span className="text-[11px] text-slate-500 block">ورديات غير مكتملة</span>
                  <span className="text-xl font-bold font-mono text-red-600 mt-1 block">
                    {statementStats.incompleteShifts}
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs col-span-2 sm:col-span-1">
                  <span className="text-[11px] text-slate-500 block">متوسط الساعات اليومي</span>
                  <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                    {statementStats.avgDailyHours} <span className="text-xs font-normal text-slate-500">س/يوم</span>
                  </span>
                </div>
              </div>

              {/* Records Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-[42vh]">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold text-center w-10">#</th>
                        <th className="py-2.5 px-3 font-semibold">اليوم</th>
                        <th className="py-2.5 px-3 font-semibold text-center">التاريخ</th>
                        <th className="py-2.5 px-3 font-semibold">مكان العمل (الفرع)</th>
                        <th className="py-2.5 px-3 font-semibold text-center">وقت الحضور</th>
                        <th className="py-2.5 px-3 font-semibold text-center">وقت الانصراف</th>
                        <th className="py-2.5 px-3 font-semibold text-center">ساعات العمل</th>
                        <th className="py-2.5 px-3 font-semibold">وسيلة التحقق</th>
                        <th className="py-2.5 px-3 font-semibold">الحالة</th>
                        <th className="py-2.5 px-3 font-semibold">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {statementRecords.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-slate-400">
                            لا توجد أي حركات دوام مسجلة لهذا الموظف خلال الفترة المحددة.
                          </td>
                        </tr>
                      ) : (
                        statementRecords.map((r, idx) => {
                          const dayName = getArabicDayName(r.date);
                          const branchName = db.branches.find((b) => b.id === r.branchId)?.name || r.branchId;
                          const isComplete = Boolean(r.checkInTime && r.checkOutTime);
                          return (
                            <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-medium text-slate-700">{dayName}</td>
                              <td className="py-2.5 px-3 text-center font-mono text-slate-800">{r.date}</td>
                              <td className="py-2.5 px-3 text-slate-700">{branchName}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700">
                                {r.checkInTime || '-'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                                {r.checkOutTime || '—'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-800 bg-emerald-50/40">
                                {r.totalHours || 0} س
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                                {r.deviceInfo || r.method || 'مسح QR بالكاميرا'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    isComplete
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {isComplete ? 'مكتمل' : 'قيد العمل'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 text-[11px] max-w-xs truncate">
                                {r.notes || '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {statementRecords.length > 0 && (
                      <tfoot className="sticky bottom-0 bg-emerald-50 border-t-2 border-emerald-300 font-bold text-slate-900">
                        <tr>
                          <td colSpan={6} className="py-2.5 px-3 text-left">
                            المجموع الإجمالي لساعات العمل المحتسبة:
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-black text-emerald-800 text-sm">
                            {statementStats.totalHours} ساعة
                          </td>
                          <td colSpan={3} className="py-2.5 px-3 text-slate-500 font-normal text-[11px]">
                            ({statementStats.totalDays} يوم دوام مسجل)
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer with Print and Excel Export */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500">
                الفترة المحددة:{' '}
                <strong className="text-slate-800">
                  {statementStartDate && statementEndDate
                    ? `من ${statementStartDate} إلى ${statementEndDate}`
                    : 'سجل شامل'}
                </strong>{' '}
                · إجمالي السجلات: <strong className="text-emerald-700">{statementRecords.length}</strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintStatement}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 active:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-emerald-300" />
                  <span>طباعة السجل (تقرير رسمي)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportStatementExcel}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير إكسل (Excel)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowStatementModal(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
