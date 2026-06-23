import "../../config";
import OpenAI from 'openai';
import * as undici from 'undici';
import { getNormalizedEnvProxyUrl } from './proxyUrl';

enum Language {
    de = 'German',
    en = 'English',
    fr = 'French',
    es = 'Spanish'
}

const proxyUrl = getNormalizedEnvProxyUrl();

const proxyAgent = proxyUrl ? new undici.ProxyAgent(proxyUrl) : undefined;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    fetchOptions: { dispatcher: proxyAgent }
});

class TranslateService {
    static async translateText(text: string, fromLanguage: Language = Language.de): Promise<string> {
        try {
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OpenAI API key is not configured');
            }

            if (!text || text.trim().length === 0) {
                throw new Error('Text to translate is required');
            }

            const prompt = `Translate the following text from ${fromLanguage} to Russian. Return only the translation without any additional text or explanations:

${text}`;

            const response = await openai.chat.completions.create({
                model: 'gpt-5-nano', // Используем доступную модель вместо gpt5 nano
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional translator. Translate text accurately while preserving the original meaning and context. Return only the translation.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_completion_tokens: 4000,
                temperature: 1
            });

            const translatedText = response.choices[0]?.message?.content?.trim();

            if (!translatedText) {
                throw new Error('Translation failed: No response from OpenAI');
            }

            return translatedText;
        } catch (error: any) {
            console.error('Translation error:', error);

            if (error.message?.includes('API key')) {
                throw new Error('Translation service configuration error');
            }

            if (error.response?.status === 429) {
                throw new Error('Translation service rate limit exceeded');
            }

            if (error.response?.status === 401) {
                throw new Error('Translation service authentication failed');
            }

            throw new Error(`Translation failed: ${error.message || 'Unknown error'}`);
        }
    }

    static async translateTextBatch(texts: string[], fromLanguage: Language = Language.de): Promise<string[]> {
        try {
            if (!texts || texts.length === 0) {
                return [];
            }

            // Фильтруем пустые строки
            const nonEmptyTexts = texts.filter(text => text && text.trim().length > 0);

            if (nonEmptyTexts.length === 0) {
                return texts.map(() => '');
            }

            const numberedTexts = nonEmptyTexts.map((text, index) => `${index + 1}. ${text}`).join('\n');

            const prompt = `Translate the following numbered texts from ${fromLanguage} to Russian. Return each translation with its corresponding number:

${numberedTexts}`;

            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional translator. Translate each numbered text accurately and return them in the same numbered format.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.1,
            });

            const translatedText = response.choices[0]?.message?.content?.trim();

            if (!translatedText) {
                throw new Error('Batch translation failed: No response from OpenAI');
            }

            // Парсим переводы обратно в массив
            const translations = translatedText
                .split('\n')
                .filter(line => line.match(/^\d+\./))
                .map(line => line.replace(/^\d+\.\s*/, '').trim());

            // Восстанавливаем исходную структуру массива
            let translationIndex = 0;
            return texts.map(text => {
                if (!text || text.trim().length === 0) {
                    return '';
                }
                return translations[translationIndex++] || text;
            });
        } catch (error: any) {
            console.error('Batch translation error:', error);
            throw new Error(`Batch translation failed: ${error.message || 'Unknown error'}`);
        }
    }
}

export { TranslateService, Language };