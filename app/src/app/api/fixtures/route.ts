import { NextRequest, NextResponse } from 'next/server';

const TXLINE_BASE_URL = process.env.TXLINE_BASE_URL || 'https://txline-dev.txodds.com';

export async function GET(request: NextRequest) {
  const txlineJwt = process.env.TXLINE_JWT;
  const txlineApiToken = process.env.TXLINE_API_TOKEN;

  if (!txlineJwt || !txlineApiToken) {
    return NextResponse.json(
      { error: 'TxLINE credentials not configured' },
      { status: 500 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const competitionId = searchParams.get('competitionId');
  const startEpochDay = searchParams.get('startEpochDay') || Math.floor(Date.now() / 86400000).toString();

  try {
    const url = new URL(`${TXLINE_BASE_URL}/api/fixtures/snapshot`);
    url.searchParams.set('startEpochDay', startEpochDay);
    if (competitionId) {
      url.searchParams.set('competitionId', competitionId);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${txlineJwt}`,
        'X-Api-Token': txlineApiToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch fixtures from TxLINE', status: response.status },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying TxLINE fixtures:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}