#!/usr/bin/env tsx

/**
 * Handshake Regtest Integration Test
 * Run: npx tsx scripts/regtest-integration.ts
 */

import hsd from 'hsd';
const { KeyRing, Script, Address } = hsd;
import sha3 from 'bcrypto/lib/sha3';
import HandshakeChain from '../lib/handshakeChain';
import AbstractHandshakeNetwork from '../lib/network/abstractHandshakeNetwork';
import { HandshakeUtxo } from '../lib/types';
import { RosenTokens, TokenMap } from '@rosen-bridge/tokens';

const NETWORK = 'regtest';
const NODE_URL = 'http://127.0.0.1:14037';
const WALLET_URL = 'http://127.0.0.1:14039';
const WALLET_ID = 'primary';
const API_KEY = 'api-key';

// Simple HTTP client
const nodeRequest = async (method: string, params: any[] = []) => {
  const response = await fetch(NODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`x:${API_KEY}`).toString('base64')}`,
    },
    body: JSON.stringify({ method, params, id: 1 }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
};

const nodeHttpRequest = async (endpoint: string) => {
  const response = await fetch(`${NODE_URL}${endpoint}`, {
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
      'Authorization': `Basic ${Buffer.from(`x:${API_KEY}`).toString('base64')}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
};

// Mock network implementation
class RegtestNetwork extends AbstractHandshakeNetwork {
  async getAddressBoxes(
    address: string,
    offset: number,
    limit: number,
  ): Promise<HandshakeUtxo[]> {
    const addr = Address.fromString(address);
    const regtestAddress = addr.toString('regtest');
    const coins = await nodeHttpRequest(`/coin/address/${regtestAddress}`);

    const boxes: HandshakeUtxo[] = coins
      .filter((coin: any) => coin.covenant.type === 0)
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
    console.log(`    Full TX hex: ${txHex}`);
    try {
      const result = await nodeRequest('sendrawtransaction', [txHex]);
      console.log(`    sendrawtransaction result: ${result}`);
    } catch (e) {
      console.error(`    sendrawtransaction error: ${e}`);
      throw e;
    }
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
    const addr = Address.fromString(address);
    const regtestAddress = addr.toString('regtest');
    const coins = await nodeHttpRequest(`/coin/address/${regtestAddress}`);

    const totalBalance = coins
      .filter((coin: any) => coin.covenant.type === 0)
      .reduce((sum: bigint, coin: any) => sum + BigInt(coin.value), 0n);

    return {
      nativeToken: totalBalance,
      tokens: [],
    };
  }
}

