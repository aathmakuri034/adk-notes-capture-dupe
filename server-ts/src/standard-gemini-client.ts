import { GoogleAuth } from 'google-auth-library';
import { logger } from './config.js';

export interface VideoAnalysisResult {
  text: string;
  tokensUsed: number;
}

export class StandardGeminiClient {
  private projectId: string;
  private location: string;
  private model: string;

  constructor(projectId: string, location: string, model: string) {
    this.projectId = projectId;
    this.location = location;
    this.model = model;
  }

  /**
   * Get OAuth2 access token for Vertex AI
   */
  private async getAccessToken(): Promise<string> {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();

    if (!tokenResponse.token) {
      logger.error('Failed to get access token. Check GOOGLE_APPLICATION_CREDENTIALS')
      throw new Error('Failed to get access token');
    }

    return tokenResponse.token;
  }

  /**
   * Analyze video using standard Gemini API with inline base64
   */
  async analyzeVideo(
    videoBase64: string,
    mimeType: string,
    userPrompt: string
  ): Promise<VideoAnalysisResult> {
    const accessToken = await this.getAccessToken();

    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;

    const requestBody = {
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: videoBase64
            }
          },
          {
            text: userPrompt
          }
        ]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Standard API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis available';
    const tokensUsed = result.usageMetadata?.totalTokenCount || 0;

    return { text, tokensUsed };
  }
}
