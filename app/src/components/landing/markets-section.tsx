'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { getRpc, getConnection, PROGRAM_ID } from '@/solana/client';
import { decodeAthletePool, ATHLETE_POOL_DISCRIMINATOR, findConfigPda, decodeAdminConfig } from '@dexi/sdk';
import { getBase58Decoder } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, AccountLayout } from '@solana/spl-token';
import { Metadata } from '@metaplex-foundation/mpl-token-metadata';
import { ROLE_LABELS } from '@/solana/dexi';

const MPL_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const POLL_INTERVAL = 30000;

interface AthleteCard {
  name: string;
  role: string;
  price: number;
  priceChange: number;
  image?: string;
}

const ROLE_GRADIENTS: Record<number, string> = {
  0: 'from-amber-600 to-yellow-500',
  1: 'from-sky-600 to-blue-500',
  2: 'from-emerald-600 to-cyan-500',
  3: 'from-rose-600 to-orange-500',
};

export default function MarketsSection() {
  const [athletes, setAthletes] = useState<AthleteCard[]>([]);
  const [loading, setLoading] = useState(true);
  const titleRef = useRef<HTMLDivElement>(null);
  const titleInView = useInView(titleRef, { once: true, margin: '-80px' });
  const sliderRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const firstPricesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let mounted = true;

    async function fetchMarketData() {
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

        const metadataPdas = decodedPools.map(p =>
          PublicKey.findProgramAddressSync(
            [Buffer.from("metadata"), MPL_PROGRAM_ID.toBuffer(), new PublicKey(p.mint).toBuffer()],
            MPL_PROGRAM_ID
          )[0]
        );

        const metadataInfos = await getConnection().getMultipleAccountsInfo(metadataPdas);

        const imageTasks: Promise<{ mint: string; image: string } | null>[] = [];

        for (let i = 0; i < decodedPools.length; i++) {
          const p = decodedPools[i];
          const metadataInfo = metadataInfos[i];
          if (metadataInfo?.data) {
            imageTasks.push(
              (async () => {
                try {
                  const metadata = Metadata.deserialize(metadataInfo.data)[0];
                  const uri = metadata.data.uri?.trim();
                  if (uri) {
                    const json = await fetch(uri).then(r => r.json());
                    return { mint: p.mint.toString(), image: json.image || '' };
                  }
                } catch {}
                return null;
              })()
            );
          } else {
            imageTasks.push(Promise.resolve(null));
          }
        }

        const imageResults = await Promise.all(imageTasks);
        const imageMap = new Map<string, string>();
        for (const r of imageResults) {
          if (r?.image) imageMap.set(r.mint, r.image);
        }

        const firstPrices = firstPricesRef.current;
        const athleteCards: AthleteCard[] = [];

        for (let i = 0; i < decodedPools.length; i++) {
          const pool = decodedPools[i];
          if (!pool.enabled) continue;

          const tokenVault = accountInfos[i * 2];
          const usdcVault = accountInfos[i * 2 + 1];

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

          athleteCards.push({
            name: pool.name,
            role: ROLE_LABELS[pool.role] || 'ATH',
            price,
            priceChange,
            image: imageMap.get(poolKey),
          });
        }

        athleteCards.sort((a, b) => b.price - a.price);

        if (mounted) {
          setAthletes(athleteCards);
          setLoading(false);
        }
      } catch (err) {
        console.error("MarketsSection fetch error:", err);
        if (mounted) setLoading(false);
      }
    }

    fetchMarketData();
    const interval = setInterval(fetchMarketData, POLL_INTERVAL);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <section className="py-16 lg:py-20 relative overflow-hidden" id="markets-section">
      <div className="container mx-auto px-4">
        <div ref={titleRef} className="max-w-2xl mb-10">
          <motion.h2
            className="font-heading font-black text-[clamp(1.5rem,4vw,2.5rem)] text-white leading-tight"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={titleInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            Markets
          </motion.h2>
          <motion.p
            className="text-[15px] text-muted-foreground leading-relaxed mt-3 max-w-xl"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={titleInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.2, ease: 'easeOut', delay: 0.08 }}
          >
            Trade the world&apos;s top athletes on automated bonding curves. Prices move with real performance.
          </motion.p>
        </div>
      </div>

      {loading ? (
        <div className="container mx-auto px-4">
          <div className="flex gap-4 overflow-hidden">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="shrink-0 w-[260px] h-[340px] rounded-2xl bg-[#181b25] animate-pulse" />
            ))}
          </div>
        </div>
      ) : athletes.length === 0 ? null : (
        <div className="overflow-hidden px-4">
          <motion.div
            ref={sliderRef}
            className="flex gap-4 cursor-grab active:cursor-grabbing"
            drag="x"
            dragConstraints={{ left: -(athletes.length * 280), right: 0 }}
            dragElastic={0.05}
          >
            {athletes.map((athlete, i) => {
              const gradient = ROLE_GRADIENTS[['GK', 'DEF', 'MID', 'FWD'].indexOf(athlete.role) >= 0
                ? ['GK', 'DEF', 'MID', 'FWD'].indexOf(athlete.role) : 3] || 'from-rose-600 to-orange-500';
              const initials = athlete.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

              const animationProps = reduce ? {} : {
                initial: { opacity: 0, y: 30 },
                whileInView: { opacity: 1, y: 0 },
                viewport: { once: true },
                transition: { duration: 0.25, ease: 'easeOut' as const, delay: i * 0.05 },
              };

              return (
                <motion.div
                  key={athlete.name}
                  className="shrink-0 w-[260px] h-[340px] rounded-2xl overflow-hidden relative group"
                  {...animationProps}
                >
                  {athlete.image ? (
                    <div className="absolute inset-0 bg-[#181b25]">
                      <Image
                        src={athlete.image}
                        alt={athlete.name}
                        fill
                        sizes="260px"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    </div>
                  ) : (
                    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} transition-transform duration-500 group-hover:scale-105`} />
                  )}

                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[6rem] font-black text-white/[0.06] select-none leading-none">
                      {initials}
                    </span>
                  </div>

                  <div className="absolute top-0 inset-x-0 p-4 flex justify-between items-start z-10">
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/30 text-white bg-white/10">
                      {athlete.role}
                    </span>
                  </div>

                  <div className="absolute bottom-0 inset-x-0 p-4 z-10">
                    <div className="bg-black/50 backdrop-blur-sm rounded-xl p-3.5 border border-white/[0.06]">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[11px] text-white/60 uppercase tracking-wider font-medium mb-0.5">{athlete.name}</p>
                          <p className="text-xl font-black text-white font-mono">${athlete.price.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-base font-bold ${athlete.priceChange >= 0 ? 'text-positive' : 'text-negative'}`}>
                            {athlete.priceChange >= 0 ? '+' : ''}{athlete.priceChange.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      )}
    </section>
  );
}
