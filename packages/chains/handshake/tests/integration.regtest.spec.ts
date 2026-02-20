import { describe, it, beforeAll, expect } from 'vitest';
import hsd from 'hsd';
const { MTX, Address, Script, KeyRing } = hsd;
import sha3 from 'bcrypto/lib/sha3';

import HandshakeChain from '../lib/handshakeChain';
import { RosenTokens, TokenMap } from '@rosen-bridge/tokens';
import { PaymentOrder } from '@rosen-chains/abstract-chain';
import AbstractHandshakeNetwork from '../lib/network/abstractHandshakeNetwork';
import { HandshakeUtxo } from '../lib/types';

const NETWORK = 'regtest';
const NODE_RPC_URL = 'http://127.0.0.1:14037';
const NODE_HTTP_URL = 'http://127.0.0.1:14037'; // HTTP API for /coin endpoints (same port)
const WALLET_URL = 'http://127.0.0.1:14039';
const WALLET_ID = 'primary';
const API_KEY = 'api-key';

// Simple HTTP client
const nodeRequest = async (method: string, params: any[] = []) => {
  const response = await fetch(NODE_RPC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`x:${API_KEY}`).toString('base64')}`,
    },
    body: JSON.stringify({
      method,
      params,
      id: 1,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
};

const nodeHttpRequest = async (endpoint: string) => {
  const response = await fetch(`${NODE_HTTP_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
  });
  return response.json();
};

