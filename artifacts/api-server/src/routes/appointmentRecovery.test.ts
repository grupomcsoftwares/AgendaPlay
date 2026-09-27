import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  createAppointmentRecoveryRouter,
  type AppointmentRecoveryParseResult,
  type RecoverableAppointment,
} from "./appointmentRecovery.ts";

interface TestAppointment extends RecoverableAppointment {
  id: number;
  userId: string;
  clientName: string;
  scheduledAt: string;
}

interface TestCandidate {
  appointment: TestAppointment;
  linkedClientPhone: string | null;
}

const OWNER_PHONE = "+55 (11) 99999-1111";
const OTHER_PHONE = "+55 (11) 98888-2222";
const OWNER_TOKEN = "owner-existing-booking-token";
const OTHER_CLIENT_TOKEN = "other-client-booking-token";

const records: TestCandidate[] = [
  {
    appointment: {
      id: 101,
      userId: "shop-a",
      clientName: "Cliente titular",
      status: "confirmed",
      cancelToken: OWNER_TOKEN,
      scheduledAt: "2026-10-01T13:00:00.000Z",
    },
    linkedClientPhone: OWNER_PHONE,
  },
  {
    appointment: {
      id: 102,
      userId: "shop-a",
      clientName: "Cliente titular",
      status: "pending_payment",
      cancelToken: "owner-second-active-token",
      scheduledAt: "2026-10-03T13:00:00.000Z",
    },
    linkedClientPhone: OWNER_PHONE,
  },
  {
    appointment: {
      id: 106,
      userId: "shop-a",
      clientName: "Cliente titular",
      status: "pending",
      cancelToken: "owner-unlinked-active-token",
      notes: `Tel: ${OWNER_PHONE}.`,
      scheduledAt: "2026-10-06T13:00:00.000Z",
    },
    linkedClientPhone: null,
  },
  {
    appointment: {
      id: 107,
      userId: "shop-a",
      clientName: "Cliente titular",
      status: "confirmed",
      cancelToken: null,
      scheduledAt: "2026-10-07T13:00:00.000Z",
    },
    linkedClientPhone: OWNER_PHONE,
  },
  {
    appointment: {
      id: 103,
      userId: "shop-a",
      clientName: "Cliente titular",
      status: "completed",
      cancelToken: "owner-completed-token",
      scheduledAt: "2026-09-01T13:00:00.000Z",
    },
    linkedClientPhone: OWNER_PHONE,
  },
  {
    appointment: {
      id: 104,
      userId: "shop-a",
      clientName: "Outro cliente",
      status: "confirmed",
      cancelToken: OTHER_CLIENT_TOKEN,
      scheduledAt: "2026-10-04T13:00:00.000Z",
    },
    linkedClientPhone: OTHER_PHONE,
  },
  {
    appointment: {
      id: 105,
      userId: "shop-b",
      clientName: "Cliente de outra barbearia",
      status: "confirmed",
      cancelToken: "other-shop-token",
      scheduledAt: "2026-10-05T13:00:00.000Z",
    },
    linkedClientPhone: OWNER_PHONE,
  },
];

function parseRecoveryBody(body: unknown): AppointmentRecoveryParseResult {
  if (!body || typeof body !== "object") return { success: false };
  const value = body as Record<string, unknown>;
  if (
    typeof value.shopId !== "string" || value.shopId.length === 0 ||
    typeof value.phone !== "string" || value.phone.length < 10 ||
    typeof value.verificationToken !== "string" || value.verificationToken.length === 0
  ) {
    return { success: false };
  }
  return {
    success: true,
    data: {
      shopId: value.shopId as string,
      phone: value.phone as string,
      verificationToken: value.verificationToken as string,
    },
  };
}

