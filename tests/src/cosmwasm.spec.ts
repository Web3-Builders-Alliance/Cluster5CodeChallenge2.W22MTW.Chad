import { CosmWasmSigner, Link, testutils } from "@confio/relayer";
import { fromBase64, fromUtf8 } from "@cosmjs/encoding";
import { assert } from "@cosmjs/utils";
import anyTest, { TestFn } from "ava";
import { Order } from "cosmjs-types/ibc/core/channel/v1/channel";

const counter = {
  path: "../artifacts/ibc_counter-aarch64.wasm",
  instantiateArgs: { count: 0 },
}
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

const test = anyTest as TestFn<TestContext>

const { osmosis: oldOsmo, setup, wasmd } = testutils;
const osmosis = { ...oldOsmo, minFee: "0.025uosmo" };

import {
  IbcVersion,
  initClient,
  setupContracts,
} from "./utils";

test.before(async (t) => {
  console.debug("Upload & instantiate contracts on wasmd...");
  const wasmdClient = await initClient('wasmd');
  const wasmdContractAddresses = await setupContracts(wasmdClient, wasmdContracts);
  t.truthy(wasmdContractAddresses.counter);
  const { ibcPortId: wasmdPort } = await wasmdClient.sign.getContract(
    wasmdContractAddresses.counter
  );
  t.log({ wasmdPort });
  assert(wasmdPort);

  console.debug("Upload & instantiate contracts on osmosis...");
  const osmosisClient = await initClient('osmosis');
  const osmosisContractAddresses = await setupContracts(osmosisClient, osmosisContracts);
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
})

test.serial("query remote chain", async (t) => {
  const {
    // osmosisClient,
    wasmdClient,
    wasmdContractAddresses: { counter: wasmdCounter },
    // osmosisContractAddresses: { counter: osmosisCounter },
    link,
    channelIds,
  } = t.context;

  // Use IBC queries to query info from the remote contract
  const ibcQuery = await wasmdClient.sign.execute(
    wasmdClient.senderAddress,
    wasmdCounter,
    {
      increment: {},
    },
    "auto"
  );
  console.log({ ibcQuery });

  // relay this over
  const info = await link.relayAll();
  console.log(info);
  console.log(fromUtf8(info.acksFromB[0].acknowledgement));

  const latest_query_result = await wasmdClient.sign.queryContractSmart(wasmdCounter, {
    latest_query_result: {
      channel_id: channelIds.wasmd,
    },
  });

  console.log({ latest_query_result });
  t.truthy(latest_query_result);

  //get all ack data
  const ack_data = JSON.parse(
    fromUtf8(fromBase64(latest_query_result.response.acknowledgement.data))
  );
  console.log({ ack_data });
  //get all ack results
  const ack_data_results = JSON.parse(fromUtf8(fromBase64(ack_data.result)));
  console.log({ ack_data_results });
  //just grab the first result
  const ok = JSON.parse(fromUtf8(fromBase64(ack_data_results.results[0])));
  console.log({ ok });
  //the first result is OK so print it out.
  console.log('ok.ok:', JSON.parse(fromUtf8(fromBase64(ok.ok))));
});
