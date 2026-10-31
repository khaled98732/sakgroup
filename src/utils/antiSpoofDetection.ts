/**
 * Anti-Spoof Detection Utility for Attendance QR Scanning
 * Prevents employees from scanning QR codes displayed on another phone,
 * computer screens, forwarded images, or saved screenshots.
 * Enforces live, direct camera photography of official printed branch QR codes.
 */

export interface AntiSpoofResult {
  isAllowed: boolean;
  isScreenSpoof: boolean;
  reason?: string;
  details?: {
    isRecentCapture: boolean;
    hasScreenArtifacts: boolean;
    hasScreenGlare: boolean;
    blueSpikeRatio: number;
    suspectedDeviceScreen: boolean;
  };
}

/**
 * Validates a captured photo file from the camera
 * 1. Checks timestamp to ensure it's not a saved gallery picture or forwarded file
 * 2. Checks filename patterns (e.g. WhatsApp, Screenshots)
 * 3. Inspects canvas pixels for digital screen luminance, blue-spike backlight, glass glare, and phone bezels
 */
export async function analyzePhotoForScreenSpoof(file: File): Promise<AntiSpoofResult> {
  // Check 1: File age (Must be freshly captured via camera right now, within 90 seconds)
  const now = Date.now();
  const fileAgeMs = now - file.lastModified;
  const isRecentCapture = fileAgeMs < 90 * 1000 && fileAgeMs > -10000;

  // Check 2: Filename inspection for saved images / messaging apps
  const lowerName = file.name.toLowerCase();
  const isSuspiciousFilename =
    lowerName.includes('whatsapp') ||
    lowerName.includes('screenshot') ||
    lowerName.includes('screen') ||
    lowerName.includes('telegram') ||
    lowerName.includes('download') ||
    lowerName.includes('wa_') ||
    lowerName.includes('received');

  if (!isRecentCapture && fileAgeMs > 120 * 1000) {
    return {
      isAllowed: false,
      isScreenSpoof: true,
      reason:
        '⛔ تم رفض العملية أمنياً: تم استخدام صورة مخزنة مسبقاً! النظام يشترط التقاط صورة مباشرة ولحظية للرمز بكاميرا الهاتف في موقع الفرع.',
      details: {
        isRecentCapture: false,
        hasScreenArtifacts: true,
        hasScreenGlare: false,
        blueSpikeRatio: 0,
        suspectedDeviceScreen: true,
      },
    };
  }

  if (isSuspiciousFilename) {
    return {
      isAllowed: false,
      isScreenSpoof: true,
      reason:
        '⛔ تم رفض العملية أمنياً: تم اكتشاف محاولة استخدام صورة شاشة أو صورة منقولة عبر تطبيقات المراسلة! يجب تصوير كود QR الفعلي المطبوع في الفرع مباشرة.',
      details: {
        isRecentCapture: false,
        hasScreenArtifacts: true,
        hasScreenGlare: false,
        blueSpikeRatio: 0,
        suspectedDeviceScreen: true,
      },
    };
  }

  // Check 3: Digital Screen Pixel & Glare Analysis via Canvas
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const targetW = Math.min(320, bitmap.width);
    const targetH = Math.min(320, bitmap.height);
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      return { isAllowed: true, isScreenSpoof: false };
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;

    let totalWhitePixels = 0;
    let blueBacklightPixels = 0;
    let specularGlarePixels = 0;
    let highContrastBezelPixels = 0;
    const totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      // Digital screens have high-luminance white with cold blue backlight (B > R * 1.25)
      if (brightness > 190) {
        totalWhitePixels++;
        if (b > r * 1.28 && b > 200) {
          blueBacklightPixels++;
        }
      }

      // Glass screen glare (extreme blown out specular reflection)
      if (r > 252 && g > 252 && b > 252) {
        specularGlarePixels++;
      }

      // Check dark perimeter pixels common in phone screens / bezels
      const pixelIdx = i / 4;
      const x = pixelIdx % targetW;
      const y = Math.floor(pixelIdx / targetW);
      const isEdge = x < 15 || x > targetW - 15 || y < 15 || y > targetH - 15;
      if (isEdge && brightness < 30) {
        highContrastBezelPixels++;
      }
    }

    const blueSpikeRatio = totalWhitePixels > 50 ? blueBacklightPixels / totalWhitePixels : 0;
    const glareRatio = specularGlarePixels / totalPixels;
    const bezelRatio = highContrastBezelPixels / (totalPixels * 0.18);

    // Screen Detection Thresholds
    // A photo of another phone screen typically exhibits:
    // 1. High blue backlight ratio in whites (> 35%)
    // 2. High glass screen glare spots (> 1.2%)
    // 3. Or sharp phone bezel frame framing the QR
    const hasScreenGlare = glareRatio > 0.025;
    const hasDigitalBacklight = blueSpikeRatio > 0.42;
    const hasPhoneBezel = bezelRatio > 0.65 && blueSpikeRatio > 0.22;

    const isScreenSpoof = (hasDigitalBacklight && hasScreenGlare) || (hasPhoneBezel && hasDigitalBacklight);

    if (isScreenSpoof) {
      return {
        isAllowed: false,
        isScreenSpoof: true,
        reason:
          '⛔ تم رفض العملية أمنياً (Anti-Screen Spoofing): تم رصد تصوير كود QR من شاشة هاتف آخر أو شاشة كمبيوتر بدلاً من الرمز الفعلي! التسجيل مسموح حصرياً عبر توجيه الكاميرا مباشرة للورقة الأصلية المعتمدة في الفرع.',
        details: {
          isRecentCapture: true,
          hasScreenArtifacts: true,
          hasScreenGlare,
          blueSpikeRatio: Math.round(blueSpikeRatio * 100),
          suspectedDeviceScreen: true,
        },
      };
    }

    return {
      isAllowed: true,
      isScreenSpoof: false,
      details: {
        isRecentCapture: true,
        hasScreenArtifacts: false,
        hasScreenGlare: false,
        blueSpikeRatio: Math.round(blueSpikeRatio * 100),
        suspectedDeviceScreen: false,
      },
    };
  } catch {
    // If bitmap processing fails, allow camera photo if timestamp is recent
    return {
      isAllowed: isRecentCapture,
      isScreenSpoof: !isRecentCapture,
      reason: isRecentCapture
        ? undefined
        : '⛔ تم رفض العملية: الصورة غير ملتقطة لحظياً من كاميرا الهاتف.',
    };
  }
}
