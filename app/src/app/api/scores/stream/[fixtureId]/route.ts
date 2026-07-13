import { NextRequest } from 'next/server';

const TXLINE_BASE_URL = process.env.TXLINE_BASE_URL || 'https://txline-dev.txodds.com';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  const { fixtureId } = await params;

  const txlineJwt = process.env.TXLINE_JWT;
  const txlineApiToken = process.env.TXLINE_API_TOKEN;

  if (!txlineJwt || !txlineApiToken) {
    return new Response('TxLINE credentials not configured', { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const txlineResponse = await fetch(
          `${TXLINE_BASE_URL}/api/scores/stream?fixtureId=${fixtureId}`,
          {
            headers: {
              'Authorization': `Bearer ${txlineJwt}`,
              'X-Api-Token': txlineApiToken,
            },
          }
        );

        if (!txlineResponse.ok) {
          controller.enqueue(encoder.encode(`data: {"error": "Failed to connect to TxLINE"}\n\n`));
          controller.close();
          return;
        }

        const reader = txlineResponse.body?.getReader();
        if (!reader) {
          controller.enqueue(encoder.encode(`data: {"error": "No response body"}\n\n`));
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        reader.read().then(function processText({ done, value }) {
          if (done) {
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              controller.enqueue(encoder.encode(line + '\n'));
            } else if (line.startsWith(':')) {
              controller.enqueue(encoder.encode('data: ' + line.slice(1) + '\n\n'));
            } else if (line.trim()) {
              controller.enqueue(encoder.encode(`data: ${line}\n\n`));
            }
          }

          reader.read().then(processText);
        }).catch((error) => {
          console.error('SSE stream error:', error);
          controller.enqueue(encoder.encode(`data: {"error": "${error.message}"}\n\n`));
          controller.close();
        });
      } catch (error: any) {
        controller.enqueue(encoder.encode(`data: {"error": "${error.message}"}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}