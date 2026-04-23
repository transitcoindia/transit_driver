import { Request, Response } from "express";

const asBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

export const getDriverHomePopupCampaign = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const enabled = asBool(process.env.DRIVER_HOME_POPUP_ENABLED, true);
  const id = process.env.DRIVER_HOME_POPUP_ID || "driver_campaign_default_v1";
  const title =
    process.env.DRIVER_HOME_POPUP_TITLE || "Unlock Driver Benefits for Just ₹20 🚀";
  const message =
    process.env.DRIVER_HOME_POPUP_MESSAGE ||
    "Become a Lifetime Transit Assured Member\n✔ Get priority ride allocations\n✔ Increase your earning opportunities\n🎁 Lucky drivers can win up to 4 days of FREE recharge";
  const ctaText = process.env.DRIVER_HOME_POPUP_CTA_TEXT || "Recharge now";
  const footerText =
    process.env.DRIVER_HOME_POPUP_FOOTER_TEXT || "Limited campaign. Terms apply.";
  const initialAmount = Number(
    process.env.DRIVER_HOME_POPUP_INITIAL_AMOUNT || "20"
  );

  res.status(200).json({
    success: true,
    data: {
      id,
      enabled,
      title,
      message,
      ctaText,
      footerText,
      initialAmount: Number.isFinite(initialAmount) ? initialAmount : 20,
    },
  });
};

