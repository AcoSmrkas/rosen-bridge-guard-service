<<<<<<< HEAD
import hsd from 'hsd';
const { MTX } = hsd;

=======
>>>>>>> handshake-chain
import { AssetBalance } from '@rosen-chains/abstract-chain';

import {
  AbstractHandshakeNetwork,
  HandshakeTx,
  HandshakeUtxo,
} from '../../lib';

class TestHandshakeNetwork extends AbstractHandshakeNetwork {
  getHeight = async (): Promise<number> => {
<<<<<<< HEAD
    throw Error(`TestError: Not mocked`);
=======
    throw Error(`Not mocked`);
>>>>>>> handshake-chain
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getTxConfirmation = async (transactionId: string): Promise<number> => {
<<<<<<< HEAD
    throw Error(`TestError: Not mocked`);
=======
    throw Error(`Not mocked`);
>>>>>>> handshake-chain
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getAddressAssets = async (address: string): Promise<AssetBalance> => {
<<<<<<< HEAD
    throw Error(`TestError: Not mocked`);
=======
    throw Error(`Not mocked`);
>>>>>>> handshake-chain
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getBlockTransactionIds = async (blockId: string): Promise<Array<string>> => {
<<<<<<< HEAD
    throw Error(`TestError: Not mocked`);
=======
    throw Error(`Not mocked`);
>>>>>>> handshake-chain
  };

  getBlockInfo = async (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    blockId: string,
  ): Promise<{ hash: string; parentHash: string; height: number }> => {
<<<<<<< HEAD
    throw Error(`TestError: Not mocked`);
=======
    throw Error(`Not mocked`);
>>>>>>> handshake-chain
  };

  getTransaction = async (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    transactionId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    blockId: string,
  ): Promise<HandshakeTx> => {
<<<<<<< HEAD
    throw Error(`TestError: Not mocked`);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  submitTransaction = async (transaction: MTX): Promise<void> => {
    throw Error(`TestError: Not mocked`);
=======
    throw Error(`Not mocked`);
  };

  submitTransaction = async (): Promise<void> => {
    throw Error(`Not mocked`);
>>>>>>> handshake-chain
  };

  getAddressBoxes = async (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    address: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    offset: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    limit: number,
  ): Promise<Array<HandshakeUtxo>> => {
<<<<<<< HEAD
    throw Error(`TestError: Not mocked`);
=======
    throw Error(`Not mocked`);
>>>>>>> handshake-chain
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isBoxUnspentAndValid = async (boxId: string): Promise<boolean> => {
<<<<<<< HEAD
    throw Error(`TestError: Not mocked`);
=======
    throw Error(`Not mocked`);
>>>>>>> handshake-chain
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getUtxo = async (boxId: string): Promise<HandshakeUtxo> => {
<<<<<<< HEAD
    throw Error(`TestError: Not mocked`);
  };

  getFeeRatio = async (): Promise<number> => {
    throw Error(`TestError: Not mocked`);
  };

  getMempoolTxIds = async (): Promise<Array<string>> => {
    throw Error(`TestError: Not mocked`);
=======
    throw Error(`Not mocked`);
  };

  getFeeRatio = async (): Promise<number> => {
    throw Error(`Not mocked`);
  };

  getMempoolTxIds = async (): Promise<Array<string>> => {
    throw Error(`Not mocked`);
>>>>>>> handshake-chain
  };
}

export default TestHandshakeNetwork;
