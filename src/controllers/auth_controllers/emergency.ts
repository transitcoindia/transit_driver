import { Request, Response } from "express";
import { prisma } from "../../prismaClient";
import { sendSmsMessage } from "../../utils/otpService";
import {
  createSosSession,
  updateSosSession,
  getSosSession,
} from "../../utils/sosSessionStore";

/**
 * Add emergency contact for driver
 */
export const addEmergencyContact = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const driver = (req as any).driver;
    if (!driver || !driver.id) {
      return res.status(401).json({ error: "Driver not authenticated" });
    }
    const driverId = driver.id as string;

    const { name, phoneNumber, relationship } = req.body;

    if (!name || !phoneNumber) {
      return res.status(400).json({
        error: "Name and phone number are required",
      });
    }

    if (phoneNumber.length < 10) {
      return res.status(400).json({
        error: "Invalid phone number",
      });
    }

    const emergencyContact = await prisma.driverEmergencyContact.create({
      data: {
        driverId,
        name,
        phoneNumber,
        relationship: relationship || "other",
      },
    });

    return res.status(201).json({
      success: true,
      message: "Emergency contact added successfully",
      data: {
        emergencyContact,
      },
    });
  } catch (error: any) {
    console.error("Error adding emergency contact:", error);
    return res.status(500).json({
      error: "Failed to add emergency contact",
      message: error.message,
    });
  }
};

/**
 * Get driver emergency contacts
 */
export const getEmergencyContacts = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const driver = (req as any).driver;
    if (!driver || !driver.id) {
      return res.status(401).json({ error: "Driver not authenticated" });
    }
    const driverId = driver.id as string;

    const emergencyContacts = await prisma.driverEmergencyContact.findMany({
      where: { driverId },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      data: {
        emergencyContacts,
      },
    });
  } catch (error: any) {
    console.error("Error fetching emergency contacts:", error);
    return res.status(500).json({
      error: "Failed to fetch emergency contacts",
      message: error.message,
    });
  }
};

/**
 * Update emergency contact
 */
export const updateEmergencyContact = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const driver = (req as any).driver;
    if (!driver || !driver.id) {
      return res.status(401).json({ error: "Driver not authenticated" });
    }
    const driverId = driver.id as string;

    const { contactId } = req.params;
    const { name, phoneNumber, relationship } = req.body;

    if (!contactId) {
      return res.status(400).json({ error: "Contact ID is required" });
    }

    const existingContact = await prisma.driverEmergencyContact.findFirst({
      where: {
        id: contactId,
        driverId,
      },
    });

    if (!existingContact) {
      return res.status(404).json({
        error: "Emergency contact not found or access denied",
      });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phoneNumber !== undefined) {
      if (phoneNumber.length < 10) {
        return res.status(400).json({ error: "Invalid phone number" });
      }
      updateData.phoneNumber = phoneNumber;
    }
    if (relationship !== undefined) updateData.relationship = relationship;

    const updatedContact = await prisma.driverEmergencyContact.update({
      where: { id: contactId },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: "Emergency contact updated successfully",
      data: {
        emergencyContact: updatedContact,
      },
    });
  } catch (error: any) {
    console.error("Error updating emergency contact:", error);
    return res.status(500).json({
      error: "Failed to update emergency contact",
      message: error.message,
    });
  }
};

/**
 * Delete emergency contact
 */
export const deleteEmergencyContact = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const driver = (req as any).driver;
    if (!driver || !driver.id) {
      return res.status(401).json({ error: "Driver not authenticated" });
    }
    const driverId = driver.id as string;

    const { contactId } = req.params;

    if (!contactId) {
      return res.status(400).json({ error: "Contact ID is required" });
    }

    const existingContact = await prisma.driverEmergencyContact.findFirst({
      where: {
        id: contactId,
        driverId,
      },
    });

    if (!existingContact) {
      return res.status(404).json({
        error: "Emergency contact not found or access denied",
      });
    }

    await prisma.driverEmergencyContact.delete({
      where: { id: contactId },
    });

    return res.status(200).json({
      success: true,
      message: "Emergency contact deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting emergency contact:", error);
    return res.status(500).json({
      error: "Failed to delete emergency contact",
      message: error.message,
    });
  }
};

const SOS_BASE_URL =
  process.env.SOS_BASE_URL ||
  process.env.BASE_URL ||
  process.env.API_BASE_URL ||
  "https://api.transitco.in";

/**
 * Trigger SOS – driver sends current location.
 * Sends SMS via Fast2SMS with "Need help with location" + live location link.
 * POST /api/driver/emergency/sos
 */
