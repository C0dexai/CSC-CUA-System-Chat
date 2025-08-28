/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Chat, Type } from "@google/genai";
import type { Part } from "@google/genai";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import * as db from './db';
import type { ChatHistory, GeminiMessage, OpenAIMessage } from './db';

// API keys are read from environment variables. These are expected to be
// available in the `process.env` object in the build environment.
const geminiApiKey = process.env.API_KEY;
const openAIApiKey = process.env.OPENAI_API_KEY;


// --- DOM Elements ---
// Landing Page
const landingPage = document.getElementById('landing-page') as HTMLDivElement;
const launchAppButton = document.getElementById('launch-app-button') as HTMLButtonElement;
const personasGrid = document.querySelector('#personas .personas-grid') as HTMLDivElement;

// App
const cuaWindow = document.getElementById('cua-window') as HTMLDivElement;
const titleBar = document.getElementById('title-bar') as HTMLDivElement;
const chatContainer = document.getElementById('chat-container') as HTMLDivElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const submitButton = chatForm.querySelector('button[type="submit"]') as HTMLButtonElement;
const modelSelector = document.getElementById('model-selector') as HTMLSelectElement;
const personaSelector = document.getElementById('persona-selector') as HTMLSelectElement;
const clearHistoryButton = document.getElementById('clear-history-button') as HTMLButtonElement;
const toggleMaximizeButton = document.getElementById('toggle-maximize-button') as HTMLButtonElement;
const uploadButton = document.getElementById('upload-button') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const stagedFileContainer = document.getElementById('staged-file-container') as HTMLDivElement;
const orchestrationLogContent = document.getElementById('orchestration-log-content') as HTMLDivElement;
const resizer = document.getElementById('resizer') as HTMLDivElement;
const chatPanel = document.getElementById('chat-panel') as HTMLDivElement;

// --- State ---
let stagedFile: File | null = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let lastPosition = { top: '', left: '' };

// --- Personas ---
const PERSONAS = {
  'CUA': { name: 'CUA', role: 'Common User Access', description: `You are CUA (Common User Access), a friendly and knowledgeable computer system interface. Respond to user queries as if you are the operating system itself. Use a slightly formal, clear, and helpful tone. Your responses should be formatted as if in a classic terminal. Do not use Markdown.`, summary: 'The classic, friendly computer system interface.', tone: null },
  'Lyra': { name: 'Lyra', role: 'Master Orchestrator', description: 'As the Master Orchestrator, you supervise task flows and coordinate multi-agent operations. Your expertise is in data orchestration, validation, and system health.', summary: 'Supervises task flows and coordinates multi-agent operations.', tone: 'Authoritative, precise, and systematic' },
  'Kara': { name: 'Kara', role: 'Security & Compliance Officer', description: 'You monitor all agent actions, ensuring safe orchestration and governance. You are the expert on security protocols, compliance, and risk assessment.', summary: 'Monitors all agent actions for security, governance, and compliance.', tone: 'Vigilant, formal, and uncompromising' },
  'Sophia': { name: 'Sophia', role: 'Semantic Intelligence Analyst', description: 'You handle complex reasoning, semantic mapping, and context linking. Your specialty is in understanding deep context and providing insightful analysis.', summary: 'Handles complex reasoning, semantic mapping, and deep context analysis.', tone: 'Analytical, insightful, and articulate' },
  'Cecilia': { name: 'Cecilia', role: 'Assistive Technology Lead', description: 'You provide real-time guidance and adaptive support to the operator. Your goal is to enhance the user\'s workflow with assistive technology.', summary: 'Provides real-time guidance and adaptive workflow support.', tone: 'Helpful, clear, and supportive' },
  'Guac': { name: 'Guac', role: 'Communication Moderator', description: 'You oversee inter-application messaging and network security, ensuring all communications are secure, efficient, and properly routed.', summary: 'Oversees secure and efficient inter-application messaging.', tone: 'Concise, secure, and reliable' },
  'Andie': { name: 'Andie', role: 'Code Execution Specialist', description: 'You specialize in executing and testing code snippets across various languages and environments, ensuring functionality and performance.', summary: 'Executes and tests code snippets across multiple environments.', tone: 'Technical, literal, and efficient' },
  'Dan': { name: 'Dan', role: 'Web & API Integrator', description: 'A full-stack web maestro, you craft seamless user experiences and integrate third-party APIs flawlessly.', summary: 'Crafts seamless user experiences and integrates third-party APIs.', tone: 'Practical, results-driven, and clear' },
  'Stan': { name: 'Stan', role: 'Infrastructure Guardian', description: 'You are a vigilant protector specializing in infrastructure deployment, firewall configurations, and system stability.', summary: 'Deploys infrastructure and guards system stability with vigilance.', tone: 'Professional, cautious, and detail-oriented' },
  'Dude': { name: 'Dude', role: 'Automation & Workflow Maestro', description: 'An expert in workflow automation, you focus on orchestrating complex tasks, managing APIs, and maximizing operational efficiency.', summary: 'Orchestrates complex tasks and maximizes operational efficiency.', tone: 'Organized, prompt, and efficiency-driven' },
};

