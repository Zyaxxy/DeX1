'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { motion } from 'framer-motion';
import { Rocket, Upload, TrendingUp, Clock, Coins } from 'lucide-react';
import { toast } from 'sonner';

import Navbar from '@/components/layout/navbar';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
          <stop offset="0%" stopColor="#00ff88" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00ff88" stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Grid lines */}
      <line x1="0" y1="20" x2="300" y2="20" stroke="rgba(255,255,255,0.05)" />
      <line x1="0" y1="60" x2="300" y2="60" stroke="rgba(255,255,255,0.05)" />
      <line x1="0" y1="100" x2="300" y2="100" stroke="rgba(255,255,255,0.05)" />
      
      <path d={areaD} fill="url(#curveGradient)" />
      <path d={pathD} fill="none" stroke="#00ff88" strokeWidth="3" strokeLinecap="round" />
      
      {/* Current position indicator based on liquidity */}
      <circle 
        cx={(liquidity / 1000) * 300} 
        cy={100 - (Math.pow((liquidity / 1000), 2) * 80)} 
        r="5" 
        fill="white" 
        stroke="#00ff88" 
        strokeWidth="2" 
        className="transition-all duration-300"
      />
    </svg>
  );
}

export default function LaunchPage() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [role, setRole] = useState('FWD');
  const [liquidity, setLiquidity] = useState(100);

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !ticker) {
      toast.error('Please fill in all required fields');
      return;
    }
    toast.success('Token launch coming soon! Stay tuned.', {
      description: 'The bonding curve factory program is currently being upgraded.'
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-black mb-4 gradient-text"
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

        {!connected ? (
          <div className="flex justify-center py-20">
            <Card className="glass w-full max-w-md text-center p-8">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Rocket className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4">Connect to Launch</h2>
              <p className="text-muted-foreground mb-8">You need a Solana wallet to deploy a new token to the blockchain.</p>
              <Button size="lg" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full glow-green" onClick={() => setVisible(true)}>
                Connect Wallet
              </Button>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="text-2xl">Create Token</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLaunch} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="name">Athlete Name *</Label>
                      <Input 
                        id="name" 
                        placeholder="e.g., Lionel Messi" 
                        className="bg-white/5 border-white/10"
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
                          className="bg-white/5 border-white/10 pl-8 uppercase"
                          value={ticker}
                          onChange={(e) => setTicker(e.target.value.toUpperCase())}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Position</Label>
                      <Select value={role} onValueChange={(v) => v && setRole(v)}>
                        <SelectTrigger className="bg-white/5 border-white/10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#141419] border-white/10">
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
                        className="flex w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
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
                      <Label>Token Image</Label>
                      <div className="border-2 border-dashed border-white/10 hover:border-primary/50 transition-colors rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-white/[0.02]">
                        <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-white font-medium">Drop image or click to upload</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF up to 5MB</p>
                      </div>
                    </div>

                    <hr className="border-white/10" />

                    <div>
                      <Button type="submit" size="lg" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-14 text-lg rounded-xl glow-green">
                        <Rocket className="mr-2" /> Launch Token
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
              <Card className="glass">
                <CardHeader>
                  <CardTitle>Bonding Curve Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="w-full pt-4 pb-2 border-b border-white/5">
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

              <Card className="glass overflow-hidden relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">Card Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center font-black text-xl">
                        {name ? name[0].toUpperCase() : '?'}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-white">{name || 'Athlete Name'}</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-primary font-mono text-sm">${ticker || 'TICKER'}</span>
                          <Badge className="bg-white/10 text-white border-none">{role}</Badge>
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
        )}

        {/* Recently Launched */}
        <div className="mt-24 max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-8">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-bold text-white">Recently Launched</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {MOCK_RECENT.map((token, i) => (
              <Card key={i} className="glass hover:border-primary/30 transition-colors cursor-pointer bg-white/[0.01]">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold">
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
