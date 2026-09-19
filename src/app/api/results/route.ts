export async function POST(request: Request) {
  const data = await request.json();

  console.log("Received training result:", data);

  return Response.json({ received: true, data });
}