type PersonaKey = keyof typeof PERSONAS;

const PERSONA_NAME_TO_KEY_MAP = Object.fromEntries(
  Object.entries(PERSONAS).map(([key, value]) => [value.name, key as PersonaKey])
);

/**
 * Generates the system prompt based on the selected persona.
 */
function generateSystemPrompt(personaKey: PersonaKey): string {
  const p = PERSONAS[personaKey];
  if (personaKey === 'CUA') {
    return p.description;
  }
  return `You are ${p.name}, a ${p.role}. ${p.description} Your tone must be ${p.tone!}. You can invoke other agents for tasks outside your expertise.`;
}

// API Clients and State
let geminiChat: Chat;
let openAIMessages: OpenAIMessage[];

const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
const openai = openAIApiKey ? new OpenAI({ apiKey: openAIApiKey, dangerouslyAllowBrowser: true }) : null;

/**
 * Logs an event to the Orchestration Log panel.
 */
function logOrchestrationEvent(message: string, type: 'user' | 'info' | 'invoke' | 'success' | 'complete' | 'error' = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = message;
    orchestrationLogContent.appendChild(entry);
    orchestrationLogContent.scrollTop = orchestrationLogContent.scrollHeight;
}

/**
 * Appends a new message container to the chat and returns its content wrapper.
 * @param prefix The prefix for the message (e.g., 'USER>', 'CUA>').
 * @param messageClass An optional CSS class for the message container.
 * @returns The div element where content should be placed.
 */