export const triggerSos = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const driver = (req as any).driver;
    if (!driver || !driver.id) {
      return res.status(401).json({ error: "Driver not authenticated" });
    }
    const driverId = driver.id as string;

    const { latitude, longitude, message } = req.body;

    if (
      latitude == null ||
      longitude == null ||
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
      return res.status(400).json({
        error: "latitude and longitude (numbers) are required",
      });
    }

    const lat = latitude.toFixed(6);
    const lng = longitude.toFixed(6);
    const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;

    // Create live session – driver app will stream location updates for 5–10 min
    const sessionId = createSosSession(driverId, latitude, longitude);
    const liveUrl = `${SOS_BASE_URL.replace(/\/$/, "")}/api/driver/emergency/sos/live/${sessionId}`;

    const contacts = await prisma.driverEmergencyContact.findMany({
      where: { driverId },
      select: { name: true, phoneNumber: true, relationship: true },
    });

    // Same channel as OTP – Fast2SMS. Message: "Need help with location"
    const sosMessage = `Need help with location. Live tracking: ${liveUrl} Or view now: ${mapUrl}`;

    let smsSentCount = 0;
    for (const c of contacts) {
      const phone = (c.phoneNumber || "").trim().replace(/\s+/g, "");
      if (phone.length >= 10) {
        const ok = await sendSmsMessage(phone, sosMessage);
        if (ok) smsSentCount++;
      }
    }

    console.warn("[SOS Driver]", {
      driverId,
      latitude,
      longitude,
      sessionId,
      contactCount: contacts.length,
      smsSentCount,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "SOS received. Emergency contacts notified.",
      data: {
        contactCount: contacts.length,
        smsSentCount,
        sessionId,
        acknowledgedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error processing SOS:", error);
    return res.status(500).json({
      error: "Failed to process SOS",
      message: error.message,
    });
  }
};

/**
 * Update SOS session with latest driver location (driver app streams every 15s).
 * POST /api/driver/emergency/sos/:sessionId/location
 */
export const updateSosLocation = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const driver = (req as any).driver;
    if (!driver || !driver.id) {
      return res.status(401).json({ error: "Driver not authenticated" });
    }
    const { sessionId } = req.params;
    const { latitude, longitude } = req.body;

    if (
      !sessionId ||
      latitude == null ||
      longitude == null ||
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
      return res.status(400).json({
        error: "sessionId, latitude and longitude (numbers) are required",
      });
    }

    const ok = updateSosSession(sessionId, driver.id, latitude, longitude);
    if (!ok) {
      return res.status(404).json({ error: "SOS session not found or expired" });
    }

    return res.status(200).json({
      success: true,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error updating SOS location:", error);
    return res.status(500).json({
      error: "Failed to update SOS location",
      message: (error as Error).message,
    });
  }
};

const LIVE_HTML = (sessionId: string, baseUrl: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Driver SOS – Live Location</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:400px;margin:40px auto;padding:20px;text-align:center}
    h1{color:#c00;font-size:1.4rem}
    p{color:#444}
    a{display:inline-block;margin:16px 0;padding:14px 24px;background:#4285f4;color:#fff;text-decoration:none;border-radius:8px;font-weight:600}
    a:hover{background:#3367d6}
    .muted{font-size:0.85rem;color:#888}
  </style>
</head>
<body>
  <h1>Driver needs help – Live location</h1>
  <p id="status">Loading…</p>
  <p class="muted" id="updated"></p>
  <a id="maps" href="#" target="_blank">Open in Google Maps</a>
  <script>
    const sessionId = "${sessionId}";
    const apiUrl = "${baseUrl}/api/driver/emergency/sos/live/" + sessionId;
    function fetchLoc() {
      fetch(apiUrl + "?format=json").then(r=>r.json()).then(d=>{
        if(d.lat!=null&&d.lng!=null){
          document.getElementById("maps").href="https://www.google.com/maps?q="+d.lat+","+d.lng;
          document.getElementById("status").textContent="Driver shared live location.";
          const s = d.updatedAt ? Math.round((Date.now()-new Date(d.updatedAt).getTime())/1000) : 0;
          document.getElementById("updated").textContent="Last updated " + (s<60?s+"s ago":"1+ min ago");
        } else document.getElementById("status").textContent="Session expired.";
      }).catch(()=>document.getElementById("status").textContent="Could not load location.");
    }
    fetchLoc();
    setInterval(fetchLoc, 10000);
  </script>
</body>
</html>`;

/**
 * GET /api/driver/emergency/sos/live/:sessionId
 * Serves live location: HTML page (default) or JSON (?format=json).
 * No auth – link is shared via SMS.
 */
export const getSosLive = (req: Request, res: Response): void => {
  const { sessionId } = req.params;
  const format = (req.query.format as string) || "";

  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }

  const session = getSosSession(sessionId);
  if (!session) {
    if (format === "json") {
      res.status(404).json({ error: "Session not found or expired" });
    } else {
      res.status(404).send(
        "<html><body><h1>Session expired</h1><p>This SOS session has expired.</p></body></html>"
      );
    }
    return;
  }

  if (format.toLowerCase() === "json") {
    res.json({
      lat: session.lat,
      lng: session.lng,
      updatedAt: session.updatedAt.toISOString(),
    });
    return;
  }

  const baseUrl = SOS_BASE_URL.replace(/\/$/, "");
  res.setHeader("Content-Type", "text/html");
  res.send(LIVE_HTML(sessionId, baseUrl));
};
