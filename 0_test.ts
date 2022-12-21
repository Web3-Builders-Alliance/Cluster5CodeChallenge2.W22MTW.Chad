import { AxelarAssetTransfer, AxelarQueryAPI, Environment, CHAINS, AxelarGMPRecoveryAPI, GMPStatusResponse } from "@axelar-network/axelarjs-sdk";

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

const mnemonic = "stick rhythm rabbit slot message spring school major benefit practice beyond pig";


async function setupClient(mnemonic: string, rpc: string, gas: string | undefined): Promise<SigningCosmWasmClient> {
    if (gas === undefined) {
        let wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'osmo' });
        let client = await SigningCosmWasmClient.connectWithSigner(rpc, wallet);

        return client;
    } else {
        let gas_price = GasPrice.fromString(gas);
        let wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'osmo' });
        let client = await SigningCosmWasmClient.connectWithSigner(rpc, wallet, { gasPrice: gas_price });
        return client;
    }
}

async function getAddress(mnemonic: string, prefix: string = 'osmo') {
    let wallet = await Secp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
    let accounts = await wallet.getAccounts();
    return accounts[0].address;
}


describe("Axelar-js tests", () => {
    xit("Generate Wallet", async () => {
        let wallet = await Secp256k1HdWallet.generate(12);
        console.log(wallet.mnemonic);
    });

    xit("gets deposit address", async () => {
        let address = await getAddress(mnemonic);

    });

});