import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';

const RPC = process.env.RPC_URL || 'https://api.devnet.solana.com';

async function main() {
  const secretKeyStr = process.env.ADMIN_SECRET;
  if (!secretKeyStr) {
    throw new Error('ADMIN_SECRET env var not set. Copy scripts/.env.example to scripts/.env and fill in the values.');
  }
  const ADMIN_SECRET = new Uint8Array(JSON.parse(secretKeyStr));
  const admin = Keypair.fromSecretKey(ADMIN_SECRET);
  const recipient = new PublicKey('9VyhrVM1SessmR92Cz2CwrM2wFP4egbjCAP69yv2Tb9N');
  const USDC_MINT = new PublicKey('9Y27Cm2eWZ1H6KzMss5Py4BhRPBMYKCssEoWBp2MunEP');

  const conn = new Connection(RPC, 'confirmed');

  console.log('Creating ATA for recipient...');
  const ata = await getOrCreateAssociatedTokenAccount(conn, admin, USDC_MINT, recipient);
  console.log('ATA:', ata.address.toBase58());

  console.log('Minting 10,000 USDC...');
  const sig = await mintTo(conn, admin, USDC_MINT, ata.address, admin.publicKey, 10_000 * 10 ** 6);
  console.log('Signature:', sig);
  console.log('Done!');
}

main().catch(console.error);