async function startPublicRecoveryServer() {
  const app = express();
  const observedUrls: string[] = [];
  app.use(express.json());
  app.use((req, _res, next) => {
    observedUrls.push(req.originalUrl);
    next();
  });
  app.use(createAppointmentRecoveryRouter<TestAppointment>({
    parseBody: parseRecoveryBody,
    findVerificationAppointment: async (shopId, token) =>
      records.find(({ appointment }) =>
        appointment.userId === shopId && appointment.cancelToken === token,
      ),
    listActiveAppointments: async (shopId) =>
      records.filter(({ appointment }) => appointment.userId === shopId),
    formatAppointment: (appointment) => appointment,
  }));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  return {
    server,
    observedUrls,
    url: `http://127.0.0.1:${address.port}/appointments/recover`,
  };
}

async function closeServer(server: Awaited<ReturnType<typeof startPublicRecoveryServer>>["server"]) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function postRecovery(
  endpoint: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() as unknown };
}

test("phone alone cannot list appointments or personal data", async (t) => {
  const server = await startPublicRecoveryServer();
  t.after(() => closeServer(server.server));

  const response = await postRecovery(server.url, {
    shopId: "shop-a",
    phone: OWNER_PHONE,
  });

  assert.equal(response.response.status, 400);
  assert.deepEqual(response.payload, {
    error: "Informe o telefone e os dados de verificação.",
  });
  assert.deepEqual(server.observedUrls, ["/appointments/recover"]);
  assert.equal(server.observedUrls.some((url) => url.includes(OWNER_PHONE)), false);
  assert.equal(server.observedUrls.some((url) => url.includes(OWNER_TOKEN)), false);
});

test("a token from another client or a different phone gets the same generic response", async (t) => {
  const server = await startPublicRecoveryServer();
  t.after(() => closeServer(server.server));

  const foreignToken = await postRecovery(server.url, {
    shopId: "shop-a",
    phone: OWNER_PHONE,
    verificationToken: OTHER_CLIENT_TOKEN,
  });
  const mismatchedPhone = await postRecovery(server.url, {
    shopId: "shop-a",
    phone: OTHER_PHONE,
    verificationToken: OWNER_TOKEN,
  });
  const foreignShop = await postRecovery(server.url, {
    shopId: "shop-a",
    phone: OWNER_PHONE,
    verificationToken: "other-shop-token",
  });

  const genericError = {
    error: "Não foi possível validar os dados informados.",
  };
  assert.equal(foreignToken.response.status, 404);
  assert.deepEqual(foreignToken.payload, genericError);
  assert.equal(mismatchedPhone.response.status, 404);
  assert.deepEqual(mismatchedPhone.payload, genericError);
  assert.equal(foreignShop.response.status, 404);
  assert.deepEqual(foreignShop.payload, genericError);
  assert.equal(JSON.stringify(foreignToken.payload).includes(OTHER_CLIENT_TOKEN), false);
  assert.equal(JSON.stringify(mismatchedPhone.payload).includes(OWNER_TOKEN), false);
  assert.deepEqual(server.observedUrls, [
    "/appointments/recover",
    "/appointments/recover",
    "/appointments/recover",
  ]);
});

test("valid proof returns only this client's active appointments for the shop", async (t) => {
  const server = await startPublicRecoveryServer();
  t.after(() => closeServer(server.server));

  const result = await postRecovery(server.url, {
    shopId: "shop-a",
    phone: OWNER_PHONE,
    verificationToken: OWNER_TOKEN,
  });

  assert.equal(result.response.status, 200);
  assert.deepEqual(
    (result.payload as TestAppointment[]).map(({ id, cancelToken }) => ({ id, cancelToken })),
    [
      { id: 101, cancelToken: OWNER_TOKEN },
      { id: 102, cancelToken: "owner-second-active-token" },
      { id: 106, cancelToken: "owner-unlinked-active-token" },
    ],
  );
  assert.deepEqual(server.observedUrls, ["/appointments/recover"]);
  assert.equal(server.observedUrls.some((url) => url.includes(OWNER_PHONE)), false);
  assert.equal(server.observedUrls.some((url) => url.includes(OWNER_TOKEN)), false);
});