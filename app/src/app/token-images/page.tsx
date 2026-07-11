'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Transaction } from '@solana/web3.js';
import { createUpdateMetadataAccountV2Instruction, Metadata } from '@metaplex-foundation/mpl-token-metadata';
import { getConnection, getRpc, PROGRAM_ID } from '@/solana/client';
import { decodeAthletePool } from '@dexi/sdk';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, Image as ImageIcon, Loader2, Check, X, RefreshCw } from 'lucide-react';

interface TokenWithImage {
  mint: string;
  name: string;
  role: number;
  hasImage: boolean;
  imageUrl?: string;
}

const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export default function TokenImagesPage() {
  const wallet = useWallet();
  const { setVisible } = useWalletModal();
  const { connected, publicKey, signTransaction } = wallet;
  
  const [tokens, setTokens] = useState<TokenWithImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<TokenWithImage | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const connection = getConnection();
      const response = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
        encoding: 'base64',
      }).send();

      const POOL_DISCRIMINATOR = [103, 246, 83, 235, 212, 232, 37, 50];
      
      const pools: any[] = [];
      for (const account of response) {
        const rawData = account.account.data[0];
        const binaryData = Uint8Array.from(atob(rawData), c => c.charCodeAt(0));
        
        if (binaryData.length >= 8) {
          const discriminator = Array.from(binaryData.slice(0, 8));
          if (discriminator.every((b: number, i: number) => b === POOL_DISCRIMINATOR[i])) {
            try {
              const decoded = decodeAthletePool({
                address: account.pubkey,
                data: binaryData,
                exists: true,
              } as any).data;
              pools.push(decoded);
            } catch (e) {}
          }
        }
      }

      const tokensWithImages: TokenWithImage[] = await Promise.all(
        pools.map(async (pool) => {
          const mintPubkey = new PublicKey(pool.mint);
          const [metadataPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("metadata"), MPL_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
            MPL_PROGRAM_ID
          );

          let hasImage = false;
          let imageUrl: string | undefined;

          try {
            const metadataInfo = await connection.getAccountInfo(metadataPda);
            if (metadataInfo?.data) {
              const metadata = Metadata.deserialize(metadataInfo.data)[0];
              const uri = metadata.data.uri?.trim();
              if (uri && uri.length > 0) {
                hasImage = true;
                imageUrl = uri;
              }
            }
          } catch (e) {}

          return {
            mint: pool.mint.toString(),
            name: pool.name,
            role: pool.role,
            hasImage,
            imageUrl,
          };
        })
      );

      setTokens(tokensWithImages);
    } catch (err) {
      console.error('Failed to fetch tokens:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const handleSelectToken = (token: TokenWithImage) => {
    setSelectedToken(token);
    setImageFile(null);
    setImagePreview(token.imageUrl || '');
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const uploadImage = async () => {
    if (!connected || !publicKey || !signTransaction) {
      toast.error('Please connect your wallet');
      setVisible(true);
      return;
    }

    if (!selectedToken || !imageFile) {
      toast.error('Please select a token and upload an image');
      return;
    }

    setUploading(true);
    try {
      const connection = getConnection();
      const { WebUploader } = await import("@irys/web-upload");
      const { WebSolana } = await import("@irys/web-upload-solana");
      
      const irys = await WebUploader(WebSolana).withProvider(wallet).withRpc(connection.rpcEndpoint).devnet().build();
      const irysGateway = "https://gateway.irys.xyz";

      toast.loading('Uploading image to Irys...', { id: 'upload' });

      const imageTags = [{ name: "Content-Type", value: imageFile.type }];
      const imageReceipt = await irys.uploadFile(imageFile, { tags: imageTags });
      const imageUrl = `${irysGateway}/${imageReceipt.id}`;

      toast.loading('Uploading metadata...', { id: 'upload' });

      const metadataObj = {
        name: selectedToken.name,
        symbol: selectedToken.name.replace(/\s+/g, '').toUpperCase().slice(0, 10),
        description: `${selectedToken.name} athlete token on DEXI`,
        image: imageUrl,
      };

      const metadataTags = [{ name: "Content-Type", value: "application/json" }];
      const metadataReceipt = await irys.upload(JSON.stringify(metadataObj), { tags: metadataTags });
      const metadataUrl = `${irysGateway}/${metadataReceipt.id}`;

      toast.loading('Updating on-chain metadata...', { id: 'upload' });

      const mintPubkey = new PublicKey(selectedToken.mint);
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), MPL_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
        MPL_PROGRAM_ID
      );

      const updateIx = createUpdateMetadataAccountV2Instruction(
        {
          metadata: metadataPda,
          updateAuthority: publicKey,
        },
        {
          updateMetadataAccountArgsV2: {
            data: {
              name: selectedToken.name,
              symbol: selectedToken.name.replace(/\s+/g, '').toUpperCase().slice(0, 10),
              uri: metadataUrl,
              sellerFeeBasisPoints: 0,
              creators: null,
              collection: null,
              uses: null,
            },
            isMutable: true,
            primarySaleHappened: null,
            updateAuthority: publicKey,
          },
        }
      );

      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction();
      tx.feePayer = publicKey;
      tx.recentBlockhash = blockhash;
      tx.add(updateIx);

      const signedTx = await wallet.signTransaction?.(tx);
      if (!signedTx) throw new Error('Failed to sign transaction');

      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      toast.success('Image uploaded successfully!', { id: 'upload' });

      setTokens(prev => prev.map(t => 
        t.mint === selectedToken.mint 
          ? { ...t, hasImage: true, imageUrl: imageUrl }
          : t
      ));

      setSelectedToken(prev => prev ? { ...prev, hasImage: true, imageUrl } : null);

    } catch (err: any) {
      toast.error(err.message || 'Failed to upload image', { id: 'upload' });
    } finally {
      setUploading(false);
    }
  };

  const tokensWithImages = tokens.filter(t => t.hasImage);
  const tokensWithoutImages = tokens.filter(t => !t.hasImage);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Token Images</h1>
            <p className="text-muted-foreground mt-2">Add or update images for existing tokens</p>
          </div>
          <Button variant="outline" onClick={fetchTokens} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Select Token
              </CardTitle>
              <CardDescription>
                Choose a token to add an image to
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {tokensWithoutImages.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Need Images ({tokensWithoutImages.length})</p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {tokensWithoutImages.map(token => (
                          <button
                            key={token.mint}
                            onClick={() => handleSelectToken(token)}
                            className={`w-full p-3 rounded-lg border text-left transition-colors ${
                              selectedToken?.mint === token.mint
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{token.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {token.mint.slice(0, 8)}...{token.mint.slice(-4)}
                                </p>
                              </div>
                              <Badge variant="secondary">No Image</Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {tokensWithImages.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Have Images ({tokensWithImages.length})</p>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {tokensWithImages.map(token => (
                          <button
                            key={token.mint}
                            onClick={() => handleSelectToken(token)}
                            className={`w-full p-3 rounded-lg border text-left transition-colors ${
                              selectedToken?.mint === token.mint
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {token.imageUrl && (
                                <img
                                  src={token.imageUrl}
                                  alt={token.name}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              )}
                              <div>
                                <p className="font-medium">{token.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {token.mint.slice(0, 8)}...{token.mint.slice(-4)}
                                </p>
                              </div>
                              <Badge className="ml-auto text-primary">Has Image</Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {tokens.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No tokens found
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload Image
              </CardTitle>
              <CardDescription>
                {selectedToken ? `Upload image for ${selectedToken.name}` : 'Select a token first'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedToken ? (
                <>
                  <div className="relative border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-background overflow-hidden">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    {imagePreview ? (
                      <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-border">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="object-cover w-full h-full"
                        />
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">Drop image or click to upload</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF up to 5MB</p>
                      </>
                    )}
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm font-medium mb-1">Selected Token</p>
                    <p className="text-lg font-bold">{selectedToken.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {selectedToken.mint}
                    </p>
                  </div>

                  <Button
                    className="w-full"
                    onClick={uploadImage}
                    disabled={uploading || !imageFile}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Image
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a token to upload an image</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}