function appendMessage(prefix: string, messageClass: string = ''): HTMLDivElement {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${messageClass}`;

  const prefixSpan = document.createElement('span');
  prefixSpan.className = 'prefix';
  prefixSpan.textContent = prefix;

  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'content-wrapper';

  messageDiv.appendChild(prefixSpan);
  messageDiv.appendChild(contentWrapper);
  chatContainer.appendChild(messageDiv);

  chatContainer.scrollTop = chatContainer.scrollHeight;
  return contentWrapper;
}

/**
 * Renders a list of messages from a chat history object.
 */
function renderHistory(history: ChatHistory) {
  chatContainer.innerHTML = '';
  // Don't render system messages, function calls, or function responses
  const messagesToRender = history.filter(m => {
    if ((m as OpenAIMessage).role === 'system' || (m as OpenAIMessage).role === 'tool') return false;
    if ((m as GeminiMessage).parts?.some(p => p.functionCall || p.functionResponse)) return false;
    // Check for tool_calls safely, as it only exists on assistant messages
    if ('tool_calls' in m && m.tool_calls) return false;
    return true;
  });

  const personaPrefix = `${personaSelector.value.toUpperCase()}>`;

  for (const message of messagesToRender) {
    const isUser = message.role === 'user';
    const prefix = isUser ? 'USER>' : personaPrefix;
    const msgClass = isUser ? 'user-message' : '';
    
    const contentWrapper = appendMessage(prefix, msgClass);

    const addText = (text: string) => {
      const textSpan = document.createElement('span');
      textSpan.textContent = text;
      contentWrapper.appendChild(textSpan);
    };

    const addImage = (src: string, alt: string) => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = alt;
        contentWrapper.appendChild(img);
    };

    if ('parts' in message && Array.isArray(message.parts)) { // Gemini format
      for (const part of (message as GeminiMessage).parts) {
        if (part.text) {
          addText(part.text);
        } else if (part.inlineData) {
          addImage(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, 'Uploaded image');
        }
      }
    } else if ('content' in message) { // OpenAI format
      if (typeof message.content === 'string') {
        addText(message.content);
      } else if (Array.isArray(message.content)) { // Multi-part content
        for (const part of message.content) {
          if (part.type === 'text') {
            addText(part.text);
          } else if (part.type === 'image_url') {
            addImage(part.image_url.url, 'Uploaded image');
          }
        }
      }
    }
  }
}

/**
 * Resets the chat history for a given provider and persona to a fresh state.
 */
function resetChatState(provider: 'gemini' | 'openai', persona: PersonaKey) {
  const systemPrompt = generateSystemPrompt(persona);
  if (provider === 'gemini' && ai) {
    geminiChat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: { systemInstruction: systemPrompt },
    });
  }
  if (provider === 'openai' && openai) {
    openAIMessages = [{ role: 'system', content: systemPrompt }];
  }
}

/**
 * Handles switching the AI provider or persona. Loads history if available.
 */
async function handleSessionSwitch() {
  const selectedProvider = modelSelector.value as 'gemini' | 'openai';
  const selectedPersona = personaSelector.value as PersonaKey;
  const sessionKey = `${selectedProvider}-${selectedPersona}`;
  
  const providerName = modelSelector.options[modelSelector.selectedIndex].text;
  const personaName = personaSelector.options[personaSelector.selectedIndex].text;
  const prefix = `${selectedPersona.toUpperCase()}>`;

  chatContainer.innerHTML = ''; // Clear the screen first
  orchestrationLogContent.innerHTML = ''; // Clear the log

  logOrchestrationEvent(`Initializing session for ${personaName} via ${providerName}.`, 'info');

  const session = await db.getHistory(sessionKey);

  const hasMeaningfulHistory = session?.history?.some(m => m.role === 'user');

  if (hasMeaningfulHistory && session) {
    // History found, load it
    const systemPrompt = generateSystemPrompt(selectedPersona);
    if (selectedProvider === 'gemini' && ai) {
      geminiChat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction: systemPrompt },
        history: session.history as GeminiMessage[],
      });
    } else if (selectedProvider === 'openai' && openai) {
      openAIMessages = session.history as OpenAIMessage[];
    }
    renderHistory(session.history);
    appendMessage(prefix, 'system-message').textContent = `Session restored for ${personaName} via ${providerName}.`;
    logOrchestrationEvent('Session history restored.', 'info');
  } else {
    // No history, start fresh
    resetChatState(selectedProvider, selectedPersona);
    appendMessage(prefix, 'system-message').textContent = `New session started for ${personaName} via ${providerName}. Awaiting your input.`;
    logOrchestrationEvent('No history found. New session created.', 'info');
  }

  chatInput.focus();
}

/**
 * Gets the tool definitions for the current session.
 */
function getTools(currentPersona: PersonaKey) {
  const availableAgents = Object.keys(PERSONAS)
    .filter(key => key !== currentPersona && key !== 'CUA')
    .map(key => PERSONAS[key as PersonaKey].name);

  if (availableAgents.length === 0) {
    return { gemini: undefined, openai: undefined };
  }

  const geminiTool = {
    functionDeclarations: [{
      name: "invokeAgent",
      description: "Invokes another AI agent to perform a specialized task or get information. Use this to delegate tasks to agents with specific expertise.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          agentName: {
            type: Type.STRING,
            description: "The name of the agent to invoke. Choose from the available specialists.",
            enum: availableAgents,
          },
          prompt: {
            type: Type.STRING,
            description: "The detailed prompt or question to send to the invoked agent."
          }
        },
        required: ["agentName", "prompt"]
      }
    }]
  };

  const openAITool: ChatCompletionTool = {
    type: 'function',
    function: {
      name: "invokeAgent",
      description: "Invokes another AI agent to perform a specialized task or get information. Use this to delegate tasks to agents with specific expertise.",
      parameters: {
        type: "object",
        properties: {
          agentName: {
            type: "string",
            description: "The name of the agent to invoke. Choose from the available specialists.",
            enum: availableAgents,
          },
          prompt: {
            type: "string",
            description: "The detailed prompt or question to send to the invoked agent."
          }
        },
        required: ["agentName", "prompt"]
      }
    }
  };

  return { gemini: [geminiTool], openai: [openAITool] };
}


/**
 * Executes a tool call to invoke another agent.
 */
async function executeInvokeAgent(agentName: string, prompt: string): Promise<string> {
    const agentKey = PERSONA_NAME_TO_KEY_MAP[agentName];
    if (!agentKey) {
        return `Error: Agent '${agentName}' not found.`;
    }
    const persona = PERSONAS[agentKey];
    console.log(`Invoking agent ${persona.name} with prompt: ${prompt}`);
    logOrchestrationEvent(`Executing call to [${agentName}]. Awaiting response...`, 'info');

    const systemPrompt = generateSystemPrompt(agentKey);
    const provider = modelSelector.value as 'gemini' | 'openai';

    try {
        let result = '';
        if (provider === 'gemini' && ai) {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { systemInstruction: systemPrompt },
            });
            result = response.text;
        } else if (provider === 'openai' && openai) {
            const messages: ChatCompletionMessageParam[] = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ];
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: messages,
            });
            result = response.choices[0].message.content ?? '';
        } else {
           result = 'Error: No valid provider configured for sub-agent call.';
        }
        logOrchestrationEvent(`[${agentName}] returned a response.`, 'success');
        return result;
    } catch (error) {
        console.error(`Error invoking agent ${agentName}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        logOrchestrationEvent(`Error during invocation of [${agentName}]: ${errorMessage}`, 'error');
        return `Error during invocation of ${agentName}: ${errorMessage}`;
    }
}

