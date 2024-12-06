import { v1 } from '@std/uuid';

using server = Deno.listen({ port: 3099 });

type Connection = {
  id: string;
  socket: Deno.TcpConn;
};

class ConnectionsWritableStream extends WritableStream<Uint8Array> {
  private connections: Connection[] = [];
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();

  constructor(ownerSocketId: string, onClose: () => void) {
    super({
      write: async (chunk) => {
        for await (const connection of this.connections) {
          const message = `${ownerSocketId}: ${this.decoder.decode(chunk)}`;
          await connection.socket.write(this.encoder.encode(message));
        }
      },
      close: () => {
        onClose();
      },
    });
  }

  setConnections(connections: Connection[]) {
    this.connections = connections;
  }
}

class Orchestrator {
  private streams: ConnectionsWritableStream[] = [];
  private connections: Connection[] = [];

  async broadcast(data: Uint8Array) {
    for await (const connection of this.connections) {
      await connection.socket.write(data);
    }
  }

  addConnection(connection: Connection, stream: ConnectionsWritableStream) {
    this.connections.push(connection);
    this.addStream(stream);
    this.syncStreams();
  }

  private addStream(stream: ConnectionsWritableStream) {
    this.streams.push(stream);
  }

  removeConnection(id: string) {
    this.connections = this.connections.filter((connection) =>
      connection.id !== id
    );
    this.syncStreams();
  }

  private syncStreams() {
    this.streams.forEach((stream) => {
      stream.setConnections(this.connections);
    });
  }
}

const orchestrator = new Orchestrator();
const encoder = new TextEncoder();
for await (using socket of server) {
  const id = v1.generate();
  const connectionsWritableStream = new ConnectionsWritableStream(id, () => {
    orchestrator.removeConnection(id);
    orchestrator.broadcast(encoder.encode(`Disconnected user with id: ${id}`));
  });
  orchestrator.addConnection({ id, socket }, connectionsWritableStream);
  orchestrator.broadcast(encoder.encode(`New user with id: ${id}`));
  socket.readable.pipeTo(connectionsWritableStream);
}

