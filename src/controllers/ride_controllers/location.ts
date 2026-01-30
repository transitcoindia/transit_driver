import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";
import redis from "../../redis";

const DRIVER_AVAILABILITY_TTL_SECONDS = 60; // Heartbeat-based availability window
const DRIVER_LOCATION_REDIS_TTL_SECONDS = 120; // Last location key TTL (slightly longer than heartbeat interval)

const getDriverAvailabilityKey = (driverId: string) =>
  `driver:${driverId}:availability`;
const getDriverLocationKey = (driverId: string) => `driver:location:${driverId}`;

/** When true (testing/default), heartbeat also writes location to DB. When false (production), Redis only. */
const shouldPersistLocationToDb = (): boolean =>
  process.env.DRIVER_LOCATION_PERSIST_TO_DB !== "false";

/**
 * Update driver's current location (legacy/one-off).
 * In production (DRIVER_LOCATION_PERSIST_TO_DB=false) only Redis is updated.
 * For live location, use heartbeat (availability/heartbeat) with lat/lng.
 */
export const updateDriverLocation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return res.status(401).json({
        success: false,
        message: "Driver not authenticated",
      });
    }
    const driverId = req.driver.id as string;
    const { latitude, longitude } = req.body;

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid latitude or longitude values",
      });
    }

    const nowDate = new Date();

    // Always update Redis so last location is available (gateway, matching).
    try {
      await redis.set(
        getDriverLocationKey(driverId),
        JSON.stringify({ latitude, longitude, updatedAt: Date.now() }),
        "EX",
        DRIVER_LOCATION_REDIS_TTL_SECONDS
      );
    } catch (redisErr) {
      console.warn("updateDriverLocation Redis failed:", redisErr);
      return next(new AppError("Failed to update location (Redis)", 500));
    }

    // DB only when persist-to-DB is enabled (e.g. testing).
    if (!shouldPersistLocationToDb()) {
      return res.status(200).json({
        success: true,
        message: "Location updated in Redis (production: DB not persisted)",
        data: {
          driverId,
          latitude,
          longitude,
          updatedAt: nowDate,
          persistedToDb: false,
        },
      });
    }

    const driver = await prisma.driver.update({
      where: { id: driverId },
      data: {
        currentLat: latitude,
        currentLng: longitude,
        updatedAt: nowDate,
      },
      select: {
        id: true,
        currentLat: true,
        currentLng: true,
        updatedAt: true,
      },
    });

    await prisma.driverLocation.upsert({
      where: { driverId },
      create: {
        driverId,
        latitude,
        longitude,
        isOnline: true,
        isAvailable: true,
        isInTrip: false,
      },
      update: {
        latitude,
        longitude,
        timestamp: nowDate,
        lastUpdatedAt: nowDate,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Location updated successfully",
      data: {
        driverId: driver.id,
        latitude: driver.currentLat,
        longitude: driver.currentLng,
        updatedAt: driver.updatedAt,
        persistedToDb: true,
      },
    });
  } catch (error: any) {
    console.error("Error updating driver location:", error);
    return next(new AppError("Failed to update location", 500));
  }
};

/**
 * Toggle driver availability (online/offline)
 */
