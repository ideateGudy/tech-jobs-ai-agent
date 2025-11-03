import { registerApiRoute } from '@mastra/core/server';
import { randomUUID } from 'crypto';

interface A2APart {
  kind: string;
  text?: string;
  data?: unknown;
}

interface A2AMessage {
  role: string;
  parts?: A2APart[];
  messageId?: string;
  taskId?: string;
}

interface A2AParams {
  message?: A2AMessage;
  messages?: A2AMessage[];
  contextId?: string;
  taskId?: string;
  metadata?: unknown;
}

export const a2aAgentRoute = registerApiRoute('/a2a/agent/:agentId', {
  method: 'POST',
  handler: async (c) => {
    try {
      const mastra = c.get('mastra');
      const agentId = c.req.param('agentId');

      // Parse JSON-RPC 2.0 request
      const body = await c.req.json();
      const { jsonrpc, id: requestId, method, params } = body;

      // Validate JSON-RPC 2.0 format
      if (jsonrpc !== '2.0' || !requestId) {
        return c.json({
          jsonrpc: '2.0',
          id: requestId || null,
          error: {
            code: -32600,
            message: 'Invalid Request: jsonrpc must be "2.0" and id is required'
          }
        }, 400);
      }

      const agent = mastra.getAgent(agentId);
      if (!agent) {
        return c.json({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32602,
            message: `Agent '${agentId}' not found`
          }
        }, 404);
      }

      // Extract messages from params
      const { message, messages, contextId, taskId, metadata } = params || {};

      let messagesList = [];
      if (message) {
        messagesList = [message];
      } else if (messages && Array.isArray(messages)) {
        messagesList = messages;
      }

      // Convert A2A messages to Mastra format.
      // Use only the most recent user message to avoid prior agent outputs
      // contaminating keyword extraction (previous agent outputs often
      // contained "Flutter" which made flutter match every query).
      let messageContent = '';
      if (messagesList.length > 0) {
        // Find the last user message; fall back to the last message if none
        const lastUser = [...messagesList].reverse().find((m: A2AMessage) => m.role === 'user');
        const parts = (lastUser || messagesList[messagesList.length - 1]).parts || [];

        messageContent = parts
          .map((part: A2APart) => {
            if (part.kind === 'text') return part.text || '';
            if (part.kind === 'data') {
              if (Array.isArray(part.data)) {
                return (part.data as any[]).map(p => (p && (p as any).text ? (p as any).text : JSON.stringify(p))).join('\n');
              }
              return JSON.stringify(part.data);
            }
            return '';
          })
          .join('\n')
          .trim();
      }

      // Execute agent with message as string
      const response = await agent.generate(messageContent);
      const agentText = response.text || '';

      // Build artifacts array
      const artifacts: Array<{
        artifactId: string;
        name: string;
        parts: Array<{ kind: string; text?: string; data?: unknown }>;
      }> = [
        {
          artifactId: randomUUID(),
          name: `${agentId}Response`,
          parts: [{ kind: 'text', text: agentText }]
        }
      ];

      // Add tool results as artifacts
      if (response.toolResults && response.toolResults.length > 0) {
        artifacts.push({
          artifactId: randomUUID(),
          name: 'ToolResults',
          parts: response.toolResults.map((result) => ({
            kind: 'data',
            data: result
          })) as Array<{ kind: string; text?: string; data?: unknown }>
        });
      }

      // Build conversation history
      const history = [
        ...messagesList.map((msg) => ({
          kind: 'message',
          role: msg.role,
          parts: msg.parts,
          messageId: msg.messageId || randomUUID(),
          taskId: msg.taskId || taskId || randomUUID(),
        })),
        {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'text', text: agentText }],
          messageId: randomUUID(),
          taskId: taskId || randomUUID(),
        }
      ];

      // Return A2A-compliant response
      return c.json({
        jsonrpc: '2.0',
        id: requestId,
        result: {
          id: taskId || randomUUID(),
          contextId: contextId || randomUUID(),
          status: {
            state: 'completed',
            timestamp: new Date().toISOString(),
            message: {
              messageId: randomUUID(),
              role: 'agent',
              parts: [{ kind: 'text', text: agentText }],
              kind: 'message'
            }
          },
          artifacts,
          history,
          kind: 'task'
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return c.json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: { details: errorMessage }
        }
      }, 500);
    }
  }
});
