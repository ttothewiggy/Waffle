import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseTransport } from "../lib/cloud/transport";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncErrorMessage } from "../lib/cloud/errors";
function transport(manifest: unknown) {
  return new SupabaseTransport(
    {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { revision: 1, manifest },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient,
    "test",
  );
}
test("the formatting edition reads both deployed legacy journals and new formatted journals", async () => {
  for (const version of [1, 2]) {
    const remote = await transport({ version, entries: [], trash: [] }).read();
    assert.equal(remote?.manifest.version, version);
  }
});
test("unsupported cloud versions stop safely and explain how to update the device", async () => {
  await assert.rejects(
    transport({ version: 3, entries: [], trash: [] }).read(),
    (error) => {
      const message = syncErrorMessage(error);
      assert.match(message, /Update Waffle/);
      assert.match(message, /device copy has not been changed/);
      return true;
    },
  );
  await assert.rejects(transport(null).read(), /Update Waffle/);
});