export const toggleDriverAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return res.status(401).json({
        success: false,
        message: "Driver not authenticated",
      });
    }
    const driverId = req.driver.id as string;

    const { isAvailable } = req.body;

    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "isAvailable must be a boolean",
      });
    }

    // Enforce active subscription when going ONLINE
    if (isAvailable) {
      const now = new Date();
      const activeSub = await prisma.driverSubscription.findFirst({
        where: {
          driverId,
          status: "ACTIVE",
          expire: { gt: now },
        },
        orderBy: { createdAt: "desc" },
      });

      const hasTimeLeft =
        activeSub &&
        (activeSub.remainingMinutes === null ||
          activeSub.remainingMinutes === undefined ||
          activeSub.remainingMinutes > 0);

      if (!activeSub || !hasTimeLeft) {
        return res.status(403).json({
          success: false,
          error: "Active subscription required to go online",
        });
      }
    }

    // Update DriverDetails.isAvailable
    const driverDetails = await prisma.driverDetails.upsert({
      where: { driverId },
      create: {
        driverId,
        isAvailable,
        licenseNumber: `TEMP-${driverId}`, // Will be updated during verification
      },
      update: {
        isAvailable,
      },
      select: {
        isAvailable: true,
      },
    });

    // Update DriverStatus
    await prisma.driverStatus.upsert({
      where: { driverId },
      create: {
        driverId,
        status: isAvailable ? "ONLINE" : "OFFLINE",
        lastPingAt: new Date(),
      },
      update: {
        status: isAvailable ? "ONLINE" : "OFFLINE",
        lastPingAt: new Date(),
      },
    });

    // Update DriverLocation
    await prisma.driverLocation.upsert({
      where: { driverId },
      create: {
        driverId,
        latitude: 0, // Will be updated when location is set
        longitude: 0,
        isOnline: isAvailable,
        isAvailable: isAvailable,
      },
      update: {
        isOnline: isAvailable,
        isAvailable: isAvailable,
      },
    });

    // Manage Redis-based real-time availability with TTL
    const availabilityKey = getDriverAvailabilityKey(driverId);
    const now = Date.now();

    try {
      if (isAvailable) {
        // Driver is going ONLINE: create/refresh availability key with TTL
        await redis.set(
          availabilityKey,
          JSON.stringify({
            driverId,
            status: "ONLINE",
            lastPing: now,
            updatedAt: now,
          }),
          "EX",
          DRIVER_AVAILABILITY_TTL_SECONDS
        );
      } else {
        // Driver is going OFFLINE: remove availability key
        await redis.del(availabilityKey);
      }
    } catch (redisError) {
      console.warn(
        "Driver availability Redis update failed:",
        redisError instanceof Error ? redisError.message : redisError
      );
      // Do not fail the request if Redis is down
    }

    return res.status(200).json({
      success: true,
      message: `Driver ${isAvailable ? "online" : "offline"}`,
      data: {
        isAvailable: driverDetails.isAvailable,
      },
    });
  } catch (error: any) {
    console.error("Error toggling driver availability:", error);
    return next(new AppError("Failed to toggle availability", 500));
  }
};

/**
 * Heartbeat endpoint to keep driver ONLINE using Redis TTL and location live.
 * Call every 15–30 seconds with current latitude/longitude (required for ride-hailing).
 */
