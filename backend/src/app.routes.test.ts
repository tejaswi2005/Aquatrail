import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "./app.js";

test("health and protected subscription routes respond correctly", async () => {
  const server = createApp().listen(0);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), {
      success: true,
      message: "AquaTrail backend is running!",
    });

    const subscriptionsResponse = await fetch(
      `${baseUrl}/api/subscriptions/my`
    );
    assert.equal(subscriptionsResponse.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
