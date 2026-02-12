import { PrismaClient } from '@prisma/client';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous 0,O,1,I
const CODE_LENGTH = 6;

/**
 * Generates a unique referral code for drivers (e.g. DRV-A3B7K2)
 */
export async function generateReferralCode(prisma: PrismaClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = 'DRV-';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    const existing = await prisma.driver.findUnique({ where: { referralCode: code } });
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique referral code');
}
