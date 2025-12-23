export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private stream: MediaStream | null = null;
  private isRecording = false;
  private sampleRate = 16000; // Match SEND_SAMPLE_RATE from backend
  private onAudioData: ((data: ArrayBuffer) => void) | null = null;

  async start(onData: (data: ArrayBuffer) => void): Promise<void> {
    if (this.isRecording) {
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: this.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      
      // Use ScriptProcessorNode for PCM audio capture
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.processorNode.onaudioprocess = (e) => {
        if (this.isRecording && this.onAudioData) {
          const inputData = e.inputBuffer.getChannelData(0);
          // Convert Float32Array to Int16Array (PCM format)
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            // Clamp and convert to 16-bit integer
            const s = Math.max(-1, Math.min(1, inputData[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          this.onAudioData(int16Data.buffer);
        }
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);
      
      this.onAudioData = onData;
      this.isRecording = true;
    } catch (error) {
      console.error('Error starting audio recording:', error);
      throw error;
    }
  }

  stop(): void {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.onAudioData = null;
  }

  isActive(): boolean {
    return this.isRecording;
  }
}

