import admin from "firebase-admin";
import { prisma } from "../prismaClient";

let initialized = false;

function initFirebase(): boolean {
  if (initialized) return true;
  try {
    const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (keyPath) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const serviceAccount = require(keyPath);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      initialized = true;
      return true;
    }
    if (keyJson) {
      const serviceAccount = JSON.parse(keyJson);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      initialized = true;
      return true;
    }
    console.warn(
      "FCM: No FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON set. Push notifications disabled."
    );
    return false;
  } catch (e) {
    console.error("FCM init error:", e);
    return false;
  }
}

interface FcmNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Send data-only FCM for chat (so rider app can show notification with inline reply). */
export async function sendFcmDataOnlyToRider(
  riderId: string,
  data: Record<string, string>
): Promise<boolean> {
  if (!initFirebase()) return false;
  try {
    const user = await prisma.user.findUnique({
      where: { id: riderId },
      select: { fcmToken: true },
    });
    if (!user?.fcmToken) return false;
    await admin.messaging().send({
      token: user.fcmToken,
      data,
      android: { priority: "high" },
    });
    return true;
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.error("FCM data-only send error:", err?.message || e);
    return false;
  }
}

export async function sendFcmToRider(
  riderId: string,
  notification: FcmNotification
): Promise<boolean> {
  if (!initFirebase()) return false;
  try {
    const user = await prisma.user.findUnique({
      where: { id: riderId },
      select: { fcmToken: true },
    });
    if (!user?.fcmToken) return false;
    await admin.messaging().send({
      token: user.fcmToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data
        ? Object.fromEntries(
            Object.entries(notification.data).map(([k, v]) => [k, String(v)])
          )
        : undefined,
      android: {
        priority: "high",
        notification: { channelId: "ride_updates" },
      },
    });
    return true;
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (
      err?.code === "messaging/invalid-registration-token" ||
      err?.code === "messaging/registration-token-not-registered"
    ) {
      console.warn("FCM invalid rider token:", riderId?.slice(0, 8) + "...");
    } else {
      console.error("FCM send error:", err?.message || e);
    }
    return false;
  }
}