export const driverHeartbeat = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return res.status(401).json({
        success: false,
        message: "Driver not authenticated",
      });
    }
    const driverId = req.driver.id as string;
    const { latitude, longitude } = req.body || {};

    const hasValidLocation =
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;
    if (!hasValidLocation) {
      return res.status(400).json({
        success: false,
        error: "latitude and longitude are required (numbers: lat -90..90, lng -180..180)",
      });
    }

    const availabilityKey = getDriverAvailabilityKey(driverId);
    const locationKey = getDriverLocationKey(driverId);
    const now = Date.now();
    const nowDate = new Date(now);

    // 1) Always update Redis first – single source of truth for live location (production).
    //    When driver moves or stays, next heartbeat overwrites; if internet drops, last location stays until TTL.
    try {
      const availabilityPayload = {
        driverId,
        status: "ONLINE",
        lastPing: now,
        updatedAt: now,
        latitude,
        longitude,
      };
      await redis.set(
        availabilityKey,
        JSON.stringify(availabilityPayload),
        "EX",
        DRIVER_AVAILABILITY_TTL_SECONDS
      );
      const locationPayload = { latitude, longitude, updatedAt: now };
      await redis.set(
        locationKey,
        JSON.stringify(locationPayload),
        "EX",
        DRIVER_LOCATION_REDIS_TTL_SECONDS
      );
    } catch (redisErr) {
      console.error(
        "Driver heartbeat Redis update failed:",
        redisErr instanceof Error ? redisErr.message : redisErr
      );
      return next(new AppError("Failed to update location (Redis)", 500));
    }

    // 2) Optionally persist to DB (for testing or when rider matching still uses DB). Disable in production with DRIVER_LOCATION_PERSIST_TO_DB=false.
    if (shouldPersistLocationToDb()) {
      try {
        await prisma.driver.update({
          where: { id: driverId },
          data: {
            currentLat: latitude,
            currentLng: longitude,
            updatedAt: nowDate,
          },
        });
        await prisma.driverLocation.upsert({
          where: { driverId },
          create: {
            driverId,
            latitude,
            longitude,
            isOnline: true,
            isAvailable: true,
            isInTrip: false,
          },
          update: {
            latitude,
            longitude,
            timestamp: nowDate,
            lastUpdatedAt: nowDate,
          },
        });
      } catch (dbErr) {
        console.error(
          "Driver heartbeat DB location update failed:",
          dbErr instanceof Error ? dbErr.message : dbErr
        );
        return next(new AppError("Failed to update location (DB)", 500));
      }
    }

    // Track online time against active subscription (if any)
    let subscriptionJustExpired = false;
    let remainingMinutesAfter: number | null | undefined = undefined;

    try {
      const currentStatus = await prisma.driverStatus.findUnique({
        where: { driverId },
      });

      // Only count minutes when previously ONLINE and we have a lastPingAt
      if (currentStatus && currentStatus.status === "ONLINE" && currentStatus.lastPingAt) {
        const lastPingMs = currentStatus.lastPingAt.getTime();
        const deltaMs = now - lastPingMs;
        const deltaMinutes = Math.floor(deltaMs / 60000);

        if (deltaMinutes > 0) {
          await prisma.$transaction(async (tx) => {
            // 1) Update DriverStatus: lastPingAt + totalOnlineHours
            await tx.driverStatus.update({
              where: { driverId },
              data: {
                lastPingAt: nowDate,
                totalOnlineHours: {
                  increment: deltaMinutes / 60,
                },
              },
            });

            // 2) Update active subscription remainingMinutes if present
            const activeSub = await tx.driverSubscription.findFirst({
              where: {
                driverId,
                status: "ACTIVE",
                expire: { gt: nowDate },
              },
              orderBy: { createdAt: "desc" },
            });

            if (activeSub && activeSub.remainingMinutes !== null && activeSub.remainingMinutes !== undefined) {
              const newRemaining = Math.max(activeSub.remainingMinutes - deltaMinutes, 0);
              remainingMinutesAfter = newRemaining;
              const newStatus = newRemaining > 0 ? "ACTIVE" : "EXPIRED";

              await tx.driverSubscription.update({
                where: { id: activeSub.id },
                data: {
                  remainingMinutes: newRemaining,
                  status: newStatus,
                },
              });

              if (newStatus === "EXPIRED") {
                subscriptionJustExpired = true;

                // When subscription expires, force driver offline and clear availability
                await tx.driverStatus.update({
                  where: { driverId },
                  data: { status: "OFFLINE" },
                });
                await tx.driverLocation.updateMany({
                  where: { driverId },
                  data: { isOnline: false, isAvailable: false },
                });
              }
            }
          });
        } else {
          // No whole minute passed; just refresh lastPingAt
          await prisma.driverStatus.update({
            where: { driverId },
            data: { lastPingAt: nowDate, status: "ONLINE" },
          });
        }
      } else {
        // First heartbeat or previously offline: ensure status row exists and set lastPingAt
        await prisma.driverStatus.upsert({
          where: { driverId },
          create: {
            driverId,
            status: "ONLINE",
            lastPingAt: nowDate,
          },
          update: {
            status: "ONLINE",
            lastPingAt: nowDate,
          },
        });
      }
    } catch (dbError) {
      console.warn(
        "Driver heartbeat subscription/time tracking failed:",
        dbError instanceof Error ? dbError.message : dbError
      );
      // Do not block the heartbeat on DB tracking issues
    }

    return res.status(200).json({
      success: true,
      message: "Heartbeat received",
      data: {
        driverId,
        lastPing: now,
        ttlSeconds: DRIVER_AVAILABILITY_TTL_SECONDS,
        locationUpdated: true,
        locationInRedis: true,
        locationPersistedToDb: shouldPersistLocationToDb(),
        subscription: {
          justExpired: subscriptionJustExpired,
          remainingMinutes: remainingMinutesAfter ?? null,
        },
      },
    });
  } catch (error: any) {
    console.error("Error in driver heartbeat:", error);
    return next(new AppError("Failed to process heartbeat", 500));
  }
};

/**
 * Get driver's current location
 */
export const getDriverLocation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return res.status(401).json({
        success: false,
        message: "Driver not authenticated",
      });
    }
    const driverId = req.driver.id as string;

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        currentLat: true,
        currentLng: true,
        updatedAt: true,
      },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        error: "Driver not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        driverId: driver.id,
        latitude: driver.currentLat,
        longitude: driver.currentLng,
        lastUpdated: driver.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Error fetching driver location:", error);
    return next(new AppError("Failed to fetch location", 500));
  }
};

