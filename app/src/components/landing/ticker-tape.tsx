'use client';

import { useState, useEffect, useRef } from 'react';
import { getRpc, getConnection, PROGRAM_ID } from '@/solana/client';
import { decodeAthletePool, ATHLETE_POOL_DISCRIMINATOR, findConfigPda, decodeAdminConfig } from '@dexi/sdk';
import { getBase58Decoder } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, AccountLayout } from '@solana/spl-token';

interface TickerItem {
  name: string;
  role: string;
  priceChange: number;
}

const POLL_INTERVAL = 30000;

export default function TickerTape() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const firstPricesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let mounted = true;

    async function fetchTickerData() {
      try {
        const response = await getRpc().getProgramAccounts(PROGRAM_ID.toBase58() as any, {
          encoding: 'base64',
          filters: [
            { memcmp: { offset: BigInt(0), encoding: 'base58', bytes: getBase58Decoder().decode(ATHLETE_POOL_DISCRIMINATOR) as any } }
          ]
        }).send();

        const decodedPools = response.map((account: any) =>
          decodeAthletePool({
            address: account.pubkey,
            data: new Uint8Array(Buffer.from(account.account.data[0], account.account.data[1] as any)),
            exists: true,
          } as any).data
        );

        if (decodedPools.length === 0) {
          if (mounted) setLoading(false);
          return;
        }

        const [configPda] = await findConfigPda();
        const configInfo = await getConnection().getAccountInfo(new PublicKey(configPda));
        if (!configInfo) throw new Error("Config not found");
        const configData = decodeAdminConfig({
          address: configPda,
          data: new Uint8Array(configInfo.data),
          exists: true,
        } as any).data;
        const usdcMint = new PublicKey(configData.usdcMint);

        const vaultAddresses: PublicKey[] = [];
        for (const pool of decodedPools) {
          const poolMint = new PublicKey(pool.mint);
          const [poolAuth] = PublicKey.findProgramAddressSync(
            [Buffer.from('pool'), poolMint.toBuffer()],
            PROGRAM_ID
          );
          vaultAddresses.push(
            getAssociatedTokenAddressSync(poolMint, poolAuth, true),
            getAssociatedTokenAddressSync(usdcMint, poolAuth, true)
          );
        }

        const accountInfos = await getConnection().getMultipleAccountsInfo(vaultAddresses);

        const firstPrices = firstPricesRef.current;
        const tickerItems: TickerItem[] = [];

        for (let i = 0; i < decodedPools.length; i++) {
          const pool = decodedPools[i];
          const tokenVault = accountInfos[i * 2];
          const usdcVault = accountInfos[i * 2 + 1];

          if (!pool.enabled) continue;

          let price = 0;
          if (tokenVault && usdcVault) {
            const ta = AccountLayout.decode(tokenVault.data);
            const ua = AccountLayout.decode(usdcVault.data);
            const poolTokens = ta.amount;
            const poolUsdc = ua.amount;
            if (poolTokens > BigInt(0)) price = Number(poolUsdc) / Number(poolTokens);
          }

          if (price <= 0) price = 1.0;

          const poolKey = pool.mint.toString();
          if (!firstPrices.has(poolKey)) firstPrices.set(poolKey, price);

          const firstPrice = firstPrices.get(poolKey) || price;
          const priceChange = firstPrice > 0 ? ((price - firstPrice) / firstPrice) * 100 : 0;

          const roleLabel = ['GK', 'DEF', 'MID', 'FWD'][pool.role] || 'ATH';

          tickerItems.push({
            name: pool.name,
            role: roleLabel,
            priceChange,
          });
        }

        if (mounted) {
          setItems(tickerItems);
          setLoading(false);
        }
      } catch (err) {
        console.error("Ticker fetch error:", err);
        if (mounted) setLoading(false);
      }
    }

    fetchTickerData();
    const interval = setInterval(fetchTickerData, POLL_INTERVAL);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div className="w-full bg-[#31353f] border-y border-[#454932] h-9 flex items-center overflow-hidden">
        <div className="w-full overflow-hidden whitespace-nowrap box-border">
          <div className="inline-block animate-marquee font-mono text-[13px] leading-[18px] font-[700] text-[#dfe2f0]">
            <span className="inline-block px-6 text-[#c6c9ab]">Loading markets...</span>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="w-full bg-[#31353f] border-y border-[#454932] h-9 flex items-center overflow-hidden">
      <div className="w-full overflow-hidden whitespace-nowrap box-border">
        <div className="inline-block animate-marquee font-mono text-[13px] leading-[18px] font-[700] text-[#dfe2f0]">
          {[...Array(2)].map((_, setIdx) =>
            items.map((item, i) => (
              <span key={`${setIdx}-${i}`} className="inline-block px-6">
                <span className="text-[#c6c9ab] mr-2 font-[500]">{item.role}</span>
                {item.name}
                <span className={`ml-1 ${item.priceChange >= 0 ? 'text-[#00eefc]' : 'text-[#ffb4ab]'}`}>
                  {item.priceChange >= 0 ? '+' : ''}{item.priceChange.toFixed(1)}%
                </span>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
