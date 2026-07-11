'use client';

import { useState, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Keypair, Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { createInitializeMintInstruction, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, createMintToInstruction, MINT_SIZE, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createCreateMetadataAccountV3Instruction } from '@metaplex-foundation/mpl-token-metadata';
import { getCreatePoolInstruction, findConfigPda, decodeAdminConfig } from '@dexi/sdk';
import { getConnection, getRpc, PROGRAM_ID } from '@/solana/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, Download, Loader2, Check, X, Rocket, Users } from 'lucide-react';

interface TokenData {
  name: string;
  ticker: string;
  role: string;
  liquidity: number;
  description: string;
}

interface TokenResult {
  name: string;
  ticker: string;
  mint: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

const SAMPLE_CSV = `name,ticker,role,liquidity,description
Lionel Messi,MESSI,FWD,100,"Argentine professional footballer"
Cristiano Ronaldo,RONALDO,FWD,100,"Portuguese professional footballer"
Kevin De Bruyne,DEBRUYNE,MID,100,"Belgian professional footballer"
Robert Lewandowski,LEWANDOWSKI,FWD,100,"Polish professional footballer"`;

export default function BulkLaunchPage() {
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const { connected, publicKey, sendTransaction, signTransaction } = wallet;
  const [csvData, setCsvData] = useState('');
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [results, setResults] = useState<TokenResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCSV = (csv: string) => {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];
    
    const parsed: TokenData[] = [];
    for (let i = 1; i < lines.length; i++) {
      const [name, ticker, role, liquidity, description] = lines[i].split(',').map(s => s.trim());
      if (name && ticker) {
        parsed.push({
          name,
          ticker: ticker.toUpperCase(),
          role: role || 'FWD',
          liquidity: parseInt(liquidity) || 100,
          description: description || `${name} athlete token on DEXI`,
        });
      }
    }
    return parsed;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setCsvData(content);
        const parsed = parseCSV(content);
        setTokens(parsed);
        setResults([]);
      };
      reader.readAsText(file);
    }
  };

  const handleCsvChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setCsvData(value);
    const parsed = parseCSV(value);
    setTokens(parsed);
    setResults([]);
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_tokens.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const launchTokens = async () => {
    if (!connected || !publicKey || !signTransaction) {
      toast.error('Please connect your wallet');
      setVisible(true);
      return;
    }

    if (tokens.length === 0) {
      toast.error('Please upload a CSV file');
      return;
    }

    setLoading(true);
    setResults(tokens.map(t => ({ ...t, mint: '', status: 'pending' })));

    try {
      const connection = getConnection();
      const { WebUploader } = await import("@irys/web-upload");
      const { WebSolana } = await import("@irys/web-upload-solana");
      const irys = await WebUploader(WebSolana).withProvider(wallet).withRpc(connection.rpcEndpoint).devnet().build();
      const irysGateway = "https://gateway.irys.xyz";

      const [configPda] = await findConfigPda();
      const configInfo = await connection.getAccountInfo(new PublicKey(configPda));
      if (!configInfo) throw new Error("Config not found");
      const configData = decodeAdminConfig({ address: configPda as any, data: new Uint8Array(configInfo.data), exists: true } as any).data;
      const usdcMint = new PublicKey(configData.usdcMint);
      const usdcTokenProgramId = TOKEN_PROGRAM_ID;

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        setCurrentIndex(i);
        
        try {
          toast.loading(`Creating ${token.name}...`, { id: 'bulk' });

          const mintKeypair = Keypair.generate();
          const decimals = 6;
          const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

          const roleNum = token.role === 'GK' ? 0 : token.role === 'DEF' ? 1 : token.role === 'MID' ? 2 : 3;

          const createAccountIx = SystemProgram.createAccount({
            fromPubkey: publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: MINT_SIZE,
            lamports,
            programId: TOKEN_PROGRAM_ID,
          });

          const initializeMintIx = createInitializeMintInstruction(
            mintKeypair.publicKey, decimals, publicKey, publicKey, TOKEN_PROGRAM_ID
          );

          const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
          const [metadataPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("metadata"), MPL_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
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
                  name: token.name,
                  symbol: token.ticker,
                  uri: '',
                  sellerFeeBasisPoints: 0,
                  creators: null,
                  collection: null,
                  uses: null,
                },
                isMutable: true,
                collectionDetails: null,
              },
            }
          );

          const [poolPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('pool'), mintKeypair.publicKey.toBuffer()],
            PROGRAM_ID
          );
          const poolTokenVault = getAssociatedTokenAddressSync(mintKeypair.publicKey, poolPda, true, TOKEN_PROGRAM_ID);
          const poolUsdcVault = getAssociatedTokenAddressSync(usdcMint, poolPda, true, usdcTokenProgramId);

          const createTokenAtaIx = createAssociatedTokenAccountInstruction(
            publicKey, poolTokenVault, poolPda, mintKeypair.publicKey, TOKEN_PROGRAM_ID
          );
          const createUsdcAtaIx = createAssociatedTokenAccountInstruction(
            publicKey, poolUsdcVault, poolPda, usdcMint, usdcTokenProgramId
          );

          const createPoolIxInfo = getCreatePoolInstruction({
            name: token.name,
            role: roleNum,
            config: configPda as any,
            pool: poolPda.toBase58() as any,
            mint: mintKeypair.publicKey.toBase58() as any,
            tokenVault: poolTokenVault.toBase58() as any,
            usdcVault: poolUsdcVault.toBase58() as any,
            poolAuthority: poolPda.toBase58() as any,
            admin: publicKey.toBase58() as any,
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
            data: Buffer.from(createPoolIxInfo.data),
          });

          const mintTokensToPoolIx = createMintToInstruction(
            mintKeypair.publicKey,
            poolTokenVault,
            publicKey,
            BigInt(token.liquidity * 1000000 * (10 ** decimals)),
            [],
            TOKEN_PROGRAM_ID
          );

          const { blockhash } = await connection.getLatestBlockhash();
          const tx = new Transaction();
          tx.feePayer = publicKey;
          tx.recentBlockhash = blockhash;
          tx.add(createAccountIx, initializeMintIx, initializeMetadataIx, createTokenAtaIx, createUsdcAtaIx, createPoolIx, mintTokensToPoolIx);

          tx.sign(mintKeypair);
          const signedTx = await wallet.signTransaction?.(tx);
          if (!signedTx) throw new Error('Failed to sign transaction');

          const signature = await connection.sendRawTransaction(signedTx.serialize());
          await connection.confirmTransaction(signature, 'confirmed');

          setResults(prev => prev.map((r, idx) => 
            idx === i ? { ...r, mint: mintKeypair.publicKey.toBase58(), status: 'success' } : r
          ));

        } catch (err: any) {
          setResults(prev => prev.map((r, idx) => 
            idx === i ? { ...r, status: 'error', error: err.message || 'Failed to create token' } : r
          ));
        }
      }

      toast.success(`Created ${tokens.length} tokens!`, { id: 'bulk' });

    } catch (err: any) {
      toast.error(err.message || 'An error occurred', { id: 'bulk' });
    } finally {
      setLoading(false);
      setCurrentIndex(-1);
    }
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Bulk Token Launch</h1>
          <p className="text-muted-foreground mt-2">Create multiple tokens at once from a CSV file</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload CSV
            </CardTitle>
            <CardDescription>
              Upload a CSV file with columns: name, ticker, role, liquidity, description
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Choose File
              </Button>
              <Button variant="outline" onClick={downloadSample}>
                <Download className="w-4 h-4 mr-2" />
                Sample CSV
              </Button>
            </div>

            <div>
              <Label>Or paste CSV content</Label>
              <textarea
                value={csvData}
                onChange={handleCsvChange}
                placeholder="name,ticker,role,liquidity,description&#10;Lionel Messi,MESSI,FWD,100,Argentine footballer"
                className="w-full h-40 mt-2 p-3 bg-background border border-border rounded-lg font-mono text-sm"
              />
            </div>

            {tokens.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm font-medium mb-2">
                  Found {tokens.length} tokens to create:
                </p>
                <div className="flex flex-wrap gap-2">
                  {tokens.map((t, i) => (
                    <Badge key={i} variant="outline">
                      {t.name} ({t.ticker})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {tokens.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="w-5 h-5" />
                Launch Tokens
              </CardTitle>
              <CardDescription>
                Create all tokens and their liquidity pools on Solana
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                className="w-full h-12 text-base font-bold"
                onClick={launchTokens}
                disabled={loading || !connected}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating tokens... ({currentIndex + 1}/{tokens.length})
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 mr-2" />
                    Launch {tokens.length} Tokens
                  </>
                )}
              </Button>

              {results.length > 0 && (
                <div className="space-y-2">
                  <div className="flex gap-4 text-sm">
                    <span className="text-primary font-medium">
                      Success: {successCount}
                    </span>
                    <span className="text-destructive font-medium">
                      Error: {errorCount}
                    </span>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {results.map((r, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between p-2 rounded ${
                          r.status === 'success' ? 'bg-primary/10' : r.status === 'error' ? 'bg-destructive/10' : 'bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {r.status === 'pending' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                          {r.status === 'success' && <Check className="w-4 h-4 text-primary" />}
                          {r.status === 'error' && <X className="w-4 h-4 text-destructive" />}
                          <span className="text-sm">{r.name}</span>
                          <span className="text-xs text-muted-foreground">({r.ticker})</span>
                        </div>
                        {r.mint && (
                          <span className="text-xs font-mono text-muted-foreground">
                            {r.mint.slice(0, 6)}...{r.mint.slice(-4)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}