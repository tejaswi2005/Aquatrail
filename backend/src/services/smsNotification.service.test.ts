import assert from "node:assert/strict";
import test from "node:test";
import {
  NotificationStatus,
  NotificationType,
  Prisma,
} from "@prisma/client";
import {
  buildTrackingUrl,
  normalizeSmsPhone,
  sendSmsNotification,
  type NotificationStore,
} from "./smsNotification.service.js";

test("SMS phone normalization accepts international and Indian mobile numbers", () => {
  assert.equal(normalizeSmsPhone("+919876543210"), "+919876543210");
  assert.equal(normalizeSmsPhone("9876543210"), "+919876543210");
  assert.equal(normalizeSmsPhone("09876543210"), "+919876543210");
  assert.throws(() => normalizeSmsPhone("12345"), /valid SMS destination/);
});

test("tracking link uses the configured public frontend origin", () => {
  const previous = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://shop.example/path";
  try {
    assert.equal(
      buildTrackingUrl("delivery-123"),
      "https://shop.example/customer/track/delivery-123"
    );
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previous;
  }
});

function createMemoryStore(
  type: NotificationType,
  eventKey: string
): {
  store: NotificationStore;
  getRecord: () => Prisma.NotificationGetPayload<object> | null;
} {
  let record: Prisma.NotificationGetPayload<object> | null = null;
  const store: NotificationStore = {
    findByEventKey: async () => record,
    create: async (data) => {
      record = {
        id: "notification-test",
        eventKey,
        type,
        status: NotificationStatus.PENDING,
        orderId: data.orderId ?? null,
        subscriptionId: data.subscriptionId ?? null,
        providerReference: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return record;
    },
    update: async (_id, data) => {
      if (!record) throw new Error("Missing test notification record.");
      const requestedStatus = data.status;
      const status =
        requestedStatus === NotificationStatus.PENDING ||
        requestedStatus === NotificationStatus.SENT ||
        requestedStatus === NotificationStatus.FAILED
          ? requestedStatus
          : record.status;
      record = {
        ...record,
        status,
        providerReference:
          typeof data.providerReference === "string"
            ? data.providerReference
            : record.providerReference,
        sentAt: data.sentAt instanceof Date ? data.sentAt : record.sentAt,
        updatedAt: new Date(),
      };
      return record;
    },
    findById: async () => record,
  };
  return { store, getRecord: () => record };
}

function withTwilioEnvironment(action: () => Promise<void>) {
  return async () => {
    const previous = {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
      requireDlt: process.env.TWILIO_REQUIRE_DLT,
      publicAppUrl: process.env.PUBLIC_APP_URL,
    };
    process.env.TWILIO_ACCOUNT_SID = "AC-test";
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG-test";
    process.env.TWILIO_REQUIRE_DLT = "false";
    process.env.PUBLIC_APP_URL = "https://shop.example";
    try {
      await action();
    } finally {
      if (previous.accountSid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
      else process.env.TWILIO_ACCOUNT_SID = previous.accountSid;
      if (previous.authToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
      else process.env.TWILIO_AUTH_TOKEN = previous.authToken;
      if (previous.messagingServiceSid === undefined) delete process.env.TWILIO_MESSAGING_SERVICE_SID;
      else process.env.TWILIO_MESSAGING_SERVICE_SID = previous.messagingServiceSid;
      if (previous.requireDlt === undefined) delete process.env.TWILIO_REQUIRE_DLT;
      else process.env.TWILIO_REQUIRE_DLT = previous.requireDlt;
      if (previous.publicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
      else process.env.PUBLIC_APP_URL = previous.publicAppUrl;
    }
  };
}

test(
  "notification event keys suppress duplicate provider submissions",
  withTwilioEnvironment(async () => {
    const eventKey = "delivery:test:started";
    const { store, getRecord } = createMemoryStore(
      NotificationType.DELIVERY_STARTED,
      eventKey
    );
    let providerCalls = 0;
    const fetcher: typeof fetch = async () => {
      providerCalls += 1;
      return new Response('{"sid":"SM-provider-reference"}', { status: 201 });
    };
    const input = {
      eventKey,
      type: NotificationType.DELIVERY_STARTED,
      orderId: "order-test",
      to: "9876543210",
      body: "AquaTrail delivery is on the way.",
    };

    await sendSmsNotification(input, { store, fetcher });
    const retry = await sendSmsNotification(input, { store, fetcher });

    assert.equal(getRecord()?.status, NotificationStatus.SENT);
    assert.equal(retry?.status, NotificationStatus.SENT);
    assert.equal(providerCalls, 1);
  })
);

test(
  "provider failures are recorded without claiming the SMS was sent",
  withTwilioEnvironment(async () => {
    const eventKey = "delivery:test:started";
    const { store, getRecord } = createMemoryStore(
      NotificationType.DELIVERY_STARTED,
      eventKey
    );
    let providerCalls = 0;
    const fetcher: typeof fetch = async () => {
      providerCalls += 1;
      return new Response("provider unavailable", { status: 503 });
    };
    const input = {
      eventKey,
      type: NotificationType.DELIVERY_STARTED,
      orderId: "order-test",
      to: "9876543210",
      body: "AquaTrail: subscription confirmed.",
    };

    await sendSmsNotification(input, { store, fetcher });
    const retry = await sendSmsNotification(input, { store, fetcher });

    assert.equal(getRecord()?.status, NotificationStatus.FAILED);
    assert.equal(retry?.status, NotificationStatus.FAILED);
    assert.equal(providerCalls, 1);
  })
);
