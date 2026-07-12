import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const RPC = 'https://devnet.solana.com';
const PROGRAM_ID = new PublicKey('HLqcxyy9DrVH7DJ2NqTza8Vq6GWB4aUuUSjFWdq5EAmt');

async function main() {
  const conn = new Connection(RPC);
  const wallet = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/solana/id.json'), 'utf-8')))
  );

  // Derive config PDA
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('admin')], PROGRAM_ID);

  // New USDC mint
  const newUsdcMint = new PublicKey('9Y27Cm2eWZ1H6KzMss5Py4BhRPBMYKCssEoWBp2MunEP');

  // Compute Anchor discriminator for "global:update_config"
  const discriminator = createHash('sha256').update('global:update_config').digest().subarray(0, 8);

  // Encode args: swap_fee_bps (Option<u16>), keeper (Option<Pubkey>), treasury (Option<Pubkey>)
  // All None = we only want to change usdc_mint
  const args = Buffer.concat([
    Buffer.from(discriminator),
    // swap_fee_bps: None (0x00)
    Buffer.from([0]),
    // keeper: None (0x00)
    Buffer.from([0]),
    // treasury: None (0x00)
    Buffer.from([0]),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: configPda, isWritable: true, isSigner: false },
      { pubkey: newUsdcMint, isWritable: false, isSigner: false },
      { pubkey: wallet.publicKey, isWritable: true, isSigner: true },
      { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isWritable: false, isSigner: false },
    ],
    data: args,
  });

  const tx = new Transaction().add(ix);
  const sig = await conn.sendTransaction(tx, [wallet], { skipPreflight: true });
  console.log('update_config tx:', sig);
  const result = await conn.confirmTransaction(sig, 'confirmed');
  console.log('Result:', JSON.stringify(result));
}

main().catch(console.error);
