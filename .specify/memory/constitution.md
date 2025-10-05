<!--
Sync Impact Report (2025-10-05):
- Version change: none → 1.0.0
- List of modified principles: All principles added (Offline-First Transcription, Real-Time Processing, OpenAI Whisper Integration, Cross-Platform Compatibility, GPU Acceleration)
- Added sections: Additional Requirements, Development and Contribution
- Removed sections: none
- Templates requiring updates: plan-template.md (updated Constitution Check), spec-template.md (added constitution alignment check), tasks-template.md (added constitution alignment check), agent-file-template.md (added constitution reference), README.md (added constitution section)
- Follow-up TODOs: none
-->

# Vibe Constitution

## Core Principles

### Offline-First Transcription

All audio transcription must occur entirely offline on the user's device, ensuring no audio data is transmitted to external servers. This principle guarantees user privacy and data sovereignty.

### Real-Time Processing

The application must support real-time transcription of live audio streams, providing immediate text output with minimal latency.

### OpenAI Whisper Integration

Utilize OpenAI's Whisper model as the core transcription engine, leveraging its multilingual capabilities and accuracy.

### Cross-Platform Compatibility

Provide native support for Windows, macOS, and Linux platforms, with optimized performance across different hardware configurations.

### GPU Acceleration

Implement GPU acceleration for supported hardware (NVIDIA, AMD, Intel) to enable faster transcription processing.

## Additional Requirements

Support multiple audio/video formats, batch processing, CLI interface, HTTP API, speaker diarization, and integration with local AI models like Ollama.

## Development and Contribution

Maintain open-source development with community contributions, automated updates, comprehensive documentation, and adherence to privacy standards.

## Governance

This constitution guides all development decisions. Amendments require consensus from maintainers and must be documented. Compliance is verified through code reviews and automated checks.

**Version**: 1.0.0 | **Ratified**: 2025-10-05 | **Last Amended**: 2025-10-05
