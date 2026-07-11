import { readFileSync } from 'fs';
import { Keypair, Connection, PublicKey, Transaction } from '@solana/web3.js';
import { createUpdateMetadataAccountV2Instruction, Metadata } from '@metaplex-foundation/mpl-token-metadata';

const MPL_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const RPC_URL = 'https://devnet.helius-rpc.com/?api-key=6194abc3-69c9-4d23-9482-e8831fd059be';

interface TokenUpdate {
  mint: string;
  name: string;
  symbol: string;
  metadataUrl: string;
}

const TOKENS_TO_UPDATE: TokenUpdate[] = [
  {
    mint: '6qkgus2mYT6wUirD5FUmbmEYiU1zMJHQtixgpC6TMzsZ',
    name: "N'Golo Kanté",
    symbol: 'KANTÉ',
    metadataUrl: 'https://gateway.irys.xyz/5w6qgBN7sS58WP1Vi1njfSPcDZZz2WeyJik1KgmEW51Z',
  },
  {
    mint: '6CJ7HGHtQ8ZvpCyyekMM6Dj4mUrX8Zu2CrNZZ91KaHeL',
    name: 'Jules Koundé',
    symbol: 'KOUNDÉ',
    metadataUrl: 'https://gateway.irys.xyz/Aasjn6JbToLVHGJGCeY1eFwWV3puueMB5o51pCq2JgWK',
  },
  {
    mint: 'HicnZEe2LL2Hy9sywcvG1nYiAe4uFxB1NNKjam8tWD84',
    name: 'Mike Maignan',
    symbol: 'MIKE',
    metadataUrl: 'https://gateway.irys.xyz/BhjmfiXyhZ1uUeg8MqXpzGYmZGFeHVfFPYTZygr39NPY',
  },
  {
    mint: 'G3Qn6aQhAQmZoeweJ3WYuEG1v8yeUVohobof8BrRCJP7',
    name: 'Théo Hernández',
    symbol: 'THÉO',
    metadataUrl: 'https://gateway.irys.xyz/3LwiAVkDtAnFoQEQzvAHXrxR1vpxe8j8Gn8JH6GdxvaY',
  },
];

async function main() {
  console.log('Loading admin wallet...');
  const keypairData = JSON.parse(readFileSync('/home/utkarsh/.config/solana/id.json', 'utf-8'));
  const adminWallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
  console.log('Admin wallet:', adminWallet.publicKey.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('\nUpdating token metadata with real URLs...');
  
  for (const token of TOKENS_TO_UPDATE) {
    console.log(`\nProcessing ${token.name}...`);
    console.log(`  Metadata URL: ${token.metadataUrl}`);
    
    try {
      const mintPubkey = new PublicKey(token.mint);
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), MPL_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
        MPL_PROGRAM_ID
      );

      const updateIx = createUpdateMetadataAccountV2Instruction(
        {
          metadata: metadataPda,
          updateAuthority: adminWallet.publicKey,
        },
        {
          updateMetadataAccountArgsV2: {
            data: {
              name: token.name,
              symbol: token.symbol,
              uri: token.metadataUrl,
              sellerFeeBasisPoints: 0,
              creators: null,
              collection: null,
              uses: null,
            },
            isMutable: true,
            primarySaleHappened: null,
            updateAuthority: adminWallet.publicKey,
          },
        }
      );

      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction();
      tx.feePayer = adminWallet.publicKey;
      tx.recentBlockhash = blockhash;
      tx.add(updateIx);

      tx.sign(adminWallet);
      const signature = await connection.sendRawTransaction(tx.serialize());
      console.log('  Transaction sent:', signature);

      await connection.confirmTransaction(signature, 'confirmed');
      console.log('  ✓ Transaction confirmed!');

    } catch (err) {
      console.error(`  ✗ Error updating ${token.name}:`, err);
    }
  }

  console.log('\n\nVerifying updates...');
  for (const token of TOKENS_TO_UPDATE) {
    const mintPubkey = new PublicKey(token.mint);
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), MPL_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
      MPL_PROGRAM_ID
    );

    const metadataInfo = await connection.getAccountInfo(metadataPda);
    if (metadataInfo?.data) {
      const metadata = Metadata.deserialize(metadataInfo.data)[0];
      console.log(`  ${token.name}: URI = "${metadata.data.uri?.trim()}"`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);