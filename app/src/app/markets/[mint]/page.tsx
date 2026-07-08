'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { motion } from 'framer-motion';
import { Copy, Check, TrendingUp, BarChart3, Clock, AlertTriangle } from 'lucide-react';

import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import CandlestickChart from '@/components/charts/candlestick-chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { connection, ROLE_LABELS, ROLE_COLORS, formatTokenAmount, formatUSDC, rpc, PROGRAM_ID, USDC_MINT } from '@/solana/client';
import { toast } from 'sonner';
import { decodeAthletePool, findPoolPda } from '@dexi/sdk';

interface PoolInfo {
  mint: string;
  name: string;
  role: number;
  enabled: boolean;
  usdcBalance?: bigint;
  tokenBalance?: bigint;
  poolUsdc?: bigint;
  poolTokens?: bigint;
  price?: number;
}

function PoolDetailContent() {
  const params = useParams();
  const mintParam = params?.mint as string;
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<bigint>(BigInt(0));
  const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0));
  const [copied, setCopied] = useState(false);
  const [slippage, setSlippage] = useState(1.0);

  useEffect(() => {
    async function fetchPool() {
      if (!mintParam) return;
      try {
        const [poolPda] = await findPoolPda({ mint: mintParam as any });
        const response = await rpc.getAccountInfo(poolPda, { commitment: 'confirmed' }).send();

        if (!response || !response.value) return;

        const decoded = decodeAthletePool({
          address: poolPda,
          data: new Uint8Array(Buffer.from(response.value.data[0], response.value.data[1] as any)),
          exists: true,
        } as any).data;

        setPool({
          mint: decoded.mint.toString(),
          name: decoded.name,
          role: decoded.role,
          enabled: decoded.enabled,
          poolUsdc: BigInt(50000), // Mock
          poolTokens: BigInt(25000), // Mock
          price: 2.0, // Mock
        });

      } catch (err) {
        console.error("Failed to fetch pool details:", err);
        setPool({
          mint: mintParam,
          name: 'Unknown Athlete',
          role: 3,
          enabled: false,
          price: 0,
        });
      }
    }
    
    fetchPool();
  }, [mintParam]);

  useEffect(() => {
    async function fetchBalances() {
      if (!connected || !publicKey) return;
      try {
        const mockUsdc = BigInt(1000000);
        setUsdcBalance(mockUsdc);
        const mockToken = BigInt(Math.floor(Math.random() * 1000));
        setTokenBalance(mockToken);
      } catch (error) {
        console.error('Error fetching balances:', error);
      }
    }
    if (connected && publicKey) {
      fetchBalances();
    }
  }, [connected, publicKey]);

  const handleBuy = async () => {
    if (!connected || !publicKey || !signTransaction || !pool) {
      toast.error('Please connect your wallet');
      return;
    }
    
    const amount = parseFloat(buyAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const { getAssociatedTokenAddressSync } = await import('@solana/spl-token');
      const { TransactionMessage, VersionedTransaction, PublicKey } = await import('@solana/web3.js');
      const { getBuyInstruction, findConfigPda, findPoolPda } = await import('@dexi/sdk');

      const [configPda] = await findConfigPda();
      const userKey = new PublicKey(publicKey.toString());
      const usdcMintKey = new PublicKey(USDC_MINT);
      const poolMintKey = new PublicKey(mintParam);
      const [poolAddress] = await findPoolPda({ mint: poolMintKey.toString() as any });
      const poolKey = new PublicKey(poolAddress);

      const userUsdcAta = getAssociatedTokenAddressSync(usdcMintKey, userKey, true);
      const userTokenAta = getAssociatedTokenAddressSync(poolMintKey, userKey, true);
      const poolTokenVault = getAssociatedTokenAddressSync(poolMintKey, poolKey, true);
      const poolUsdcVault = getAssociatedTokenAddressSync(usdcMintKey, poolKey, true);

      const usdcAmount = BigInt(Math.floor(amount * (10 ** 6))); // USDC_DECIMALS=6

      const buyIx = getBuyInstruction({
        config: configPda.toString() as any,
        pool: poolAddress as any,
        userUsdcAta: userUsdcAta.toBase58() as any,
        userTokenAta: userTokenAta.toBase58() as any,
        poolTokenVault: poolTokenVault.toBase58() as any,
        poolUsdcVault: poolUsdcVault.toBase58() as any,
        poolAuthority: poolAddress as any,
        user: userKey.toBase58() as any,
        usdcAmount: usdcAmount as any,
      });

      const { TransactionInstruction } = await import('@solana/web3.js');
      const instruction = new TransactionInstruction({
        programId: new PublicKey(buyIx.programAddress),
        keys: buyIx.accounts.map(a => ({
          pubkey: new PublicKey(a.address),
          isSigner: (a as any).role >= 2,
          isWritable: (a as any).role === 1 || (a as any).role === 3,
        })),
        data: Buffer.from(buyIx.data)
      });

      const { blockhash } = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: userKey,
        recentBlockhash: blockhash,
        instructions: [instruction],
      }).compileToV0Message();
      
      const transaction = new VersionedTransaction(messageV0);
      const signedTransaction = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      toast.success(`Bought ${amount} USDC worth of ${pool.name}!`);
      setBuyAmount('');
    } catch (error) {
      console.error(error);
      toast.error('Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    if (!connected || !publicKey || !signTransaction || !pool) {
      toast.error('Please connect your wallet');
      return;
    }
    
    const amount = parseFloat(sellAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (BigInt(Math.floor(amount * 1000000000)) > tokenBalance) {
      toast.error('Insufficient balance');
      return;
    }

    setLoading(true);
    try {
      const { getAssociatedTokenAddressSync } = await import('@solana/spl-token');
      const { TransactionMessage, VersionedTransaction, PublicKey } = await import('@solana/web3.js');
      const { getSellInstruction, findConfigPda, findPoolPda } = await import('@dexi/sdk');

      const [configPda] = await findConfigPda();
      const userKey = new PublicKey(publicKey.toString());
      const usdcMintKey = new PublicKey(USDC_MINT);
      const poolMintKey = new PublicKey(mintParam);
      const [poolAddress] = await findPoolPda({ mint: poolMintKey.toString() as any });
      const poolKey = new PublicKey(poolAddress);

      const userUsdcAta = getAssociatedTokenAddressSync(usdcMintKey, userKey, true);
      const userTokenAta = getAssociatedTokenAddressSync(poolMintKey, userKey, true);
      const poolTokenVault = getAssociatedTokenAddressSync(poolMintKey, poolKey, true);
      const poolUsdcVault = getAssociatedTokenAddressSync(usdcMintKey, poolKey, true);

      const tokenAmount = BigInt(Math.floor(amount * 1_000_000_000)); // Token has 9 decimals

      const sellIx = getSellInstruction({
        config: configPda.toString() as any,
        pool: poolAddress as any,
        userUsdcAta: userUsdcAta.toBase58() as any,
        userTokenAta: userTokenAta.toBase58() as any,
        poolTokenVault: poolTokenVault.toBase58() as any,
        poolUsdcVault: poolUsdcVault.toBase58() as any,
        poolAuthority: poolAddress as any,
        user: userKey.toBase58() as any,
        tokenAmount: tokenAmount as any,
      });

      const { TransactionInstruction } = await import('@solana/web3.js');
      const instruction = new TransactionInstruction({
        programId: new PublicKey(sellIx.programAddress),
        keys: sellIx.accounts.map(a => ({
          pubkey: new PublicKey(a.address),
          isSigner: (a as any).role >= 2,
          isWritable: (a as any).role === 1 || (a as any).role === 3,
        })),
        data: Buffer.from(sellIx.data)
      });

      const { blockhash } = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: userKey,
        recentBlockhash: blockhash,
        instructions: [instruction],
      }).compileToV0Message();
      
      const transaction = new VersionedTransaction(messageV0);
      const signedTransaction = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      toast.success(`Sold ${amount} ${pool.name}!`);
      setSellAmount('');
    } catch (error) {
      console.error(error);
      toast.error('Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  const calculateBuyOutput = (usdcInput: number) => {
    if (!pool?.price || usdcInput <= 0) return 0;
    return usdcInput / pool.price;
  };

  const calculateSellOutput = (tokenInput: number) => {
    if (!pool?.price || tokenInput <= 0) return 0;
    return tokenInput * pool.price;
  };

  const copyToClipboard = () => {
    if (pool?.mint) {
      navigator.clipboard.writeText(pool.mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Address copied to clipboard');
    }
  };

  if (!pool) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <a href="/markets" className="hover:text-white transition-colors">Markets</a>
          <span>/</span>
          <span className="text-white">{pool.name}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 glass p-6 rounded-3xl">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center shadow-lg border border-white/10">
              <span className="text-3xl font-black text-white">{pool.name[0]}</span>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">{pool.name}</h1>
                <Badge className={`${ROLE_COLORS[ROLE_LABELS[pool.role]]} text-white border-none px-2 py-0.5 text-sm`}>
                  {ROLE_LABELS[pool.role]}
                </Badge>
                {!pool.enabled && <Badge variant="destructive">Disabled</Badge>}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="font-mono text-sm">{pool.mint.slice(0, 6)}...{pool.mint.slice(-4)}</span>
                <button onClick={copyToClipboard} className="hover:text-white transition-colors p-1 rounded-md hover:bg-white/10">
                  {copied ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="text-right ml-auto">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Current Price</p>
            <p className="text-4xl font-mono font-black text-[#00ff88]">${pool.price?.toFixed(2)}</p>
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column (Chart & Info) */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass overflow-hidden border-white/10">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-muted-foreground" />
                  <span className="font-semibold text-white">Price Chart</span>
                </div>
                <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
                  {['1H', '4H', '1D', '1W', '1M'].map(tf => (
                    <button key={tf} className={`px-3 py-1 text-xs font-medium rounded-md ${tf === '1H' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:bg-white/5 hover:text-white'}`}>
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              <CandlestickChart height={450} className="w-full" />
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="glass">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Pool USDC</p>
                  <p className="text-lg font-mono font-bold text-white">${formatUSDC(pool.poolUsdc || BigInt(0))}</p>
                </CardContent>
              </Card>
              <Card className="glass">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Pool Tokens</p>
                  <p className="text-lg font-mono font-bold text-white">{formatTokenAmount(pool.poolTokens || BigInt(0), 0)}</p>
                </CardContent>
              </Card>
              <Card className="glass">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Market Cap</p>
                  <p className="text-lg font-mono font-bold text-white">$125.4K</p>
                </CardContent>
              </Card>
              <Card className="glass">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase mb-1">24h Vol</p>
                  <p className="text-lg font-mono font-bold text-white">$12.1K</p>
                </CardContent>
              </Card>
            </div>
            
            <Card className="glass">
              <CardHeader className="pb-2 border-b border-white/5">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-muted-foreground" /> Recent Trades
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/5 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Time</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Price</th>
                      <th className="px-4 py-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {[1, 2, 3, 4, 5].map((_, i) => {
                      const isBuy = Math.random() > 0.5;
                      return (
                        <tr key={i} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-muted-foreground">14:32:0{i}</td>
                          <td className={`px-4 py-3 font-bold ${isBuy ? 'text-[#00ff88]' : 'text-[#ff4757]'}`}>
                            {isBuy ? 'BUY' : 'SELL'}
                          </td>
                          <td className="px-4 py-3 text-white">$2.04</td>
                          <td className="px-4 py-3 text-right text-white">{(Math.random() * 100).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Right Column (Trade Panel) */}
          <div className="lg:col-span-1">
            <Card className="glass sticky top-24 border-white/10 shadow-2xl">
              <CardContent className="p-6">
                <Tabs defaultValue="buy" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6 bg-white/5 p-1 rounded-xl">
                    <TabsTrigger 
                      value="buy" 
                      className="rounded-lg data-[state=active]:bg-[#00ff88]/20 data-[state=active]:text-[#00ff88] data-[state=active]:font-bold transition-all"
                    >
                      Buy
                    </TabsTrigger>
                    <TabsTrigger 
                      value="sell" 
                      className="rounded-lg data-[state=active]:bg-[#ff4757]/20 data-[state=active]:text-[#ff4757] data-[state=active]:font-bold transition-all"
                    >
                      Sell
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* BUY TAB */}
                  <TabsContent value="buy" className="space-y-6 mt-0">
                    <div className="flex justify-between items-end mb-2">
                      <Label className="text-muted-foreground font-medium">You Pay</Label>
                      <span className="text-xs text-muted-foreground">
                        Balance: <span className="text-white font-mono">${formatUSDC(usdcBalance)}</span>
                      </span>
                    </div>
                    
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs border border-blue-500/30">
                        $
                      </div>
                      <Input
                        type="number"
                        placeholder="0.00"
                        className="pl-12 pr-16 h-14 bg-black/40 border-white/10 text-xl font-mono text-white focus-visible:ring-[#00ff88]"
                        value={buyAmount}
                        onChange={(e) => setBuyAmount(e.target.value)}
                      />
                      <button className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-xs font-bold px-2 py-1 rounded text-white transition-colors">
                        MAX
                      </button>
                    </div>

                    <div className="flex justify-between items-end mb-2 mt-6">
                      <Label className="text-muted-foreground font-medium">You Receive (Est.)</Label>
                    </div>
                    
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center font-bold text-xs text-white">
                        {pool.name[0]}
                      </div>
                      <div className="pl-12 h-14 bg-white/5 border border-white/5 rounded-md flex items-center text-xl font-mono text-white">
                        {buyAmount && parseFloat(buyAmount) > 0 
                          ? calculateBuyOutput(parseFloat(buyAmount)).toFixed(4) 
                          : '0.0000'}
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Slippage Tolerance</span>
                        <div className="flex gap-1 bg-white/5 p-1 rounded-md">
                          {[0.5, 1.0, 2.0].map(val => (
                            <button 
                              key={val}
                              onClick={() => setSlippage(val)}
                              className={`px-2 py-0.5 rounded text-xs font-medium ${slippage === val ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
                            >
                              {val}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Price Impact</span>
                        <span className="text-[#00ff88] font-mono">&lt; 0.1%</span>
                      </div>
                    </div>

                    <Button 
                      className="w-full h-14 text-lg font-bold rounded-xl bg-[#00ff88] hover:bg-[#00ff88]/90 text-black glow-green transition-all"
                      onClick={handleBuy}
                      disabled={loading || !buyAmount || parseFloat(buyAmount) <= 0 || !connected}
                    >
                      {!connected ? 'Connect Wallet' : loading ? 'Swapping...' : 'Buy Tokens'}
                    </Button>
                  </TabsContent>
                  
                  {/* SELL TAB */}
                  <TabsContent value="sell" className="space-y-6 mt-0">
                    <div className="flex justify-between items-end mb-2">
                      <Label className="text-muted-foreground font-medium">You Pay</Label>
                      <span className="text-xs text-muted-foreground">
                        Balance: <span className="text-white font-mono">{formatTokenAmount(tokenBalance)}</span>
                      </span>
                    </div>
                    
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center font-bold text-xs text-white">
                        {pool.name[0]}
                      </div>
                      <Input
                        type="number"
                        placeholder="0.00"
                        className="pl-12 pr-16 h-14 bg-black/40 border-white/10 text-xl font-mono text-white focus-visible:ring-[#ff4757]"
                        value={sellAmount}
                        onChange={(e) => setSellAmount(e.target.value)}
                      />
                      <button className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-xs font-bold px-2 py-1 rounded text-white transition-colors">
                        MAX
                      </button>
                    </div>

                    <div className="flex justify-between items-end mb-2 mt-6">
                      <Label className="text-muted-foreground font-medium">You Receive (Est.)</Label>
                    </div>
                    
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs border border-blue-500/30">
                        $
                      </div>
                      <div className="pl-12 h-14 bg-white/5 border border-white/5 rounded-md flex items-center text-xl font-mono text-white">
                        {sellAmount && parseFloat(sellAmount) > 0 
                          ? calculateSellOutput(parseFloat(sellAmount)).toFixed(2) 
                          : '0.00'}
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Slippage Tolerance</span>
                        <div className="flex gap-1 bg-white/5 p-1 rounded-md">
                          {[0.5, 1.0, 2.0].map(val => (
                            <button 
                              key={val}
                              onClick={() => setSlippage(val)}
                              className={`px-2 py-0.5 rounded text-xs font-medium ${slippage === val ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
                            >
                              {val}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Price Impact</span>
                        <span className="text-[#00ff88] font-mono">&lt; 0.1%</span>
                      </div>
                    </div>

                    <Button 
                      className="w-full h-14 text-lg font-bold rounded-xl bg-[#ff4757] hover:bg-[#ff4757]/90 text-white glow-purple shadow-[0_0_20px_rgba(255,71,87,0.3)] transition-all"
                      onClick={handleSell}
                      disabled={loading || !sellAmount || parseFloat(sellAmount) <= 0 || !connected}
                    >
                      {!connected ? 'Connect Wallet' : loading ? 'Swapping...' : 'Sell Tokens'}
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default dynamic(() => Promise.resolve(PoolDetailPage), { ssr: false });

function PoolDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <PoolDetailContent />
    </Suspense>
  );
}