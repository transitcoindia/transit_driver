import { PrismaClient } from '@prisma/client';

/**
 * Generates a custom user ID based on user type
 * - R-001 for riders (isDriver = false, isAdmin = false)
 * - A-001 for admins (isAdmin = true)
 * - D-001 for drivers (isDriver = true)
 */
export const generateUserId = async (
  prisma: PrismaClient,
  isAdmin: boolean,
  isDriver: boolean
): Promise<string> => {
  let prefix: string;
  
  if (isAdmin) {
    prefix = 'A';
  } else if (isDriver) {
    prefix = 'D';
  } else {
    prefix = 'R';
  }

  // Find all users with IDs matching the prefix pattern (e.g., A-001, A-002, etc.)
  const users = await prisma.user.findMany({
    where: {
      id: {
        startsWith: `${prefix}-`
      }
    },
    select: {
      id: true
    },
    orderBy: {
      id: 'desc'
    }
  });

  // Extract the highest number from existing IDs
  let maxNumber = 0;
  for (const user of users) {
    const match = user.id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  // Generate next ID
  const nextNumber = maxNumber + 1;
  const paddedNumber = nextNumber.toString().padStart(3, '0');
  
  return `${prefix}-${paddedNumber}`;
};

