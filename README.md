# CUA System Interface

## Welcome to CUA!

This application provides a retro "Common User Access" (CUA) themed interface to a powerful conversational AI. You can interact with the system by typing commands and questions in natural language. The system is designed to simulate a friendly, all-knowing computer operating system from a bygone era.

## Features

- **Retro UI:** A classic windowed interface inspired by early graphical user interfaces.
- **Multiple Personas:** Choose from a family of AI assistants, each with a unique role and personality.
- **Multi-AI Backend:** Switch between Google Gemini and OpenAI models on the fly.
- **Streaming Responses:** Get real-time, character-by-character responses for a dynamic, terminal-like feel.
- **Persistent Chat History:** Your conversation with each persona is saved locally in your browser.
- **Orchestration Log:** A real-time log that shows the flow of tasks and communication between different AI agents.

## How to Use

1.  Use the **"Persona"** dropdown to select the AI assistant you want to talk to.
2.  Use the **"Provider"** dropdown menu to select your desired AI backend (Gemini or OpenAI).
3.  Type your command or question into the input box at the bottom of the window.
4.  Press `Enter` or click the "Send" button.
5.  Observe the **Orchestration Log** on the right to see how your request is being handled by the AI Family.

The system will process your request using the selected provider and respond in the main chat window, adopting the personality of your chosen character.

## AI Personas

You can choose from a variety of AI specialists from the AI Family:

-   **CUA:** The original. A friendly, knowledgeable computer system interface with a retro-terminal feel.
-   **Lyra:** The Master Orchestrator, supervising task flows and coordinating agents.
-   **Kara:** The Security & Compliance Officer, ensuring safe orchestration and governance.
-   **Sophia:** The Semantic Intelligence Analyst, for complex reasoning and context linking.
-   **Cecilia:** The Assistive Technology Lead, providing real-time guidance and support.
-   **Guac:** The Communication Moderator, overseeing inter-app messaging.
-   **Andie:** The Code Execution Specialist, for running and testing code.
-   **Dan:** The Web & API Integrator, a full-stack development virtuoso.
-   **Stan:** The Infrastructure Guardian, specializing in deployment and system stability.
-   **Dude:** The Automation & Workflow Maestro, an expert in task orchestration.


## Technical Setup

To run this application, you must have at least one of the following API keys set as an environment variable in a `.env` file at the root of your project.

**IMPORTANT:** For security reasons, your development environment requires that any environment variables exposed to the browser be prefixed with `VITE_`.

1.  **Google Gemini:**
    - Obtain an API key from [Google AI Studio](https://aistudio.google.com/).
    - Create a `.env` file and add your key. The variable name **must** start with `VITE_`.
    - `VITE_API_KEY="YOUR_GEMINI_KEY_HERE"` (preferred) or `VITE_GEMINI_API_KEY="YOUR_GEMINI_KEY_HERE"`

2.  **OpenAI:**
    - Obtain an API key from the [OpenAI Platform](https://platform.openai.com/api-keys).
    - Add the key to your `.env` file. The variable name **must** start with `VITE_`.
    - `VITE_OPENAI_API_KEY="YOUR_OPENAI_KEY_HERE"`

The application will disable the corresponding AI provider option in the dropdown if its key is not found. If neither key is provided, the application will display an error and will not function.

---
*Disclaimer: This interface is a creative demonstration and does not interact with your actual computer's file system or operating system.*