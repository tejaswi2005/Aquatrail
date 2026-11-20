import {
  NotificationStatus,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { prisma } from "../config/prisma.js";

type NotificationInput = {
  eventKey: string;
  type: NotificationType;
  orderId?: string;
  subscriptionId?: string;
  to: string;
  body: string;
};

type SmsMessage = {
  to: string;
  body: string;
};

export type NotificationStore = {
  findByEventKey: (
    eventKey: string
  ) => Promise<Prisma.NotificationGetPayload<object> | null>;
  create: (
    data: {
      eventKey: string;
      type: NotificationType;
      orderId?: string;
      subscriptionId?: string;
    }
  ) => Promise<Prisma.NotificationGetPayload<object>>;
  update: (
    id: string,
    data: Prisma.NotificationUpdateInput
  ) => Promise<Prisma.NotificationGetPayload<object>>;
  findById: (
    id: string
  ) => Promise<Prisma.NotificationGetPayload<object> | null>;
};

const databaseStore: NotificationStore = {
  findByEventKey: (eventKey) =>
    prisma.notification.findUnique({ where: { eventKey } }),
  create: (data) => prisma.notification.create({ data }),
  update: (id, data) =>
    prisma.notification.update({ where: { id }, data }),
  findById: (id) => prisma.notification.findUnique({ where: { id } }),
};

export function normalizeSmsPhone(phone: string): string {
  const trimmed = phone.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  const indianNumber = digits.startsWith("0") ? digits.slice(1) : digits;
  if (/^[6-9]\d{9}$/.test(indianNumber)) return `+91${indianNumber}`;

  throw new Error("Customer phone number is not a valid SMS destination.");
}

function getTwilioConfig(type: NotificationType) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) {
    throw new Error("Twilio SMS credentials or sender are not configured.");
  }

  const requireDlt = process.env.TWILIO_REQUIRE_DLT === "true";
  const dltEntityId = process.env.TWILIO_DLT_ENTITY_ID;
  const dltTemplateId = process.env[
    `TWILIO_DLT_TEMPLATE_ID_${type}`
  ];
  if (requireDlt && (!dltEntityId || !dltTemplateId)) {
    throw new Error("Required India DLT entity or template ID is not configured.");
  }

  return {
    accountSid,
    authToken,
    messagingServiceSid,
    fromNumber,
    dltEntityId,
    dltTemplateId,
  };
}

async function submitSms(
  notificationId: string,
  type: NotificationType,
  message: SmsMessage,
  store: NotificationStore = databaseStore,
  fetcher: typeof fetch = fetch
): Promise<void> {
  let providerReference: string | null = null;
  try {
    const config = getTwilioConfig(type);
    if (
      type === NotificationType.DELIVERY_STARTED &&
      !process.env.PUBLIC_APP_URL &&
      !process.env.FRONTEND_URL
    ) {
      throw new Error("PUBLIC_APP_URL must be configured for tracking SMS.");
    }
    if (
      type === NotificationType.DELIVERY_STARTED &&
      process.env.PUBLIC_APP_URL
    ) {
      new URL(process.env.PUBLIC_APP_URL);
    }
    const form = new URLSearchParams({
      To: normalizeSmsPhone(message.to),
      Body: message.body,
    });
    if (config.messagingServiceSid) {
      form.set("MessagingServiceSid", config.messagingServiceSid);
    } else if (config.fromNumber) {
      form.set("From", config.fromNumber);
    }
    const response = await fetcher(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${config.accountSid}:${config.authToken}`
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(12_000),
      }
    );

    if (!response.ok) {
      throw new Error(`SMS provider returned HTTP ${response.status}.`);
    }

    const result: unknown = await response.json();
    providerReference =
      typeof result === "object" &&
      result !== null &&
      "sid" in result &&
      typeof result.sid === "string"
        ? result.sid
        : null;
  } catch (error) {
    await store.update(notificationId, {
      status: NotificationStatus.FAILED,
    });
    console.error(
      JSON.stringify({
        event: "sms_notification_failed",
        notificationId,
        notificationType: type,
        errorType: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : "Unknown SMS error.",
      })
    );
    return;
  }

  await store.update(notificationId, {
      status: NotificationStatus.SENT,
      providerReference,
      sentAt: new Date(),
  });
}

export async function sendDeliveryNotification(
  deliveryId: string,
  type: NotificationType
) {
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      order: {
        include: {
          customer: { include: { user: { select: { phone: true } } } },
        },
      },
      driver: { include: { user: { select: { name: true, phone: true } } } },
    },
  });
  if (!delivery) throw new Error("Delivery not found for notification.");

  let body: string;
  if (type === NotificationType.DELIVERY_STARTED) {
    const driver = delivery.driver?.user;
    const driverDetails = driver?.name
      ? ` Driver: ${driver.name}.${driver.phone ? ` Contact: ${driver.phone}.` : ""}`
      : "";
    const trackLink =
      process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL
        ? ` Track here: ${buildTrackingUrl(delivery.id)}`
        : "";
    body = `AquaTrail: Your water delivery is on the way!${driverDetails}${trackLink}`;
  } else if (type === NotificationType.DELIVERY_COMPLETED) {
    body =
      "AquaTrail: Your water delivery has been completed. Thank you for choosing AquaTrail!";
  } else {
    const reason = delivery.cancellationReason || "Not specified";
    body = `AquaTrail: Your scheduled water delivery could not be completed. Reason: ${reason}. Please contact AquaTrail for assistance.`;
  }

  return sendSmsNotification({
    eventKey: `delivery:${delivery.id}:${type}`,
    type,
    orderId: delivery.orderId,
    to: delivery.order.customer.user.phone ?? "",
    body,
  });
}

export async function sendSmsNotification(
  input: NotificationInput,
  dependencies: {
    store?: NotificationStore;
    fetcher?: typeof fetch;
  } = {}
) {
  const store = dependencies.store ?? databaseStore;
  const fetcher = dependencies.fetcher ?? fetch;
  const existing = await store.findByEventKey(input.eventKey);
  if (existing) return existing;

  let notification;
  try {
    notification = await store.create({
      eventKey: input.eventKey,
      type: input.type,
      orderId: input.orderId,
      subscriptionId: input.subscriptionId,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return store.findByEventKey(input.eventKey);
    }
    throw error;
  }

  await submitSms(
    notification.id,
    input.type,
    { to: input.to, body: input.body },
    store,
    fetcher
  );

  const updated = await store.findById(notification.id);
  if (!updated) throw new Error("Notification record disappeared after sending.");
  return updated;
}

export function buildTrackingUrl(deliveryId: string): string {
  const baseUrl = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL;
  if (!baseUrl) throw new Error("PUBLIC_APP_URL must be configured for tracking SMS.");

  const url = new URL(baseUrl);
  return new URL(
    `/customer/track/${encodeURIComponent(deliveryId)}`,
    url.origin
  ).toString();
}
