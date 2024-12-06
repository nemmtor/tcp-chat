using connection = await Deno.connect({ port: 3099 });

const UP = `\u001B[1A`;
const CLEAR_LINE = `\u001B[2K`;
const DOWN = `\u001B[1B`;
const START = `\u001B[G`;

const PROMPT = 'Message: ';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

class PromptedReadableStream extends ReadableStream<string> {
  constructor() {
    let reader: ReadableStreamDefaultReader<Uint8Array>;
    super({
      async start() {
        reader = Deno.stdin.readable.getReader();
        await Deno.stdout.write(encoder.encode(PROMPT));
      },
      async pull(controller) {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        const input = decoder.decode(value).trim();
        controller.enqueue(input);
        await Deno.stdout.write(
          encoder.encode(UP + CLEAR_LINE),
        );
      },
      async cancel() {
        await reader.cancel();
      },
    });
  }
}

class ChatWritableStream extends WritableStream<Uint8Array> {
  constructor() {
    super({
      write: async (chunk) => {
        const message = decoder.decode(chunk);
        await Deno.stdout.write(
          encoder.encode(START + CLEAR_LINE + message + DOWN + START + PROMPT),
        );
      },
    });
  }
}

const promptReadable = new PromptedReadableStream();
const chatWritableStream = new ChatWritableStream();

const write = async () => {
  await promptReadable.pipeThrough(new TextEncoderStream()).pipeTo(
    connection.writable,
  );
};

const read = async () => {
  await connection.readable.pipeTo(chatWritableStream);
};

await Promise.all([read(), write()]);

