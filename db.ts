/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const DB_NAME = 'CUA-ChatDB';
const STORE_NAME = 'chat_sessions';
const DB_VERSION = 1;

// A flexible definition for a part of a Gemini message that can accommodate various content types.
export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, any>;
  };
}


// Gemini's history format
export type GeminiMessage = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};
// OpenAI's history format
export type OpenAIMessage = ChatCompletionMessageParam;

// A union type for the history array
export type ChatHistory = (GeminiMessage | OpenAIMessage)[];

// The structure of the object we'll store in IndexedDB
interface ChatSession {
  provider: string; // The key, e.g., 'gemini-CUA'
  history: ChatHistory;
}

let db: IDBDatabase;

/**
 * Opens and initializes the IndexedDB database.
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Error opening database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const dbInstance = (event.target as IDBOpenDBRequest).result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'provider' });
      }
    };
  });
}

/**
 * Saves the chat history for a given session key.
 * @param key The session key (e.g., 'gemini-CUA').
 * @param history The chat history array to save.
 */
export function saveHistory(key: string, history: ChatHistory): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const session: ChatSession = { provider: key, history };
    const request = store.put(session);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error('Error saving history:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Retrieves the chat history for a given session key.
 * @param key The session key (e.g., 'gemini-CUA').
 * @returns The saved ChatSession or undefined if not found.
 */
export function getHistory(key: string): Promise<ChatSession | undefined> {
  return new Promise(async (resolve, reject) => {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result as ChatSession | undefined);
    };
    request.onerror = () => {
      console.error('Error getting history:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Clears the chat history for a given session key.
 * @param key The session key (e.g., 'gemini-CUA') to clear.
 */
export function clearHistory(key: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const dbInstance = await openDB();
    const transaction = dbInstance.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error('Error clearing history:', request.error);
      reject(request.error);
    };
  });
}
