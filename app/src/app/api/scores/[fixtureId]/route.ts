import { NextRequest, NextResponse } from 'next/server';

const TXLINE_BASE_URL = process.env.TXLINE_BASE_URL || 'https://txline-dev.txodds.com';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  const { fixtureId } = await params;

  const txlineJwt = process.env.TXLINE_JWT;
  const txlineApiToken = process.env.TXLINE_API_TOKEN;

  if (!txlineJwt || !txlineApiToken) {
    return NextResponse.json(
      { error: 'TxLINE credentials not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `${TXLINE_BASE_URL}/api/scores/snapshot/${fixtureId}?asOf=${Date.now()}`,
      {
        headers: {
          'Authorization': `Bearer ${txlineJwt}`,
          'X-Api-Token': txlineApiToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch scores from TxLINE', status: response.status },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying TxLINE scores:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}