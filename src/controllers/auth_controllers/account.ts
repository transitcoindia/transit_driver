import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../prismaClient';
import AppError from '../../utils/AppError';

/** DELETE /api/driver/account — permanently delete driver account and linked user. */
export const deleteDriverAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return next(new AppError('Driver not authenticated', 401));
    }

    const driverId = req.driver.id;

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        documents: true,
        bookings: { include: { fare: true } },
        cab: true,
        user: true,
      },
    });

    if (!driver || !driver.user) {
      return next(new AppError('Driver not found', 404));
    }

    const userId = driver.userId;

    if (driver.documents.length > 0) {
      await prisma.driverDocument.deleteMany({ where: { driverId } });
    }

    try {
      await prisma.$executeRaw`DELETE FROM "DriverSubscription" WHERE "driverId" = ${driverId}`;
    } catch (e) {
      console.log('DriverSubscription deletion skipped:', e);
    }

    try {
      await prisma.$executeRaw`DELETE FROM "SubscriptionPayment" WHERE "driverId" = ${driverId}`;
    } catch (e) {
      console.log('SubscriptionPayment deletion skipped:', e);
    }

    if (driver.bookings.length > 0) {
      for (const booking of driver.bookings) {
        if (booking.fare) {
          await prisma.fare.delete({ where: { id: booking.fare.id } });
        }
      }
      await prisma.booking.deleteMany({ where: { driverId } });
    }

    if (driver.cab) {
      await prisma.cab.delete({ where: { id: driver.cab.id } });
    }

    await prisma.driver.delete({ where: { id: driverId } });

    await prisma.session.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });

    return res.status(200).json({
      success: true,
      message: 'Driver account and all associated data deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting driver account:', error);
    return next(new AppError('Error deleting driver account', 500));
  }
};
