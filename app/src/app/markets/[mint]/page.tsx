'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Connection, Transaction, SystemProgram } from '@solana/web3.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WalletButton } from '@/components/wallet-button';
import { connection, ROLE_LABELS, ROLE_COLORS, formatUSDC, formatTokenAmount, RPC_URL, getPoolPda, getConfigPda, getTokenBalance, USDC_DECIMALS } from '@/lib/program/client';
import { toast } from 'sonner';

interface PoolInfo {
  mint: PublicKey;
  name: string;
  role: number;
  enabled: boolean;
  usdcBalance?: bigint;
  tokenBalance?: bigint;
  poolUsdc?: bigint;
  poolTokens?: bigint;
  price?: number;
}

function getMockPoolInfo(): Record<string, PoolInfo> {
  return {
    'A4B2xZJ8cFZ7Y2vL4NpT9rMk6H8vK3fE6wXy2sAB': {
      mint: new PublicKey('A4B2xZJ8cFZ7Y2vL4NpT9rMk6H8vK3fE6wXy2sAB'),
      name: 'Erling Haaland',
      role: 3,
      enabled: true,
      price: 2.45,
      poolUsdc: BigInt(50000),
      poolTokens: BigInt(25000),
    },
    'B5C3yA9dHG8wAL6zM3OpT0sNlO7iH9wL4gF7yB3tCD': {
      mint: new PublicKey('B5C3yA9dHG8wAL6zM3OpT0sNlO7iH9wL4gF7yB3tCD'),
      name: 'Kevin De Bruyne',
      role: 2,
      enabled: true,
      price: 1.89,
      poolUsdc: BigInt(35000),
      poolTokens: BigInt(22000),
    },
  };
}

function PoolDetailContent() {
  const params = useParams();
  const mintParam = params?.mint as string;
  const { connected, publicKey, signTransaction, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<bigint>(BigInt(0));
  const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0));

  useEffect(() => {
    if (mintParam) {
      const pools = getMockPoolInfo();
      const poolInfo = pools[mintParam] || {
        mint: new PublicKey(mintParam),
        name: 'Unknown Athlete',
        role: 0,
        enabled: true,
        price: 1.0,
        poolUsdc: BigInt(10000),
        poolTokens: BigInt(10000),
      };
      setPool(poolInfo);
    }
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success(`Bought ${amount} ${pool.name} tokens!`);
      setBuyAmount('');
    } catch (error) {
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

    if (BigInt(amount * 1000000000) > tokenBalance) {
      toast.error('Insufficient balance');
      return;
    }

    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success(`Sold ${amount} ${pool.name} tokens!`);
      setSellAmount('');
    } catch (error) {
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

  if (!pool) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xl font-bold text-primary-foreground">D</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Dexi</h1>
            </a>
            <nav className="flex items-center gap-6 ml-8">
              <a href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">Dashboard</a>
              <a href="/markets" className="text-sm font-medium text-foreground">Markets</a>
              {connected && <a href="/admin" className="text-sm font-medium text-muted-foreground hover:text-foreground">Admin</a>}
            </nav>
          </div>
          <WalletButton />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!connected ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Card className="max-w-md w-full">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl">Connect Wallet</CardTitle>
                <CardDescription>
                  Connect your wallet to trade
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <Button size="lg" className="w-full rounded-full" onClick={() => setVisible(true)}>
                  Connect Wallet
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <a href="/markets" className="hover:text-foreground">Markets</a>
              <span>/</span>
              <span>{pool.name}</span>
            </div>

            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                    <span className="text-2xl font-bold text-primary-foreground">{pool.name[0]}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h1 className="text-3xl font-bold">{pool.name}</h1>
                      <Badge className={ROLE_COLORS[ROLE_LABELS[pool.role]]}>
                        {ROLE_LABELS[pool.role]}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">Token Address: {pool.mint.toBase58().slice(0, 16)}...</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3 mb-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">Current Price</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">${pool.price?.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">USDC per token</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">Your Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{formatTokenAmount(tokenBalance)}</p>
                      <p className="text-xs text-muted-foreground">{pool.name}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">USDC Available</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">${formatUSDC(usdcBalance)}</p>
                      <p className="text-xs text-muted-foreground">USDC</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Card className="w-[400px]">
                <CardHeader>
                  <CardTitle>Trade</CardTitle>
                  <CardDescription>Buy or sell {pool.name} tokens</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="buy" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="buy">Buy</TabsTrigger>
                      <TabsTrigger value="sell">Sell</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="buy" className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">USDC Amount</label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={buyAmount}
                          onChange={(e) => setBuyAmount(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          You pay: ${buyAmount || '0.00'} USDC
                        </p>
                      </div>
                      {buyAmount && parseFloat(buyAmount) > 0 && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">You receive</label>
                          <p className="text-lg font-semibold">
                            {calculateBuyOutput(parseFloat(buyAmount)).toFixed(4)} {pool.name}
                          </p>
                        </div>
                      )}
                      <Button 
                        className="w-full" 
                        onClick={handleBuy} 
                        disabled={loading || !buyAmount || parseFloat(buyAmount) <= 0}
                      >
                        {loading ? 'Processing...' : 'Buy Tokens'}
                      </Button>
                    </TabsContent>
                    
                    <TabsContent value="sell" className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Token Amount</label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={sellAmount}
                          onChange={(e) => setSellAmount(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Available: {formatTokenAmount(tokenBalance)} {pool.name}
                        </p>
                      </div>
                      {sellAmount && parseFloat(sellAmount) > 0 && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">You receive</label>
                          <p className="text-lg font-semibold">
                            ${calculateSellOutput(parseFloat(sellAmount)).toFixed(2)} USDC
                          </p>
                        </div>
                      )}
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={handleSell} 
                        disabled={loading || !sellAmount || parseFloat(sellAmount) <= 0}
                      >
                        {loading ? 'Processing...' : 'Sell Tokens'}
                      </Button>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default dynamic(() => Promise.resolve(PoolDetailPage), { ssr: false });

function PoolDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Loading...</p>
      </div>
    }>
      <PoolDetailContent />
    </Suspense>
  );
}