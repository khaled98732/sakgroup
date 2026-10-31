import { Branch } from '../types';

/**
 * Calculates distance between two GPS coordinates using the Haversine formula (in meters)
 */
export function calculateDistanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371e3; // Earth radius in meters
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c * 10) / 10;
}

export interface UserCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Gets high-accuracy GPS coordinates from the employee's smartphone
 */
export function getCurrentUserCoordinates(): Promise<UserCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('جهازك أو متصفحك الحالي لا يدعم ميزة تحديد الموقع الجغرافي (GPS).'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 10,
        });
      },
      (err) => {
        let msg = 'تعذر تحديد الموقع الجغرافي (GPS) للهاتف.';
        if (err.code === 1) {
          // PERMISSION_DENIED
          msg =
            '⛔ يلزم تفعيل إذن الموقع الجغرافي (GPS) في المتصفح! يمنع النظام تسجيل الدوام دون التحقق من تواجدك في الفرع.';
        } else if (err.code === 2) {
          // POSITION_UNAVAILABLE
          msg =
            '⛔ إشارة الموقع الجغرافي (GPS) غير متوفرة. يرجى التأكد من تشغيل الـ GPS في الهاتف والاقتراب من نافذة أو مكان مكشوف.';
        } else if (err.code === 3) {
          // TIMEOUT
          msg =
            '⛔ استغرق الاتصال بنظام الـ GPS وقتاً طويلاً. يرجى تفعيل الموقع في هاتفك وإعادة المحاولة.';
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

export interface GeofenceVerificationResult {
  isAllowed: boolean;
  distanceMeters: number;
  allowedRadiusMeters: number;
  userCoords?: UserCoordinates;
  reason?: string;
}

/**
 * Verifies that the employee is physically present within the branch perimeter (circle of 15 meters)
 */
export async function verifyEmployeeInBranchGeofence(
  branch: Branch,
  customRadius?: number
): Promise<GeofenceVerificationResult> {
  // Default radius is 15 meters as strictly requested
  const allowedRadius = customRadius ?? (branch.radiusMeters > 0 ? branch.radiusMeters : 15);

  // If branch coordinates are completely 0/undefined, treat as Amman center
  const branchLat = branch.latitude || 31.973;
  const branchLon = branch.longitude || 35.854;

  try {
    const userCoords = await getCurrentUserCoordinates();
    const distance = calculateDistanceInMeters(
      userCoords.latitude,
      userCoords.longitude,
      branchLat,
      branchLon
    );

    // If within allowed radius (accounting for reasonable device GPS accuracy buffer if right at the door)
    // We enforce the strict 15m radius
    if (distance <= allowedRadius) {
      return {
        isAllowed: true,
        distanceMeters: distance,
        allowedRadiusMeters: allowedRadius,
        userCoords,
      };
    }

    return {
      isAllowed: false,
      distanceMeters: distance,
      allowedRadiusMeters: allowedRadius,
      userCoords,
      reason: `⛔ تم رفض تسجيل الدوام أمنياً: أنت خارج محيط الفرع الجغرافي! المسافة المحسوبة بينك وبين (${branch.name}) هي ${Math.round(distance)} متراً، بينما النطاق الأقصى المسموح به هو دائرة ${allowedRadius} متراً. يلزم التواجد الفعلي داخل مقر الفرع لتسجيل الدوام.`,
    };
  } catch (err: any) {
    return {
      isAllowed: false,
      distanceMeters: -1,
      allowedRadiusMeters: allowedRadius,
      reason:
        err?.message ||
        '⛔ تعذر التحقق من موقعك الجغرافي عبر الـ GPS. يلزم السماح لخدمة الموقع للتأكد من تواجدك داخل نطاق الـ 15 متراً للفرع.',
    };
  }
}
