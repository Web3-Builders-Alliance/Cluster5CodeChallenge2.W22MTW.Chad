import {
  AxelarAssetTransfer, AxelarQueryAPI, Environment, CHAINS, AxelarGMPRecoveryAPI, GMPStatusResponse } from "@axelar-network/axelarjs-sdk";
import { SigningCosmWasmClient, Secp256k1HdWallet, GasPrice } from "cosmwasm";

const osmoRpc = "https://rpc-test.osmosis.zone";

const axelarAssetTransfer = new AxelarAssetTransfer({
    environment: Environment.TESTNET,
    auth: "metamask"
});
const axelarQuery = new AxelarQueryAPI({
    environment: Environment.TESTNET,
});
const recoveryApi = new AxelarGMPRecoveryAPI({
    environment: Environment.TESTNET,
});

const mnemonic = "volcano sure feed scrub fence close fetch link race cart rude cost";

async function setupClient(mnemonic: string, rpc: string): Promise<SigningCosmWasmClient> {
  let wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'osmo' });
  return await SigningCosmWasmClient.connectWithSigner(rpc, wallet);
}

async function getAddress(mnemonic: string, prefix: string = 'osmo') {
  let wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  let accounts = await wallet.getAccounts();
  return accounts[0].address;
}


describe("Axelar-js tests", () => {
  it("gets deposit address", async () => {
    const address = await getAddress(mnemonic);
    let client = await setupClient(mnemonic, osmoRpc);
    let balance = await client.getBalance(address, "uausdc");
    console.log({ address, balance } );
  });
});
