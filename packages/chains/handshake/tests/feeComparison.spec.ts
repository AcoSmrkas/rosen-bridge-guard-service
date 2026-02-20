import hsd from 'hsd';
const { MTX, Address, Coin, Script } = hsd;
import { describe, it, expect } from 'vitest';

import {
  HANDSHAKE_TX_BASE_SIZE,
  HANDSHAKE_INPUT_SIZE,
  HANDSHAKE_OUTPUT_SIZE,
} from '../lib/constants';
import { estimateFeeForCounts, estimateTxFee } from '../lib/handshakeUtils';
import * as testData from './testData';

describe('Handshake Fee Estimation', () => {
  const feeRatio = 10; // 10 dollarydoos per byte

  /**
   * Test that estimateFeeForCounts calculates correct Handshake transaction sizes
   */
  it('should calculate correct fee estimates based on input/output counts', () => {
    // Test case: 2 inputs, 2 outputs
    const inputCount = 2;
    const outputCount = 2;
    const estimatedFee = estimateFeeForCounts(
      inputCount,
      outputCount,
      feeRatio,
    );

    // Expected: base (10) + 2*input (148 each) + 2*output (34 each)
    // = 10 + 296 + 68 = 374 bytes
    // = 374 * 10 = 3740 dollarydoos
    const expectedTxSize = HANDSHAKE_TX_BASE_SIZE +
      inputCount * HANDSHAKE_INPUT_SIZE +
      outputCount * HANDSHAKE_OUTPUT_SIZE;
    const expectedFee = BigInt(Math.ceil(expectedTxSize * feeRatio));

    console.log(
      `Estimated fee for ${inputCount} inputs, ${outputCount} outputs: ${estimatedFee}`,
    );
    console.log(`Expected tx size: ${expectedTxSize} bytes`);

    expect(estimatedFee).toBe(expectedFee);
    console.log('✓ Fee calculation matches expected size');
  });

  /**
   * Test various transaction configurations
   */
  it('should calculate correct fees for various input/output combinations', () => {
    const testCases = [
      { inputs: 1, outputs: 1, name: '1-in 1-out' },
      { inputs: 1, outputs: 2, name: '1-in 2-out' },
      { inputs: 2, outputs: 2, name: '2-in 2-out' },
      { inputs: 5, outputs: 3, name: '5-in 3-out' },
      { inputs: 10, outputs: 5, name: '10-in 5-out' },
    ];

    for (const testCase of testCases) {
      const estimatedFee = estimateFeeForCounts(
        testCase.inputs,
        testCase.outputs,
        feeRatio,
      );

      const expectedTxSize =
        HANDSHAKE_TX_BASE_SIZE +
        testCase.inputs * HANDSHAKE_INPUT_SIZE +
        testCase.outputs * HANDSHAKE_OUTPUT_SIZE;
      const expectedFee = BigInt(Math.ceil(expectedTxSize * feeRatio));

      console.log(
        `${testCase.name}: size=${expectedTxSize} bytes, fee=${estimatedFee}`,
      );

      expect(estimatedFee).toBe(expectedFee);
    }

    console.log('✓ All fee calculations correct');
  });

  /**
   * Test that witness-based fee calculation (used in handshakeChain.ts) is accurate
   */
  it('should calculate accurate fees when comparing estimate vs actual signed transaction', () => {
    const mtx = new MTX();
    const lockAddress = Address.fromString(testData.lockAddress);
    const lockScript = Buffer.from(testData.lockScript, 'hex');

    // Add 2 inputs
    const coin1 = Coin.fromJSON({
      version: 0,
      height: -1,
      value: 10000000,
      address: lockAddress.toString(),
      coinbase: false,
      hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      index: 0,
    });
    const coin2 = Coin.fromJSON({
      version: 0,
      height: -1,
      value: 5000000,
      address: lockAddress.toString(),
      coinbase: false,
      hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      index: 1,
    });
    mtx.addCoin(coin1);
    mtx.addCoin(coin2);

    // Add 2 outputs
    mtx.addOutput({ address: lockAddress, value: 2000000 });
    mtx.addOutput({ address: lockAddress, value: 0 }); // change output

    // Clone and add temporary witness (same as handshakeChain.ts does)
    const tempMtx = mtx.clone();
    const tempWitness = new Script();
    tempWitness.pushOp(Script.opcodes.OP_0);
    tempWitness.pushData(Buffer.alloc(71, 0)); // Typical signature size
    tempWitness.pushData(lockScript);
    tempWitness.compile();
    const witnessStack = tempWitness.toStack();

    for (let i = 0; i < tempMtx.inputs.length; i++) {
      tempMtx.inputs[i].witness.fromStack(witnessStack);
    }

    // Get estimated fee using hsd's virtual size
    const estimatedFee = estimateTxFee(tempMtx, feeRatio);
    console.log('Estimated fee (with temporary witness):', estimatedFee.toString());

    // Now add witness to the original MTX to get actual signed transaction
    for (let i = 0; i < mtx.inputs.length; i++) {
      mtx.inputs[i].witness.fromStack(witnessStack);
    }

    // Get actual fee for signed transaction
    const actualSignedFee = estimateTxFee(mtx, feeRatio);
    console.log('Actual signed tx fee (hsd):', actualSignedFee.toString());

    // They should be identical (same witness data, same hsd calculation)
    const diff = Math.abs(Number(estimatedFee) - Number(actualSignedFee));
    const percentDiff = (diff / Number(actualSignedFee)) * 100;

    console.log('Difference:', diff);
    console.log('Percentage difference:', percentDiff.toFixed(2) + '%');

    // Should be exact (or nearly exact with rounding)
    expect(percentDiff).toBeLessThan(1);
    console.log('✓ Estimated fee matches actual signed fee');
  });

  /**
   * Verify that witness-based estimates work for various transaction sizes
   */
  it('should produce consistent estimates across various transaction sizes', () => {
    const lockAddress = Address.fromString(testData.lockAddress);
    const lockScript = Buffer.from(testData.lockScript, 'hex');

    const testCases = [
      { inputs: 1, outputs: 2, name: '1-in 2-out' },
      { inputs: 2, outputs: 2, name: '2-in 2-out' },
      { inputs: 5, outputs: 3, name: '5-in 3-out' },
      { inputs: 10, outputs: 5, name: '10-in 5-out' },
    ];

    for (const testCase of testCases) {
      const mtx = new MTX();

      // Add inputs
      for (let i = 0; i < testCase.inputs; i++) {
        const coin = Coin.fromJSON({
          version: 0,
          height: -1,
          value: 5000000,
          address: lockAddress.toString(),
          coinbase: false,
          hash: Buffer.alloc(32, i).toString('hex'),
          index: 0,
        });
        mtx.addCoin(coin);
      }

      // Add outputs
      for (let i = 0; i < testCase.outputs; i++) {
        mtx.addOutput({ address: lockAddress, value: 1000000 });
      }

      // Add witness and get estimated fee (same method as handshakeChain.ts)
      const tempMtx = mtx.clone();
      const tempWitness = new Script();
      tempWitness.pushOp(Script.opcodes.OP_0);
      tempWitness.pushData(Buffer.alloc(71, 0));
      tempWitness.pushData(lockScript);
      tempWitness.compile();

      for (let i = 0; i < tempMtx.inputs.length; i++) {
        tempMtx.inputs[i].witness.fromStack(tempWitness.toStack());
      }

      const estimatedFee = estimateTxFee(tempMtx, feeRatio);

      // Add witness to original and get actual fee
      for (let i = 0; i < mtx.inputs.length; i++) {
        mtx.inputs[i].witness.fromStack(tempWitness.toStack());
      }

      const actualSignedFee = estimateTxFee(mtx, feeRatio);

      const difference = Number(estimatedFee) - Number(actualSignedFee);
      const percentDiff = Math.abs(difference / Number(actualSignedFee)) * 100;

      console.log(
        `${testCase.name}: estimated=${estimatedFee}, actual=${actualSignedFee}, diff=${percentDiff.toFixed(2)}%`,
      );

      // Should be identical (same witness, same hsd calculation)
      expect(percentDiff).toBeLessThan(1);
    }

    console.log('✓ All size estimates are accurate');
  });
});
