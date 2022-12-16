import { PathLike, readFileSync } from "node:fs";

import {
  AckWithMetadata,
  CosmWasmSigner,
  RelayInfo,
  testutils,
} from "@confio/relayer";
import { fromBase64, fromUtf8 } from "@cosmjs/encoding";
import { assert } from "@cosmjs/utils";

const {
  fundAccount,
  generateMnemonic,
  osmosis: oldOsmo,
  signingCosmWasmClient,
  wasmd,
} = testutils;

const chains = {
  wasmd,
  osmosis: { ...oldOsmo, minFee: "0.025uosmo" },
};

export const IbcVersion = "counter-1";

interface ContractInfo {
  path: PathLike;
  instantiateArgs: Record<string, unknown>;
}

/**
 * Upload wasm bytes and instantiate contract.
 *
 * Takes a CosmWasmSigner and an object mapping contract names to {@link
 * ContractInfo}, returns a matching object with keys now pointing at contract
 * addresses.
 */
export async function setupContracts<T extends Record<string, ContractInfo>>(
  cosmwasm: CosmWasmSigner,
  contracts: T
): Promise<{ [K in keyof T]: string }> {
  const names: (keyof T)[] = Object.keys(contracts);
  return await names.reduce(
    async (results, nameRaw) => ({
      ...(await results),
      [nameRaw]: await (async () => {
        const name = String(nameRaw);
        const { path, instantiateArgs } = contracts[name];
        const wasm = readFileSync(path);
        const receipt = await cosmwasm.sign.upload(
          cosmwasm.senderAddress,
          wasm,
          "auto",
          `Upload ${name}`
        );
        const { contractAddress } = await cosmwasm.sign.instantiate(
          cosmwasm.senderAddress,
          receipt.codeId,
          instantiateArgs,
          name,
          "auto"
        );
        return contractAddress;
      })(),
    }),
    Promise.resolve({} as { [K in keyof T]: string })
  );
}

// This creates a client for the CosmWasm chain, that can interact with contracts
export async function initClient(
  chain: "wasmd" | "osmosis"
): Promise<CosmWasmSigner> {
  // create apps and fund an account
  const mnemonic = generateMnemonic();
  const cosmwasm = await signingCosmWasmClient(chains[chain], mnemonic);
  await fundAccount(chains[chain], cosmwasm.senderAddress, "4000000");
  return cosmwasm;
}

// throws error if not all are success
export function assertAckSuccess(acks: AckWithMetadata[]) {
  for (const ack of acks) {
    const parsed = JSON.parse(fromUtf8(ack.acknowledgement));
    if (parsed.error) {
      throw new Error(`Unexpected error in ack: ${parsed.error}`);
    }
    console.log(parsed);
    if (!parsed.result) {
      throw new Error(`Ack result unexpectedly empty`);
    }
  }
}

// throws error if not all are errors
export function assertAckErrors(acks: AckWithMetadata[]) {
  for (const ack of acks) {
    const parsed = JSON.parse(fromUtf8(ack.acknowledgement));
    if (parsed.result) {
      throw new Error(`Ack result unexpectedly set`);
    }
    if (!parsed.error) {
      throw new Error(`Ack error unexpectedly empty`);
    }
  }
}

export function assertPacketsFromA(
  relay: RelayInfo,
  count: number,
  success: boolean
) {
  if (relay.packetsFromA !== count) {
    throw new Error(`Expected ${count} packets, got ${relay.packetsFromA}`);
  }
  if (relay.acksFromB.length !== count) {
    throw new Error(`Expected ${count} acks, got ${relay.acksFromB.length}`);
  }
  if (success) {
    assertAckSuccess(relay.acksFromB);
  } else {
    assertAckErrors(relay.acksFromB);
  }
}

export function assertPacketsFromB(
  relay: RelayInfo,
  count: number,
  success: boolean
) {
  if (relay.packetsFromB !== count) {
    throw new Error(`Expected ${count} packets, got ${relay.packetsFromB}`);
  }
  if (relay.acksFromA.length !== count) {
    throw new Error(`Expected ${count} acks, got ${relay.acksFromA.length}`);
  }
  if (success) {
    assertAckSuccess(relay.acksFromA);
  } else {
    assertAckErrors(relay.acksFromA);
  }
}

export function parseAcknowledgementSuccess(ack: AckWithMetadata): unknown {
  const response = JSON.parse(fromUtf8(ack.acknowledgement));
  assert(response.result);
  return JSON.parse(fromUtf8(fromBase64(response.result)));
}