/**
 * Handles the form submission to send a message to the AI.
 */
async function handleChatSubmit(event: Event) {
  event.preventDefault();
  let userInput = chatInput.value.trim();
  if (!userInput && !stagedFile) return;

  // --- Delegation Logic via @mention ---
  const mentionRegex = /^@(\w+)[, ]?(.*)/s;
  const mentionMatch = userInput.match(mentionRegex);
  
  // Only handle delegation for text-only prompts to keep it simple.
  if (mentionMatch && !stagedFile) {
    const agentName = mentionMatch[1];
    const promptForAgent = mentionMatch[2].trim();
    
    // Case-insensitive lookup for the agent name.
    const agentNameKey = Object.keys(PERSONA_NAME_TO_KEY_MAP).find(name => name.toLowerCase() === agentName.toLowerCase());

    if (agentNameKey && promptForAgent) {
      const targetPersonaKey = PERSONA_NAME_TO_KEY_MAP[agentNameKey];

      // If mentioning the current persona, just strip the mention and proceed normally.
      if (targetPersonaKey === personaSelector.value) {
        userInput = promptForAgent;
      } else {
        // --- Execute one-off delegation and exit ---
        chatInput.value = '';
        chatInput.disabled = true;
        submitButton.disabled = true;
        uploadButton.disabled = true;

        const currentPersonaKey = personaSelector.value as PersonaKey;
        const currentPersonaName = PERSONAS[currentPersonaKey].name;
        
        logOrchestrationEvent(`User command received: "${userInput}"`, 'user');
        logOrchestrationEvent(`Delegation detected. Routing task from [${currentPersonaName}] to [${agentName}].`, 'invoke');

        appendMessage('USER>', 'user-message').textContent = userInput;
        
        const prefix = `${targetPersonaKey.toUpperCase()}>`;
        const thinkingMessageWrapper = appendMessage(prefix, '');
        thinkingMessageWrapper.parentElement!.classList.add('thinking');

        try {
            const result = await executeInvokeAgent(agentName, promptForAgent);
            thinkingMessageWrapper.parentElement!.classList.remove('thinking');
            thinkingMessageWrapper.textContent = result;
            logOrchestrationEvent(`[${agentName}] generated response. Task complete.`, 'complete');
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            logOrchestrationEvent(`SYSTEM ERROR during delegation: ${errorMessage}`, 'error');
            thinkingMessageWrapper.parentElement?.remove();
            appendMessage('SYSTEM_ERROR>', 'error-message').textContent = `Error during delegation: ${errorMessage}`;
        } finally {
            chatInput.disabled = false;
            submitButton.disabled = false;
            uploadButton.disabled = false;
            chatInput.focus();
        }
        return; // Stop further processing for this submission.
      }
    }
  }

  // If the mention was stripped, the input could be empty.
  if (!userInput && !stagedFile) return;

  chatInput.value = '';
  chatInput.disabled = true;
  submitButton.disabled = true;
  uploadButton.disabled = true;
  
  const selectedProvider = modelSelector.value as 'gemini' | 'openai';
  const selectedPersonaKey = personaSelector.value as PersonaKey;
  const selectedPersonaName = PERSONAS[selectedPersonaKey].name;
  const sessionKey = `${selectedProvider}-${selectedPersonaKey}`;
  const prefix = `${selectedPersonaKey.toUpperCase()}>`;

  logOrchestrationEvent(`User command received: "${userInput}"`, 'user');

  // Display user message
  const userMessageWrapper = appendMessage('USER>', 'user-message');
  if (stagedFile) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(stagedFile);
    img.alt = stagedFile.name;
    img.onload = () => URL.revokeObjectURL(img.src);
    userMessageWrapper.appendChild(img);
  }
  if (userInput) {
    const textSpan = document.createElement('span');
    textSpan.textContent = userInput;
    userMessageWrapper.appendChild(textSpan);
  }

  const thinkingMessageWrapper = appendMessage(prefix, '');
  thinkingMessageWrapper.parentElement!.classList.add('thinking');

  const fileToProcess = stagedFile;
  clearStagedFile();
  
  logOrchestrationEvent(`Task routed to [${selectedPersonaName}]. Processing...`, 'info');

  try {
    const base64File = fileToProcess ? await fileToBase64(fileToProcess) : null;

    let fullResponse = '';

    if (selectedProvider === 'gemini' && ai) {
        if (!geminiChat) throw new Error("Gemini chat not initialized.");

        const tools = getTools(selectedPersonaKey).gemini;

        // Initial message parts
        const contentRequest: (string | Part)[] = [];
        if (userInput) contentRequest.push(userInput);
        if (base64File) contentRequest.push({ inlineData: { mimeType: base64File.mimeType, data: base64File.data } });

        // === Gemini Tool Call Loop ===
        let continueConversation = true;
        let messageToSend: { message: (string | Part)[] } = { message: contentRequest };

        while (continueConversation) {
            const stream = await geminiChat.sendMessageStream({
              ...messageToSend,
              ...(tools && { tools }),
            });
            
            let aggregatedText = '';
            let functionCalls: any[] = [];

            for await (const chunk of stream) {
                const text = chunk.text;
                if (text) {
                    aggregatedText += text;
                    thinkingMessageWrapper.textContent = aggregatedText;
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
                if (chunk.functionCalls) {
                    functionCalls = [...functionCalls, ...chunk.functionCalls];
                }
            }
            
            fullResponse = aggregatedText;

            if (functionCalls.length > 0) {
                const call = functionCalls[0];
                const { agentName, prompt } = call.args;
                
                logOrchestrationEvent(`[${selectedPersonaName}] is invoking [${agentName}] for task: "${prompt.substring(0, 50)}..."`, 'invoke');
                thinkingMessageWrapper.textContent = `${aggregatedText}\n\n[Consulting with ${agentName}...]`;

                const toolResult = await executeInvokeAgent(agentName, prompt);
                
                const toolResponsePart: Part = {
                    functionResponse: { name: call.name, response: { content: toolResult } }
                };
                
                logOrchestrationEvent(`[${selectedPersonaName}] received response from [${agentName}]. Continuing main task...`, 'info');
                messageToSend = { message: [toolResponsePart] };
            } else {
                continueConversation = false;
            }
        }
        // === End Loop ===

    } else if (selectedProvider === 'openai' && openai) {
        if (!openai || !openAIMessages) throw new Error("OpenAI chat not initialized.");

        const tools = getTools(selectedPersonaKey).openai;
        
        // Initial message
        const userMessage: OpenAIMessage = { role: 'user', content: [] };
        const contentParts: any[] = [];
        if (userInput) contentParts.push({ type: 'text', text: userInput });
        if (base64File) contentParts.push({ type: 'image_url', image_url: { url: `data:${base64File.mimeType};base64,${base64File.data}` } });
        userMessage.content = contentParts.length === 1 && contentParts[0].type === 'text' ? contentParts[0].text : contentParts;
        openAIMessages.push(userMessage);

        // === OpenAI Tool Call Loop ===
        let continueConversation = true;
        while(continueConversation) {
            const stream = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: openAIMessages,
                stream: true,
                tools: tools,
                tool_choice: tools ? 'auto' : undefined,
            });
            
            let aggregatedText = '';
            let toolCalls: any[] = [];
            
            for await (const chunk of stream) {
                aggregatedText += chunk.choices[0]?.delta?.content || '';
                if (chunk.choices[0]?.delta?.tool_calls) {
                    chunk.choices[0].delta.tool_calls.forEach(tc => {
                        if (tc.index === toolCalls.length) { // New tool call
                           toolCalls.push({ id: tc.id, type: 'function', function: { name: tc.function?.name, arguments: '' } });
                        }
                        if (tc.function?.arguments) {
                            toolCalls[tc.index].function.arguments += tc.function.arguments;
                        }
                    });
                }
                thinkingMessageWrapper.textContent = aggregatedText;
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
            fullResponse = aggregatedText;
            
            if (toolCalls.length > 0) {
                openAIMessages.push({ role: 'assistant', content: null, tool_calls: toolCalls });

                const call = toolCalls[0];
                const args = JSON.parse(call.function.arguments);
                
                logOrchestrationEvent(`[${selectedPersonaName}] is invoking [${args.agentName}] for task: "${args.prompt.substring(0, 50)}..."`, 'invoke');
                thinkingMessageWrapper.textContent = `${aggregatedText}\n\n[Consulting with ${args.agentName}...]`;

                const toolResult = await executeInvokeAgent(args.agentName, args.prompt);

                logOrchestrationEvent(`[${selectedPersonaName}] received response from [${args.agentName}]. Continuing main task...`, 'info');
                openAIMessages.push({ role: 'tool', tool_call_id: call.id, content: toolResult });

            } else {
                openAIMessages.push({ role: 'assistant', content: fullResponse });
                continueConversation = false;
            }
        }
         // === End Loop ===
    }

    thinkingMessageWrapper.parentElement!.classList.remove('thinking');
    thinkingMessageWrapper.textContent = fullResponse; // Final update
    logOrchestrationEvent(`[${selectedPersonaName}] generated final response. Task complete.`, 'complete');

    // Save history after the entire exchange is complete
    const currentHistory = selectedProvider === 'gemini' 
      ? await geminiChat.getHistory() 
      : openAIMessages;
    await db.saveHistory(sessionKey, currentHistory as ChatHistory);

  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    logOrchestrationEvent(`SYSTEM ERROR: ${errorMessage}`, 'error');
    thinkingMessageWrapper.parentElement?.remove();
    appendMessage('SYSTEM_ERROR>', 'error-message').textContent = `Error: ${errorMessage}`;
  } finally {
    chatInput.disabled = false;
    submitButton.disabled = false;
    uploadButton.disabled = false;
    chatInput.focus();
  }
}


