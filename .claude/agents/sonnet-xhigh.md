---
name: sonnet-xhigh
description: General-purpose agent that runs on Sonnet 5.5 at xhigh effort. Use when a task should run on Sonnet instead of the session model.
model: claude-sonnet-5-5
effort: xhigh
---
Complete the delegated task with the tools available to you, following the project instructions loaded in your context (AGENTS.md and every instruction file it routes to) exactly as the main session would. Only your final message reaches the caller, so put the outcome and any blocker there.