(async () => {
  try {
    console.log('=== Handshake HandshakeChain Integration Test ===\n');

    // Step 1: Create TSS aggregated key (simulated with single key for testing)
    console.log('Step 1: Creating TSS lock address...');

    // In production, this would be the aggregated public key from TSS ceremony
    // For testing, we use a single key to simulate the aggregated key
    const aggregatedKey = KeyRing.generate();
    const aggregatedPubKey = aggregatedKey.getPublicKey();

    console.log(`  Aggregated Public Key: ${aggregatedPubKey.toString('hex')}`);

    // Create P2WPKH script for the aggregated public key
    const lockScript = Script.fromPubkeyhash(aggregatedKey.getKeyHash());

    // Create P2WPKH address
    const lockAddr = Address.fromHash(aggregatedKey.getKeyHash(), 0); // version 0 = P2WPKH
    console.log(`  Lock Address (regtest): ${lockAddr.toString(NETWORK)}`);

    // Step 2: Fund lock address
    console.log('\nStep 2: Funding lock address (100 HNS)...');
    const fundTx = await walletRequest('POST', `/wallet/${WALLET_ID}/send`, {
      outputs: [{
        address: lockAddr.toString(NETWORK),
        value: 100000000,
      }],
    });
    console.log(`  Funding TX: ${fundTx.hash}`);

    // Step 3: Mine and verify
    console.log('\nStep 3: Mining block...');
    await nodeRequest('generate', [1]);

    const txInfo = await nodeRequest('getrawtransaction', [fundTx.hash, true]);
    let vout = -1;
    let value = 0;
    for (let i = 0; i < txInfo.vout.length; i++) {
      if (txInfo.vout[i].address.string === lockAddr.toString(NETWORK)) {
        vout = i;
        value = Math.floor(txInfo.vout[i].value * 1000000);
        break;
      }
    }
    console.log(`  Confirmed UTXO: ${fundTx.hash}:${vout}`);
    console.log(`  Value: ${value} dollarydoos`);

    // Step 4: Initialize HandshakeChain
    console.log('\nStep 4: Initializing HandshakeChain...');
    const network = new RegtestNetwork();

    const tokenMapConfig: RosenTokens = [{
      handshake: {
        tokenId: 'hns',
        name: 'HNS',
        decimals: 6,
        type: 'native',
        residency: 'native',
        extra: {},
      },
    }];

    const tokenMap = new TokenMap();
    await tokenMap.updateConfigByJson(tokenMapConfig);

    // Signing function - simulates TSS signing with aggregated key
    const signFunction = async (txHash: Uint8Array) => {
      console.log(`  Signing transaction hash with aggregated key...`);
      // In production, this would be a TSS signing ceremony
      // For testing, we sign with the single key that represents the aggregated key
      const sig = aggregatedKey.sign(Buffer.from(txHash));
      return {
        signature: sig.toString('hex'),
        signatureRecovery: '00',
      };
    };

    const mediator = {
      sign: signFunction,
      isInSign: async () => false,
    };

    const chain = new HandshakeChain(
      network,
      {
        addresses: {
          lock: lockAddr.toString('main'), // Use mainnet format for extractor
          cold: lockAddr.toString('main'),
          lock_public_key: aggregatedPubKey.toString('hex'),
        },
        aggregatedPublicKey: aggregatedPubKey.toString('hex'),
        txFeeSlippage: 10, // 10% tolerance for fee verification
        fee: 1000n,
        confirmations: {
          observation: 1,
          payment: 1,
          cold: 1,
          manual: 1,
        },
        lockScript: lockScript.encode().toString('hex'),
        requiredSign: 1, // TSS produces single aggregated signature
        rwtId: 'test-rwt',
      },
      tokenMap,
      mediator,
    );

    console.log('  HandshakeChain initialized');

    // Step 5: Create payment order
    console.log('\nStep 5: Creating payment order...');
    const returnAddrRes = await walletRequest('POST', `/wallet/${WALLET_ID}/address`, { account: 'default' });
    const returnAddr = returnAddrRes.address;
    console.log(`  Return address: ${returnAddr}`);

    const order = [{
      address: returnAddr,
      assets: {
        nativeToken: 50000000n, // 50 HNS (leaving plenty for fees)
        tokens: [],
      },
    }];

    const boxes = [{
      txId: fundTx.hash,
      index: vout,
      value: BigInt(value),
    }];

    // Step 6: Generate transaction
    console.log('\nStep 6: Generating transaction with HandshakeChain...');
    const paymentTxs = await chain.generateMultipleTransactions(
      'test-event',
      'payment',
      order,
      [],
      [],
    );
    console.log(`  Generated ${paymentTxs.length} transaction(s)`);
    console.log(`  TX ID: ${paymentTxs[0].txId}`);

    // Step 7: Sign transaction
    console.log('\nStep 7: Signing transaction...');
    const signedTx = await chain.signTransaction(paymentTxs[0], 1);
    console.log('  Transaction signed');

    // Step 8: Submit transaction
    console.log('\nStep 8: Broadcasting transaction...');
    await chain.submitTransaction(signedTx);
    const txId = signedTx.txId;
    console.log(`  Submitted TX: ${txId}`);

    // Step 9: Check mempool and mine
    console.log('\nStep 9: Checking mempool...');
    const mempool = await nodeRequest('getrawmempool', []);
    console.log(`  Mempool TXs: ${mempool.length}`);
    console.log(`  Is our TX in mempool? ${mempool.includes(txId)}`);

    console.log('\nMining block...');
    await nodeRequest('generate', [1]);

    console.log('Checking if TX was mined...');
    const finalTx = await nodeRequest('getrawtransaction', [txId, true]);
    console.log(`  Confirmations: ${finalTx.confirmations}`);
    console.log(`  Block: ${finalTx.blockhash}`);

    console.log('\n✅ HANDSHAKECHAIN MULTISIG SPEND SUCCESSFUL!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR:', err.message || err);
    console.error(err.stack);
    process.exit(1);
  }
})();