/**
 * Handles the click event for the "Clear History" button.
 */
async function handleClearHistory() {
  const selectedProvider = modelSelector.value as 'gemini' | 'openai';
  const selectedPersona = personaSelector.value as PersonaKey;
  const sessionKey = `${selectedProvider}-${selectedPersona}`;

  const providerName = modelSelector.options[modelSelector.selectedIndex].text;
  const personaName = personaSelector.options[personaSelector.selectedIndex].text;

  if (confirm(`Are you sure you want to clear the chat history for ${personaName} on ${providerName}?`)) {
      await db.clearHistory(sessionKey);
      await handleSessionSwitch(); // This will refresh the UI to a clean state
      logOrchestrationEvent('Chat history and logs cleared by user.', 'info');
  }
}

/**
 * Toggles the window between maximized and restored states.
 */
function handleToggleMaximize() {
  if (!cuaWindow || !toggleMaximizeButton) return;

  cuaWindow.classList.toggle('maximized');
  const isMaximized = cuaWindow.classList.contains('maximized');

  if (isMaximized) {
    // Save last position before maximizing
    lastPosition.top = cuaWindow.style.top;
    lastPosition.left = cuaWindow.style.left;
    // Reset styles for fixed maximized view
    cuaWindow.style.top = '';
    cuaWindow.style.left = '';
    
    toggleMaximizeButton.innerHTML = '&#x2929;'; // Unicode for restore symbol ⧉
    toggleMaximizeButton.setAttribute('aria-label', 'Restore Window');
  } else {
    // Restore to last position
    cuaWindow.style.top = lastPosition.top;
    cuaWindow.style.left = lastPosition.left;

    toggleMaximizeButton.innerHTML = '&#x25A1;'; // Unicode for square □
    toggleMaximizeButton.setAttribute('aria-label', 'Maximize Window');
  }
}

