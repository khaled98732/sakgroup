export interface Branch {
  id: string;
  name: string;
  city: string;
  address: string;
  managerName: string;
  qrToken: string;
  barcodeText?: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export type EmployeeStatus = 'active' | 'on_leave' | 'suspended';

export interface Employee {
  id: string;
  code: string;
  name: string;
  pin: string;
  branchId: string;
  jobTitle: string;
  department: string;
  phone: string;
  nationalId: string;
  hireDate: string;
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  manualGrossSalary?: number;
  shiftStart: string;
  shiftEnd: string;
  status: EmployeeStatus;
  boundDeviceId?: string | null;
  boundDeviceName?: string | null;
  boundDeviceAt?: string | null;
  withdrawalLimitType?: 'unlimited' | 'fixed'; // بدون سقف أو قيمة محددة
  withdrawalLimitAmount?: number; // قيمة سقف المسحوبات إن وجدت
}

export type CheckInMethod = 'PIN' | 'GPS' | 'QR' | 'BARCODE';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  branchId: string;
  date: string; // YYYY-MM-DD
  checkInTime: string; // HH:mm
  checkOutTime: string | null; // HH:mm or null
  method: CheckInMethod;
  gpsVerified: boolean;
  distanceMeters?: number;
  deviceInfo: string;
  deviceId?: string;
  notes?: string;
  totalHours: number;
}

export type WithdrawalType = 'daily_advance' | 'emergency_advance' | 'deduction' | 'purchases';

export interface CashWithdrawal {
  id: string;
  employeeId: string;
  branchId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  type: WithdrawalType;
  reason: string;
  approvedBy: string;
  createdAt: string;
}

export interface SubBranch {
  id: string;
  name: string;
  parentBranchId: string;
  code?: string;
  plateNumber?: string;
  driverName?: string;
  notes?: string;
  createdAt: string;
}

export type ExpenseCategory =
  | 'rent_utilities'
  | 'electricity_water'
  | 'maintenance'
  | 'hospitality'
  | 'supplies'
  | 'transport'
  | 'other';

export interface BranchExpense {
  id: string;
  branchId: string;
  subBranchId?: string;
  subBranchName?: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  description: string;
  invoiceNumber: string;
  paidBy: string;
  createdAt: string;
}

export interface SalaryPayment {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  baseSalary: number;
  allowances: number;
  totalWithdrawals: number;
  bonus: number;
  extraDeduction: number;
  netSalary: number;
  paidAt: string;
  approvedBy: string;
}

export type PermissionKey =
  | 'employees_view'
  | 'employees_add'
  | 'employees_edit'
  | 'employees_delete'
  | 'branches_manage'
  | 'withdrawals_view'
  | 'withdrawals_add'
  | 'withdrawals_edit'
  | 'withdrawals_delete'
  | 'payroll_view'
  | 'payroll_edit'
  | 'expenses_manage'
  | 'attendance_manage'
  | 'permissions_manage'
  | 'backup_manage';

export type UserRole =
  | 'admin'
  | 'branch_supervisor'
  | 'general_supervisor'
  | 'sales'
  | 'delivery'
  | 'manager'
  | 'accountant'
  | 'hr'
  | 'supervisor'
  | 'custom';

export interface AppUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: UserRole;
  branchId?: string; // 'all' or specific branch ID
  isAdmin: boolean;
  permissions: Record<PermissionKey, boolean>;
  createdAt: string;
}

export interface CompanySettings {
  companyName: string;
  currency: string;
  defaultCheckInMethod: CheckInMethod;
  enforceGpsRadius: boolean;
  maxWithdrawalPercent: number;
  adminUsername?: string;
  adminPassword?: string;
  masterPassword?: string;
  enforceSingleDevicePerEmployee?: boolean;
  updatedAt?: number;
}

export const MASTER_ADMIN_PASSWORD = 'Dontmrkhaled.0';

export type LeaveRequestType = 'leave' | 'departure'; // إجازة أو مغادرة
export type LeaveCategory = 'annual' | 'sick' | 'emergency' | 'personal' | 'official_work'; // سنوية، مرضية، طارئة، شخصية، عمل خارجي
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected'; // قيد الانتظار، مقبول، مرفوض

export interface LeaveRequest {
  id: string;
  employeeId: string;
  branchId: string;
  type: LeaveRequestType;
  category?: LeaveCategory;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD (للإجازات متعددة الأيام)
  startTime?: string; // HH:mm (للمغادرات)
  endTime?: string; // HH:mm (للمغادرات)
  durationHours?: number; // عدد ساعات المغادرة
  reason: string;
  status: LeaveRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminNote?: string;
}

export interface AppDatabase {
  branches: Branch[];
  subBranches?: SubBranch[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  withdrawals: CashWithdrawal[];
  expenses: BranchExpense[];
  salaryPayments: SalaryPayment[];
  leaveRequests?: LeaveRequest[];
  users: AppUser[];
  settings: CompanySettings;
}

