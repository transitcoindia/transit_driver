import { prisma } from "../prismaClient";
import { sendFcmToDriver } from "./fcmService";

const OT_RATE_PER_HOUR = 10;
const GRACE_HOURS = 4; // Driver can run 4 hours after expiry with ₹10/hr charge; then forced offline

export interface OvertimeResult {
  charged: number;
  hours: number;
  walletBalanceAfter: number;
  /** True if grace period (4h) has ended */
  gracePeriodEnded: boolean;
  /** Hours remaining in grace (0 if ended) */
  graceHoursRemaining: number;
}

/**
 * Apply overtime billing for driver with expired subscription.
 * Grace period: 4 hours after expiry. During grace: charge ₹10/hour, wallet can go negative.
 * After 4 hours: no more charging, driver must be forced offline by caller.
 */
export async function applyOvertimeBilling(driverId: string): Promise<OvertimeResult | null> {
  const now = new Date();
  const nowMs = now.getTime();

  const lastExpiredSub = await prisma.driverSubscription.findFirst({
    where: {
      driverId,
      expire: { lt: now },
    },
    orderBy: { expire: "desc" },
  });

  if (!lastExpiredSub) return null;

  const expireMs = lastExpiredSub.expire.getTime();
  const graceEndsMs = expireMs + GRACE_HOURS * 60 * 60 * 1000;
  const gracePeriodEnded = nowMs > graceEndsMs;
  const graceHoursRemaining = Math.max(0, (graceEndsMs - nowMs) / (60 * 60 * 1000));

  const lastBillingAt = lastExpiredSub.lastOvertimeBillingAt ?? lastExpiredSub.expire;
  const lastBillingMs = lastBillingAt.getTime();
  const endBillingMs = Math.min(nowMs, graceEndsMs);
  const billableMs = Math.max(0, endBillingMs - lastBillingMs);
  const hoursToBill = Math.floor(billableMs / (60 * 60 * 1000));
  if (hoursToBill <= 0) {
    let walletBalance = 0;
    const wallet = await prisma.driverWallet.findUnique({ where: { driverId } });
    if (wallet) walletBalance = wallet.balance;
    return { charged: 0, hours: 0, walletBalanceAfter: walletBalance, gracePeriodEnded, graceHoursRemaining };
  }

  const chargeAmount = hoursToBill * OT_RATE_PER_HOUR;
  const newBillingAt = new Date(lastBillingMs + hoursToBill * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    let wallet = await tx.driverWallet.findUnique({ where: { driverId } });
    if (!wallet) {
      wallet = await tx.driverWallet.create({ data: { driverId } });
    }
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - chargeAmount;
    await tx.driverWallet.update({
      where: { id: wallet.id },
      data: { balance: balanceAfter, updatedAt: now },
    });
    await tx.driverWalletTransaction.create({
      data: {
        driverWalletId: wallet.id,
        type: "debit",
        amount: chargeAmount,
        balanceBefore,
        balanceAfter,
        description: `Overtime: ₹${chargeAmount} (${hoursToBill} hr @ ₹${OT_RATE_PER_HOUR}/hr after subscription expiry)`,
        referenceType: "overtime",
        referenceId: lastExpiredSub.id,
      },
    });
    await tx.driverSubscription.update({
      where: { id: lastExpiredSub.id },
      data: { lastOvertimeBillingAt: newBillingAt },
    });
    return { balanceAfter };
  });

  try {
    const body = gracePeriodEnded
      ? `4-hour grace period ended. ₹${chargeAmount} was deducted. Recharge to go online again.`
      : `Subscription expired. ₹${chargeAmount} (${hoursToBill} hr × ₹10/hr) deducted. ${graceHoursRemaining.toFixed(0)}h left before you must recharge.`;
    await sendFcmToDriver(driverId, {
      title: chargeAmount > 0 ? "Overtime charge applied" : "Grace period ended",
      body,
      data: { type: "overtime", amount: String(chargeAmount), hours: String(hoursToBill), graceEnded: String(gracePeriodEnded) },
    });
  } catch (_) {}

  return {
    charged: chargeAmount,
    hours: hoursToBill,
    walletBalanceAfter: result.balanceAfter,
    gracePeriodEnded,
    graceHoursRemaining,
  };
}

/** Check if driver is in grace period (within 4h of subscription expiry). If so, they can stay online. */
export async function isInGracePeriod(driverId: string): Promise<{ inGrace: boolean; graceHoursRemaining: number } | null> {
  const lastExpiredSub = await prisma.driverSubscription.findFirst({
    where: { driverId, expire: { lt: new Date() } },
    orderBy: { expire: "desc" },
  });
  if (!lastExpiredSub) return null;
  const nowMs = Date.now();
  const graceEndsMs = lastExpiredSub.expire.getTime() + GRACE_HOURS * 60 * 60 * 1000;
  const inGrace = nowMs <= graceEndsMs;
  const graceHoursRemaining = Math.max(0, (graceEndsMs - nowMs) / (60 * 60 * 1000));
  return { inGrace, graceHoursRemaining };
}