/**
 * Populates the persona selector dropdown and landing page cards.
 */
function populatePersonas() {
    personasGrid.innerHTML = '';
    for (const key in PERSONAS) {
        const persona = PERSONAS[key as PersonaKey];
        // Populate dropdown
        const option = document.createElement('option');
        option.value = key;
        option.textContent = persona.name;
        personaSelector.appendChild(option);

        // Populate landing page grid
        const card = document.createElement('div');
        card.className = 'persona-card';
        card.innerHTML = `
            <h3>${persona.name}</h3>
            <p class="role">${persona.role}</p>
            <p>${persona.summary}</p>
        `;
        personasGrid.appendChild(card);
    }
}

// --- File Handling Functions ---

function fileToBase64(file: File): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, data] = result.split(',', 2);
      if (!header || !data) {
        return reject(new Error('Invalid file format.'));
      }
      const mimeType = header.split(':')[1].split(';')[0];
      resolve({ mimeType, data });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

function displayStagedFile() {
  stagedFileContainer.innerHTML = '';
  if (stagedFile) {
    const pill = document.createElement('div');
    pill.className = 'staged-file-pill';
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = stagedFile.name;
    nameSpan.title = stagedFile.name;
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', `Remove ${stagedFile.name}`);
    removeBtn.onclick = clearStagedFile;
    
    pill.appendChild(nameSpan);
    pill.appendChild(removeBtn);
    stagedFileContainer.appendChild(pill);
  }
}

