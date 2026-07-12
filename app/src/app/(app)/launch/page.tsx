'use client';

import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { motion } from 'framer-motion';
import { Rocket, Upload, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { ADMIN_WALLET_ADDRESS, getConnection, PROGRAM_ID } from '@/solana/client';

const MOCK_RECENT = [
  { name: "Kylian Mbappé", ticker: "MBAPPE", role: "Forward", roleColor: "bg-rose-500", price: 2.45, change: 18.7, time: "2h ago", mcap: "$124K" },
  { name: "Pedri González", ticker: "PEDRI", role: "Midfielder", roleColor: "bg-emerald-500", price: 1.82, change: 5.3, time: "4h ago", mcap: "$89K" },
  { name: "Bukayo Saka", ticker: "SAKA", role: "Forward", roleColor: "bg-rose-500", price: 3.12, change: -2.1, time: "6h ago", mcap: "$201K" },
  { name: "Virgil van Dijk", ticker: "VVD", role: "Defender", roleColor: "bg-sky-500", price: 1.15, change: 8.9, time: "8h ago", mcap: "$67K" },
];

function BondingCurveSVG({ liquidity }: { liquidity: number }) {
  // Simple bonding curve visual y = x^2 curve
  const points = [];
  const maxSupply = 100;
  for (let x = 0; x <= maxSupply; x += 5) {
    const y = 100 - (Math.pow(x / maxSupply, 2) * 80); // Inverted Y for SVG
    points.push(`${x * 3},${y}`);
  }
  
  const pathD = `M 0,100 L ${points.join(' L ')}`;
  const areaD = `${pathD} L 300,100 Z`;

  return (
    <svg width="100%" height="150" viewBox="0 0 300 120" preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id="curveGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.2 160)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="oklch(0.72 0.2 160)" stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Grid lines */}
      <line x1="0" y1="20" x2="300" y2="20" stroke="rgba(255,255,255,0.05)" />
      <line x1="0" y1="60" x2="300" y2="60" stroke="rgba(255,255,255,0.05)" />
      <line x1="0" y1="100" x2="300" y2="100" stroke="rgba(255,255,255,0.05)" />
      
      <path d={areaD} fill="url(#curveGradient)" />
      <path d={pathD} fill="none" stroke="oklch(0.72 0.2 160)" strokeWidth="3" strokeLinecap="round" />
      
      {/* Current position indicator based on liquidity */}
      <circle 
        cx={(liquidity / 1000) * 300} 
        cy={100 - (Math.pow((liquidity / 1000), 2) * 80)} 
        r="5" 
        fill="white" 
        stroke="oklch(0.72 0.2 160)" 
        strokeWidth="2" 
        className="transition-all duration-300"
      />
    </svg>
  );
}

export default function LaunchPage() {
  const wallet = useWallet();
  const { connected, publicKey, sendTransaction } = wallet;
  const { setVisible } = useWalletModal();

  useRevolvingTitle([
    'Launch Token | DEXI',
    'Create Athlete Token | DEXI',
    'New Market | DEXI',
  ]);

  usePageMeta({
    title: 'Launch Token | DEXI',
    description: 'Create and launch new athlete tokens with automated bonding curves on Solana.',
    ogTitle: 'Launch Token — DEXI',
    ogDescription: 'Create and launch new athlete tokens on Solana.',
  });
  
  const isAdmin = connected && publicKey?.toBase58() === ADMIN_WALLET_ADDRESS;
  
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [role, setRole] = useState('FWD');
  const [description, setDescription] = useState('');
  const [liquidity, setLiquidity] = useState(100);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !ticker || !imageFile) {
      toast.error('Please provide name, ticker, and image.');
      return;
    }
    if (!sendTransaction || !publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    setLoading(true);
    try {
      const { Keypair, SystemProgram, TransactionMessage, VersionedTransaction, PublicKey, TransactionInstruction } = await import('@solana/web3.js');
      const { createInitializeMintInstruction, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, createMintToInstruction, MINT_SIZE, TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
      const { createCreateMetadataAccountV3Instruction } = await import('@metaplex-foundation/mpl-token-metadata');
      const { getCreatePoolInstruction, findConfigPda, decodeAdminConfig } = await import('@dexi/sdk');

      // 1. Upload Metadata and Image to Irys
      const { WebUploader } = await import("@irys/web-upload");
      const { WebSolana } = await import("@irys/web-upload-solana");
      
      const irys = await WebUploader(WebSolana).withProvider(wallet).withRpc(getConnection().rpcEndpoint).devnet().build();
      const irysGateway = "https://gateway.irys.xyz";

      // Estimate metadata size to fund for both image and metadata at once
      const estimatedMetadata = JSON.stringify({
        name,
        symbol: ticker,
        description,
        image: `${irysGateway}/1234567890123456789012345678901234567890123`,
      });
      const metadataSize = new Blob([estimatedMetadata]).size;
      const totalSize = imageFile.size + metadataSize + 1024; // 1KB buffer

      try {
        const price = await irys.getPrice(totalSize);
        const balance = await irys.getLoadedBalance();
        if (price.isGreaterThan(balance)) {
          toast.loading('Funding Irys node...', { id: 'launch' });
          await irys.fund(price.minus(balance));
        }
      } catch (e) {
        console.error("Error funding Irys:", e);
      }

      toast.loading('Uploading image...', { id: 'launch' });
      const imageTags = [{ name: "Content-Type", value: imageFile.type }];
      const imageReceipt = await irys.uploadFile(imageFile, { tags: imageTags });
      toast.dismiss('launch');
      const imageUrl = `${irysGateway}/${imageReceipt.id}`;

      const metadataObj = {
        name,
        symbol: ticker,
        description,
        image: imageUrl,
      };

      const metadataTags = [{ name: "Content-Type", value: "application/json" }];
      toast.loading('Uploading metadata...', { id: 'launch' });
      const metadataReceipt = await irys.upload(JSON.stringify(metadataObj), { tags: metadataTags });
      toast.dismiss('launch');
      const metadataUrl = `${irysGateway}/${metadataReceipt.id}`;

      toast.loading('Creating token and pool...', { id: 'launch' });

      // 2. Create Standard Token Mint
      const mintKeypair = Keypair.generate();
      const decimals = 6;
      
      const lamports = await getConnection().getMinimumBalanceForRentExemption(MINT_SIZE);

      const createAccountIx = SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      });

      const initializeMintIx = createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        publicKey,
        publicKey,
        TOKEN_PROGRAM_ID
      );

      const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          MPL_PROGRAM_ID.toBuffer(),
          mintKeypair.publicKey.toBuffer()
        ],
        MPL_PROGRAM_ID
      );

      const initializeMetadataIx = createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataPda,
          mint: mintKeypair.publicKey,
          mintAuthority: publicKey,
          payer: publicKey,
          updateAuthority: publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name,
              symbol: ticker,
              uri: metadataUrl,
              sellerFeeBasisPoints: 0,
              creators: null,
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          }
        }
      );

      // 3. Create Pool
      const adminKey = publicKey;
      const mintKey = mintKeypair.publicKey;
      const [configPda] = await findConfigPda();
      const configInfo = await getConnection().getAccountInfo(new PublicKey(configPda));
      if (!configInfo) throw new Error("Config not found");
      const configData = decodeAdminConfig({
        address: configPda as any,
        data: new Uint8Array(Buffer.from(configInfo.data)),
        exists: true
      } as any).data;
      
      const usdcMint = new PublicKey(configData.usdcMint);
      
      const usdcMintInfo = await getConnection().getAccountInfo(usdcMint);
      const usdcTokenProgramId = usdcMintInfo?.owner || TOKEN_PROGRAM_ID;

      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('pool'), mintKey.toBuffer()],
        PROGRAM_ID
      );

      const poolTokenVault = getAssociatedTokenAddressSync(mintKey, poolPda, true, TOKEN_PROGRAM_ID);
      const poolUsdcVault = getAssociatedTokenAddressSync(usdcMint, poolPda, true, usdcTokenProgramId);

      const createTokenAtaIx = createAssociatedTokenAccountInstruction(
        adminKey,
        poolTokenVault,
        poolPda,
        mintKey,
        TOKEN_PROGRAM_ID
      );
      
      const createUsdcAtaIx = createAssociatedTokenAccountInstruction(
        adminKey,
        poolUsdcVault,
        poolPda,
        usdcMint,
        usdcTokenProgramId
      );

      let roleNum = 0; // GK
      if (role === 'DEF') roleNum = 1;
      else if (role === 'MID') roleNum = 2;
      else if (role === 'FWD') roleNum = 3;

      const createPoolIxInfo = getCreatePoolInstruction({
        name: name,
        role: roleNum,
        config: configPda as any,
        pool: poolPda.toBase58() as any,
        mint: mintKey.toBase58() as any,
        tokenVault: poolTokenVault.toBase58() as any,
        usdcVault: poolUsdcVault.toBase58() as any,
        poolAuthority: poolPda.toBase58() as any,
        admin: adminKey.toBase58() as any,
        tokenProgram: TOKEN_PROGRAM_ID.toBase58() as any,
        associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as any,
        systemProgram: SystemProgram.programId.toBase58() as any,
      });

      const createPoolIx = new TransactionInstruction({
        programId: new PublicKey(createPoolIxInfo.programAddress),
        keys: createPoolIxInfo.accounts.map(a => ({
          pubkey: new PublicKey(a.address),
          isSigner: a.role >= 2,
          isWritable: a.role === 1 || a.role === 3,
        })),
        data: Buffer.from(createPoolIxInfo.data)
      });

      // Mint initial token supply to pool
      // Bonding curves usually have 1,000,000 supply
      const tokenSupplyNum = 1000000;
      const mintTokensToPoolIx = createMintToInstruction(
        mintKey,
        poolTokenVault,
        adminKey,
        BigInt(tokenSupplyNum * (10 ** decimals)),
        [],
        TOKEN_PROGRAM_ID
      );
      
      // We also mint USDC to the pool representing initial liquidity for testing
      const usdcSupplyNum = liquidity;
      const mintUsdcToPoolIx = createMintToInstruction(
        usdcMint,
        poolUsdcVault,
        adminKey,
        BigInt(usdcSupplyNum * (10 ** 6))
      );

      const tokenVaultInfo = await getConnection().getAccountInfo(poolTokenVault);
      const usdcVaultInfo = await getConnection().getAccountInfo(poolUsdcVault);

      const instructions = [
        createAccountIx,
        initializeMintIx,
        initializeMetadataIx,
        ...(tokenVaultInfo ? [] : [createTokenAtaIx]),
        ...(usdcVaultInfo ? [] : [createUsdcAtaIx]),
        createPoolIx,
        mintTokensToPoolIx,
        mintUsdcToPoolIx
      ];

      const { context: { slot }, value: { blockhash } } = await getConnection().getLatestBlockhashAndContext();
      const msg = new TransactionMessage({
        payerKey: adminKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const tx = new VersionedTransaction(msg);
      tx.sign([mintKeypair]);
      
      toast.loading('Please approve the transaction...', { id: 'launch' });
      const sig = await sendTransaction(tx, getConnection(), {
        minContextSlot: slot,
      });
      await getConnection().confirmTransaction(sig, 'confirmed');

      toast.success('Token launched successfully!', { id: 'launch' });
      
      // Reset form
      setName('');
      setTicker('');
      setDescription('');
      setImageFile(null);
      setImagePreview('');
      setLiquidity(100);

    } catch (error: any) {
      console.error(error);
      toast.error('Launch failed: ' + error.message, { id: 'launch' });
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Card className="max-w-md w-full bg-[#181b25] border border-[#454932]">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl text-white">Access Denied</CardTitle>
                <CardDescription>
                  Only the admin can launch tokens
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                {!connected ? (
                  <Button size="lg" className="w-full bg-primary" onClick={() => setVisible(true)}>
                    Connect Wallet
                  </Button>
                ) : (
                  <p className="text-muted-foreground">
                    Your wallet: {publicKey?.toBase58().slice(0, 8)}...
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-black mb-4 text-primary"
          >
            Launch a Token
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-muted-foreground text-lg max-w-2xl mx-auto"
          >
            Create a new athlete token with an automated bonding curve. Anyone can trade it instantly on DEXI.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="bg-[#181b25] border border-[#454932]">
              <CardHeader>
                <CardTitle className="text-2xl text-white">Create Token</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLaunch} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Athlete Name *</Label>
                    <Input 
                      id="name" 
                      placeholder="e.g., Lionel Messi" 
                      className="bg-[#0f131d] border-[#454932] text-white"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="ticker">Ticker Symbol *</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                      <Input 
                        id="ticker" 
                        placeholder="MESSI" 
                        maxLength={6}
                        className="bg-[#0f131d] border-[#454932] pl-8 uppercase text-white"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Position</Label>
                    <Select value={role} onValueChange={(v) => v && setRole(v)}>
                      <SelectTrigger className="bg-[#0f131d] border-[#454932] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1c1f2a] border-[#454932]">
                        <SelectItem value="GK">Goalkeeper</SelectItem>
                        <SelectItem value="DEF">Defender</SelectItem>
                        <SelectItem value="MID">Midfielder</SelectItem>
                        <SelectItem value="FWD">Forward</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="desc">Description (Optional)</Label>
                    <textarea 
                      id="desc" 
                      placeholder="Tell us about this athlete..."
                      className="flex w-full border border-[#454932] bg-[#0f131d] px-3 py-2 text-sm text-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#c6c9ab] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label>Initial Liquidity (USDC)</Label>
                      <span className="font-mono text-primary font-bold">${liquidity}</span>
                    </div>
                    <input 
                      type="range" 
                      min="10" 
                      max="1000" 
                      step="10"
                      value={liquidity}
                      onChange={(e) => setLiquidity(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Token Image *</Label>
                    <div className="relative border-2 border-dashed border-[#454932] hover:border-primary/50 transition-colors p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-[#181b25] overflow-hidden">
                      <input 
                        type="file" 
                        accept="image/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        onChange={handleImageChange}
                      />
                      {imagePreview ? (
                        <div className="relative w-full aspect-video rounded-lg overflow-hidden">
                          <img src={imagePreview} alt="Preview" className="object-cover w-full h-full" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <p className="text-white font-medium">Change Image</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-white font-medium">Drop image or click to upload</p>
                          <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF up to 5MB</p>
                        </>
                      )}
                    </div>
                  </div>

                  <hr className="border-[#454932]" />

                  <div>
                    <Button type="submit" disabled={loading} size="lg" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-14 text-lg">
                      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Rocket className="mr-2" /> Launch Token</>}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground mt-3">
                      Estimated cost: ~0.05 SOL (network fees)
                    </p>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>

          {/* Preview Column */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            <Card className="bg-[#181b25] border border-[#454932]">
              <CardHeader>
                <CardTitle className="text-white">Bonding Curve Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="w-full pt-4 pb-2 border-b border-[#454932]">
                  <BondingCurveSVG liquidity={liquidity} />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>Supply</span>
                    <span>Price</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Starting Price</span>
                    <span className="font-mono text-white">$0.01</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Market Cap at Launch</span>
                    <span className="font-mono text-white">${(liquidity * 2).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Curve Type</span>
                    <span className="text-white">Linear Bonding Curve</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Initial Supply Minted</span>
                    <span className="font-mono text-white">{(liquidity * 100).toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#181b25] border border-[#454932] overflow-hidden relative">
              <CardHeader>
                <CardTitle className="text-sm text-[#c6c9ab] uppercase tracking-wider">Card Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {imagePreview ? (
                      <div className="w-12 h-12 overflow-hidden border border-[#454932]">
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 bg-[#262a34] border border-[#454932] flex items-center justify-center font-bold text-xl text-white">
                        {name ? name[0].toUpperCase() : '?'}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-lg text-white">{name || 'Athlete Name'}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-primary font-mono text-sm">${ticker || 'TICKER'}</span>
                        <Badge className="bg-[#262a34] text-white border-none">{role}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Price</p>
                    <p className="font-mono font-bold text-white">$0.01</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Recently Launched */}
        <div className="mt-24 max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-8">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-bold text-white">Recently Launched</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {MOCK_RECENT.map((token, i) => (
              <Card key={i} className="bg-[#181b25] border border-[#454932] hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-3">
                      <div className="w-10 h-10 bg-[#262a34] flex items-center justify-center font-bold border border-[#454932]">
                        {token.name[0]}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-white truncate max-w-[100px]">{token.name}</p>
                        <p className="text-xs text-primary font-mono">${token.ticker}</p>
                      </div>
                    </div>
                    <Badge className={`${token.roleColor} text-white border-none text-[10px] px-1.5`}>{token.role}</Badge>
                  </div>
                  
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Mcap: {token.mcap}</p>
                      <p className="font-mono font-bold text-white">${token.price}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mb-1">{token.time}</p>
                      <p className={`text-sm font-bold ${token.change >= 0 ? 'text-[#00ff88]' : 'text-[#ff4757]'}`}>
                        {token.change >= 0 ? '+' : ''}{token.change}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
