import { CosmWasmSigner, Link, testutils } from "@confio/relayer";
import { fromBase64, fromUtf8 } from "@cosmjs/encoding";
import { assert } from "@cosmjs/utils";
import anyTest, { TestFn } from "ava";
import { Order } from "cosmjs-types/ibc/core/channel/v1/channel";

const wasmdContracts = {
  counter: "../artifacts/ibc_counter-aarch64.wasm",
};

const osmosisContracts = {
  counter: "../artifacts/ibc_counter-aarch64.wasm",
};

interface TestContext {
  wasmdCodeIds: { [K in keyof typeof wasmdContracts]: number };
  osmosisCodeIds: { [K in keyof typeof osmosisContracts]: number };
  wasmdClient: CosmWasmSigner;
  osmosisClient: CosmWasmSigner;
  wasmdCounterAddress: string;
  osmosisCounterAddress: string;
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
  setupContracts,
  setupOsmosisClient,
  setupWasmClient,
} from "./utils";

test.before(async (t) => {
  console.debug("Upload & instantiate contracts on wasmd...");
  const wasmdClient = await setupWasmClient();
  const wasmdCodeIds = await setupContracts(wasmdClient, wasmdContracts);
  const { contractAddress: wasmdCounterAddress } = await wasmdClient.sign.instantiate(
    wasmdClient.senderAddress,
    wasmdCodeIds.counter,
    { count: 0 },
    "wasmd counter",
    "auto"
  );
  t.truthy(wasmdCounterAddress);
  const { ibcPortId: wasmdPort } = await wasmdClient.sign.getContract(
    wasmdCounterAddress
  );
  t.log({ wasmdPort });
  assert(wasmdPort);

  console.debug("Upload & instantiate contracts on osmosis...");
  const osmosisClient = await setupOsmosisClient();
  const osmosisCodeIds = await setupContracts(osmosisClient, osmosisContracts);
  const { contractAddress: osmosisCounterAddress } = await osmosisClient.sign.instantiate(
    osmosisClient.senderAddress,
    osmosisCodeIds.counter,
    { count: 0 },
    "osmosis counter",
    "auto"
  );
  t.truthy(osmosisCounterAddress);
  const { ibcPortId: osmosisPort } = await osmosisClient.sign.getContract(
    osmosisCounterAddress
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
    wasmdCodeIds,
    osmosisCodeIds,
    wasmdClient,
    osmosisClient,
    wasmdCounterAddress,
    osmosisCounterAddress,
    link,
    channelIds,
  };
})

test.serial("query remote chain", async (t) => {
  const {
    osmosisClient,
    wasmdClient,
    wasmdCounterAddress,
    link,
    channelIds,
  } = t.context;

  // Use IBC queries to query info from the remote contract
  const ibcQuery = await wasmdClient.sign.execute(
    wasmdClient.senderAddress,
    wasmQuerier,
    {
      ibc_query: {
        channel_id: channelIds.wasm,
        msgs: [
          {
            bank: {
              all_balances: {
                address: osmosisClient.senderAddress,
              },
            },
          },
        ],
        callback: wasmdCounterAddress,
      },
    },
    "auto"
  );
  console.log(ibcQuery);

  // relay this over
  const info = await link.relayAll();
  console.log(info);
  console.log(fromUtf8(info.acksFromB[0].acknowledgement));

  const result = await wasmdClient.sign.queryContractSmart(wasmQueryReceiver, {
    latest_query_result: {
      channel_id: channelIds.wasm,
    },
  });

  console.log(result);
  //get all ack data
  const ack_data = JSON.parse(
    fromUtf8(fromBase64(result.response.acknowledgement.data))
  );
  console.log(ack_data);
  //get all ack results
  const ack_data_results = JSON.parse(fromUtf8(fromBase64(ack_data.result)));
  console.log(ack_data_results);
  //just grab the first result
  const ok = JSON.parse(fromUtf8(fromBase64(ack_data_results.results[0])));
  console.log(ok);
  //the first result is OK so print it out.
  console.log(JSON.parse(fromUtf8(fromBase64(ok.ok))));
  t.truthy(result);
});