function clearStagedFile() {
  stagedFile = null;
  fileInput.value = '';
  displayStagedFile();
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    stagedFile = input.files[0];
    displayStagedFile();
  }
}

function handleUploadClick() {
  fileInput.click();
}

// --- Draggable Window, Resizer, and Boot Sequence ---

function onDrag(e: MouseEvent) {
  if (!isDragging) return;
  e.preventDefault();
  let newLeft = e.clientX - dragOffsetX;
  let newTop = e.clientY - dragOffsetY;

  const maxWidth = window.innerWidth - cuaWindow.offsetWidth;
  const maxHeight = window.innerHeight - cuaWindow.offsetHeight;

  newLeft = Math.max(0, Math.min(newLeft, maxWidth));
  newTop = Math.max(0, Math.min(newTop, maxHeight));

  cuaWindow.style.left = `${newLeft}px`;
  cuaWindow.style.top = `${newTop}px`;
}

function onDragEnd() {
  isDragging = false;
  titleBar.style.cursor = 'grab';
  document.body.style.userSelect = '';
  document.removeEventListener('mousemove', onDrag);
}

function makeDraggable() {
  titleBar.addEventListener('mousedown', (e) => {
    // Only allow dragging if the target is the title bar itself, not a control
    if ((e.target as HTMLElement).closest('#window-controls')) {
        return;
    }
    if (cuaWindow.classList.contains('maximized')) {
        return;
    }
    isDragging = true;
    
    const rect = cuaWindow.getBoundingClientRect();
    cuaWindow.style.transform = 'none';
    cuaWindow.style.left = `${rect.left}px`;
    cuaWindow.style.top = `${rect.top}px`;

    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    titleBar.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onDragEnd, { once: true });
  });
}

function makeResizable() {
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isResizing) return;
            const containerRect = chatPanel.parentElement!.getBoundingClientRect();
            const newChatPanelWidth = moveEvent.clientX - containerRect.left;
            const resizerWidth = resizer.offsetWidth;
            
            // Set flex-basis in percentage
            const totalWidth = containerRect.width - resizerWidth;
            const newChatFlexBasis = (newChatPanelWidth / totalWidth) * 100;
            
            // Clamp values to prevent collapsing
            if (newChatFlexBasis > 15 && newChatFlexBasis < 85) {
                chatPanel.style.flexBasis = `${newChatFlexBasis}%`;
            }
        };

        const onMouseUp = () => {
            isResizing = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp, { once: true });
    });
}

