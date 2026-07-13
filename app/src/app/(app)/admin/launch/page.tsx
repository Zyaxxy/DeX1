'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, ROLE_COLORS } from '@/solana/client';
import { toast } from 'sonner';
import { Plus, Loader2, Rocket } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';

function LaunchToken() {

  useRevolvingTitle(['Launch Token | DEXI', 'Admin | DEXI']);
  usePageMeta({
    title: 'Launch Token | DEXI',
    description: 'Launch a new athlete SPL token with Metaplex metadata and create an AMM trading pool.',
    ogTitle: 'Launch Token — DEXI',
    ogDescription: 'Launch a new athlete SPL token with Metaplex metadata and create an AMM trading pool.',
  });

  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [role, setRole] = useState('3');
  const [desc, setDesc] = useState('');
  const SNAP_POINTS = [1000, 2500, 5000, 7500, 10000, 20000, 25000, 30000, 40000, 50000, 60000, 70000, 75000, 80000, 90000, 100000];
  const [liquidity, setLiquidity] = useState(100);
  const [imagePreview, setImagePreview] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLaunch = async () => {
    if (!name || !ticker) {
      toast.error('Please fill in name and ticker');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('ticker', ticker);
      formData.append('role', role);
      formData.append('desc', desc);
      formData.append('liquidity', String(liquidity));
      if (imageFile) {
        formData.append('image', imageFile);
      }

      toast.loading('Uploading assets and deploying token...', { id: 'launch' });
      const res = await fetch('/api/admin/launch', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      toast.dismiss('launch');

      if (!res.ok || result.error) {
        throw new Error(result.error || 'Server error during launch');
      }

      toast.success(`${name} token launched + pool created!`, { id: 'launch' });
      setName(''); setTicker(''); setDesc(''); setImagePreview(''); setLiquidity(100);
    } catch (error: any) {
      console.error(error);
      toast.error('Launch failed: ' + (error.message || 'Unknown error'), { id: 'launch' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-heading">Launch Player Token</CardTitle>
            <CardDescription>Create a new athlete SPL token with Metaplex metadata. An AMM trading pool is created automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Athlete Name</Label>
              <Input placeholder="e.g., Lionel Messi" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Ticker Symbol</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                <Input
                  placeholder="MESSI" maxLength={6}
                  className="pl-8 uppercase"
                  value={ticker}
                  onChange={e => setTicker(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Position</Label>
              <Select value={role} onValueChange={v => v && setRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_COLORS).map(([label, colorClass]) => (
                    <SelectItem key={label} value={String(Object.keys(ROLE_LABELS).find(k => ROLE_LABELS[Number(k)] === label))}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${colorClass}`} />
                        {label === 'GK' ? 'Goalkeeper' : label === 'DEF' ? 'Defender' : label === 'MID' ? 'Midfielder' : 'Forward'} ({label})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                placeholder="Tell us about this athlete..."
                className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Token Image</Label>
              <div className="relative border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-lg p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-background overflow-hidden">
                <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setImagePreview(URL.createObjectURL(file));
                      setImageFile(file);
                    }
                  }}
                />
                {imagePreview ? (
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-border">
                    <img src={imagePreview} alt="Preview" className="object-cover w-full h-full" />
                  </div>
                ) : (
                  <>
                    <Plus className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Drop image or click to upload</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF up to 5MB</p>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>Initial Liquidity (USDC)</Label>
                <span className="font-mono text-primary font-bold">${liquidity}</span>
              </div>
              <input type="range" min="10" max="100000" step="1" value={liquidity}
                onChange={e => {
                  const raw = Number(e.target.value);
                  const nearest = SNAP_POINTS.reduce((a, b) => Math.abs(b - raw) < Math.abs(a - raw) ? b : a);
                  setLiquidity(nearest);
                }}
                className="w-full accent-primary"
                list="liquidity-snaps"
              />
              <datalist id="liquidity-snaps" className="flex justify-between w-full text-[10px] text-muted-foreground/60">
                <option value="1000" label="$1K" />
                <option value="2500" />
                <option value="5000" label="$5K" />
                <option value="7500" />
                <option value="10000" label="$10K" />
                <option value="20000" label="$20K" />
                <option value="25000" />
                <option value="30000" label="$30K" />
                <option value="40000" label="$40K" />
                <option value="50000" label="$50K" />
                <option value="60000" label="$60K" />
                <option value="70000" label="$70K" />
                <option value="75000" />
                <option value="80000" label="$80K" />
                <option value="90000" label="$90K" />
                <option value="100000" label="$100K" />
              </datalist>
              <p className="text-xs text-muted-foreground">Funds the AMM pool for instant trading</p>
            </div>

            <Button
              className="w-full h-12 text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleLaunch}
              disabled={loading}
            >
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Launching...</> : <><Rocket className="w-4 h-4 mr-2" /> Launch Token</>}
            </Button>
            <p className="text-xs text-center text-muted-foreground">~0.05 SOL in network fees</p>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground">Token Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#262a34] border border-[#454932] flex items-center justify-center font-bold text-lg text-white">
                  {name ? name[0].toUpperCase() : '?'}
                </div>
                <div>
                  <p className="font-bold">{name || 'Athlete Name'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-primary font-mono text-sm">${ticker || 'TICKER'}</span>
                    <Badge className={`${ROLE_COLORS[ROLE_LABELS[parseInt(role)]]} text-white border-none text-[10px]`}>
                      {ROLE_LABELS[parseInt(role)]}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Price</p>
                <p className="font-mono font-bold text-primary">$0.01</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold tracking-wider uppercase text-muted-foreground">Bonding Curve Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <svg width="100%" height="120" viewBox="0 0 300 120" preserveAspectRatio="none" className="overflow-visible">
              <defs>
                <linearGradient id="curveG" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.72 0.2 160)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="oklch(0.72 0.2 160)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[20, 60, 100].map(y => <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,0.05)" />)}
              <path d={`M 0,100 L ${Array.from({ length: 21 }, (_, i) => {
                const x = i * 15;
                const y = 100 - Math.pow(i / 20, 2) * 80;
                return `${x},${y}`;
              }).join(' L ')} L 300,100 Z`} fill="url(#curveG)" />
              <path d={`M 0,100 ${Array.from({ length: 21 }, (_, i) => {
                const x = i * 15;
                const y = 100 - Math.pow(i / 20, 2) * 80;
                return `L ${x},${y}`;
              }).join(' ')}`} fill="none" stroke="oklch(0.72 0.2 160)" strokeWidth="2" />
              <circle cx={(liquidity / 1000) * 300} cy={100 - Math.pow(liquidity / 1000, 2) * 80} r="4" fill="white" stroke="oklch(0.72 0.2 160)" strokeWidth="2" />
            </svg>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Supply</span>
              <span>Price</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Starting Price</span><span className="font-mono">$0.01</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Market Cap</span><span className="font-mono">${(liquidity * 2).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Curve Type</span><span>Bonding Curve</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Initial Supply</span><span className="font-mono">1,000,000</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(LaunchToken), { ssr: false });
