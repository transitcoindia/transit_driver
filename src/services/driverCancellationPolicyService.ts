/**
 * Driver cancellation policy service.
 * Implements rules: 45s free window, distance-based charges, no-show, valid reasons, strikes.
 */

const FREE_CANCEL_WINDOW_SECONDS = 45;
const LOW_MOVEMENT_METERS = 300;
const MODERATE_MOVEMENT_METERS = 1500;
const ARRIVED_RADIUS_METERS = 100;
const WAIT_RADIUS_METERS = 120;

// Partial fee (300m–1.5km movement)
const PARTIAL_FEE: Record<string, number> = {
  bike: 15,
  auto: 20,
  mini: 30,
  sedan: 30,
  hatchback: 30,
  cab: 30,
  xl: 40,
  suv: 40,
};

// Full fee (1.5km+ movement)
const FULL_FEE: Record<string, number> = {
  bike: 25,
  auto: 30,
  mini: 50,
  sedan: 50,
  hatchback: 50,
  cab: 50,
  xl: 70,
  suv: 70,
};

// No-show fee (driver waited required time at pickup)
const NOSHOW_FEE: Record<string, number> = {
  bike: 25,
  auto: 30,
  mini: 50,
  sedan: 50,
  hatchback: 50,
  cab: 50,
  xl: 80,
  suv: 80,
};

// Wait minutes before driver can cancel as no-show
const NOSHOW_WAIT_MINUTES: Record<string, number> = {
  bike: 3,
  auto: 4,
  mini: 5,
  sedan: 5,
  cab: 5,
  hatchback: 5,
  xl: 5,
  suv: 5,
};

export const VALID_CANCELLATION_REASONS = [
  "vehicle_breakdown",
  "accident",
  "medical_emergency",
  "unsafe_pickup",
  "road_blockage",
] as const;

export type ValidCancellationReason = (typeof VALID_CANCELLATION_REASONS)[number];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distance from A to B in meters (along line) */
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}

/** How much closer driver got to pickup (positive = moved toward) */
function distanceTowardPickup(
  acceptLat: number,
  acceptLng: number,
  currentLat: number,
  currentLng: number,
  pickupLat: number,
  pickupLng: number
): number {
  const distAcceptToPickup = distanceMeters(acceptLat, acceptLng, pickupLat, pickupLng);
  const distCurrentToPickup = distanceMeters(currentLat, currentLng, pickupLat, pickupLng);
  return Math.max(0, distAcceptToPickup - distCurrentToPickup);
}

function normalizeVehicleType(vt: string | null | undefined): string {
  if (!vt) return "sedan";
  const s = vt.toLowerCase().trim();
  if (["bike", "bikes", "two_wheeler", "2w"].some((x) => s.includes(x))) return "bike";
  if (["auto", "autorickshaw", "3w"].some((x) => s.includes(x))) return "auto";
  if (["xl", "suv", "xuv"].some((x) => s.includes(x))) return "xl";
  if (["mini", "hatchback", "hatch"].some((x) => s.includes(x))) return "mini";
  return "sedan";
}

function getFee(map: Record<string, number>, vehicleType: string): number {
  const v = normalizeVehicleType(vehicleType);
  return map[v] ?? map.sedan ?? 50;
}

export interface CancellationInput {
  rideId: string;
  driverId: string;
  driverLat: number;
  driverLng: number;
  cancellationReason?: string;
  cancellationReasonType?: ValidCancellationReason | string | null;
  riderCallAttempted?: boolean;
  driverAcceptedAt: Date | null;
  driverLatAtAccept: number | null;
  driverLngAtAccept: number | null;
  pickupLatitude: number;
  pickupLongitude: number;
  driverArrivedAtPickupAt: Date | null;
  riderCallAttemptedAt: Date | null;
  requestedVehicleType: string | null;
  vehicleType: string | null;
}

export interface CancellationOutcome {
  riderChargedAmount: number;
  driverCompensationAmount: number;
  driverStrikeType: "full" | "light" | null;
  driverCancellationReasonType: string | null;
  category:
    | "free_window"
    | "low_movement_fault"
    | "moderate_effort"
    | "high_effort"
    | "rider_noshow"
    | "valid_reason";
  message: string;
}

