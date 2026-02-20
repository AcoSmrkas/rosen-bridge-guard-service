# Handshake Regtest Integration Testing

This guide explains how to run integration tests against a local Handshake regtest node.

## Prerequisites

1. **Install Handshake**
   ```bash
   npm install -g hsd hs-client
   ```

2. **Start Handshake Node in Regtest Mode**
   ```bash
   hsd \
     --network=regtest \
     --api-key=api-key \
     --index-address=true \
     --http-host=0.0.0.0
   ```

   Leave this running in a terminal.

3. **Create Wallet and Fund It** (in another terminal)
   ```bash
   # Create wallet
   hsw-cli --network=regtest --api-key=api-key rpc createwallet primary

   # Get an address
   ADDR=$(hsw-cli --network=regtest --api-key=api-key rpc getnewaddress)

   # Mine 200 blocks to that address (need 100 confirmations before spending)
   hsd-cli --network=regtest --api-key=api-key rpc generatetoaddress 200 $ADDR

   # Verify balance
   hsw-cli --network=regtest --api-key=api-key rpc getbalance
   ```

## Running the Tests

### Option 1: Vitest Integration Test

```bash
# Build the package first
npm run build

# Run the integration test
npm test -- integration.regtest.spec.ts
```

Note: The test is marked with `describe.skip` by default. Remove the `.skip` to enable it.

### Option 2: Standalone Script

```bash
# Build the package first
npm run build

# Run the standalone script
node scripts/regtest-integration.js
```

## What the Test Does

The integration test performs a complete multisig workflow using HandshakeChain:

1. **Setup**: Creates a 3-of-5 P2WSH multisig address
2. **Funding**: Sends 10 HNS to the multisig address using wallet API
3. **Mining**: Mines a block to confirm the funding transaction
4. **HandshakeChain Init**: Initializes HandshakeChain with:
   - Custom regtest network implementation
   - Token map with HNS
   - TSS signing function (simulates 3-of-5 signing)
5. **Transaction Generation**: Uses `generateMultipleTransactions()` to create a payment
6. **Signing**: Signs the transaction using the TSS function
7. **Verification**: Verifies the signature
8. **Broadcasting**: Submits the transaction to the network
9. **Confirmation**: Mines a block and verifies the transaction is confirmed

## Network Implementation

The regtest network implementation (`RegtestHandshakeNetwork`) implements the `AbstractHandshakeNetwork` interface and communicates with the local regtest node via RPC.

Key methods:
- `getAddressBoxes()`: Fetches UTXOs for an address
- `submitTransaction()`: Broadcasts a signed transaction
- `getTxConfirmation()`: Gets confirmation count
- `getFeeRatio()`: Returns fee rate (hardcoded to 10 dollarydoos/byte for regtest)

## Signing Function

The signing function simulates a TSS setup by signing with the first 3 keys of the 5-key multisig:

```typescript
const signFunction = async (txHash: Uint8Array, requiredSign: number) => {
  const signatures: Buffer[] = [];
  for (let i = 0; i < 3; i++) {
    const sig = keys[i].sign(Buffer.from(txHash));
    const sigWithHashType = Buffer.concat([sig, Buffer.from([0x01])]);
    signatures.push(sigWithHashType);
  }
  return signatures.map(s => s.toString('hex'));
};
```

## Troubleshooting

### Connection Refused
- Make sure `hsd` is running with `--http-host=0.0.0.0`
- Verify the API key matches (`--api-key=api-key`)

### Insufficient Funds
- Mine more blocks: `hsd-cli rpc generate 100`
- Check wallet balance: `hsw-cli rpc getbalance`

### Transaction Rejected
- Check fee rate is sufficient
- Verify multisig script is correct
- Ensure all signatures are valid

## Expected Output

```
=== Handshake HandshakeChain Integration Test ===

Step 1: Creating 3-of-5 Multisig...
  Multisig Address: rs1q...

Step 2: Funding Multisig (10 HNS)...
  Funding TX: abc123...

Step 3: Mining block...
  Confirmed UTXO: abc123...:0
  Value: 10000000 dollarydoos

Step 4: Initializing HandshakeChain...
  HandshakeChain initialized

Step 5: Creating payment order...
  Return address: rs1q...

Step 6: Generating transaction with HandshakeChain...
  Generated 1 transaction(s)
  TX ID: def456...

Step 7: Signing transaction...
  Signing with 3 keys...

Step 8: Verifying signature...
  Signature verified ✓

Step 9: Broadcasting transaction...
  Submitted TX: def456...

Step 10: Mining block...
  Confirmations: 1
  Block: 000000...

✅ HANDSHAKECHAIN MULTISIG SPEND SUCCESSFUL!
```

## Notes

- This test uses P2WSH (witness script hash) for the multisig
- The signing is done via a simulated TSS function
- The test demonstrates the full flow from UTXO selection to transaction confirmation
- All transaction generation and signing uses HandshakeChain code (not manual MTX building)