async function runBootSequence() {
    const bootTextEl = document.getElementById('boot-text') as HTMLDivElement;
    const bootSequenceContainer = document.getElementById('boot-sequence') as HTMLDivElement;

    if (!bootTextEl || !cuaWindow || !bootSequenceContainer) return;
    
    const bootMessages = [
        'INITIATING CUA V2.1...',
        'MEMORY CHECK: 256 PB... OK',
        'LOADING AI CORE...',
        'ESTABLISHING PROVIDER LINKS...',
        'MOUNTING PERSONA MODULES (AI FAMILY)...',
        'INITIALIZING A2A ORCHESTRATION LAYER...',
        'RENDERING OPERATOR CONTROL CENTER...',
        'DOCKING INTERFACE.'
    ];

    for (const msg of bootMessages) {
        if(bootTextEl.textContent) bootTextEl.textContent += '\n';
        bootTextEl.textContent += `> ${msg}`;
        await new Promise(res => setTimeout(res, 200 + Math.random() * 100));
    }

    await new Promise(res => setTimeout(res, 500));
    
    // Make app elements visible and animate them
    cuaWindow.style.display = 'flex';
    document.querySelectorAll<HTMLElement>('.desktop-icon').forEach(icon => {
        icon.style.display = 'flex';
    });
    // Use requestAnimationFrame to ensure the 'docked' class is applied after display is set
    requestAnimationFrame(() => {
        cuaWindow.classList.add('docked');
        document.querySelectorAll<HTMLElement>('.desktop-icon').forEach(icon => {
            icon.style.opacity = '1';
        });
    });

    await new Promise(res => setTimeout(res, 1000));
    bootSequenceContainer.style.opacity = '0';
    bootSequenceContainer.addEventListener('transitionend', () => {
        bootSequenceContainer.style.display = 'none';
    });
}


/**
 * Hides the landing page and starts the application boot sequence.
 */
async function launchApp() {
  landingPage.style.display = 'none';
  const bootSequenceContainer = document.getElementById('boot-sequence') as HTMLDivElement;
  bootSequenceContainer.style.display = 'flex';

  await runBootSequence();

  // Initialize the rest of the app
  if (!geminiApiKey && !openAIApiKey) {
    appendMessage('SYSTEM_ERROR>', 'error-message').textContent = 'No API keys found. Please set API_KEY (for Gemini) and/or OPENAI_API_KEY (for OpenAI) in your environment to use the application.';
    logOrchestrationEvent('CRITICAL ERROR: API keys not found. Application halted.', 'error');
    chatInput.disabled = true;
    submitButton.disabled = true;
    uploadButton.disabled = true;
    modelSelector.disabled = true;
    personaSelector.disabled = true;
    clearHistoryButton.disabled = true;
    return;
  }
  
  await db.openDB();

  chatForm.addEventListener('submit', handleChatSubmit);
  modelSelector.addEventListener('change', handleSessionSwitch);
  personaSelector.addEventListener('change', handleSessionSwitch);
  clearHistoryButton.addEventListener('click', handleClearHistory);
  toggleMaximizeButton?.addEventListener('click', handleToggleMaximize);
  uploadButton.addEventListener('click', handleUploadClick);
  fileInput.addEventListener('change', handleFileSelect);
  
  makeDraggable();
  makeResizable();
  await handleSessionSwitch();
}

/**
 * Initializes the application.
 */
async function initializeApp() {
  populatePersonas();

  if (!geminiApiKey) {
    (modelSelector.querySelector('option[value="gemini"]') as HTMLOptionElement).disabled = true;
  }
  if (!openAIApiKey) {
    (modelSelector.querySelector('option[value="openai"]') as HTMLOptionElement).disabled = true;
  }

  if (modelSelector.options[modelSelector.selectedIndex].disabled) {
    const firstAvailableIndex = Array.from(modelSelector.options).findIndex(opt => !opt.disabled);
    if (firstAvailableIndex !== -1) {
      modelSelector.selectedIndex = firstAvailableIndex;
    }
  }

  launchAppButton.addEventListener('click', launchApp);
}

// Start the app
initializeApp();