const walletRequest = async (method: string, endpoint: string, body?: any) => {
  const response = await fetch(`${WALLET_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`x:${API_KEY}`).toString('base64')}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return data;
};

// Mock network implementation for regtest
class RegtestHandshakeNetwork extends AbstractHandshakeNetwork {
  async getAddressBoxes(
    address: string,
    offset: number,
    limit: number,
  ): Promise<HandshakeUtxo[]> {
    // Convert mainnet address to regtest format
    const addr = Address.fromString(address);
    const regtestAddress = addr.toString('regtest');

    // Get UTXOs from HTTP API (like HandshakeRpcNetwork does)
    const coins = await nodeHttpRequest(`/coin/address/${regtestAddress}`);

    const boxes: HandshakeUtxo[] = coins
      .filter((coin: any) => coin.covenant.type === 0) // Only regular coins
      .map((coin: any) => ({
        txId: coin.hash,
        index: coin.index,
        value: BigInt(coin.value), // coin.value is already in dollarydoos (smallest unit)
      }));

    return boxes.slice(offset, offset + limit);
  }

  async getHeight(): Promise<number> {
    const info = await nodeRequest('getblockchaininfo');
    return info.blocks;
  }

  async getTxConfirmation(txId: string): Promise<number> {
    try {
      const tx = await nodeRequest('getrawtransaction', [txId, true]);
      return tx.confirmations || 0;
    } catch {
      return -1;
    }
  }

  async getBlockInfo(blockId: string): Promise<any> {
    return nodeRequest('getblock', [blockId]);
  }

  async submitTransaction(tx: any): Promise<void> {
    const txHex = tx.toRaw().toString('hex');
    await nodeRequest('sendrawtransaction', [txHex]);
  }

  async getBlockTransactionIds(blockId: string): Promise<string[]> {
    const block = await this.getBlockInfo(blockId);
    return block.tx;
  }

  async getTransaction(txId: string, blockId: string): Promise<Uint8Array> {
    const txHex = await nodeRequest('getrawtransaction', [txId, false]);
    return Buffer.from(txHex, 'hex');
  }

  async getFeeRatio(): Promise<number> {
    try {
      const feeRate = await nodeRequest('estimatefee', [1]); // 1 block target

      // estimatefee returns -1 if it can't estimate (regtest has no historical data)
      if (feeRate === -1 || feeRate <= 0) {
        // Use minimum relay fee as fallback
        const networkInfo = await nodeRequest('getnetworkinfo', []);
        const minRelayFee = networkInfo.relayfee; // HNS/KB
        const minFeePerByte = Math.ceil((minRelayFee * 1000000) / 1024);
        console.log(`estimatefee returned -1, using minimum relay fee: ${minRelayFee} HNS/KB = ${minFeePerByte} dollarydoos/byte`);
        return minFeePerByte;
      }

      // Convert from HNS/KB to dollarydoos/byte
      const feeDollarydoos = feeRate * 1000000; // HNS to dollarydoos
      const feePerByte = feeDollarydoos / 1024; // per KB to per byte
      console.log(`estimatefee returned ${feeRate} HNS/KB = ${Math.ceil(feePerByte)} dollarydoos/byte`);
      return Math.ceil(feePerByte);
    } catch (e) {
      // Last resort fallback (should not happen)
      console.warn('getFeeRatio failed, using fallback 1:', e);
      return 1;
    }
  }

  async getAddressAssets(address: string): Promise<{ nativeToken: bigint; tokens: any[] }> {
    // Convert mainnet address to regtest format
    const addr = Address.fromString(address);
    const regtestAddress = addr.toString('regtest');

    // Get balance from HTTP API
    const coins = await nodeHttpRequest(`/coin/address/${regtestAddress}`);

    const totalBalance = coins
      .filter((coin: any) => coin.covenant.type === 0) // Only regular coins
      .reduce((sum: bigint, coin: any) => sum + BigInt(coin.value), 0n);

    return {
      nativeToken: totalBalance,
      tokens: [],
    };
  }
}

describe('Handshake Regtest Integration', () => {
  let chain: HandshakeChain;
  let multisigAddr: Address;
  let multisigScript: Script;
  let keys: KeyRing[];
  let fundingTxId: string;
  let fundingVout: number;
  let fundingValue: bigint;

  beforeAll(async () => {
    // Setup: Create 3-of-5 multisig
    console.log('\n=== Setting up 3-of-5 Multisig ===');
    keys = [];
    for (let i = 0; i < 5; i++) {
      keys.push(KeyRing.generate());
    }

    multisigScript = new Script();
    multisigScript.pushSmall(3); // m=3
    for (const key of keys) {
      multisigScript.pushData(key.getPublicKey());
    }
    multisigScript.pushSmall(5); // n=5
    multisigScript.pushOp(Script.opcodes.OP_CHECKMULTISIG);
    multisigScript.compile();

    const scriptHash = sha3.digest(multisigScript.encode());
    multisigAddr = Address.fromHash(scriptHash, 0); // P2WSH
    console.log(`Multisig Address (regtest): ${multisigAddr.toString(NETWORK)}`);
    console.log(`Multisig Address (mainnet for extractor): ${multisigAddr.toString('main')}`);

    // Fund the multisig
    console.log('\nFunding multisig with 100 HNS...');
    const fundTx = await walletRequest('POST', `/wallet/${WALLET_ID}/send`, {
      outputs: [
        {
          address: multisigAddr.toString(NETWORK),
          value: 100000000, // 100 HNS
        },
      ],
    });
    fundingTxId = fundTx.hash;
    console.log(`Funding TX: ${fundingTxId}`);

    // Mine block
    console.log('Mining block...');
    await nodeRequest('generate', [1]);

    // Find the output
    const txInfo = await nodeRequest('getrawtransaction', [fundingTxId, true]);
    for (let i = 0; i < txInfo.vout.length; i++) {
      const out = txInfo.vout[i];
      if (out.address.string === multisigAddr.toString(NETWORK)) {
        fundingVout = i;
        fundingValue = BigInt(Math.floor(out.value * 1000000));
        break;
      }
    }

    console.log(`Found UTXO: ${fundingTxId}:${fundingVout}`);
    console.log(`Value: ${fundingValue} dollarydoos`);

    // Create HandshakeChain instance
    const network = new RegtestHandshakeNetwork();

    const tokenMapConfig: RosenTokens = [
      {
        handshake: {
          tokenId: 'hns',
          name: 'HNS',
          decimals: 6,
          type: 'native',
          residency: 'native',
          extra: {},
        },
      },
    ];

    const tokenMap = new TokenMap();
    await tokenMap.updateConfigByJson(tokenMapConfig);

    // Signing function - generates 3 signatures for 3-of-5 multisig
    const signFunction = async (txHash: Uint8Array) => {
      console.log(`\nSigning transaction hash with 3 keys...`);
      const sigs = [];
      for (let i = 0; i < 3; i++) {
        const sig = keys[i].sign(Buffer.from(txHash));
        sigs.push(sig.toString('hex'));
      }
      // Return all 3 signatures concatenated with a separator
      return {
        signature: sigs.join(':'),
        signatureRecovery: '00',
      };
    };

    chain = new HandshakeChain(
      network,
      {
        addresses: {
          lock: multisigAddr.toString('main'), // Use mainnet format for extractor
          cold: multisigAddr.toString('main'),
          lock_public_key: keys[0].getPublicKey().toString('hex'),
        },
        fee: 1000n,
        confirmations: {
          observation: 1,
          payment: 1,
          cold: 1,
          manual: 1,
        },
        lockScript: multisigScript.encode().toString('hex'),
        requiredSign: 3,
      },
      tokenMap,
      signFunction,
    );

    console.log('\n=== HandshakeChain initialized ===\n');
  }, 60000);

  it('should spend from multisig using HandshakeChain', async () => {
    // Get a return address from wallet
    const returnAddrRes = await walletRequest(
      'POST',
      `/wallet/${WALLET_ID}/address`,
      { account: 'default' },
    );
    const returnAddr = returnAddrRes.address;
    console.log(`Return address: ${returnAddr}`);

    // Create payment order
    const order: PaymentOrder = [
      {
        address: returnAddr,
        assets: {
          nativeToken: 50000000n, // 50 HNS (leaving plenty for fees)
          tokens: [],
        },
      },
    ];

    // Get available UTXOs
    const boxes: HandshakeUtxo[] = [
      {
        txId: fundingTxId,
        index: fundingVout,
        value: fundingValue,
      },
    ];

    console.log('\n=== Generating transaction with HandshakeChain ===');
    const paymentTxs = await chain.generateMultipleTransactions(
      'test-event-1',
      'payment',
      order,
      [],
      [], // No serialized signed transactions for first call
    );

    expect(paymentTxs).toHaveLength(1);
    console.log(`Generated ${paymentTxs.length} transaction(s)`);

    // Extract the transaction
    const paymentTx = paymentTxs[0];
    console.log(`TX ID: ${paymentTx.txId}`);
    console.log(`TX Type: ${paymentTx.txType}`);

    // Sign the transaction
    console.log('\n=== Signing transaction ===');
    const signedTx = await chain.signTransaction(paymentTx, 3);
    console.log('Transaction signed successfully');

    // Submit transaction
    console.log('\n=== Broadcasting transaction ===');
    const txId = await chain.submitTransaction(signedTx);
    console.log(`Submitted TX: ${txId}`);

    // Mine block
    console.log('\nMining block to confirm...');
    await nodeRequest('generate', [1]);

    // Verify confirmation
    const txInfo = await nodeRequest('getrawtransaction', [txId, true]);
    expect(txInfo.confirmations).toBeGreaterThan(0);
    console.log(`\n✅ Transaction confirmed in block: ${txInfo.blockhash}`);
    console.log(`Confirmations: ${txInfo.confirmations}`);

    // Verify the output
    const outputs = txInfo.vout;
    let foundOutput = false;
    for (const out of outputs) {
      if (out.address && out.address.string === returnAddr) {
        foundOutput = true;
        const receivedValue = Math.floor(out.value * 1000000);
        console.log(`Received ${receivedValue} dollarydoos at ${returnAddr}`);
        expect(receivedValue).toBeGreaterThan(49000000); // Should be ~50 HNS minus fee
      }
    }
    expect(foundOutput).toBe(true);

    console.log('\n✅ HANDSHAKECHAIN MULTISIG SPEND SUCCESSFUL!\n');
  }, 60000);
});
