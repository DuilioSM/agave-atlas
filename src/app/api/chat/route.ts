export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message } = body;

    const response = await fetch(
      "https://prod-1-data.ke.pinecone.io/assistant/chat/nasaspace",
      {
        method: "POST",
        headers: {
          "Api-Key": process.env.PINECONE_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: message,
            },
          ],
          stream: false,
          model: "gpt-4o",
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Pinecone API error: ${response.statusText}`);
    }

    const data = await response.json();

    return Response.json({
      message: data.message?.content || "No response from assistant"
    });
  } catch (error) {
    console.error("Error:", error);
    return Response.json(
      { message: "Error connecting to assistant" },
      { status: 500 }
    );
  }
}
