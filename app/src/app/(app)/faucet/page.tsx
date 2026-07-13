'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, AccountLayout } from '@solana/spl-token';
import { Coins, Loader2, ArrowRight, ExternalLink, Copy, Check, Info, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { findConfigPda, decodeAdminConfig } from '@dexi/sdk';
import { getConnection } from '@/solana/client';

// Devnet USDC Mint address
const DEFAULT_USDC_MINT = '9Y27Cm2eWZ1H6KzMss5Py4BhRPBMYKCssEoWBp2MunEP';

export default function FaucetPage() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [addressInput, setAddressInput] = useState('');
  const [amount, setAmount] = useState(10000);
  const [isMinting, setIsMinting] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [copiedMint, setCopiedMint] = useState(false);
  const [usdcMintAddress, setUsdcMintAddress] = useState(DEFAULT_USDC_MINT);

  // Sync addressInput when wallet connects
  useEffect(() => {
    if (publicKey) {
      setAddressInput(publicKey.toBase58());
    }
  }, [publicKey]);

  // Dynamically resolve USDC Mint address and fetch balance
  useEffect(() => {
    let active = true;
    const fetchMintAndBalance = async () => {
      if (!publicKey) {
        setCurrentBalance(null);
        return;
      }

      setIsLoadingBalance(true);
      try {
        const conn = getConnection();
        let activeUsdcMint = new PublicKey(DEFAULT_USDC_MINT);

        try {
          const [configPda] = await findConfigPda();
          const configInfo = await conn.getAccountInfo(new PublicKey(configPda));
          if (configInfo) {
            const configData = decodeAdminConfig({
              address: configPda as any,
              data: new Uint8Array(Buffer.from(configInfo.data)),
              exists: true
            } as any).data;
            activeUsdcMint = new PublicKey(configData.usdcMint);
            if (active) {
              setUsdcMintAddress(activeUsdcMint.toBase58());
            }
          }
        } catch (err) {
          console.warn('Could not retrieve USDC mint PDA, using fallback:', err);
        }

        const userUsdcAta = getAssociatedTokenAddressSync(activeUsdcMint, publicKey, true);
        const userUsdcInfo = await conn.getAccountInfo(userUsdcAta);
        
        if (active) {
          if (userUsdcInfo) {
            const decoded = AccountLayout.decode(userUsdcInfo.data);
            const bal = Number(decoded.amount) / 1_000_000; // 6 decimals
            setCurrentBalance(bal);
          } else {
            setCurrentBalance(0);
          }
        }
      } catch (err) {
        console.error('Error fetching balance:', err);
      } finally {
        if (active) {
          setIsLoadingBalance(false);
        }
      }
    };

    fetchMintAndBalance();
    return () => {
      active = false;
    };
  }, [publicKey, txSignature]);

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressInput) {
      toast.error('Please enter a wallet address.');
      return;
    }

    try {
      new PublicKey(addressInput);
    } catch (err) {
      toast.error('Invalid Solana wallet address format.');
      return;
    }

    setIsMinting(true);
    setTxSignature(null);
    const mintPromise = fetch('/api/faucet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: addressInput, amount }),
    });

    toast.promise(mintPromise, {
      loading: 'Requesting USDC from faucet...',
      success: async (res) => {
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Failed to mint USDC');
        }
        setTxSignature(data.signature);
        setIsMinting(false);
        return `Successfully minted ${amount.toLocaleString()} USDC to ${addressInput.slice(0, 4)}...${addressInput.slice(-4)}`;
      },
      error: (err) => {
        setIsMinting(false);
        return err.message || 'Error occurred while minting.';
      }
    });
  };

  const copyMintToClipboard = () => {
    navigator.clipboard.writeText(usdcMintAddress);
    setCopiedMint(true);
    toast.success('USDC Mint address copied to clipboard!');
    setTimeout(() => setCopiedMint(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0f131d]">
      <Navbar />

      <main className="flex-grow flex flex-col justify-center items-center py-10 md:py-16 px-4 relative overflow-hidden">
        {/* Animated Background Highlights */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#d2f000]/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-[300px] h-[300px] bg-[#00eefc]/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="w-full max-w-xl z-10 space-y-6">
          
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#181b25] border border-[#454932] rounded-full">
              <Coins className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-[12px] font-mono tracking-wider font-semibold text-[#c6c9ab] uppercase">
                Solana Devnet Faucet
              </span>
            </div>
            <h1 className="font-heading text-[32px] md:text-[42px] font-extrabold text-white leading-tight tracking-tight">
              Get Demo <span className="text-primary">USDC</span>
            </h1>
            <p className="font-sans text-[15px] leading-relaxed text-[#c6c9ab] max-w-md mx-auto">
              Mint dummy USDC directly to your Solana wallet to trade athlete tokens, participate in contests, and test the DEXI platform.
            </p>
          </div>

          {/* Form Card */}
          <Card className="bg-[#181b25] border-[#454932] shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary to-[#00eefc]" />
            <CardHeader className="pb-4">
              <CardTitle className="font-heading text-lg text-white flex justify-between items-center">
                <span>Mint Test Funds</span>
                {connected && (
                  <Badge variant="outline" className="border-[#454932] text-xs font-mono text-[#c6c9ab]">
                    {isLoadingBalance ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1 inline" />
                    ) : (
                      <span className="text-[#00eefc] font-bold mr-1">
                        {currentBalance !== null ? currentBalance.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0.00'}
                      </span>
                    )}
                    USDC
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs text-[#c6c9ab]">
                Enter your wallet public key. The faucet will automatically initialize your token account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleMint} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="walletAddress" className="text-xs font-semibold text-white tracking-wider uppercase font-mono">
                    Wallet Address
                  </label>
                  <div className="relative">
                    <Input
                      id="walletAddress"
                      type="text"
                      placeholder="Enter Solana wallet address (e.g. 9VyhrVM1...)"
                      value={addressInput}
                      onChange={(e) => setAddressInput(e.target.value)}
                      disabled={isMinting}
                      className="bg-[#0f131d] border-[#454932] text-white font-mono placeholder-[#c6c9ab]/40 pr-24 focus-visible:ring-primary focus-visible:border-primary"
                    />
                    {connected && publicKey && addressInput !== publicKey.toBase58() && (
                      <button
                        type="button"
                        onClick={() => setAddressInput(publicKey.toBase58())}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-[#1c1f2a] hover:bg-[#262a34] text-primary border border-[#454932] px-2 py-1 transition-colors"
                      >
                        Use Wallet
                      </button>
                    )}
                  </div>
                </div>

                {/* Amount Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white tracking-wider uppercase font-mono block">
                    Select Amount
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[10000, 25000, 50000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAmount(amt)}
                        disabled={isMinting}
                        className={`py-2 px-3 border text-sm font-mono transition-all font-semibold rounded-sm ${
                          amount === amt
                            ? 'bg-primary text-[#191e00] border-primary shadow-lg shadow-[#d2f000]/10'
                            : 'bg-[#0f131d] border-[#454932] text-[#c6c9ab] hover:border-white hover:text-white'
                        }`}
                      >
                        {amt.toLocaleString()} USDC
                      </button>
                    ))}
                  </div>
                </div>

                {!connected && (
                  <div className="flex items-center gap-2 p-3 bg-[#1c1f2a]/80 border border-[#454932] rounded-sm text-xs text-[#c6c9ab]">
                    <Info className="w-4 h-4 text-primary shrink-0" />
                    <span>
                      Not connected? You can still paste any address manually, or{' '}
                      <button type="button" onClick={() => setVisible(true)} className="text-primary hover:underline font-bold">
                        connect wallet
                      </button>{' '}
                      to autofill and track balance.
                    </span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isMinting || !addressInput}
                  className="w-full bg-primary hover:bg-primary/90 text-[#191e00] font-heading font-bold text-base h-12 rounded-sm shadow-xl transition-all disabled:opacity-50"
                >
                  {isMinting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Minting USDC Tokens...
                    </>
                  ) : (
                    <>
                      Mint {amount.toLocaleString()} USDC
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>

            {/* Success Box */}
            {txSignature && (
              <CardFooter className="pt-2 flex flex-col items-stretch">
                <div className="w-full bg-[#102a24] border border-[#1b6b55] rounded-sm p-4 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[#00ff88] font-bold font-heading flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      Mint Successful!
                    </span>
                  </div>
                  <p className="text-xs text-[#a2d8cb]">
                    Successfully transferred {amount.toLocaleString()} USDC to your wallet address.
                  </p>
                  <div className="pt-1 flex items-center gap-2">
                    <a
                      href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs text-primary font-mono hover:underline gap-1"
                    >
                      View on Solana Explorer
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </CardFooter>
            )}
          </Card>

          {/* Token Details / Setup Card */}
          <Card className="bg-[#181b25] border-[#454932] shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-[16px] text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                How to View in Your Wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-[#c6c9ab] space-y-4">
              <p>
                To view this mock USDC in wallets like Phantom or Solflare, you may need to manually import the token. 
                Use the following mint address:
              </p>
              
              <div className="flex items-center justify-between bg-[#0f131d] border border-[#454932] px-3 py-2 rounded-sm">
                <code className="font-mono text-[11px] text-white select-all">
                  {usdcMintAddress}
                </code>
                <button
                  type="button"
                  onClick={copyMintToClipboard}
                  className="text-[#c6c9ab] hover:text-white transition-colors p-1"
                  title="Copy Mint Address"
                >
                  {copiedMint ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-start gap-2 bg-[#ffb4ab]/10 border border-[#ffb4ab]/30 p-3 rounded-sm">
                <ShieldAlert className="w-4 h-4 text-[#ffb4ab] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-white">Solana Devnet Only</p>
                  <p className="text-[11px]">
                    These are testing tokens. They carry no real-world value and are exclusively meant for the Solana Devnet cluster.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
        </div>
      </main>

      <Footer />
    </div>
  );
}
