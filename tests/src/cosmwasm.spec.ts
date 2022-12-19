import { CosmWasmSigner, Link, testutils } from "@confio/relayer";
import { assert } from "@cosmjs/utils";
import anyTest, { TestFn } from "ava";
import { Order } from "cosmjs-types/ibc/core/channel/v1/channel";

const counter = {
  path: "../artifacts/ibc_counter-aarch64.wasm",
  instantiateArgs: { count: 0 },
};
const wasmdContracts = { counter };
const osmosisContracts = { counter };

interface TestContext {
  wasmdClient: CosmWasmSigner;
  wasmdContractAddresses: { [K in keyof typeof wasmdContracts]: string };

  osmosisClient: CosmWasmSigner;
  osmosisContractAddresses: { [K in keyof typeof osmosisContracts]: string };

  link: Link;
  channelIds: {
    wasmd: string;
    osmosis: string;
  };
}

const test = anyTest as TestFn<TestContext>;

const { osmosis: oldOsmo, setup, wasmd } = testutils;
const osmosis = { ...oldOsmo, minFee: "0.025uosmo" };

import { IbcVersion, initClient, setupContracts } from "./utils";

test.before(async (t) => {
  t.log("Upload & instantiate contracts on wasmd...");
  const wasmdClient = await initClient("wasmd");
  const wasmdContractAddresses = await setupContracts(
    wasmdClient,
    wasmdContracts
  );
  t.log({ wasmdContractAddresses });
  t.truthy(wasmdContractAddresses.counter);
  const { ibcPortId: wasmdPort } = await wasmdClient.sign.getContract(
    wasmdContractAddresses.counter
  );
  t.log({ wasmdPort });
  assert(wasmdPort);

  t.log("Upload & instantiate contracts on osmosis...");
  const osmosisClient = await initClient("osmosis");
  const osmosisContractAddresses = await setupContracts(
    osmosisClient,
    osmosisContracts
  );
  t.log({ osmosisContractAddresses });
  t.truthy(osmosisContractAddresses.counter);
  const { ibcPortId: osmosisPort } = await osmosisClient.sign.getContract(
    osmosisContractAddresses.counter
  );
  t.log({ osmosisPort });
  assert(osmosisPort);

  // create a connection and channel between wasmd chain and osmosis chain
  const [src, dest] = await setup(wasmd, osmosis);
  const link = await Link.createWithNewConnections(src, dest);
  const channelInfo = await link.createChannel(
    "A",
    wasmdPort,
    osmosisPort,
    Order.ORDER_UNORDERED,
    IbcVersion
  );

  const channelIds = {
    wasmd: channelInfo.src.channelId,
    osmosis: channelInfo.src.channelId,
  };

  t.context = {
    wasmdClient,
    wasmdContractAddresses,
    osmosisContractAddresses,
    osmosisClient,
    link,
    channelIds,
  };
});

test.serial(
  "increment wasmd counter; check that both are incremented",
  async (t) => {
    const {
      osmosisClient,
      wasmdClient,
      wasmdContractAddresses: { counter: wasmdCounter },
      osmosisContractAddresses: { counter: osmosisCounter },
      link,
    } = t.context;

    // Increment wasmd counter
    const wasmdIncrement = await wasmdClient.sign.execute(
      wasmdClient.senderAddress,
      wasmdCounter,
      {
        increment: {},
      },
      "auto"
    );
    t.log({ wasmdIncrement });

    let wasmdGetCount = await wasmdClient.sign.queryContractSmart(
      wasmdCounter,
      { get_count: {} }
    );
    t.log({ wasmdGetCount });
    t.is(wasmdGetCount.count, 1);

    // message has not yet been relayed to Osmosis, so counter there is still 0
    let osmosisGetCount = await osmosisClient.sign.queryContractSmart(
      osmosisCounter,
      { get_count: {} }
    );
    t.log({ osmosisGetCount });
    t.is(osmosisGetCount.count, 0);

    // now relay the message to Osmosis
    await link.relayAll();

    // wasmd value should stay unchanged
    wasmdGetCount = await wasmdClient.sign.queryContractSmart(wasmdCounter, {
      get_count: {},
    });
    t.log({ wasmdGetCount });
    t.is(wasmdGetCount.count, 1);

    // osmosis value should now match
    osmosisGetCount = await osmosisClient.sign.queryContractSmart(
      osmosisCounter,
      { get_count: {} }
    );
    t.log({ osmosisGetCount });
    t.is(osmosisGetCount.count, 1);
  }
);
