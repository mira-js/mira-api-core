export interface LLMMessage {
    role: 'user' | 'assistant';
    content: string;
}
export interface LLMOptions {
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
}
export declare function callLLM(messages: LLMMessage[], options?: LLMOptions): Promise<string>;
//# sourceMappingURL=llm.d.ts.map