export function computeDriverCancellationOutcome(input: CancellationInput): CancellationOutcome {
  const {
    driverLat,
    driverLng,
    cancellationReasonType,
    riderCallAttempted,
    driverAcceptedAt,
    driverLatAtAccept,
    driverLngAtAccept,
    pickupLatitude,
    pickupLongitude,
    driverArrivedAtPickupAt,
    riderCallAttemptedAt,
    requestedVehicleType,
    vehicleType,
  } = input;

  const vt = vehicleType || requestedVehicleType || "sedan";

  // Valid operational/safety reason – penalty waived
  if (cancellationReasonType && VALID_CANCELLATION_REASONS.includes(cancellationReasonType as ValidCancellationReason)) {
    return {
      riderChargedAmount: 0,
      driverCompensationAmount: 0,
      driverStrikeType: null,
      driverCancellationReasonType: cancellationReasonType,
      category: "valid_reason",
      message: "Cancelled with valid reason – no charge, no strike.",
    };
  }

  const now = new Date();
  const secondsSinceAccept = driverAcceptedAt
    ? (now.getTime() - driverAcceptedAt.getTime()) / 1000
    : 0;

  // Free cancellation within 45 seconds
  if (secondsSinceAccept <= FREE_CANCEL_WINDOW_SECONDS) {
    return {
      riderChargedAmount: 0,
      driverCompensationAmount: 0,
      driverStrikeType: null,
      driverCancellationReasonType: null,
      category: "free_window",
      message: "Free cancellation within 45 seconds.",
    };
  }

  const acceptLat = driverLatAtAccept ?? driverLat;
  const acceptLng = driverLngAtAccept ?? driverLng;
  const distTowardPickup = distanceTowardPickup(
    acceptLat,
    acceptLng,
    driverLat,
    driverLng,
    pickupLatitude,
    pickupLongitude
  );
  const distToPickup = distanceMeters(driverLat, driverLng, pickupLatitude, pickupLongitude);

  // Rider no-show: driver arrived (within 100m), waited required time, stayed within 120m, made call
  if (driverArrivedAtPickupAt && distToPickup <= WAIT_RADIUS_METERS) {
    const waitMinutesRequired = NOSHOW_WAIT_MINUTES[normalizeVehicleType(vt)] ?? 5;
    const waitMinutes = (now.getTime() - driverArrivedAtPickupAt.getTime()) / (60 * 1000);
    const hasCallAttempt = riderCallAttempted === true || !!riderCallAttemptedAt;

    if (waitMinutes >= waitMinutesRequired && hasCallAttempt) {
      const fee = getFee(NOSHOW_FEE, vt);
      return {
        riderChargedAmount: fee,
        driverCompensationAmount: fee,
        driverStrikeType: null,
        driverCancellationReasonType: null,
        category: "rider_noshow",
        message: `Rider no-show after ${waitMinutesRequired} min wait – rider charged ₹${fee}, driver compensated, no strike.`,
      };
    }
  }

  // After free window: distance-based rules
  if (distTowardPickup < LOW_MOVEMENT_METERS) {
    return {
      riderChargedAmount: 0,
      driverCompensationAmount: 0,
      driverStrikeType: "full",
      driverCancellationReasonType: null,
      category: "low_movement_fault",
      message: "Driver cancelled with less than 300m movement – full strike, no charge.",
    };
  }

  if (distTowardPickup < MODERATE_MOVEMENT_METERS) {
    const fee = getFee(PARTIAL_FEE, vt);
    return {
      riderChargedAmount: fee,
      driverCompensationAmount: fee,
      driverStrikeType: "light",
      driverCancellationReasonType: null,
      category: "moderate_effort",
      message: `Moderate effort (300m–1.5km) – rider charged ₹${fee}, driver compensated, light strike.`,
    };
  }

  // 1.5km+ movement
  const fee = getFee(FULL_FEE, vt);
  return {
    riderChargedAmount: fee,
    driverCompensationAmount: fee,
    driverStrikeType: "light",
    driverCancellationReasonType: null,
    category: "high_effort",
    message: `High effort (1.5km+) – rider charged ₹${fee}, driver compensated, light strike.`,
  };
}
