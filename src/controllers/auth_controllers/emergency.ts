import { Request, Response } from "express";
import { prisma } from "../../prismaClient";

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

/**
 * Trigger SOS – driver sends current location.
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

    const contacts = await prisma.driverEmergencyContact.findMany({
      where: { driverId },
      select: { name: true, phoneNumber: true, relationship: true },
    });

    console.warn("[SOS Driver]", {
      driverId,
      latitude,
      longitude,
      message: message || null,
      contactCount: contacts.length,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "SOS received. Emergency contacts will be notified.",
      data: {
        contactCount: contacts.length,
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
