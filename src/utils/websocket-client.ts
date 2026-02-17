import type { MessageType, WebSocketMessage, WebSocketCallback } from '../types';

export class VoiceAgentWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private callbacks: Map<MessageType, Set<WebSocketCallback>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private isIntentionalClose = false;
  private debug: boolean;

  constructor(url: string = 'ws://localhost:8080', debug: boolean = false) {
    this.url = url;
    this.debug = debug;
  }

  private log(...args: any[]) {
    if (this.debug) {
      console.log('[VoiceAgentWebSocket]', ...args);
    }
  }

  connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return Promise.resolve();
    }

    this.isConnecting = true;
    this.isIntentionalClose = false;

    return new Promise((resolve, reject) => {
      try {
        this.log('Connecting to', this.url);
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.log('Connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnecting = false;
          reject(error);
        };

        this.ws.onclose = () => {
          this.log('Connection closed');
          this.isConnecting = false;
          if (!this.isIntentionalClose) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.log(`Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => {
        this.connect().catch(console.error);
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('error', { type: 'error', data: 'Connection failed after multiple attempts' });
    }
  }

  private handleMessage(message: WebSocketMessage) {
    const callbacks = this.callbacks.get(message.type);
    if (callbacks) {
      callbacks.forEach(callback => callback(message));
    }
  }

  on(type: MessageType, callback: WebSocketCallback) {
    if (!this.callbacks.has(type)) {
      this.callbacks.set(type, new Set());
    }
    this.callbacks.get(type)!.add(callback);
  }

  off(type: MessageType, callback: WebSocketCallback) {
    const callbacks = this.callbacks.get(type);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  sendAudio(audioData: ArrayBuffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const base64 = this.arrayBufferToBase64(audioData);
      this.ws.send(JSON.stringify({
        type: 'audio',
        data: base64
      }));
    } else {
      this.log('WebSocket not open, cannot send audio');
    }
  }

  sendEnd() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'end' }));
    }
  }

  send(data: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      this.log('WebSocket not open, cannot send message');
    }
  }

  private emit(type: MessageType, message: WebSocketMessage) {
    this.handleMessage(message);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  disconnect() {
    this.isIntentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.clear();
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
